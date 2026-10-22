import "dotenv/config";
import { v4 as uuidv4 } from "uuid";
import db from "../src/models";

const DEMO_CLINIC_ID = "46c6d95f-76e7-4a2c-90ea-49b51ce5bc26";
const DEMO_PROVIDER_ID = "821a00ab-c63b-40d9-a9ad-77d4f7bfd9cc";

function normalizeJsonField(val) {
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
}

async function main() {
  await db.sequelize.authenticate();
  const transaction = await db.sequelize.transaction();

  try {
    let clinicTemplate = await db.Template.findOne({
      where: { clinicId: DEMO_CLINIC_ID, isDefault: true },
      transaction,
    });

    if (!clinicTemplate) {
      const systemTemplate = await db.Template.findOne({
        where: { clinicId: null, isDefault: true },
        transaction,
      });
      if (!systemTemplate) {
        throw new Error("No system default template found");
      }

      const questions = await db.TemplateQuestion.findAll({
        where: { templateId: systemTemplate.id },
        order: [["position", "ASC"]],
        transaction,
      });

      clinicTemplate = await db.Template.create(
        {
          id: uuidv4(),
          clinicId: DEMO_CLINIC_ID,
          name: systemTemplate.name,
          description: systemTemplate.description,
          isDefault: true,
          isActive: true,
        },
        { transaction }
      );

      const idMap = {};
      const rows = questions.map((q) => {
        const newId = uuidv4();
        idMap[q.id] = newId;
        return {
          id: newId,
          templateId: clinicTemplate.id,
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

      console.log(
        `CLONED_TEMPLATE ${clinicTemplate.id} questions=${rows.length}`
      );
    } else {
      console.log(`EXISTING_CLINIC_TEMPLATE ${clinicTemplate.id}`);
    }

    await db.Provider.update(
      { activeTemplateId: clinicTemplate.id },
      { where: { id: DEMO_PROVIDER_ID }, transaction }
    );
    console.log(`PROVIDER_TEMPLATE_SET ${DEMO_PROVIDER_ID}`);

    const encoded = await db.TemplateQuestion.findAll({
      transaction,
    });
    let fixed = 0;
    for (const q of encoded) {
      const nextOptions = normalizeJsonField(q.options);
      const nextShow = normalizeJsonField(q.showCondition);
      if (nextOptions !== q.options || nextShow !== q.showCondition) {
        await q.update(
          { options: nextOptions, showCondition: nextShow },
          { transaction }
        );
        fixed += 1;
      }
    }
    console.log(`NORMALIZED_OPTIONS ${fixed}`);

    await transaction.commit();
    console.log("DONE");
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  } finally {
    await db.sequelize.close();
  }
}

main().catch((err) => {
  console.error("FAILED", err.message);
  process.exit(1);
});
