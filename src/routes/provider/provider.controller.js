import express from "express";
import crypto from "crypto";
import debugObj from "debug";
import models from "../../models";
import {
  STATUS_CODES,
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  SUBSCRIPTION_STATUSES,
  AWS_CONFIG,
} from "../../utils/constants";
import {
  BadRequestError,
  generateHash,
  SuccessResponse,
} from "../../utils/helper";
import {
  inviteProviderSchema,
  acceptInvitationSchema,
  listProvidersQuerySchema,
  updateProviderProfileSchema,
  providersByClinicParamsSchema,
  resendInvitationSchema,
  publicProviderInfoQuerySchema,
  autoCreateProviderSchema,
  setActiveTemplateSchema,
} from "./validationSchemas";
import {
  Request,
  AuditLog,
  SwaggerDoc,
  RequestBodyValidator,
} from "../../utils/decorators";
import { emailSender } from "../../utils/emailSender";
import {
  generateUniqueProviderSlug,
  resolveIntakeSlugs,
} from "../../utils/slugHelpers";
import { listProvidersQuery } from "./query";
import { logFailedAttempt } from "../../utils/auditHelpers";
import { updateSubscriptionQuantity } from "../../utils/subscriptionQuantityManager";
import { countActiveProviders } from "../../utils/providerHelpers";
import upload from "../../middlewares/upload";
import {
  uploadFileToAzure,
  deleteFileFromAzure,
} from "../../utils/azureStorage";

const debug = debugObj("api:provider");

const {
  User,
  Clinic,
  Subscription,
  UserInvitation,
  Provider,
  Template,
  UserRole,
  sequelize,
} = models;
const { Op } = models.Sequelize;

class ProviderController {
  static router;

  static getRouter() {
    this.router = express.Router();
    this.router.get("/", this.listProviders);
    this.router.get("/profile", this.getProfile);
    this.router.put("/profile", this.updateProfile);
    this.router.put("/profile/active-template", this.setActiveTemplate);
    this.router.post(
      "/profile/avatar",
      upload("image-memory").single("file"),
      this.uploadAvatar
    );
    this.router.delete("/profile/avatar", this.deleteAvatar);
    this.router.post("/invite", this.inviteProvider);
    this.router.post("/auto-create", this.autoCreateProvider);
    this.router.post("/accept-invitation", this.acceptInvitation);
    this.router.get("/public/info", this.getPublicInfo);
    this.router.get("/public/:clinic_id", this.listProvidersByClinicId);
    this.router.post("/resend-invitation", this.resendInvitation);
    this.router.delete("/:id", this.removeProvider);
    return this.router;
  }

