/**
 * Summary Format Configuration
 * Defines the structure and formatting rules for AI-generated patient summaries
 */

export const SUMMARY_FORMAT_CONFIG = {
  sections: {
    patientIntroduction: {
      name: 'Patient Introduction',
      format: 'prose', // Single flowing paragraph, NO bullet points, NO lists, NO dashes
      requiredOrder: [
        'Demographics',
        'Medical History',
        'Surgical History',
        'Anticoagulation',
        'Chief Complaint',
        'Pain Locations',
      ],
      rules: [
        'MUST be written as a single flowing paragraph with NO bullet points, NO lists, NO dashes - just continuous prose text',
        'Must use "chief complaint" terminology',
        'End paragraph with pain locations',
        'Use age-appropriate descriptors: infant (0-1 year), toddler (1-3 years), child (3-12 years), adolescent (13-17 years), young adult (18-25 years), adult (26+ years)',
      ],
    },

    painAreas: {
      name: 'Pain Area',
      headerFormat: 'Pain Area – {location}', // e.g., "Pain Area – Low Back"
      format: 'bullets',
      requiredFields: ['Duration', 'Self-injury date'],
      rules: [
        'Preserve section headers: **Pain Area – [Location]**',
        'Use bullet points (•) for all details',
        'Include Duration and Self-injury date as separate bullets when available',
      ],
    },

    treatmentsToDate: {
      name: 'Treatments to Date',
      format: 'subsections',
      mandatory: true,
      subsections: {
        currentMedications: {
          header: 'Current Medications:',
          key: 'current_medications',
        },
        pastMedications: {
          header: 'Past Medications:',
          key: 'past_medications',
        },
        proceduresTried: {
          header: 'Procedures Tried:',
          key: 'procedures',
        },
        complementaryTherapy: {
          header: 'Complementary / Alternative Therapy:',
          key: 'complementary_therapy',
        },
      },
      rules: [
        'You MUST preserve these subsection headers when they appear in the input',
        'Each subsection MUST keep its bold header even if it has only one bullet point',
        'NEVER combine bullets from different subsections under one header',
        'NEVER remove subsection headers',
        'Keep bullets organized under their correct subsection header',
        "If a subsection is not in the input, don't include it",
      ],
    },

    diagnostics: {
      name: 'Diagnostics',
      format: 'bullets',
      emptyValue: 'None',
      rules: ['Use bullets or write "None" if empty'],
    },

    functionalGoals: {
      name: 'Functional Goals',
      format: 'clinical-sentences',
      conversion: 'first-person to third-person',
      rules: [
        'Convert patient language to clinical sentences',
        'Change first-person to third-person ("I want to walk" → "Patient aims to walk")',
      ],
    },
  },

  globalRules: {
    responseInterpretation: [
      "CAREFULLY READ each question-answer pair and accurately interpret the patient's responses",
      'When a patient answers "yes", they ARE reporting that condition/symptom - include it in the summary',
      'When a patient answers "no", they are NOT reporting that condition/symptom',
      '**ONLY include positive findings** - do not mention things the patient does NOT have',
      '❌ BAD: "Patient denies shoulder pain" or "No reported pain"',
      '✅ GOOD: Only mention pain if they answered "yes" to a pain question',
      'Exception: Include clinically critical negatives (no allergies, not taking blood thinners before surgery, etc.)',
      'If ALL responses are negative (all "no" answers), state: "No significant findings reported"',
      'Pay close attention to the actual answer value (yes/no/specific text) and reflect it accurately',
      'Use the category hints to organize information appropriately',
    ],

    formatting: [
      'Use **bold** titles for each section (e.g., **Pain Assessment**, **Medical History**, **Current Medications**, etc)',
      'Use bullet points or short paragraphs for detailed information within sections',
      'Maintain a clinical and professional tone',
      'Avoid unnecessary repetition',
      'Omit entire sections that have no positive findings (e.g., if no pain reported, omit Pain Assessment section entirely)',
      'Rephrase goals and descriptions into complete, clinical-sounding sentences',
      'Group related information logically by category',
      'Use age-appropriate patient descriptors based on date of birth: infant (0-12 months), toddler (1-3 years), child (3-12 years), adolescent (13-17 years), young adult (18-25 years), or adult (26+ years)',
    ],

    rewriting: [
      "Rephrase content for clinical clarity (don't copy patient words verbatim)",
      'Use professional medical terminology',
      'Maintain proper grammar',
      'Use standard medical abbreviations where appropriate',
      'Keep the same structure and headers as the input',
    ],
  },
};

/**
 * Builds detailed formatting instructions for the AI prompt
 */
export function buildFormattingInstructions() {
  const config = SUMMARY_FORMAT_CONFIG;

  let instructions = '**Critical Instructions - Response Interpretation:**\n';
  config.globalRules.responseInterpretation.forEach((rule) => {
    instructions += `- ${rule}\n`;
  });

  instructions += '\n**Formatting Guidelines:**\n';
  config.globalRules.formatting.forEach((rule) => {
    instructions += `- ${rule}\n`;
  });

  instructions += '\n**Detailed Section Requirements:**\n\n';

  // Patient Introduction
  instructions += `1. **${config.sections.patientIntroduction.name}**:\n`;
  config.sections.patientIntroduction.rules.forEach((rule) => {
    instructions += `   - ${rule}\n`;
  });
  instructions += `   - Order: ${config.sections.patientIntroduction.requiredOrder.join(
    ' → '
  )}\n\n`;

  // Pain Areas
  instructions += `2. **${config.sections.painAreas.name} Sections**:\n`;
  config.sections.painAreas.rules.forEach((rule) => {
    instructions += `   - ${rule}\n`;
  });
  instructions += '\n';

  // Treatments to Date
  instructions += `3. **${config.sections.treatmentsToDate.name}** - MANDATORY STRUCTURE:\n`;
  instructions += `   - Main header: **${config.sections.treatmentsToDate.name}**\n`;
  instructions +=
    '   - You MUST preserve these subsection headers when they appear in the input:\n';
  Object.values(config.sections.treatmentsToDate.subsections).forEach((subsection) => {
    instructions += `     • **${subsection.header}**\n`;
  });
  config.sections.treatmentsToDate.rules.forEach((rule) => {
    instructions += `   - ${rule}\n`;
  });
  instructions += '\n';

  // Diagnostics
  instructions += `4. **${config.sections.diagnostics.name}**:\n`;
  instructions += `   - Header: **${config.sections.diagnostics.name}**\n`;
  config.sections.diagnostics.rules.forEach((rule) => {
    instructions += `   - ${rule}\n`;
  });
  instructions += '\n';

  // Functional Goals
  instructions += `5. **${config.sections.functionalGoals.name}**:\n`;
  instructions += `   - Header: **${config.sections.functionalGoals.name}**\n`;
  config.sections.functionalGoals.rules.forEach((rule) => {
    instructions += `   - ${rule}\n`;
  });
  instructions += '\n';

  instructions += '**Rewriting Guidelines:**\n';
  config.globalRules.rewriting.forEach((rule) => {
    instructions += `- ${rule}\n`;
  });

  return instructions;
}
