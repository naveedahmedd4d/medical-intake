import express from 'express';
import PDFDocument from 'pdfkit';
import models from '../../models';
import { STATUS_CODES, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../../utils/constants';
import { BadRequestError, SuccessResponse } from '../../utils/helper';
import {
  listPatientSummariesQuerySchema,
  updatePatientSummaryParamSchema,
  updatePatientSummaryBodySchema,
} from './validationSchemas';
import { Request, AuditLog, SwaggerDoc, RequestBodyValidator } from '../../utils/decorators';
import { listPatientSummariesQuery, exportPatientSummariesQuery } from './query';
import { logFailedAttempt } from '../../utils/auditHelpers';

const { PatientSummary, IntakeSession, Provider } = models;

class PatientSummaryController {
  static router;

  static getRouter() {
    this.router = express.Router();
    this.router.get('/', this.listPatientSummaries);
    this.router.patch('/:id', this.updatePatientSummary);
    this.router.get('/export/pdf', this.exportPatientSummariesToPDF);
    return this.router;
  }

  @SwaggerDoc({
    tags: ['Patient Summaries'],
    description:
      'List patient summaries with search, filter, and pagination. Provider sees only their assigned patients.',
  })
  @Request
  @AuditLog({
    action: AUDIT_ACTIONS.VIEW_PATIENT_SUMMARY_LIST,
    resourceType: AUDIT_RESOURCE_TYPES.PATIENT_SUMMARY,
    getResourceId: () => null,
    getChanges: (req, result) => ({
      searchTerm: req.query.search || null,
      filters: {
        dateOfBirth: req.query.dateOfBirth || null,
        appointmentDate: req.query.appointmentDate || null,
        isArchived: req.query.isArchived || false,
      },
      resultCount: result?.totalRecords || 0,
    }),
  })
  static async listPatientSummaries(req, res) {
    const { error, value } = listPatientSummariesQuerySchema.validate(req.query);
    if (error) {
      return BadRequestError(error.details[0].message, STATUS_CODES.INVALID_INPUT);
    }

    const {
      search,
      dateOfBirth,
      appointmentDate,
      isArchived,
      providerId: queryProviderId,
      page,
      pageSize,
      sortColumn,
      sortOrder,
    } = value;

    let providerFilterId = null;

    if (req.auth.role === 'provider') {
      const provider = await Provider.findOne({
        where: { userId: req.auth.id },
      });
      providerFilterId = provider?.id || null;
    } else if (queryProviderId) {
      providerFilterId = queryProviderId;
    }

    const clinicFilterId = req.auth.role === 'super_admin' ? undefined : req.auth.clinicId;

    const query = await listPatientSummariesQuery({
      search,
      dateOfBirth,
      appointmentDate,
      isArchived,
      providerId: providerFilterId,
      clinicId: clinicFilterId,
      sortColumn,
      sortOrder,
      pageNumber: page,
      pageSize,
    });

    const { count, rows: summaries } = await PatientSummary.findAndCountAll(query);

    const summariesData = summaries.map((summary) => {
      const session = summary.intakeSession;
      const age = session.dateOfBirth
        ? Math.floor((new Date() - new Date(session.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000))
        : null;
      return {
        id: summary.id,
        patientName: session.patientName,
        patientId: session.patientIdentifier,
        dateOfBirth: session.dateOfBirth,
        age,
        gender: session.gender,
        phone: session.phoneNumber,
        appointmentDate: session.appointmentDate,
        summaryDate: summary.generatedAt,
        time: summary.generatedAt,
        aiGeneratedSummary: summary.aiGeneratedSummary,
        status: summary.isArchived ? 'Archived' : 'Active',
        isArchived: summary.isArchived,
      };
    });

    const result = {
      totalRecords: count,
      patientSummaries: summariesData,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ['Patient Summaries'],
    description: 'Update patient summary archive status. Supports archiving and unarchiving.',
  })
  @AuditLog({
    action: AUDIT_ACTIONS.UPDATE_PATIENT_SUMMARY,
    resourceType: AUDIT_RESOURCE_TYPES.PATIENT_SUMMARY,
    getResourceId: (result) => result?.id,
    getChanges: (req, result) => ({
      patientIdentifier: result?.patientIdentifier,
      isArchived: {
        old: result?.oldIsArchived,
        new: result?.isArchived,
      },
      archivedAt: result?.archivedAt,
    }),
  })
  @RequestBodyValidator(updatePatientSummaryBodySchema)
  @Request
  static async updatePatientSummary(req, res) {
    const { error, value } = updatePatientSummaryParamSchema.validate(req.params);
    if (error) {
      return BadRequestError(error.details[0].message, STATUS_CODES.INVALID_INPUT);
    }

    const { id } = value;
    const { isArchived } = req.body;

    // Allow updates based on clinic (and super admin), not just the individual provider.
    // This aligns with master links behavior where providers and clinic admins can see
    // all summaries for a clinic.
    const where = { id };

    // Super admins can access any clinic, others are scoped to their clinic
    if (req.auth.role !== 'super_admin') {
      where.clinicId = req.auth.clinicId;
    }

    const summary = await PatientSummary.findOne({
      where,
      include: [
        {
          model: IntakeSession,
          as: 'intakeSession',
          attributes: ['patientIdentifier'],
        },
      ],
    });

    if (!summary) {
      await logFailedAttempt({
        action: AUDIT_ACTIONS.FAILED_PHI_ACCESS,
        resourceType: AUDIT_RESOURCE_TYPES.PATIENT_SUMMARY,
        email: req.auth?.email || 'unknown',
        reason: 'Patient summary not found or unauthorized access',
        req,
        additionalChanges: {
          attemptedSummaryId: id,
          clinicId: req.auth.clinicId,
        },
      });
      return BadRequestError('Patient summary not found', STATUS_CODES.NOTFOUND);
    }

    const oldIsArchived = summary.isArchived;

    await summary.update({
      isArchived,
      archivedAt: isArchived ? new Date() : null,
    });

    const result = {
      id: summary.id,
      patientIdentifier: summary.intakeSession.patientIdentifier,
      isArchived: summary.isArchived,
      archivedAt: summary.archivedAt,
      oldIsArchived,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ['Patient Summaries'],
    description:
      'Export all active patient summaries to PDF. Generates downloadable PDF with table data.',
  })
  @AuditLog({
    action: AUDIT_ACTIONS.EXPORT_PATIENT_SUMMARIES,
    resourceType: AUDIT_RESOURCE_TYPES.PATIENT_SUMMARY,
    getResourceId: () => null,
    getChanges: (req, result) => ({
      totalRecords: result.recordCount,
      exportedAt: new Date(),
    }),
  })
  @Request
  static async exportPatientSummariesToPDF(req, res) {
    // Restrict export similar to list:
    // - Providers: only their own summaries
    // - Clinic admins: all summaries for their clinic
    // - Super admins: all summaries (no clinic/provider filter)
    let providerFilterId = null;

    if (req.auth.role === 'provider') {
      const provider = await Provider.findOne({
        where: { userId: req.auth.id },
      });
      providerFilterId = provider?.id || null;
    }

    const clinicFilterId = req.auth.role === 'super_admin' ? undefined : req.auth.clinicId;

    const query = await exportPatientSummariesQuery({
      providerId: providerFilterId,
      clinicId: clinicFilterId,
    });

    const summaries = await PatientSummary.findAll(query);

    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      layout: 'landscape',
    });

    const filename = `patient-summaries-${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    doc.fontSize(16).text('Patient Notes', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, {
      align: 'center',
    });
    doc.moveDown(1);

    const tableTop = 120;
    const rowHeight = 25;
    const columnWidths = {
      patientName: 80,
      patientId: 60,
      dob: 70,
      ageGender: 60,
      phone: 90,
      appointmentDate: 80,
      summaryDate: 80,
      time: 60,
      status: 50,
    };

    const columns = [
      { key: 'patientName', label: 'Patient Name', x: 30 },
      { key: 'patientId', label: 'Patient ID', x: 110 },
      { key: 'dob', label: 'DOB', x: 170 },
      { key: 'ageGender', label: 'Age/Gender', x: 240 },
      { key: 'phone', label: 'Phone', x: 300 },
      { key: 'appointmentDate', label: 'Appointment', x: 390 },
      { key: 'summaryDate', label: 'Summary Date', x: 470 },
      { key: 'time', label: 'Time', x: 550 },
      { key: 'status', label: 'Status', x: 610 },
    ];

    doc.fontSize(8).fillColor('#000');
    columns.forEach((col) => {
      doc.text(col.label, col.x, tableTop, {
        width: columnWidths[col.key],
        align: 'left',
      });
    });

    doc
      .moveTo(30, tableTop + 15)
      .lineTo(780, tableTop + 15)
      .stroke();

    let yPosition = tableTop + rowHeight;

    summaries.forEach((summary, index) => {
      if (yPosition > 550) {
        doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
        yPosition = 50;

        doc.fontSize(8).fillColor('#000');
        columns.forEach((col) => {
          doc.text(col.label, col.x, yPosition - 20, {
            width: columnWidths[col.key],
            align: 'left',
          });
        });

        doc
          .moveTo(30, yPosition - 5)
          .lineTo(780, yPosition - 5)
          .stroke();
      }

      const session = summary.intakeSession;
      const age = session.dateOfBirth
        ? Math.floor((new Date() - new Date(session.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000))
        : 'N/A';

      const formatDate = (date) => {
        if (!date) {
          return 'N/A';
        }
        return new Date(date).toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
        });
      };

      const formatTime = (date) => {
        if (!date) {
          return 'N/A';
        }
        return new Date(date).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
      };

      const rowData = [
        {
          text: session.patientName || 'N/A',
          x: columns[0].x,
          width: columnWidths.patientName,
        },
        {
          text: session.patientIdentifier || 'N/A',
          x: columns[1].x,
          width: columnWidths.patientId,
        },
        {
          text: formatDate(session.dateOfBirth),
          x: columns[2].x,
          width: columnWidths.dob,
        },
        {
          text: `${age}y / ${session.gender?.charAt(0).toUpperCase() || 'N/A'}`,
          x: columns[3].x,
          width: columnWidths.ageGender,
        },
        {
          text: session.phoneNumber || 'N/A',
          x: columns[4].x,
          width: columnWidths.phone,
        },
        {
          text: formatDate(session.appointmentDate),
          x: columns[5].x,
          width: columnWidths.appointmentDate,
        },
        {
          text: formatDate(summary.generatedAt),
          x: columns[6].x,
          width: columnWidths.summaryDate,
        },
        {
          text: formatTime(summary.generatedAt),
          x: columns[7].x,
          width: columnWidths.time,
        },
        {
          text: summary.isArchived ? 'Archived' : 'Active',
          x: columns[8].x,
          width: columnWidths.status,
        },
      ];

      doc.fontSize(8).fillColor(index % 2 === 0 ? '#000' : '#333');

      rowData.forEach((data) => {
        doc.text(data.text, data.x, yPosition, {
          width: data.width,
          align: 'left',
          lineBreak: false,
        });
      });

      yPosition += rowHeight;
    });

    doc.end();

    return { recordCount: summaries.length };
  }
}

export default PatientSummaryController;
