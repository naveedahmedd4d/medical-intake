import "dotenv/config";
import { v4 as uuidv4 } from "uuid";
import db from "../src/models";
import { generateHash } from "../src/utils/helper";
import { DEFAULT_TEMPLATE_STRUCTURE } from "../src/utils/defaultTemplateStructure";
import {
  generateUniqueClinicSlug,
  generateUniqueProviderSlug,
} from "../src/utils/slugHelpers";

const CLINIC_NAME = "Local Test Clinic";
const ADMIN_EMAIL = "local-admin@test.com";
const ADMIN_PASSWORD = "LocalAdmin123!";
const PROVIDER_EMAIL = "local-provider@test.com";
const PROVIDER_PASSWORD = "LocalProvider123!";
const PROVIDER_FIRST = "Alex";
const PROVIDER_LAST = "Rivera";

async function ensureClinicTemplate(clinicId, transaction) {
  let template = await db.Template.findOne({
    where: { clinicId, isDefault: true },
    transaction,
  });

  if (template) {
    return template;
  }

  const systemDefault = await db.Template.findOne({
    where: { clinicId: null, isDefault: true },
    transaction,
  });

  if (systemDefault) {
    const questions = await db.TemplateQuestion.findAll({
      where: { templateId: systemDefault.id },
      order: [["position", "ASC"]],
      transaction,
    });

    template = await db.Template.create(
      {
        id: uuidv4(),
        clinicId,
        name: systemDefault.name || DEFAULT_TEMPLATE_STRUCTURE.name,
        description: systemDefault.description || null,
        isDefault: true,
        isActive: true,
      },
      { transaction }
    );

    const normalizeJsonField = (val) => {
      if (val == null) return null;
      if (typeof val === "object") return JSON.stringify(val);
      if (typeof val !== "string") return String(val);
      let cur = val;
      for (let i = 0; i < 5; i += 1) {
        try {
          const parsed = JSON.parse(cur);
          if (typeof parsed === "string") {
            cur = parsed;
          } else {
            return JSON.stringify(parsed);
          }
        } catch (e) {
          return cur;
        }
      }
      return cur;
    };

    const idMap = {};
    const rows = questions.map((q) => {
      const newId = uuidv4();
      idMap[q.id] = newId;
      return {
        id: newId,
        templateId: template.id,
        questionIdentifier: q.questionIdentifier,
        questionText: q.questionText,
        questionType: q.questionType,
        category: q.category,
        position: q.position,
        parentQuestionId: null,
        showCondition: normalizeJsonField(q.showCondition),
        options: normalizeJsonField(q.options),
        systemComponent: q.systemComponent,
      };
    });

    rows.forEach((row, idx) => {
      const originalParent = questions[idx].parentQuestionId;
      if (originalParent && idMap[originalParent]) {
        row.parentQuestionId = idMap[originalParent];
      }
    });

    if (rows.length) {
      await db.TemplateQuestion.bulkCreate(rows, { transaction });
    }

    return template;
  }

  template = await db.Template.create(
    {
      id: uuidv4(),
      clinicId,
      name: DEFAULT_TEMPLATE_STRUCTURE.name,
      isDefault: true,
      isActive: true,
    },
    { transaction }
  );

  const questionIdMap = {};
  const templateQuestions = DEFAULT_TEMPLATE_STRUCTURE.questions.map(
    (question) => {
      const questionId = uuidv4();
      questionIdMap[question.questionIdentifier] = questionId;
      return {
        id: questionId,
        templateId: template.id,
        questionIdentifier: question.questionIdentifier,
        questionText: question.questionText,
        questionType: question.questionType,
        category: question.category,
        position: question.position,
        parentQuestionId: null,
        showCondition: question.showCondition
          ? JSON.stringify(question.showCondition)
          : null,
        options: question.options ? JSON.stringify(question.options) : null,
        systemComponent: question.systemComponent || null,
      };
    }
  );

  templateQuestions.forEach((question) => {
    const original = DEFAULT_TEMPLATE_STRUCTURE.questions.find(
      (q) => q.questionIdentifier === question.questionIdentifier
    );
    if (original?.parentQuestionIdentifier) {
      question.parentQuestionId =
        questionIdMap[original.parentQuestionIdentifier];
    }
  });

  await db.TemplateQuestion.bulkCreate(templateQuestions, { transaction });
  return template;
}

async function upsertUser({
  email,
  password,
  firstName,
  lastName,
  role,
  clinicId,
  providerSlug,
  transaction,
}) {
  let user = await db.User.findOne({
    where: { email },
    paranoid: false,
    transaction,
  });

  if (user) {
    await user.update(
      {
        password: generateHash(password),
        firstName,
        lastName,
        role,
        clinicId,
        providerSlug: providerSlug || user.providerSlug,
        deletedAt: null,
      },
      { transaction }
    );
  } else {
    user = await db.User.create(
      {
        id: uuidv4(),
        email,
        password: generateHash(password),
        firstName,
        lastName,
        role,
        clinicId,
        providerSlug: providerSlug || null,
        phone: null,
      },
      { transaction }
    );
  }

  if (db.UserRole) {
    const existingRole = await db.UserRole.findOne({
      where: { userId: user.id, role },
      transaction,
    });
    if (!existingRole) {
      await db.UserRole.create(
        {
          id: uuidv4(),
          userId: user.id,
          role,
        },
        { transaction }
      );
    }
  }

  return user;
}

