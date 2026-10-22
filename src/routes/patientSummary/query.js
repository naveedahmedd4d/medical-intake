import sequelize from 'sequelize';
import { PAGE_SIZE } from '../../utils/constants';

const { Op } = sequelize;

export const listPatientSummariesQuery = async ({
  search,
  dateOfBirth,
  appointmentDate,
  isArchived = false,
  providerId,
  clinicId,
  sortColumn = 'generatedAt',
  sortOrder = 'DESC',
  pageNumber = 1,
  pageSize = PAGE_SIZE,
}) => {
  const query = { where: {} };

  query.offset = (pageNumber - 1) * pageSize;
  query.limit = pageSize;

  query.distinct = true;

  if (providerId) {
    // providerId is expected to be the Provider model UUID
    query.where.providerId = providerId;
  }

  if (clinicId) {
    query.where.clinicId = clinicId;
  }

  query.where.isArchived = isArchived;

  query.attributes = [
    'id',
    'intakeSessionId',
    'providerId',
    'clinicId',
    'isArchived',
    'aiGeneratedSummary',
    'generatedAt',
    'reviewedAt',
    'archivedAt',
    'createdAt',
    'updatedAt',
  ];

  query.include = [
    {
      association: 'intakeSession',
      attributes: [
        'id',
        'patientIdentifier',
        'patientName',
        'dateOfBirth',
        'phoneNumber',
        'appointmentDate',
        'gender',
        'status',
      ],
      required: true,
    },
  ];

  if (search) {
    const likeClause = { [Op.like]: `%${search}%` };
    query.include[0].where = {
      [Op.or]: [
        { patientName: likeClause },
        { patientIdentifier: likeClause },
        { phoneNumber: likeClause },
      ],
    };
  }

  if (dateOfBirth) {
    if (!query.include[0].where) {
      query.include[0].where = {};
    }
    query.include[0].where.dateOfBirth = dateOfBirth;
  }

  if (appointmentDate) {
    if (!query.include[0].where) {
      query.include[0].where = {};
    }
    query.include[0].where.appointmentDate = appointmentDate;
  }

  if (sortColumn && sortOrder) {
    if (
      sortColumn === 'patientName' ||
      sortColumn === 'patientIdentifier' ||
      sortColumn === 'dateOfBirth' ||
      sortColumn === 'appointmentDate' ||
      sortColumn === 'phoneNumber' ||
      sortColumn === 'gender'
    ) {
      query.order = [['intakeSession', sortColumn, sortOrder]];
    } else {
      query.order = [[sortColumn, sortOrder]];
    }
  }

  return query;
};

export const exportPatientSummariesQuery = async ({ providerId, clinicId }) => {
  const query = { where: {} };

  if (providerId) {
    // providerId is expected to be the Provider model UUID
    query.where.providerId = providerId;
  }

  if (clinicId) {
    query.where.clinicId = clinicId;
  }

  query.where.isArchived = false;

  query.attributes = [
    'id',
    'intakeSessionId',
    'providerId',
    'clinicId',
    'isArchived',
    'generatedAt',
    'reviewedAt',
    'archivedAt',
    'createdAt',
    'updatedAt',
  ];

  query.include = [
    {
      association: 'intakeSession',
      attributes: [
        'id',
        'patientIdentifier',
        'patientName',
        'dateOfBirth',
        'phoneNumber',
        'appointmentDate',
        'gender',
        'status',
      ],
      required: true,
    },
  ];

  query.order = [['generatedAt', 'DESC']];

  return query;
};