  @SwaggerDoc({
    tags: ["Providers", "Public"],
    description:
      "Resolve clinic and/or provider identifiers from public slugs. Accepts clinicSlug, providerSlug, or both.",
    query: {
      clinicSlug: {
        type: "string",
        description: "Public clinic slug",
      },
      providerSlug: {
        type: "string",
        description: "Public provider slug",
      },
    },
    security: [],
  })
  @Request
  static async getPublicInfo(req, res) {
    const { error: validationError, value } =
      publicProviderInfoQuerySchema.validate(req.query);

    if (validationError) {
      return BadRequestError(
        validationError.details[0].message,
        STATUS_CODES.INVALID_INPUT
      );
    }

    const { clinicSlug, providerSlug } = value;

    // Both slugs provided – use shared resolver to validate relationship
    if (clinicSlug && providerSlug) {
      try {
        const result = await resolveIntakeSlugs(clinicSlug, providerSlug);

        const defaultTemplate = await Template.findOne({
          where: { clinicId: result.clinicId, isDefault: true },
          attributes: ["id"],
        });

        let templateId = defaultTemplate?.id || null;
        const provider = await Provider.findByPk(result.providerId, {
          attributes: ["id", "activeTemplateId"],
        });
        if (provider?.activeTemplateId) {
          const activeTemplate = await Template.findByPk(provider.activeTemplateId, {
            attributes: ["id", "clinicId"],
          });
          const allowed =
            activeTemplate &&
            (activeTemplate.clinicId === null || activeTemplate.clinicId === result.clinicId);
          if (allowed) templateId = activeTemplate.id;
        }

        return SuccessResponse(res, {
          clinicId: result.clinicId,
          providerId: result.providerId,
          clinicSlug,
          providerSlug,
          clinic: result.clinic,
          provider: result.provider,
          templateId,
        });
      } catch (error) {
        return BadRequestError(error.message, STATUS_CODES.NOTFOUND);
      }
    }

    // Only clinicSlug provided – resolve clinicId
    if (clinicSlug && !providerSlug) {
      const clinic = await Clinic.findOne({
        where: { clinicSlug },
        attributes: ["id", "clinicName", "logoUrl", "clinicSlug"],
      });

      if (!clinic) {
        return BadRequestError("Clinic not found", STATUS_CODES.NOTFOUND);
      }

      const defaultTemplate = await Template.findOne({
        where: { clinicId: clinic.id, isDefault: true },
        attributes: ["id"],
      });

      // Fetch active providers for this clinic
      const providers = await User.findAll({
        where: {
          clinicId: clinic.id,
          role: "provider",
        },
        include: [
          {
            model: Provider,
            as: "provider",
            required: true,
            where: {
              status: "active",
            },
          },
        ],
        attributes: ["id", "firstName", "lastName", "providerSlug"],
        order: [
          ["firstName", "ASC"],
          ["lastName", "ASC"],
        ],
      });

      const providersData = providers.map((user) => ({
        id: user.provider.id,
        fullName: `${user.firstName} ${user.lastName}`,
        providerSlug: user.providerSlug,
      }));

      return SuccessResponse(res, {
        clinicId: clinic.id,
        clinicSlug: clinic.clinicSlug,
        clinic: {
          id: clinic.id,
          name: clinic.clinicName,
          logoUrl: clinic.logoUrl,
        },
        providers: providersData,
        templateId: defaultTemplate?.id || null,
      });
    }

    // Only providerSlug provided – resolve providerId (and clinic if available)
    const user = await User.findOne({
      where: { providerSlug },
      attributes: ["id", "firstName", "lastName", "clinicId", "providerSlug"],
      include: [
        {
          model: Provider,
          as: 'provider',
          attributes: ['id', 'status', 'activeTemplateId'],
          required: true,
        },
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'clinicName', 'logoUrl', 'clinicSlug'],
          required: false,
        },
      ],
    });

    if (!user || !user.provider) {
      return BadRequestError("Provider not found", STATUS_CODES.NOTFOUND);
    }

    if (user.provider.status !== "active") {
      return BadRequestError(
        "Provider is not active",
        STATUS_CODES.INVALID_INPUT
      );
    }

    const clinicId = user.clinic ? user.clinic.id : user.clinicId;

    const defaultTemplate = await Template.findOne({
      where: { clinicId, isDefault: true },
      attributes: ["id"],
    });

    let templateId = defaultTemplate?.id || null;
    if (user.provider.activeTemplateId && clinicId) {
      const activeTemplate = await Template.findByPk(user.provider.activeTemplateId, {
        attributes: ["id", "clinicId"],
      });
      const allowed =
        activeTemplate &&
        (activeTemplate.clinicId === null || activeTemplate.clinicId === clinicId);
      if (allowed) templateId = activeTemplate.id;
    }

    const clinicData = user.clinic
      ? {
        id: user.clinic.id,
        name: user.clinic.clinicName,
        logoUrl: user.clinic.logoUrl,
      }
      : null;

    return SuccessResponse(res, {
      clinicId,
      providerId: user.provider.id,
      providerSlug,
      clinicSlug: user.clinic ? user.clinic.clinicSlug : null,
      clinic: clinicData,
      provider: {
        id: user.provider.id,
        name: `${user.firstName} ${user.lastName}`,
      },
      templateId,
    });
  }

  @SwaggerDoc({
    tags: ["Providers"],
    description:
      "Get provider profile information. Only accessible by the provider themselves.",
  })
  @Request
  @AuditLog({
    action: AUDIT_ACTIONS.VIEW_PROVIDER_PROFILE,
    resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
    getResourceId: (result) => result?.providerId,
    getChanges: (result) => ({
      userId: result?.id,
      providerId: result?.providerId,
    }),
  })
  static async getProfile(req, res) {
    const user = await User.findByPk(req.auth.id, {
      include: [
        {
          model: Provider,
          as: "provider",
          required: false,
          attributes: ["id", "specialty", "licenseNumber", "status", "avatarUrl", "createdAt", "activeTemplateId"],
        },
        {
          model: Clinic,
          as: "clinic",
          attributes: ["id", "clinicName", "clinicSlug"],
        },
      ],
    });

    if (!user) {
      return BadRequestError("User not found", STATUS_CODES.NOTFOUND);
    }

    // Resolve effective template (same order as intake resolution): active → clinic default → default prebuild → first clinic → first prebuild
    let effectiveTemplate = null;
    const activeTemplateId = user.provider?.activeTemplateId;
    if (activeTemplateId) {
      const activeTemplate = await Template.findByPk(activeTemplateId, {
        attributes: ["id", "name", "clinicId"],
      });
      const allowed = activeTemplate && (
        activeTemplate.clinicId === null ||
        activeTemplate.clinicId === user.clinicId
      );
      if (allowed) effectiveTemplate = activeTemplate;
    }
    if (!effectiveTemplate && user.clinicId) {
      effectiveTemplate = await Template.findOne({
        where: { clinicId: user.clinicId, isDefault: true },
        attributes: ["id", "name"],
      });
    }
    if (!effectiveTemplate) {
      effectiveTemplate = await Template.findOne({
        where: { clinicId: null, isDefault: true },
        attributes: ["id", "name"],
      });
    }
    if (!effectiveTemplate && user.clinicId) {
      effectiveTemplate = await Template.findOne({
        where: { clinicId: user.clinicId },
        attributes: ["id", "name"],
        order: [["createdAt", "ASC"]],
      });
    }
    if (!effectiveTemplate) {
      effectiveTemplate = await Template.findOne({
        where: { clinicId: null },
        attributes: ["id", "name"],
        order: [["createdAt", "ASC"]],
      });
    }

    const templateCounts = await Template.count({
      where: { clinicId: user.clinicId },
    });

    const activeTemplateCounts = await Template.count({
      where: { clinicId: user.clinicId, isDefault: false },
    });

    const customTemplateCounts = await Template.count({
      where: { clinicId: user.clinicId, isDefault: false },
    });

    const result = {
      id: user.id,
      providerId: user.provider?.id || null,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      phoneNumber: user.phone || null,
      specialty: user.provider?.specialty || null,
      licenseNumber: user.provider?.licenseNumber || null,
      avatarUrl: user.provider?.avatarUrl || null,
      dateAdded: user.provider?.createdAt || null,
      status: user.provider?.status || null,
      clinicId: user.clinicId,
      clinicName: user.clinic?.clinicName || null,
      clinicSlug: user.clinic?.clinicSlug || null,
      providerSlug: user.providerSlug || null,
      templateId: effectiveTemplate?.id || null,
      templateName: effectiveTemplate?.name || null,
      activeTemplateId: user.provider?.activeTemplateId || null,
      templatesSummary: {
        total: templateCounts,
        active: activeTemplateCounts,
        custom: customTemplateCounts,
      },
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Providers"],
    description:
      "Update provider profile information (name, phone, specialty, license number).",
  })
  @RequestBodyValidator(updateProviderProfileSchema)
  @AuditLog({
    action: AUDIT_ACTIONS.UPDATE_PROVIDER_PROFILE,
    resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
    getResourceId: (result) => result?.id,
    getChanges: (req) => req.body,
  })
  @Request
  static async updateProfile(req, res) {
    const { firstName, lastName, phone, specialty, licenseNumber } = req.body;

    const transaction = await sequelize.transaction();

    try {
      const userUpdateData = {};
      if (firstName !== undefined) {
        userUpdateData.firstName = firstName;
      }
      if (lastName !== undefined) {
        userUpdateData.lastName = lastName;
      }
      if (phone !== undefined) {
        userUpdateData.phone = phone === "" ? null : phone;
      }

      if (Object.keys(userUpdateData).length > 0) {
        await User.update(userUpdateData, {
          where: { id: req.auth.id },
          transaction,
        });
      }

      const providerUpdateData = {};
      if (specialty !== undefined) {
        providerUpdateData.specialty = specialty === "" ? null : specialty;
      }
      if (licenseNumber !== undefined) {
        providerUpdateData.licenseNumber =
          licenseNumber === "" ? null : licenseNumber;
      }

      if (Object.keys(providerUpdateData).length > 0) {
        await Provider.update(providerUpdateData, {
          where: { userId: req.auth.id },
          transaction,
        });
      }

      await transaction.commit();

      res.status(204).send();
      return { id: req.auth.id };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  @SwaggerDoc({
    tags: ["Providers"],
    description:
      "Set the provider's active intake template. Template must be prebuild (clinicId null) or belong to the provider's clinic.",
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["templateId"],
            properties: {
              templateId: { type: "string", format: "uuid", description: "Template ID" },
            },
          },
        },
      },
    },
  })
  @RequestBodyValidator(setActiveTemplateSchema)
  @Request
  static async setActiveTemplate(req, res) {
    const { templateId } = req.body;

    const provider = await Provider.findOne({
      where: { userId: req.auth.id },
      attributes: ["id", "clinicId"],
    });
    if (!provider) {
      return BadRequestError(
        "Only providers can set an active template",
        STATUS_CODES.BAD_REQUEST
      );
    }

    const template = await Template.findByPk(templateId, {
      attributes: ["id", "name", "clinicId"],
    });
    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }
    const allowed =
      template.clinicId === null || template.clinicId === provider.clinicId;
    if (!allowed) {
      return BadRequestError(
        "Template is not available for this provider",
        STATUS_CODES.BAD_REQUEST
      );
    }

    await provider.update({ activeTemplateId: templateId });

    const result = {
      providerId: provider.id,
      activeTemplateId: template.id,
      activeTemplateName: template.name,
    };
    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Providers"],
    description: "Upload provider avatar to Azure Blob Storage",
    requestBody: {
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              file: { type: "string", format: "binary" },
            },
          },
        },
      },
    },
  })
  @AuditLog({
    action: AUDIT_ACTIONS.UPLOAD_PROVIDER_AVATAR,
    resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
    getResourceId: (result) => result?.providerId,
    // eslint-disable-next-line no-unused-vars
    getChanges: (req, result) => ({
      avatarUrl: result?.avatarUrl,
    }),
  })
  @Request
  static async uploadAvatar(req, res) {
    if (!req.file) {
      return BadRequestError("No file uploaded", STATUS_CODES.INVALID_INPUT);
    }

    const { id: userId } = req.auth;
    const { buffer, originalname, mimetype } = req.file;

    const provider = await Provider.findOne({
      where: { userId },
      include: [{ model: User, as: "user", required: true }],
    });

    if (!provider) {
      return BadRequestError("Provider not found", STATUS_CODES.NOTFOUND);
    }

    // Delete old avatar if exists
    if (provider.avatarUrl) {
      await deleteFileFromAzure(provider.avatarUrl);
    }

    // Upload new avatar
    const uniqueFileName = `${provider.id}-${Date.now()}-${originalname}`;
    const avatarUrl = await uploadFileToAzure(
      buffer,
      uniqueFileName,
      mimetype,
      AWS_CONFIG.PROVIDER_AVATAR
    );

    await provider.update({ avatarUrl });

    const result = {
      providerId: provider.id,
      userId: provider.user.id,
      fullName: `${provider.user.firstName} ${provider.user.lastName}`,
      avatarUrl: provider.avatarUrl,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Providers"],
    description: "Delete provider avatar from Azure Blob Storage",
  })
  @AuditLog({
    action: AUDIT_ACTIONS.UPLOAD_PROVIDER_AVATAR,
    resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
    getResourceId: (result) => result?.providerId,
    // eslint-disable-next-line no-unused-vars
    getChanges: (req, result) => ({
      avatarUrl: null,
      action: "deleted",
    }),
  })
  @Request
  static async deleteAvatar(req, res) {
    const { id: userId } = req.auth;

    const provider = await Provider.findOne({
      where: { userId },
      include: [{ model: User, as: "user", required: true }],
    });

    if (!provider) {
      return BadRequestError("Provider not found", STATUS_CODES.NOTFOUND);
    }

    // Delete avatar from Azure if exists
    if (provider.avatarUrl) {
      await deleteFileFromAzure(provider.avatarUrl);
    }

    // Clear avatarUrl in database
    await provider.update({ avatarUrl: null });

    const result = {
      providerId: provider.id,
      userId: provider.user.id,
      fullName: `${provider.user.firstName} ${provider.user.lastName}`,
      message: "Avatar deleted successfully",
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Providers"],
    description:
      "List all providers for clinic with search, filter, and pagination.",
  })
  @Request
  @AuditLog({
    action: AUDIT_ACTIONS.VIEW_PROVIDER_LIST,
    resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
    getResourceId: () => null,
    getChanges: (req, result) => ({
      searchTerm: req.query.search || null,
      filters: {
        status: req.query.status || null,
      },
      resultCount: result?.totalRecords || 0,
    }),
  })
  static async listProviders(req, res) {
    const { error, value } = listProvidersQuerySchema.validate(req.query);
    if (error) {
      return BadRequestError(
        error.details[0].message,
        STATUS_CODES.INVALID_INPUT
      );
    }

    const { search, status, page, pageSize, sortColumn, sortOrder } = value;

    const query = listProvidersQuery({
      search,
      status,
      clinicId: req.auth.clinicId,
      sortColumn,
      sortOrder,
      pageNumber: page,
      pageSize,
    });

    const { count, rows: users } = await User.findAndCountAll(query);

    const providersData = users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      phone: user.phone,
      specialty: user.provider?.specialty || null,
      licenseNumber: user.provider?.licenseNumber || null,
      status: user.provider?.status || "invited",
      createdAt: user.createdAt,
    }));

    const result = {
      totalRecords: count,
      providers: providersData,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Providers", "Public"],
    description:
      "List providers for a specific clinic by clinic ID. Supports multi-role users via UserRole table.",
    params: {
      clinic_id: { type: "string", format: "uuid", description: "Clinic ID" },
    },
    security: [],
  })
  @Request
  static async listProvidersByClinicId(req, res) {
    const { error: paramError, value: params } =
      providersByClinicParamsSchema.validate(req.params);
    if (paramError) {
      return BadRequestError(
        paramError.details[0].message,
        STATUS_CODES.INVALID_INPUT
      );
    }

    const { rows: providers } = await Provider.findAndCountAll({
      where: {
        clinicId: params.clinic_id,
        status: "active",
      },
      include: [
        {
          model: User,
          as: "user",
          required: true,
          attributes: ["id", "firstName", "lastName", "email", "phone", "role"],
          include: [
            {
              model: UserRole,
              as: "roles",
              where: { role: "provider" },
              required: false,
              attributes: ["role"],
            },
          ],
        },
        {
          model: Clinic,
          as: "clinic",
          attributes: ["clinicName", "logoUrl"],
        },
      ],
      order: [
        [{ model: User, as: "user" }, "firstName", "ASC"],
        [{ model: User, as: "user" }, "lastName", "ASC"],
      ],
    });

    const providersWithRoleCheck = providers?.filter((provider) => {
      const { user } = provider;
      const hasLegacyRole = user.role === "provider";
      const hasRoleInTable = user.roles && user.roles.length > 0;
      return hasLegacyRole || hasRoleInTable;
    });

    const providersData = providersWithRoleCheck?.map((provider) => ({
      id: provider.id,
      userId: provider.user.id,
      clinicId: provider.clinicId,
      clinicName: provider.clinic?.clinicName,
      fullName: `${provider.user.firstName} ${provider.user.lastName}`,
      email: provider.user.email,
      phone: provider.user.phone,
      specialty: provider.specialty,
      licenseNumber: provider.licenseNumber,
      status: provider.status,
      logoUrl: provider.clinic?.logoUrl,
    }));

    const result = {
      totalRecords: providersWithRoleCheck.length,
      providers: providersData,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Providers"],
    description:
      "Invite provider to clinic. Creates user with invited status and sends invitation email.",
  })
  @RequestBodyValidator(inviteProviderSchema)
  @AuditLog({
    action: AUDIT_ACTIONS.PROVIDER_INVITED,
    resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
    getResourceId: (result) => result?.userId,
    getChanges: (req, result) => ({
      email: result?.email,
      clinicId: req.auth.clinicId,
      providerId: result?.providerId,
    }),
  })
  @Request
  static async inviteProvider(req, res) {
    const { body } = req;

    const existingUser = await User.findOne({
      where: { email: body.email },
      include: [
        {
          model: Provider,
          as: "provider",
          required: false,
        },
      ],
      paranoid: false,
    });

    // Check if user already exists and is active
    if (existingUser && !existingUser.deletedAt) {
      debug(
        "Existing user found: userId=%s, clinicId=%s, auth.clinicId=%s",
        existingUser.id,
        existingUser.clinicId,
        req.auth.clinicId
      );

      // Check if they're in the same clinic (handle string comparison for UUIDs)
      if (
        existingUser.clinicId &&
        req.auth.clinicId &&
        String(existingUser.clinicId) !== String(req.auth.clinicId)
      ) {
        await logFailedAttempt({
          action: AUDIT_ACTIONS.FAILED_PROVIDER_INVITATION,
          resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
          email: body.email,
          reason: "Email registered to different clinic",
          req,
          additionalChanges: {
            clinicId: req.auth.clinicId,
            existingClinicId: existingUser.clinicId,
            invitedBy: req.auth.id,
          },
        });
        return BadRequestError(
          "This email is already registered to a different clinic",
          STATUS_CODES.INVALID_INPUT
        );
      }

      // Check if they already have an active provider record
      if (existingUser.provider && existingUser.provider.status === "active") {
        await logFailedAttempt({
          action: AUDIT_ACTIONS.FAILED_PROVIDER_INVITATION,
          resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
          email: body.email,
          reason: "User already has active provider role",
          req,
          additionalChanges: {
            clinicId: req.auth.clinicId,
            invitedBy: req.auth.id,
            providerId: existingUser.provider.id,
          },
        });
        return BadRequestError(
          "This user is already an active provider",
          STATUS_CODES.INVALID_INPUT
        );
      }

      // If they have a pending/invited provider record, reject
      if (existingUser.provider && existingUser.provider.status === "invited") {
        await logFailedAttempt({
          action: AUDIT_ACTIONS.FAILED_PROVIDER_INVITATION,
          resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
          email: body.email,
          reason: "User already has pending provider invitation",
          req,
          additionalChanges: {
            clinicId: req.auth.clinicId,
            invitedBy: req.auth.id,
            providerId: existingUser.provider.id,
          },
        });
        return BadRequestError(
          "This user already has a pending provider invitation",
          STATUS_CODES.INVALID_INPUT
        );
      }

      // If we reach here, user exists in same clinic but doesn't have provider role
      // This is the clinic admin becoming a provider case - allow it to proceed
    }

    const clinic = await Clinic.findByPk(req.auth.clinicId);
    if (!clinic) {
      return BadRequestError("Clinic not found", STATUS_CODES.NOTFOUND);
    }

    if (
      clinic.accountStatus !== "active" &&
      clinic.accountStatus !== "trialing"
    ) {
      return BadRequestError(
        "Clinic is not active",
        STATUS_CODES.INVALID_INPUT
      );
    }

    // Check for duplicate firstName + lastName combination in the same clinic (case-insensitive)
    const duplicateNameConditions = {
      clinicId: req.auth.clinicId,
      [Op.and]: [
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('firstName')),
          body.firstName.toLowerCase()
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('lastName')),
          body.lastName.toLowerCase()
        ),
      ],
      deletedAt: null,
    };

    // Exclude existingUser if it exists (for update scenarios)
    if (existingUser && !existingUser.deletedAt) {
      duplicateNameConditions.id = { [Op.ne]: existingUser.id };
    }

    const duplicateUser = await User.findOne({
      where: duplicateNameConditions,
      paranoid: true, // Only check non-deleted users
    });

    if (duplicateUser) {
      await logFailedAttempt({
        action: AUDIT_ACTIONS.FAILED_PROVIDER_INVITATION,
        resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
        email: body.email,
        reason: 'Duplicate first name and last name combination in clinic',
        req,
        additionalChanges: {
          clinicId: req.auth.clinicId,
          invitedBy: req.auth.id,
          firstName: body.firstName,
          lastName: body.lastName,
          duplicateUserId: duplicateUser.id,
        },
      });
      return BadRequestError(
        `A provider with the name "${body.firstName} ${body.lastName}" already exists in this clinic`,
        STATUS_CODES.INVALID_INPUT
      );
    }

    const subscription = await Subscription.findOne({
      where: {
        clinicId: req.auth.clinicId,
        status: {
          [Op.in]: [
            SUBSCRIPTION_STATUSES.ACTIVE,
            SUBSCRIPTION_STATUSES.TRIALING,
          ],
        },
      },
    });

    if (!subscription) {
      return BadRequestError(
        "No active subscription found",
        STATUS_CODES.INVALID_INPUT
      );
    }

    // Remove provider limit check - graduated pricing handles unlimited providers
    const transaction = await sequelize.transaction();

    try {
      const invitationToken = crypto.randomBytes(32).toString("hex");
      const temporaryPassword = crypto.randomBytes(32).toString("hex");

      let newUser;
      let newProvider;

      // Case 1: User exists and is active (clinic admin becoming provider)
      if (existingUser && !existingUser.deletedAt) {
        newUser = existingUser;

        // For existing users (clinic admins), activate immediately - they already have credentials
        // Create provider record with active status since they don't need to set a password
        newProvider = await Provider.create(
          {
            userId: newUser.id,
            clinicId: req.auth.clinicId,
            specialty: null,
            licenseNumber: null,
            status: "active", // Immediately active for existing users
          },
          { transaction }
        );

        // Add provider role to user (clinic admin can also be provider)
        const existingRole = await models.UserRole.findOne({
          where: { userId: newUser.id, role: "provider" },
          transaction,
        });

        if (!existingRole) {
          await models.UserRole.create(
            {
              userId: newUser.id,
              role: "provider",
            },
            { transaction }
          );
        }

        // Generate provider slug if not already set
        if (!existingUser.providerSlug) {
          const providerSlug = await generateUniqueProviderSlug(
            existingUser.firstName,
            existingUser.lastName
          );
          await User.update(
            { providerSlug },
            { where: { id: existingUser.id }, transaction }
          );
        }
      } else if (existingUser && existingUser.deletedAt) {
        // Case 2: User was deleted, restore them
        await User.restore({ where: { id: existingUser.id }, transaction });

        await User.update(
          {
            password: generateHash(temporaryPassword),
            firstName: body.firstName,
            lastName: body.lastName,
            phone: null,
            role: "provider",
            clinicId: req.auth.clinicId,
          },
          { where: { id: existingUser.id }, transaction }
        );

        // DO NOT add provider role here - it will be added when invitation is accepted

        newUser = await User.findByPk(existingUser.id, { transaction });

        const existingProvider = await Provider.findOne({
          where: { userId: existingUser.id },
          paranoid: false,
          transaction,
        });

        if (existingProvider) {
          await Provider.restore({
            where: { id: existingProvider.id },
            transaction,
          });

          await Provider.update(
            {
              clinicId: req.auth.clinicId,
              specialty: null,
              licenseNumber: null,
              status: "invited",
            },
            { where: { id: existingProvider.id }, transaction }
          );

          newProvider = await Provider.findByPk(existingProvider.id, {
            transaction,
          });
        } else {
          newProvider = await Provider.create(
            {
              userId: newUser.id,
              clinicId: req.auth.clinicId,
              specialty: null,
              licenseNumber: null,
              status: "invited",
            },
            { transaction }
          );
        }
      } else {
        // Case 3: New user (doesn't exist yet)
        // Generate unique provider slug
        const providerSlug = await generateUniqueProviderSlug(
          body.firstName,
          body.lastName
        );

        newUser = await User.create(
          {
            email: body.email,
            password: generateHash(temporaryPassword),
            firstName: body.firstName,
            lastName: body.lastName,
            phone: null,
            role: "provider",
            clinicId: req.auth.clinicId,
            providerSlug,
          },
          { transaction }
        );

        // Create UserRole record for provider
        await models.UserRole.create(
          {
            userId: newUser.id,
            role: "provider",
          },
          { transaction }
        );

        newProvider = await Provider.create(
          {
            userId: newUser.id,
            clinicId: req.auth.clinicId,
            specialty: null,
            licenseNumber: null,
            status: "invited",
          },
          { transaction }
        );
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // For existing users (clinic admins), mark invitation as already accepted
      const isExistingActiveUser = existingUser && !existingUser.deletedAt;

      const invitationData = {
        clinicId: req.auth.clinicId,
        email: body.email,
        role: "provider",
        token: invitationToken,
        expiresAt,
        invitedByUserId: req.auth.id,
        accepted: !!isExistingActiveUser, // Explicitly true or false
        acceptedAt: isExistingActiveUser ? new Date() : null,
      };

      await UserInvitation.create(invitationData, { transaction });

      const invitationLink = `${process.env.FRONTEND_URL}/accept-invitation?token=${invitationToken}`;

      // Only send invitation email to new users who need to set a password
      if (!isExistingActiveUser) {
        await emailSender({
          label: "Mira Medical",
          receiver: body.email,
          subject: "You're Invited to Join MIRA",
          body: {
            title: "You're Invited to Join MIRA",
            message: `You've been invited to join MIRA, your practice's intelligent intake assistant designed to streamline patient history collection and improve visit efficiency.<br><br>MIRA helps gather structured patient information before the visit so you can begin the encounter better prepared and focus on examination and treatment planning.<br><br>To get started:<br>• Click the link below to activate your account<br>• Set your password and log in<br>• Begin using MIRA to review patient summaries generated prior to visits<br><br>Once logged in, you will have access to your provider dashboard, where you can review patient responses and the generated summaries. Here you will have access to your templates and can personalize them to meet your needs.<br><br>There are several video tutorials available to you on the left side of your dashboard, once you've logged in.  If you have further questions please email help@try-mira.com and we will respond within 24hrs.<br><br>Make sure to watch the Getting Started tutorial in our tutorial library on the left hand side of provider dashboard or just <a href="https://mira-landing-page.lovable.app/tutorials">click here</a>.<br><br>We're excited to have you using MIRA.<br><br>Best regards,<br>The MIRA Team`,
            link: invitationLink,
            linkText: "Activate Your Account",
            firstName: body.firstName,
          },
        });
      } else {
        // Send a different email to existing users (clinic admins)
        await emailSender({
          label: "Mira Medical",
          receiver: body.email,
          subject: `Provider Role Added - ${clinic.clinicName}`,
          body: {
            title: "Provider Role Activated",
            message: `You have been granted provider access at ${clinic.clinicName}. You can now access the provider features using your existing account credentials.`,
            link: `${process.env.FRONTEND_URL}/signin`,
            linkText: "Sign In",
            firstName: body.firstName,
          },
        });
      }

      await transaction.commit();

      if (isExistingActiveUser) {
        // Check if the user is a clinic admin
        const isClinicAdmin = existingUser.role === "clinic_admin";

        if (isClinicAdmin) {
          debug(
            "👤 Clinic admin becoming provider - already counted in initial subscription, no charge"
          );
        } else {
          // Only update subscription for non-admin users
          try {
            const activeProviderCount = await countActiveProviders(
              req.auth.clinicId
            );
            await updateSubscriptionQuantity(
              req.auth.clinicId,
              activeProviderCount,
              {
                reason: `Provider activated (existing user): ${body.email}`,
              }
            );
            debug(
              "✅ Stripe subscription quantity updated to %d",
              activeProviderCount
            );
          } catch (stripeError) {
            debug(
              "⚠️ Failed to update Stripe quantity: %s",
              stripeError.message
            );
          }
        }
      } else {
        debug(
          "📧 Provider invited but NOT charged yet. Will charge when invitation is accepted."
        );
      }

      const result = {
        userId: newUser.id,
        providerId: newProvider.id,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        status: isExistingActiveUser ? "active" : "invited",
        expiresAt,
        message: isExistingActiveUser
          ? "Existing user activated as provider immediately"
          : "Invitation sent to new user. Provider will be charged when invitation is accepted.",
      };

      SuccessResponse(res, result);
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  @SwaggerDoc({
    tags: ["Providers"],
    description:
      "Auto-create provider profile for clinic admin for role switching",
  })
  @RequestBodyValidator(autoCreateProviderSchema)
  @Request
  static async autoCreateProvider(req, res) {
    const { clinicId, firstName, lastName } = req.body;
    const userId = req.auth.id;

    // Get user from User table to get clinicId
    const user = await User.findByPk(userId);
    if (!user) {
      return BadRequestError(
        "User not found",
        STATUS_CODES.NOTFOUND
      );
    }

    // Verify the user is a clinic admin
    if (user.role !== "clinic_admin" || user.clinicId !== clinicId) {
      return BadRequestError(
        "Only clinic admins can create provider profiles",
        STATUS_CODES.FORBIDDEN
      );
    }

    // Get clinicId from user (already have it, but verify it matches)
    const userClinicId = user.clinicId;

    // Find clinicSlug from Clinics table
    const clinic = await Clinic.findByPk(userClinicId, {
      attributes: ['id', 'clinicSlug'],
    });

    if (!clinic || !clinic.clinicSlug) {
      return BadRequestError(
        "Clinic not found or clinicSlug not set",
        STATUS_CODES.NOTFOUND
      );
    }

    // Check if provider already exists for this user
    const existingProvider = await Provider.findOne({
      where: { userId, clinicId: userClinicId },
    });

    if (existingProvider) {
      return SuccessResponse(res, {
        providerId: existingProvider.id,
        message: "Provider profile already exists",
      });
    }

    // Make firstName and lastName lowercase
    const firstNameLower = firstName.toLowerCase();
    const lastNameLower = lastName.toLowerCase();

    // Generate providerSlug: clinicSlug + firstname(lowercase) + lastname(lowercase)
    const providerSlug = `${clinic.clinicSlug}-${firstNameLower}-${lastNameLower}`;

    const transaction = await sequelize.transaction();

    try {
      // Create provider profile
      const newProvider = await Provider.create(
        {
          userId,
          clinicId: userClinicId,
          specialty: null,
          licenseNumber: null,
          status: "active", // Clinic admin's provider profile is active immediately
        },
        { transaction }
      );

      // Add provider role
      await UserRole.create(
        {
          userId,
          role: "provider",
        },
        { transaction }
      );

      // Update providerSlug in Users table
      await User.update(
        { providerSlug },
        { where: { id: userId }, transaction }
      );

      await transaction.commit();

      debug(
        "✅ Auto-created provider profile %s for clinic admin %s with providerSlug: %s",
        newProvider.id,
        userId,
        providerSlug
      );

      return SuccessResponse(res, {
        providerId: newProvider.id,
        providerSlug,
        message: "Provider profile created successfully",
      });
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      debug("❌ Error auto-creating provider: %s", error.message);
      return BadRequestError(
        "Failed to create provider profile",
        STATUS_CODES.INTERNAL_ERROR
      );
    }
  }

  @SwaggerDoc({
    tags: ["Providers"],
    description:
      "Accept provider invitation by setting password. Activates provider account.",
    security: [],
  })
  @RequestBodyValidator(acceptInvitationSchema)
  @AuditLog({
    action: AUDIT_ACTIONS.PROVIDER_ACTIVATED,
    resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
    getResourceId: (result) => result?.id,
    // eslint-disable-next-line no-unused-vars
    getChanges: (req, result) => ({
      email: result?.email,
      clinicId: result?.clinicId,
      passwordSet: true,
    }),
  })
  @Request
  static async acceptInvitation(req, res) {
    const { body } = req;

    const invitation = await UserInvitation.findOne({
      where: { token: body.token, accepted: false },
    });
    if (!invitation) {
      await logFailedAttempt({
        action: AUDIT_ACTIONS.FAILED_PROVIDER_ACTIVATION,
        resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
        email: "unknown",
        reason: "Invalid or expired invitation token",
        req,
        additionalChanges: { tokenProvided: !!body.token },
      });
      return BadRequestError(
        "Invalid or expired invitation token",
        STATUS_CODES.NOTFOUND
      );
    }

    if (new Date() > invitation.expiresAt) {
      await logFailedAttempt({
        action: AUDIT_ACTIONS.FAILED_PROVIDER_ACTIVATION,
        resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
        email: invitation.email,
        reason: "Invitation has expired",
        req,
        additionalChanges: {
          expiresAt: invitation.expiresAt,
          clinicId: invitation.clinicId,
        },
      });
      return BadRequestError(
        "Invitation has expired",
        STATUS_CODES.INVALID_INPUT
      );
    }

    const existingUser = await User.findOne({
      where: { email: invitation.email },
      include: [{ model: Provider, as: "provider" }],
    });

    if (!existingUser) {
      return BadRequestError(
        "User not found for this invitation",
        STATUS_CODES.NOTFOUND
      );
    }

    if (!existingUser.provider) {
      return BadRequestError(
        "Provider record not found",
        STATUS_CODES.NOTFOUND
      );
    }

    if (existingUser.provider.status === "active") {
      return BadRequestError(
        "Invitation already accepted",
        STATUS_CODES.INVALID_INPUT
      );
    }

    // Check if this is an existing user (clinic admin) who was already activated
    // Existing users should have been activated immediately during invitation
    const isExistingUser = existingUser.role === "clinic_admin";

    if (isExistingUser) {
      return BadRequestError(
        "Your provider role has already been activated. Please sign in with your existing account credentials.",
        STATUS_CODES.INVALID_INPUT
      );
    }

    const transaction = await sequelize.transaction();

    try {
      // Only update password for new users (not existing clinic admins)
      await User.update(
        {
          password: generateHash(body.password),
        },
        { where: { id: existingUser.id }, transaction }
      );

      await Provider.update(
        {
          status: "active",
        },
        { where: { id: existingUser.provider.id }, transaction }
      );

      // Add provider role to user (clinic admin can also be provider)
      const existingRole = await models.UserRole.findOne({
        where: { userId: existingUser.id, role: "provider" },
        transaction,
      });

      if (!existingRole) {
        await models.UserRole.create(
          {
            userId: existingUser.id,
            role: "provider",
          },
          { transaction }
        );
      }

      // Generate provider slug if not already set
      if (!existingUser.providerSlug) {
        const providerSlug = await generateUniqueProviderSlug(
          existingUser.firstName,
          existingUser.lastName
        );
        await User.update(
          { providerSlug },
          { where: { id: existingUser.id }, transaction }
        );
      }

      await UserInvitation.update(
        { accepted: true, acceptedAt: new Date() },
        { where: { id: invitation.id }, transaction }
      );

      await transaction.commit();

      // NOW charge Stripe since provider is active
      // BUT skip if user is clinic admin (they're already counted in initial subscription)
      const isClinicAdmin = existingUser.role === "clinic_admin";

      if (isClinicAdmin) {
        debug(
          "👤 Clinic admin accepted provider invitation - already counted in initial subscription, no charge"
        );
      } else {
        try {
          const activeProviderCount = await countActiveProviders(
            existingUser.clinicId
          );
          await updateSubscriptionQuantity(
            existingUser.clinicId,
            activeProviderCount,
            {
              reason: `Provider activated: ${existingUser.email}`,
            }
          );
          debug(
            "✅ Stripe charged for newly activated provider. Total active: %d",
            activeProviderCount
          );
        } catch (stripeError) {
          debug(
            "⚠️ Failed to update Stripe subscription quantity after provider activation: %s",
            stripeError.message
          );
        }
      }

      const updatedUser = await User.findByPk(existingUser.id, {
        include: [{ model: Provider, as: "provider" }],
      });

      const userResponse = updatedUser.toJSON();
      delete userResponse.password;

      SuccessResponse(res, userResponse);
      return userResponse;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  @SwaggerDoc({
    tags: ["Providers"],
    description:
      "Resend invitation email to provider with expired or unaccepted invitation",
  })
  @AuditLog({
    action: AUDIT_ACTIONS.PROVIDER_INVITED,
    resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
    getResourceId: (result) => result?.providerId,
    getChanges: (req, result) => ({
      email: result?.email,
      clinicId: req.auth.clinicId,
      resent: true,
    }),
  })
  @RequestBodyValidator(resendInvitationSchema)
  @Request
  static async resendInvitation(req, res) {
    const { body } = req;

    const provider = await Provider.findOne({
      where: { id: body.providerId, clinicId: req.auth.clinicId },
      include: [{ model: User, as: "user" }],
    });

    if (!provider) {
      return BadRequestError("Provider not found", STATUS_CODES.NOTFOUND);
    }

    if (provider.status === "active") {
      return BadRequestError(
        "Provider has already accepted the invitation",
        STATUS_CODES.INVALID_INPUT
      );
    }

    const clinic = await Clinic.findByPk(req.auth.clinicId);
    if (!clinic) {
      return BadRequestError("Clinic not found", STATUS_CODES.NOTFOUND);
    }

    const existingInvitation = await UserInvitation.findOne({
      where: { email: provider.user.email, accepted: false },
    });

    if (!existingInvitation) {
      return BadRequestError(
        "No pending invitation found for this provider",
        STATUS_CODES.NOTFOUND
      );
    }

    const newToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await UserInvitation.update(
      {
        token: newToken,
        expiresAt,
      },
      { where: { id: existingInvitation.id } }
    );

    const invitationLink = `${process.env.FRONTEND_URL}/accept-invitation?token=${newToken}`;

    await emailSender({
      label: "Mira Medical",
      receiver: provider.user.email,
      subject: "You're Invited to Join MIRA",
      body: {
        title: "You're Invited to Join MIRA",
        message: `You've been invited to join MIRA, your practice's intelligent intake assistant designed to streamline patient history collection and improve visit efficiency.<br><br>MIRA helps gather structured patient information before the visit so you can begin the encounter better prepared and focus on examination and treatment planning.<br><br>To get started:<br>• Click the link below to activate your account<br>• Set your password and log in<br>• Begin using MIRA to review patient summaries generated prior to visits<br><br>Once logged in, you will have access to your provider dashboard, where you can review patient responses and the generated summaries. Here you will have access to your templates and can personalize them to meet your needs.<br><br>There are several video tutorials available to you on the left side of your dashboard, once you've logged in.  If you have further questions please email help@try-mira.com and we will respond within 24hrs.<br><br>Make sure to watch the Getting Started tutorial in our tutorial library on the left hand side of provider dashboard or just <a href="https://mira-landing-page.lovable.app/tutorials">click here</a>.<br><br>We're excited to have you using MIRA.<br><br>Best regards,<br>The MIRA Team`,
        link: invitationLink,
        linkText: "Activate Your Account",
        firstName: provider.user.firstName,
      },
    });

    const result = {
      providerId: provider.id,
      userId: provider.user.id,
      email: provider.user.email,
      message: "Invitation resent successfully",
      expiresAt,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Providers"],
    description:
      "Remove provider from clinic. Updates Stripe subscription quantity with automatic credit.",
  })
  @AuditLog({
    action: AUDIT_ACTIONS.PROVIDER_REMOVED,
    resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
    getResourceId: (result) => result?.id,
    // eslint-disable-next-line no-unused-vars
    getChanges: (req, result) => ({
      email: result?.email,
      clinicId: result?.clinicId,
      providerCount: result?.newProviderCount,
    }),
  })
  @Request
  static async removeProvider(req, res) {
    const { id } = req.params;

    const user = await User.findOne({
      where: {
        id,
        clinicId: req.auth.clinicId,
        role: "provider",
      },
      include: [
        {
          model: Provider,
          as: "provider",
          required: true,
        },
      ],
    });

    if (!user || !user.provider) {
      return BadRequestError("Provider not found", STATUS_CODES.NOTFOUND);
    }

    const wasActive = user.provider.status === "active";

    const transaction = await sequelize.transaction();

    try {
      await User.destroy({ where: { id }, transaction });

      await transaction.commit();

      if (wasActive) {
        try {
          const activeProviderCount = await countActiveProviders(
            req.auth.clinicId
          );
          await updateSubscriptionQuantity(
            req.auth.clinicId,
            activeProviderCount,
            {
              reason: `Active provider removed: ${user.email}`,
            }
          );
          debug(
            "✅ Stripe updated after removing active provider. Remaining: %d",
            activeProviderCount
          );
        } catch (stripeError) {
          debug(
            "⚠️ Failed to update Stripe subscription quantity after provider removal: %s",
            stripeError.message
          );
        }
      } else {
        debug(
          "📧 Removed invited (not active) provider. No Stripe update needed."
        );
      }

      const providerResponse = user.toJSON();
      delete providerResponse.password;

      SuccessResponse(res, providerResponse);
      return providerResponse;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

export default ProviderController;
