/** Ordinal labels for pain area ranking (consistent with intake UI) */
function getOrdinalLabel(n) {
  const labels = { 1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', 5: 'Fifth', 6: 'Sixth', 7: 'Seventh', 8: 'Eighth', 9: 'Ninth', 10: 'Tenth' };
  return labels[n] ?? `${n}th`;
}

/**
 * Recursively formats response data into human-readable text
 * Handles: primitives, arrays, objects, nested structures
 */
function formatResponseValue(data) {
  // Handle null/undefined
  if (data == null) {
    return '';
  }

  // Handle primitives (string, number, boolean)
  if (typeof data !== 'object') {
    return String(data);
  }

  // Handle arrays
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return '';
    }

    // Check if array contains objects
    if (typeof data[0] === 'object' && data[0] !== null) {
      return data
        .map((item) => {
          if (item.option) {
            // Multi-select with option field (e.g., {option: "X", dose: "10mg"})
            const details = Object.keys(item)
              .filter((key) => key !== 'option' && item[key])
              .map((key) => `${key}: ${item[key]}`)
              .join(', ');

            return details ? `${item.option} (${details})` : item.option;
          }
          // Fallback for other object structures
          return formatResponseValue(item);
        })
        .filter((val) => val)
        .join('; ');
    }

    // Array of primitives
    return data
      .map((item) => formatResponseValue(item))
      .filter((val) => val)
      .join(', ');
  }

  // Handle plain objects
  if (data.option) {
    // Single object with option field
    const details = Object.keys(data)
      .filter((key) => key !== 'option' && data[key])
      .map((key) => `${key}: ${data[key]}`)
      .join(', ');

    return details ? `${data.option} (${details})` : data.option;
  }

  // Generic object - convert to key: value pairs
  const entries = Object.entries(data)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}: ${formatResponseValue(value)}`)
    .filter((entry) => entry.split(': ')[1])
    .join(', ');

  return entries || '';
}

function formatPatientSummaryGeneric(intakeSession, responses, questions) {
  console.log('=== formatPatientSummaryGeneric START ===');
  console.log(`Total responses received: ${responses.length}`);
  console.log(`Total questions: ${questions.length}`);

  const age = intakeSession.dateOfBirth
    ? new Date().getFullYear() - new Date(intakeSession.dateOfBirth).getFullYear()
    : 'N/A';
  const gender = intakeSession.gender || 'N/A';

  const summaryParts = [];

  // Patient demographics (Name and DOB excluded from LLM input for privacy)
  summaryParts.push(
    `**Patient Demographics**\nAge: ${age}\nGender: ${
      gender.charAt(0).toUpperCase() + gender.slice(1)
    }\nAppointment Date: ${intakeSession.appointmentDate || 'N/A'}`
  );

  // Question-Answer Pairs - Let AI interpret and categorize
  const questionAnswerPairs = [];
  let skippedCount = 0;

  responses.forEach((response, index) => {
    const question = questions.find((item) => item.id === response.templateQuestionId);

    if (!question) {
      console.log(`[${index}] SKIPPED - Question not found for ID: ${response.templateQuestionId}`);
      skippedCount += 1;
      return;
    }

    const responseData =
      typeof response.responseData === 'string'
        ? JSON.parse(response.responseData)
        : response.responseData;

    console.log(`[${index}] Question: "${question.questionText}"`);
    console.log(`[${index}] Raw responseData:`, JSON.stringify(responseData));

    // Skip empty, null, or "skipped" responses
    if (
      responseData == null ||
      responseData === 'skipped' ||
      (typeof responseData === 'string' && responseData.trim() === '') ||
      (Array.isArray(responseData) && responseData.length === 0)
    ) {
      console.log(`[${index}] SKIPPED - Empty/null/skipped response`);
      skippedCount += 1;
      return;
    }

    const questionText = question.questionText || question.questionIdentifier;
    let formattedAnswer;

    // Special handling for initial-pain: use First/Second/Third labels (consistent with intake UI)
    if (question.questionIdentifier === 'initial-pain' && Array.isArray(responseData) && responseData.length > 0) {
      const items = responseData
        .map((item, idx) => {
          const label = getOrdinalLabel(idx + 1);
          const option = item && typeof item === 'object' && item.option
            ? item.option
            : typeof item === 'string'
              ? item
              : formatResponseValue(item);
          return option && String(option).trim() ? `${label}: ${option}` : '';
        })
        .filter((val) => val);
      formattedAnswer = items.join('; ');
    } else {
      formattedAnswer = formatResponseValue(responseData);
    }

    console.log(`[${index}] Formatted answer: "${formattedAnswer}"`);

    // Skip if formatting resulted in empty string
    if (!formattedAnswer || formattedAnswer.trim() === '') {
      console.log(`[${index}] SKIPPED - Formatted answer is empty`);
      skippedCount += 1;
      return;
    }

    // Include category hint for AI (helps with organization)
    const categoryHint = question.category ? ` [Category: ${question.category}]` : '';
    const qaPair = `Q: ${questionText}${categoryHint}\nA: ${formattedAnswer}`;
    questionAnswerPairs.push(qaPair);
    console.log(`[${index}] INCLUDED - Added to summary`);
  });

  console.log(
    `\nSummary: ${questionAnswerPairs.length} questions included, ${skippedCount} skipped`
  );

  if (questionAnswerPairs.length > 0) {
    summaryParts.push(`**Patient Responses**\n\n${questionAnswerPairs.join('\n\n')}`);
  } else {
    console.log('WARNING: No question-answer pairs generated!');
    summaryParts.push(`**Patient Responses**\nNo responses recorded.`);
  }

  const finalSummary = summaryParts.join('\n\n');
  console.log('\n=== FINAL FORMATTED SUMMARY ===');
  console.log(finalSummary);
  console.log('=== END ===\n');

  return finalSummary;
}

export function formatPatientSummary(intakeSession, responses, questions) {
  // Always use the generic formatter - it handles all data structures properly
  return formatPatientSummaryGeneric(intakeSession, responses, questions);
}
