"use strict";

const { randomUUID } = require("crypto");

const DEMO_CLINIC_ID = "46c6d95f-76e7-4a2c-90ea-49b51ce5bc26";
const DEMO_PROVIDER_ID = "821a00ab-c63b-40d9-a9ad-77d4f7bfd9cc";

function normalizeJsonText(val) {
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

module.exports = {
  async up(queryInterface) {
    const [systemTemplates] = await queryInterface.sequelize.query(`
      SELECT id, name, description, "isActive"
      FROM "Templates"
      WHERE "clinicId" IS NULL AND "isDefault" = true AND "deletedAt" IS NULL
      ORDER BY "createdAt" ASC
      LIMIT 1;
    `);

    if (!systemTemplates.length) {
      throw new Error(
        "No system default template found to clone for demo clinic"
      );
    }

    const systemTemplate = systemTemplates[0];

    const [clinicDefaults] = await queryInterface.sequelize.query(
      `
      SELECT id
      FROM "Templates"
      WHERE "clinicId" = :clinicId AND "isDefault" = true AND "deletedAt" IS NULL
      LIMIT 1;
    `,
      { replacements: { clinicId: DEMO_CLINIC_ID } }
    );

    let clinicTemplateId = clinicDefaults[0]?.id || null;

    if (!clinicTemplateId) {
      clinicTemplateId = randomUUID();
      const now = new Date();

      await queryInterface.bulkInsert("Templates", [
        {
          id: clinicTemplateId,
          clinicId: DEMO_CLINIC_ID,
          name: systemTemplate.name,
          description: systemTemplate.description,
          isDefault: true,
          isActive: systemTemplate.isActive !== false,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const [questions] = await queryInterface.sequelize.query(
        `
        SELECT *
        FROM "TemplateQuestions"
        WHERE "templateId" = :templateId AND "deletedAt" IS NULL
        ORDER BY position ASC;
      `,
        { replacements: { templateId: systemTemplate.id } }
      );

      const idMap = {};
      const rows = questions.map((q) => {
        const newId = randomUUID();
        idMap[q.id] = newId;
        return {
          id: newId,
          templateId: clinicTemplateId,
          questionIdentifier: q.questionIdentifier,
          questionText: q.questionText,
          questionType: q.questionType,
          category: q.category,
          position: q.position,
          parentQuestionId: null,
          showCondition: normalizeJsonText(q.showCondition),
          options: normalizeJsonText(q.options),
          systemComponent: q.systemComponent,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
      });

      rows.forEach((row, idx) => {
        const originalParent = questions[idx].parentQuestionId;
        if (originalParent && idMap[originalParent]) {
          row.parentQuestionId = idMap[originalParent];
        }
      });

      if (rows.length) {
        await queryInterface.bulkInsert("TemplateQuestions", rows);
      }
    }

    await queryInterface.sequelize.query(
      `
      UPDATE "Providers"
      SET "activeTemplateId" = :templateId, "updatedAt" = NOW()
      WHERE id = :providerId;
    `,
      {
        replacements: {
          templateId: clinicTemplateId,
          providerId: DEMO_PROVIDER_ID,
        },
      }
    );

    const [allQuestions] = await queryInterface.sequelize.query(`
      SELECT id, options, "showCondition"
      FROM "TemplateQuestions"
      WHERE "deletedAt" IS NULL
        AND (
          (options IS NOT NULL AND LEFT(options::text, 1) = '"')
          OR ("showCondition" IS NOT NULL AND LEFT("showCondition"::text, 1) = '"')
        );
    `);

    for (const q of allQuestions) {
      const nextOptions = normalizeJsonText(q.options);
      const nextShow = normalizeJsonText(q.showCondition);
      if (nextOptions === q.options && nextShow === q.showCondition) {
        continue;
      }
      await queryInterface.sequelize.query(
        `
        UPDATE "TemplateQuestions"
        SET
          options = :options,
          "showCondition" = :showCondition,
          "updatedAt" = NOW()
        WHERE id = :id;
      `,
        {
          replacements: {
            id: q.id,
            options: nextOptions,
            showCondition: nextShow,
          },
        }
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `
      UPDATE "Providers"
      SET "activeTemplateId" = NULL, "updatedAt" = NOW()
      WHERE id = :providerId;
    `,
      { replacements: { providerId: DEMO_PROVIDER_ID } }
    );

    const [templates] = await queryInterface.sequelize.query(
      `
      SELECT id FROM "Templates"
      WHERE "clinicId" = :clinicId AND "isDefault" = true AND "deletedAt" IS NULL;
    `,
      { replacements: { clinicId: DEMO_CLINIC_ID } }
    );

    for (const t of templates) {
      await queryInterface.sequelize.query(
        `DELETE FROM "TemplateQuestions" WHERE "templateId" = :templateId;`,
        { replacements: { templateId: t.id } }
      );
      await queryInterface.sequelize.query(
        `DELETE FROM "Templates" WHERE id = :templateId;`,
        { replacements: { templateId: t.id } }
      );
    }
  },
};