async function main() {
  await db.sequelize.authenticate();
  const transaction = await db.sequelize.transaction();

  try {
    let clinic = await db.Clinic.findOne({
      where: { clinicName: CLINIC_NAME },
      transaction,
    });

    if (!clinic) {
      const clinicSlug = await generateUniqueClinicSlug(CLINIC_NAME);
      clinic = await db.Clinic.create(
        {
          id: uuidv4(),
          clinicName: CLINIC_NAME,
          clinicSlug,
          practiceType: "General Practice",
          subscriptionStatus: "active",
          accountStatus: "active",
          trialDaysRemaining: 0,
          providerCount: 1,
          selectedPlan: "starter",
        },
        { transaction }
      );
      console.log("CREATED_CLINIC", clinic.id, clinic.clinicSlug);
    } else {
      if (!clinic.clinicSlug) {
        const clinicSlug = await generateUniqueClinicSlug(
          CLINIC_NAME,
          clinic.id
        );
        await clinic.update(
          {
            clinicSlug,
            subscriptionStatus: "active",
            accountStatus: "active",
          },
          { transaction }
        );
      } else {
        await clinic.update(
          {
            subscriptionStatus: "active",
            accountStatus: "active",
          },
          { transaction }
        );
      }
      console.log("EXISTING_CLINIC", clinic.id, clinic.clinicSlug);
    }

    await upsertUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      firstName: "Local",
      lastName: "Admin",
      role: "clinic_admin",
      clinicId: clinic.id,
      transaction,
    });

    const providerSlug = await generateUniqueProviderSlug(
      PROVIDER_FIRST,
      PROVIDER_LAST
    );

    const providerUser = await upsertUser({
      email: PROVIDER_EMAIL,
      password: PROVIDER_PASSWORD,
      firstName: PROVIDER_FIRST,
      lastName: PROVIDER_LAST,
      role: "provider",
      clinicId: clinic.id,
      providerSlug,
      transaction,
    });

    if (!providerUser.providerSlug) {
      await providerUser.update({ providerSlug }, { transaction });
    }

    let provider = await db.Provider.findOne({
      where: { userId: providerUser.id },
      transaction,
    });

    const template = await ensureClinicTemplate(clinic.id, transaction);

    if (!provider) {
      provider = await db.Provider.create(
        {
          id: uuidv4(),
          userId: providerUser.id,
          clinicId: clinic.id,
          specialty: "Family Medicine",
          status: "active",
          activeTemplateId: template.id,
        },
        { transaction }
      );
      console.log("CREATED_PROVIDER", provider.id);
    } else {
      await provider.update(
        {
          clinicId: clinic.id,
          status: "active",
          activeTemplateId: template.id,
          deletedAt: null,
        },
        { transaction }
      );
      console.log("UPDATED_PROVIDER", provider.id);
    }

    await clinic.update({ providerCount: 1 }, { transaction });

    const existingSub = await db.Subscription.findOne({
      where: { clinicId: clinic.id },
      transaction,
    });
    if (!existingSub) {
      const now = new Date();
      const end = new Date(now);
      end.setFullYear(end.getFullYear() + 1);
      await db.Subscription.create(
        {
          id: uuidv4(),
          clinicId: clinic.id,
          planType: "starter",
          providerCount: 1,
          stripeSubscriptionId: `local_test_sub_${Date.now()}`,
          stripePriceId: "local_test_price",
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: end,
        },
        { transaction }
      );
    } else if (existingSub.status !== "active") {
      await existingSub.update({ status: "active" }, { transaction });
    }

    await transaction.commit();

    const finalSlug =
      providerUser.providerSlug ||
      (
        await db.User.findByPk(providerUser.id, {
          attributes: ["providerSlug"],
        })
      ).providerSlug;

    console.log("---");
    console.log(`clinicId=${clinic.id}`);
    console.log(`clinicSlug=${clinic.clinicSlug}`);
    console.log(`clinicAdminEmail=${ADMIN_EMAIL}`);
    console.log(`clinicAdminPassword=${ADMIN_PASSWORD}`);
    console.log(`providerId=${provider.id}`);
    console.log(`providerUserId=${providerUser.id}`);
    console.log(`providerSlug=${finalSlug}`);
    console.log(`providerEmail=${PROVIDER_EMAIL}`);
    console.log(`providerPassword=${PROVIDER_PASSWORD}`);
    console.log(`templateId=${template.id}`);
    console.log(
      `intakeUrl=http://localhost:8082/intake/${clinic.clinicSlug}/${finalSlug}`
    );
  } catch (err) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    throw err;
  } finally {
    await db.sequelize.close();
  }
}

main().catch((err) => {
  console.error("SEED_FAILED:", err.message);
  console.error(err.stack);
  process.exit(1);
});
