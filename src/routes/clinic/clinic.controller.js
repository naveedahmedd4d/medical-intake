import express from "express";
import { v4 as uuidv4 } from "uuid";
import slugify from "slugify";
import models from "../../models";
import {
  STATUS_CODES,
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  AWS_CONFIG,
} from "../../utils/constants";
import {
  BadRequestError,
  generateHash,
  SuccessResponse,
} from "../../utils/helper";
import {
  clinicOnboardingWithPaymentSchema,
  listClinicsQuerySchema,
  clinicIdParamSchema,
  updateClinicProfileSchema,
  validateClinicNameQuerySchema,
} from "./validationSchemas";
import {
  Request,
  AuditLog,
  SwaggerDoc,
  RequestBodyValidator,
} from "../../utils/decorators";
import {
  listClinicsQuery,
  getClinicByIdQuery,
  getClinicProfileQuery,
} from "./query";
import stripe from "../../utils/stripe";
import { createCheckoutSession } from "../../utils/stripeHelpers";
import upload from "../../middlewares/upload";
import {
  uploadFileToAzure,
  deleteFileFromAzure,
} from "../../utils/azureStorage";
import { getProviderCounts } from "../../utils/providerHelpers";
import { generateUniqueClinicSlug } from "../../utils/slugHelpers";

const {
  Clinic,
  User,
  ClinicLocation,
  Template,
  SubscriptionAcceptance,
  sequelize,
} = models;
const { Op } = models.Sequelize;

class ClinicController {
  static router;

  static getRouter() {
    this.router = express.Router();
    this.router.get("/", this.listClinics);
    this.router.get("/validate-name", this.validateClinicName);
    this.router.get("/profile", this.getClinicProfile);
    this.router.put("/profile", this.updateClinicProfile);
    this.router.get("/:id", this.getClinicById);
    this.router.delete("/:id", this.deleteClinic);
    this.router.post(
      "/onboarding/initiate",
      this.initiateOnboardingWithPayment,
    );
    this.router.post(
      "/profile/logo",
      upload("image-memory").single("file"),
      this.uploadLogo,
    );
    return this.router;
  }

