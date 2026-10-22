import { v4 as uuidv4 } from 'uuid';
import models from '../src/models/index';
import { DEFAULT_TEMPLATE_STRUCTURE } from '../src/utils/defaultTemplateStructure';

const { Template, TemplateQuestion, sequelize } = models;

const CLINIC_ID = '46c6d95f-76e7-4a2c-90ea-49b51ce5bc26';

async function createTemplate() {
  const transaction = await sequelize.transaction();

  try {
    console.log('Starting template creation...');

    const templateId = uuidv4();
    const templateName = `${DEFAULT_TEMPLATE_STRUCTURE.name} - ${new Date().toISOString()}`;

    console.log(`Creating template with ID: ${templateId}`);
    console.log(`Template name: ${templateName}`);

    await Template.create(
      {
        id: templateId,
        clinicId: CLINIC_ID,
        name: templateName,
        isDefault: false,
      },
      { transaction }
    );

    console.log('Template created successfully.');
    console.log('Creating template questions...');

    const questionIdMap = {};
    const templateQuestions = DEFAULT_TEMPLATE_STRUCTURE.questions.map((question) => {
      const questionId = uuidv4();
      questionIdMap[question.questionIdentifier] = questionId;

      return {
        id: questionId,
        templateId,
        questionIdentifier: question.questionIdentifier,
        questionText: question.questionText,
        questionType: question.questionType,
        category: question.category,
        position: question.position,
        parentQuestionId: null,
        showCondition: question.showCondition ? JSON.stringify(question.showCondition) : null,
        options: question.options ? JSON.stringify(question.options) : null,
        systemComponent: question.systemComponent || null,
      };
    });

    templateQuestions.forEach((question) => {
      const originalQuestion = DEFAULT_TEMPLATE_STRUCTURE.questions.find(
        (q) => q.questionIdentifier === question.questionIdentifier
      );
      if (originalQuestion?.parentQuestionIdentifier) {
        question.parentQuestionId = questionIdMap[originalQuestion.parentQuestionIdentifier];
      }
    });

    await TemplateQuestion.bulkCreate(templateQuestions, { transaction });

    console.log(`Created ${templateQuestions.length} template questions.`);

    await transaction.commit();

    console.log('\n=== Template Created Successfully ===');
    console.log(`Template ID: ${templateId}`);
    console.log(`Template Name: ${templateName}`);
    console.log(`Clinic ID: ${CLINIC_ID}`);
    console.log(`Total Questions: ${templateQuestions.length}`);
    console.log('=====================================\n');

    process.exit(0);
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    console.error('Error creating template:', error);
    process.exit(1);
  }
}

createTemplate();