  @SwaggerDoc({
    tags: ["Clinic Profile"],
    description: "Upload clinic logo to Azure Blob Storage",
    requestBody: {
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              file: {
                type: "string",
                format: "binary",
              },
            },
          },
        },
      },
    },
  })
  @AuditLog({
    action: AUDIT_ACTIONS.UPLOAD_CLINIC_LOGO,
    resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
    getResourceId: (result) => result?.id,
    getChanges: (req, result) => ({
      logoUrl: result?.logoUrl,
    }),
  })
  @Request
  static async uploadLogo(req, res) {
    if (!req.file) {
      return BadRequestError("No file uploaded", STATUS_CODES.INVALID_INPUT);
    }
    const { clinicId } = req.auth;
    const { buffer, originalname, mimetype } = req.file;

    const clinic = await Clinic.findByPk(clinicId);
    if (!clinic) {
      return BadRequestError("Clinic not found", STATUS_CODES.NOTFOUND);
    }

    if (clinic.logoUrl) {
      await deleteFileFromAzure(clinic.logoUrl);
    }

    const uniqueFileName = `${clinicId}-${Date.now()}-${originalname}`;
    const logoUrl = await uploadFileToAzure(
      buffer,
      uniqueFileName,
      mimetype,
      AWS_CONFIG.CLINIC_LOGO,
    );
    await clinic.update({ logoUrl });

    const result = {
      id: clinic.id,
      clinicName: clinic.clinicName,
      logoUrl: clinic.logoUrl,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Clinic Onboarding"],
    description:
      "Validate clinic name availability. Public endpoint to check if a clinic name already exists.",
    security: [],
    parameters: [
      {
        in: "query",
        name: "clinicName",
        required: true,
        schema: {
          type: "string",
          minLength: 2,
          maxLength: 200,
        },
        description: "Clinic name to validate",
      },
    ],
  })
  @Request
  static async validateClinicName(req, res) {
    const { error, value } = validateClinicNameQuerySchema.validate(req.query);
    if (error) {
      return BadRequestError(
        error.details[0].message,
        STATUS_CODES.INVALID_INPUT
      );
    }

    const { clinicName } = value;

    // Check for duplicate clinicName (case-insensitive)
    const duplicateClinicConditions = {
      [Op.and]: [
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('clinicName')),
          clinicName.toLowerCase()
        ),
      ],
      deletedAt: null,
    };

    const duplicateClinic = await Clinic.findOne({
      where: duplicateClinicConditions,
      paranoid: true, // Only check non-deleted clinics
    });

    const result = {
      clinicName,
      available: !duplicateClinic,
      exists: !!duplicateClinic,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Clinic Onboarding"],
    description:
      "Initiate clinic onboarding with Stripe payment. Creates clinic in trial mode and returns Stripe Checkout URL.",
    security: [],
  })
  @AuditLog({
    action: AUDIT_ACTIONS.CLINIC_ONBOARDING_INITIATED,
    resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
    getResourceId: (result) => result?.clinic?.id,
    getChanges: (req, result) => ({
      clinicName: result?.clinic?.clinicName,
      planType: req?.body?.payment?.planType,
      stripeCustomerId: result?.stripeCustomerId,
      checkoutSessionId: result?.checkoutSessionId,
    }),
  })
  @Request
  @RequestBodyValidator(clinicOnboardingWithPaymentSchema)
  static async initiateOnboardingWithPayment(req, res) {
    const { body } = req;
    const { clinic, admin, locations, payment = {}, acceptance } = body;
    const initialProviderCount = payment.initialProviderCount || 1;

    const existingUser = await User.findOne({
      where: { email: admin.email },
    });

    if (existingUser) {
      return BadRequestError(
        "Email already registered",
        STATUS_CODES.INVALID_INPUT,
      );
    }

    // Check for duplicate clinicName (case-insensitive)
    const duplicateClinicConditions = {
      [Op.and]: [
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('clinicName')),
          clinic.clinicName.toLowerCase()
        ),
      ],
      deletedAt: null,
    };

    const duplicateClinic = await Clinic.findOne({
      where: duplicateClinicConditions,
      paranoid: true, // Only check non-deleted clinics
    });

    if (duplicateClinic) {
      return BadRequestError(
        `A clinic with the name "${clinic.clinicName}" already exists`,
        STATUS_CODES.INVALID_INPUT
      );
    }

    const clinicSlug = `${slugify(clinic.clinicName, {
      lower: true,
    })}`;

    const hashedPassword = generateHash(admin.password);

    const transaction = await sequelize.transaction();

    try {
      const newClinic = await Clinic.create(
        {
          clinicName: clinic.clinicName,
          clinicSlug,
          practiceType: clinic.practiceType,
          subscriptionStatus: "pending_payment",
          accountStatus: "pending_payment",
          stripeCustomerId: null,
          selectedPlan: "graduated",
          providerCount: 0,
        },
        { transaction },
      );

      const newUser = await User.create(
        {
          email: admin.email,
          password: hashedPassword,
          firstName: admin.firstName,
          lastName: admin.lastName,
          phone: admin.phone,
          role: "clinic_admin",
          clinicId: newClinic.id,
        },
        { transaction },
      );
      const locationData = locations.map((location, index) => ({
        clinicId: newClinic.id,
        addressLine1: location.addressLine1,
        addressLine2: location.addressLine2,
        city: location.city,
        state: location.state,
        zipCode: location.zipCode,
        phone: location.phone,
        isPrimary: index === 0,
      }));

      await Promise.all([
        models.UserRole.create(
          {
            userId: newUser.id,
            role: "clinic_admin",
          },
          { transaction },
        ),
        /* eslint-disable indent */
        locationData.length > 0
          ? ClinicLocation.bulkCreate(locationData, {
              transaction,
              validate: false,
              returning: false,
            })
          : Promise.resolve([]),
        /* eslint-enable indent */
      ]);

      await transaction.commit();

      const customer = await stripe.customers.create({
        email: admin.email,
        name: `${admin.firstName} ${admin.lastName}`,
        phone: admin.phone,
        metadata: {
          clinicId: newClinic.id,
          userId: newUser.id,
          pricingModel: "graduated",
        },
      });

      const checkoutSession = await createCheckoutSession({
        stripeCustomerId: customer.id,
        clinicId: newClinic.id,
        userId: newUser.id,
        initialProviderCount,
      });

      const updateTransaction = await sequelize.transaction();
      let acceptanceRecord = null;
      try {
        await Clinic.update(
          {
            stripeCustomerId: customer.id,
            checkoutSessionId: checkoutSession.id,
          },
          { where: { id: newClinic.id }, transaction: updateTransaction },
        );

        if (acceptance) {
          const ipAddress =
            req.headers["x-forwarded-for"] ||
            req.connection?.remoteAddress ||
            req.ip;
          const userAgent = req.headers["user-agent"];
          const acceptanceTimestamp = new Date();

          const pricingTier =
            acceptance.pricingTier ||
            payment.selectedPlan ||
            payment.planType ||
            "graduated";

          acceptanceRecord = await SubscriptionAcceptance.create(
            {
              clinicId: newClinic.id,
              userId: newUser.id,
              subscriptionId: null,

              legalEntityName: acceptance.legalEntityName,
              signerName: acceptance.signerName,
              signerEmail: acceptance.signerEmail,
              signerTitle: acceptance.signerTitle,
              pricingTier,
              providerCount: acceptance.providerCount,
              pricePerProvider: acceptance.pricePerProvider,
              totalSubscriptionPrice: acceptance.totalSubscriptionPrice,
              billingFrequency: acceptance.billingFrequency,
              subscriptionStartDate: new Date(),
              termsAccepted: acceptance.termsAccepted,
              acceptanceTimestamp,
              ipAddress,
              userAgent,
              termsVersion:
                acceptance.termsVersion || process.env.TERMS_VERSION || "1.0",
              agreementVersion:
                acceptance.agreementVersion ||
                process.env.AGREEMENT_VERSION ||
                "1.0",

              stripeCheckoutSessionId: checkoutSession.id,
              stripeCustomerId: customer.id,
            },
            { transaction: updateTransaction },
          );
        }

        await updateTransaction.commit();
      } catch (updateError) {
        await updateTransaction.rollback();
        // Clinic is already created, so we don't fail the request
      }

      // Build response (acceptanceRecord may be null if update failed)
      const response = {
        clinic: {
          id: newClinic.id,
          clinicName: newClinic.clinicName,
          subscriptionStatus: newClinic.subscriptionStatus,
          selectedPlan: newClinic.selectedPlan,
        },
        checkoutUrl: checkoutSession.url,
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.id,
        acceptanceId: acceptanceRecord?.id || null,
      };

      SuccessResponse(res, response);
      return response;
    } catch (error) {
      // Rollback main transaction if it exists and hasn't been committed
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  @SwaggerDoc({
    tags: ["Clinic Profile"],
    description:
      "Get current clinic profile information for clinic admin. Returns clinic details, admin info, locations, and subscription.",
  })
  @Request
  @AuditLog({
    action: AUDIT_ACTIONS.VIEW_CLINIC_PROFILE,
    resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
    getResourceId: (result) => result?.id,
    getChanges: (req, result) => ({
      clinicName: result?.clinicName,
      locationCount: result?.locations?.length || 0,
    }),
  })
  static async getClinicProfile(req, res) {
    const { clinicId } = req.auth;

    if (!clinicId) {
      return BadRequestError(
        "Clinic ID not found in authentication",
        STATUS_CODES.UNAUTHORIZED,
      );
    }

    const query = getClinicProfileQuery(clinicId);
    const clinic = await Clinic.findOne(query);

    if (!clinic) {
      return BadRequestError("Clinic not found", STATUS_CODES.NOTFOUND);
    }

    const admin =
      clinic.users && clinic.users.length > 0 ? clinic.users[0] : null;

    const locations = [];
    if (clinic.locations) {
      clinic.locations.forEach((loc) => {
        locations.push({
          id: loc.id,
          addressLine1: loc.addressLine1,
          addressLine2: loc.addressLine2,
          city: loc.city,
          state: loc.state,
          zipCode: loc.zipCode,
          phone: loc.phone,
          isPrimary: loc.isPrimary,
        });
      });
    }

    const currentSubscription =
      clinic.subscriptions && clinic.subscriptions.length > 0
        ? clinic.subscriptions[0]
        : null;

    let subscriptionInfo = null;
    if (currentSubscription) {
      let effectivePricePerProvider = null;
      const quantity = currentSubscription.providerCount || 1;
      if (currentSubscription.stripeSubscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(
            currentSubscription.stripeSubscriptionId,
            { expand: ['latest_invoice'] }
          );
          let invoice = subscription.latest_invoice;
          if (typeof invoice === 'string' && invoice) {
            invoice = await stripe.invoices.retrieve(invoice);
          }
          const amountPaid =
            invoice && typeof invoice === 'object' && invoice.amount_paid != null
              ? invoice.amount_paid
              : null;
          if (amountPaid != null && amountPaid > 0 && quantity > 0) {
            effectivePricePerProvider =
              Math.round((amountPaid / 100 / quantity) * 100) / 100;
          }
        } catch (err) {
          // Stripe API error - fall back to base pricing below
        }
      }
      if (effectivePricePerProvider == null) {
        const count = currentSubscription.providerCount || 0;
        effectivePricePerProvider =
          count <= 10 ? 199 : count <= 20 ? 149 : 99;
      }
      subscriptionInfo = {
        id: currentSubscription.id,
        planType: currentSubscription.planType,
        status: currentSubscription.status,
        monthlyRatePerProvider: effectivePricePerProvider,
        providerCount: currentSubscription.providerCount,
        currentPeriodStart: currentSubscription.currentPeriodStart,
        currentPeriodEnd: currentSubscription.currentPeriodEnd,
      };
    }

    let adminInfo = null;
    if (admin) {
      adminInfo = {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        phone: admin.phone,
      };
    }
    const defaultTemplate = await Template.findOne({
      where: { clinicId: clinic.id, isDefault: true },
      attributes: ["id", "name"],
    });

    // Get accurate provider counts (active vs invited)
    const providerCounts = await getProviderCounts(clinicId);

    const result = {
      id: clinic.id,
      clinicName: clinic.clinicName,
      logoUrl: clinic.logoUrl,
      practiceType: clinic.practiceType,
      subscriptionStatus: clinic.subscriptionStatus,
      accountStatus: clinic.accountStatus,
      admin: adminInfo,
      locations,
      subscription: subscriptionInfo,
      createdAt: clinic.createdAt,
      templateId: defaultTemplate?.id || null,
      templateName: defaultTemplate?.name || null,
      providerCounts: {
        active: providerCounts.active,
        invited: providerCounts.invited,
        total: providerCounts.total,
      },
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Clinic Profile"],
    description:
      "Update clinic profile information including clinic details, admin info, and locations.",
  })
  @RequestBodyValidator(updateClinicProfileSchema)
  @AuditLog({
    action: AUDIT_ACTIONS.UPDATE_CLINIC_PROFILE,
    resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
    getResourceId: (result) => result.id,
    getChanges: (req) => req.body,
  })
  @Request
  static async updateClinicProfile(req, res) {
    const {
      clinicName,
      practiceType,
      primaryColor,
      secondaryColor,
      admin,
      locations,
    } = req.body;
    const { clinicId } = req.auth;

    if (!clinicId) {
      return BadRequestError(
        "Clinic ID not found in authentication",
        STATUS_CODES.UNAUTHORIZED,
      );
    }

    const transaction = await sequelize.transaction();

    try {
      const clinic = await Clinic.findByPk(clinicId, { transaction });
      if (!clinic) {
        await transaction.rollback();
        return BadRequestError("Clinic not found", STATUS_CODES.NOTFOUND);
      }

      // Update clinic fields
      const clinicUpdateData = {};
      if (clinicName !== undefined) {
        clinicUpdateData.clinicName = clinicName;
        const newClinicSlug = await generateUniqueClinicSlug(clinicName, clinicId);
        clinicUpdateData.clinicSlug = newClinicSlug;
      }
      if (practiceType !== undefined) {
        clinicUpdateData.practiceType =
          practiceType === "" ? null : practiceType;
      }
      if (primaryColor !== undefined) {
        clinicUpdateData.primaryColor =
          primaryColor === "" ? null : primaryColor;
      }
      if (secondaryColor !== undefined) {
        clinicUpdateData.secondaryColor =
          secondaryColor === "" ? null : secondaryColor;
      }

      if (Object.keys(clinicUpdateData).length > 0) {
        await Clinic.update(clinicUpdateData, {
          where: { id: clinicId },
          transaction,
        });
      }

      // Update admin user info
      if (admin) {
        const adminUser = await User.findOne({
          where: { clinicId, role: "clinic_admin" },
          transaction,
        });

        if (adminUser) {
          const adminUpdateData = {};
          if (admin.firstName !== undefined) {
            adminUpdateData.firstName = admin.firstName;
          }
          if (admin.lastName !== undefined) {
            adminUpdateData.lastName = admin.lastName;
          }
          if (admin.email !== undefined) {
            const existingUser = await User.findOne({
              where: { email: admin.email },
              transaction,
            });
            if (existingUser && existingUser.id !== adminUser.id) {
              await transaction.rollback();
              return BadRequestError(
                "Email already in use",
                STATUS_CODES.INVALID_INPUT,
              );
            }
            adminUpdateData.email = admin.email;
          }
          if (admin.phone !== undefined) {
            adminUpdateData.phone = admin.phone === "" ? null : admin.phone;
          }

          if (Object.keys(adminUpdateData).length > 0) {
            await User.update(adminUpdateData, {
              where: { id: adminUser.id },
              transaction,
            });
          }
        }
      }

      if (locations && Array.isArray(locations)) {
        const existingLocations = await ClinicLocation.findAll({
          where: { clinicId },
          transaction,
        });

        const existingLocationIds = existingLocations.map((loc) => loc.id);
        const providedLocationIds = locations
          .filter((loc) => loc.id)
          .map((loc) => loc.id);
        const locationsToDelete = existingLocationIds.filter(
          (id) => !providedLocationIds.includes(id),
        );
        if (locationsToDelete.length > 0) {
          await ClinicLocation.destroy({
            where: { id: locationsToDelete },
            transaction,
          });
        }

        const locationPromises = locations.map((location, i) => {
          const locationData = {
            clinicId,
            addressLine1: location.addressLine1,
            addressLine2: location.addressLine2 || null,
            city: location.city,
            state: location.state,
            zipCode: location.zipCode,
            phone: location.phone,
            isPrimary:
              location.isPrimary !== undefined ? location.isPrimary : i === 0,
          };

          if (location.id) {
            return ClinicLocation.update(locationData, {
              where: { id: location.id, clinicId },
              transaction,
            });
          }
          return ClinicLocation.create(locationData, { transaction });
        });

        await Promise.all(locationPromises);

        if (locations.length > 0 && !locations.some((loc) => loc.isPrimary)) {
          const firstLocation = locations[0];
          if (firstLocation.id) {
            await ClinicLocation.update(
              { isPrimary: true },
              {
                where: { id: firstLocation.id },
                transaction,
              },
            );
          }
        }
      }

      await transaction.commit();

      const query = getClinicProfileQuery(clinicId);
      const updatedClinic = await Clinic.findOne(query);

      const adminUser =
        updatedClinic.users && updatedClinic.users.length > 0
          ? updatedClinic.users[0]
          : null;

      const locationsData = [];
      if (updatedClinic.locations) {
        updatedClinic.locations.forEach((loc) => {
          locationsData.push({
            id: loc.id,
            addressLine1: loc.addressLine1,
            addressLine2: loc.addressLine2,
            city: loc.city,
            state: loc.state,
            zipCode: loc.zipCode,
            phone: loc.phone,
            isPrimary: loc.isPrimary,
          });
        });
      }

      const currentSubscription =
        updatedClinic.subscriptions && updatedClinic.subscriptions.length > 0
          ? updatedClinic.subscriptions[0]
          : null;

      let subscriptionInfo = null;
      if (currentSubscription) {
        subscriptionInfo = {
          id: currentSubscription.id,
          planType: currentSubscription.planType,
          status: currentSubscription.status,
          providerCount: currentSubscription.providerCount,
          currentPeriodStart: currentSubscription.currentPeriodStart,
          currentPeriodEnd: currentSubscription.currentPeriodEnd,
        };
      }

      let adminInfo = null;
      if (adminUser) {
        adminInfo = {
          id: adminUser.id,
          email: adminUser.email,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          phone: adminUser.phone,
        };
      }

      const defaultTemplate = await Template.findOne({
        where: { clinicId: updatedClinic.id, isDefault: true },
        attributes: ["id", "name"],
      });

      // Get accurate provider counts (active vs invited)
      const providerCounts = await getProviderCounts(clinicId);

      const result = {
        id: updatedClinic.id,
        clinicName: updatedClinic.clinicName,
        practiceType: updatedClinic.practiceType,
        subscriptionStatus: updatedClinic.subscriptionStatus,
        accountStatus: updatedClinic.accountStatus,
        admin: adminInfo,
        locations: locationsData,
        subscription: subscriptionInfo,
        createdAt: updatedClinic.createdAt,
        templateId: defaultTemplate?.id || null,
        templateName: defaultTemplate?.name || null,
        providerCounts: {
          active: providerCounts.active,
          invited: providerCounts.invited,
          total: providerCounts.total,
        },
      };

      SuccessResponse(res, result);
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  @SwaggerDoc({
    tags: ["Admin - Clinic Management"],
    description:
      "List all clinics with filtering, search, and pagination. Super admin only. Search by clinic name, admin email, or city.",
    query: {
      search: {
        type: "string",
        description: "Search by clinic name, admin email, or city",
      },
      planType: {
        type: "string",
        enum: ["starter", "professional", "enterprise"],
      },
      status: {
        type: "string",
        enum: [
          "active",
          "cancelled",
          "past_due",
          "pending_payment",
          "suspended",
        ],
      },

      page: { type: "number", default: 1 },
      pageSize: { type: "number", default: 10 },
      sortColumn: { type: "string", default: "createdAt" },
      sortOrder: { type: "string", enum: ["ASC", "DESC"], default: "DESC" },
    },
  })
  @Request
  @AuditLog({
    action: AUDIT_ACTIONS.VIEW_CLINIC_LIST,
    resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
    getResourceId: () => null,
    getChanges: (req, result) => ({
      searchTerm: req.query.search || null,
      filters: {
        status: req.query.status || null,
      },
      resultCount: result?.totalRecords || 0,
    }),
  })
  static async listClinics(req, res) {
    const { error, value } = listClinicsQuerySchema.validate(req.query, {
      convert: true,
    });
    if (error) {
      return BadRequestError(
        error.details[0].message,
        STATUS_CODES.INVALID_INPUT,
      );
    }

    const { search, status, page, pageSize, sortColumn, sortOrder } = value;

    const query = listClinicsQuery({
      search,
      status,
      sortColumn,
      sortOrder,
      pageNumber: page,
      pageSize,
    });

    const { count, rows: clinics } = await Clinic.findAndCountAll(query);

    const clinicsData = clinics.map((clinic) => {
      const adminEmails = clinic.users
        ? clinic.users.map((user) => user.email)
        : [];
      const cities = clinic.locations
        ? clinic.locations.map((loc) => loc.city)
        : [];
      const currentSubscription =
        clinic.subscriptions && clinic.subscriptions.length > 0
          ? clinic.subscriptions[0]
          : null;

      return {
        id: clinic.id,
        clinicName: clinic.clinicName,
        adminEmails,
        cities,
        planType: currentSubscription ? currentSubscription.planType : null,
        subscriptionStatus: clinic.subscriptionStatus,
        practiceType: clinic.practiceType,
        createdAt: clinic.createdAt,
      };
    });

    const result = {
      totalRecords: count,
      clinics: clinicsData,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Admin - Clinic Management"],
    description:
      "Get detailed information about a specific clinic. Super admin only.",
    params: {
      id: { type: "string", format: "uuid", description: "Clinic ID" },
    },
  })
  @Request
  @AuditLog({
    action: AUDIT_ACTIONS.VIEW_CLINIC_DETAILS,
    resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
    getResourceId: (result) => result?.id,
    getChanges: (req, result) => ({
      clinicName: result?.clinicName,
      adminCount: result?.admins?.length || 0,
      locationCount: result?.locations?.length || 0,
    }),
  })
  static async getClinicById(req, res) {
    const { error } = clinicIdParamSchema.validate(req.params);
    if (error) {
      return BadRequestError(
        error.details[0].message,
        STATUS_CODES.INVALID_INPUT,
      );
    }

    const query = getClinicByIdQuery(req.params.id);
    const clinic = await Clinic.findOne(query);

    if (!clinic) {
      return BadRequestError("Clinic not found", STATUS_CODES.NOTFOUND);
    }

    const admins = [];
    if (clinic.users) {
      clinic.users.forEach((user) => {
        admins.push({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
        });
      });
    }

    const locations = [];
    if (clinic.locations) {
      clinic.locations.forEach((loc) => {
        locations.push({
          id: loc.id,
          addressLine1: loc.addressLine1,
          addressLine2: loc.addressLine2,
          city: loc.city,
          state: loc.state,
          zipCode: loc.zipCode,
          phone: loc.phone,
          isPrimary: loc.isPrimary,
        });
      });
    }

    const currentSubscription =
      clinic.subscriptions && clinic.subscriptions.length > 0
        ? clinic.subscriptions[0]
        : null;

    let subscriptionInfo = null;
    if (currentSubscription) {
      subscriptionInfo = {
        id: currentSubscription.id,
        planType: currentSubscription.planType,
        status: currentSubscription.status,
        monthlyRatePerProvider: currentSubscription.monthlyRatePerProvider,
        providerCount: currentSubscription.providerCount,
        currentPeriodStart: currentSubscription.currentPeriodStart,
        currentPeriodEnd: currentSubscription.currentPeriodEnd,
        stripeSubscriptionId: currentSubscription.stripeSubscriptionId,
      };
    }

    const result = {
      id: clinic.id,
      clinicName: clinic.clinicName,
      practiceType: clinic.practiceType,
      primaryColor: clinic.primaryColor,
      secondaryColor: clinic.secondaryColor,
      subscriptionStatus: clinic.subscriptionStatus,
      accountStatus: clinic.accountStatus,
      trialDaysRemaining: clinic.trialDaysRemaining,
      trialEndsAt: clinic.trialEndsAt,
      createdAt: clinic.createdAt,
      updatedAt: clinic.updatedAt,
      admins,
      locations,
      subscription: subscriptionInfo,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Admin - Clinic Management"],
    description: "Soft delete a clinic using paranoid mode. Super admin only.",
    params: {
      id: { type: "string", format: "uuid", description: "Clinic ID" },
    },
  })
  @Request
  @AuditLog({
    action: AUDIT_ACTIONS.DELETE_CLINIC,
    resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
    getResourceId: (result) => result?.id,
    getChanges: (req, result) => ({
      clinicName: result?.clinicName,
      previousStatus: result?.subscriptionStatus,
      deletedAt: result?.deletedAt,
    }),
  })
  static async deleteClinic(req, res) {
    const { error } = clinicIdParamSchema.validate(req.params);
    if (error) {
      return BadRequestError(
        error.details[0].message,
        STATUS_CODES.INVALID_INPUT,
      );
    }

    const clinic = await Clinic.findByPk(req.params.id);

    if (!clinic) {
      return BadRequestError("Clinic not found", STATUS_CODES.NOTFOUND);
    }

    if (clinic.deletedAt) {
      return BadRequestError(
        "Clinic is already deleted",
        STATUS_CODES.BAD_REQUEST,
      );
    }

    await clinic.destroy();

    const result = {
      id: clinic.id,
      clinicName: clinic.clinicName,
      subscriptionStatus: clinic.subscriptionStatus,
      deletedAt: clinic.deletedAt,
      message: "Clinic soft deleted successfully",
    };

    SuccessResponse(res, result);
    return result;
  }
}

export default ClinicController;
