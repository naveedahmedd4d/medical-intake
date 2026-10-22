import { AzureChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { buildFormattingInstructions } from "../config/summaryFormatConfig";

function ensureSectionHeaderLineBreaks(text) {
  let result = text;
  result = result.replace(/Clinical Narrative:\s+/g, "Clinical Narrative:\n\n");
  result = result.replace(/^(.+)\n(Onset\/Duration:)/gm, "$1\n\n$2");
  return result;
}

const llm = new AzureChatOpenAI({
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_ENDPOINT?.replace(
    "https://",
    "",
  ).replace(".openai.azure.com/", ""),
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
});

export async function generatePatientSummary(formattedSummary) {
  console.log("\n=== AI SUMMARY SERVICE START ===");
  console.log("Input summary length:", formattedSummary.length);
  console.log("Input summary preview (first 500 chars):");
  console.log(formattedSummary.substring(0, 500));
  console.log("...\n");

  // Build formatting instructions from config
  const formattingInstructions = buildFormattingInstructions();

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `
        You are a resident physician documenting a consultation note.

        Your task is to generate a physician-ready clinical summary from structured patient intake data using a tone and style typical of a resident consult note.

        Use clear clinical sentences (not telegraphic shorthand).

        Use appropriate medical terminology.

        Avoid overly conversational or patient-facing phrasing.

        Do NOT include Assessment, Differential, or Plan.

        Do NOT speculate or infer missing clinical information.

        ────────────────────────────

        CLINICAL NARRATIVE (FRAMING PARAGRAPH)

        ────────────────────────────

        Produce ONE concise framing narrative paragraph that:

        * Identifies the chief complaint(s)

        * States overall duration (if known)

        * Includes relevant PMH/PSH/medications/anticoagulation when clinically important

        * Includes major red-flag modifiers if present

        * Avoids detailed symptom descriptors (location, radiation, severity, character, aggravating/alleviating factors, associated symptoms), as these will be documented in the problem-oriented sections below

        * Does NOT restate structured template labels (e.g., do not write “Pain locations:”)

        * Do not include or use MIPS and MIPS-RELATED DATA in the narrative content.

        STRICT EXCLUSION RULE:
        The following data elements MUST NEVER appear in the Clinical Narrative under any circumstance:

        * Smoking / tobacco use
        * Alcohol use
        * Job/work status
        * Advanced directive status
        * Depression screen results
        * Falls history
        * Ambulatory assistive device use (e.g., wheelchair, cane, walker)

        These elements are classified as MIPS / Quality Data and must ONLY appear in the "MIPS / Quality Data" section regardless of clinical context.

        This paragraph should frame the consultation and avoid duplicating structured HPI details.

        ────────────────────────────

        PROBLEM-ORIENTED SUBSECTIONS

        ────────────────────────────

        After the narrative, generate clearly labeled problem-oriented subsections with bullet points (one subsection per complaint/problem).

        Issue labeling rules:

        Label each issue using the most specific anatomical region and descriptor available.

        Preferred format:

        "[Laterality if given] [Anatomic Region] [Symptom]"

        Examples:

        * Left Low Back Pain
        * Right Knee Pain
        * Epigastric Abdominal Pain

        Avoid generic labels like “Issue 1.”

        Each problem subsection may include:

        * Onset/duration
        * Location
        * Radiation/spread
        * Character/quality
        * Severity
        * Aggravating factors
        * Alleviating factors
        * Associated symptoms
        * Functional impact
        * Relevant safety modifiers

        Only include fields that are present and non-empty.

        ────────────────────────────

        GLOBAL SECTIONS

        ────────────────────────────

        After all problem-oriented subsections, create:

        * Treatments to Date
        * Diagnostics
        * Additional Clinical Factors
        * MIPS / Quality Data (conditional — see rules below)

        Routing rules:

        If information reflects prior care → include under “Treatments to Date.”

        If information reflects tests or imaging → include under “Diagnostics.”

        If information is clinically relevant but does not fit narrative, problem sections, treatments, diagnostics, or MIPS → include under “Additional Clinical Factors.”

        Include clinically relevant template-derived clinical information if present in the intake data.

        Do NOT include administrative template metadata such as appointment dates, intake context labels, form metadata, or template-specific patient factors.

        ────────────────────────────

        MIPS-RELATED DATA HANDLING (HIGHEST PRIORITY RULE)

        ────────────────────────────

        The following fields are classified as MIPS / Quality data:

        * Smoking / tobacco use
        * Alcohol use
        * Job/work status
        * Advanced directive status
        * Depression screen result

        These fields must NEVER appear in:
        * The Clinical Narrative
        * Any Problem-Oriented subsection
        * Treatments to Date
        * Diagnostics
        * Additional Clinical Factors

        They must appear ONLY in the “MIPS / Quality Data” section if present.

        Falls history / fall risk:
        * If falls are directly related to the presenting complaint (e.g., neurologic instability, gait dysfunction, progressive weakness, dizziness), they MAY be included in the relevant Problem-Oriented subsection (preferred) or briefly referenced in the Clinical Narrative framing paragraph.
        * Regardless of clinical relevance, they MUST also appear in the “MIPS / Quality Data” section if present.

        Ambulatory assistive device use:
        * If it reflects baseline mobility status or functional decline related to the presenting complaint, it MAY be included in the relevant Problem-Oriented subsection (preferred) or briefly referenced in the Clinical Narrative framing paragraph.
        * Regardless of clinical relevance, it MUST also appear in the “MIPS / Quality Data” section if present.

        This rule overrides all other routing instructions.

        If NONE of the above MIPS fields are present in the intake data (including falls or assistive device use), OMIT the entire “MIPS / Quality Data” section.

        ────────────────────────────

        INTAKE CONTEXT EXCLUSION RULE

        ────────────────────────────

        The following template metadata fields must NEVER appear anywhere in the output:

        * Appointment date
        * Intake context
        * Template-specific patient factors
        * Form metadata
        * Submission timestamps
        * Template identifiers

        These fields are administrative metadata and are not part of the clinical documentation.

        They must NOT appear in:

        * Clinical Narrative
        * Problem-Oriented subsections
        * Treatments to Date
        * Diagnostics
        * Additional Clinical Factors
        * MIPS / Quality Data

        If present in the intake data, they must be ignored entirely.

        ────────────────────────────

        SECTION OMISSION RULES

        ────────────────────────────

        Omit any section that has no data.

        Omit any field that is blank, null, N/A, or not provided.

        Do not create empty headers.

      `,
    ],
    [
      "user",
      `Using ONLY the intake data below, generate a resident physician–style HPI summary in the required format.

${formattingInstructions}

---

Patient Intake Data:
{summary}

---

Return ONLY the structured clinical summary in this format:

Clinical Narrative:
- One paragraph summarizing the presenting complaint(s), key symptom patterns, and relevant background (PMH, PSH, medications, anticoagulation, functional modifiers if relevant).

Problem-Oriented HPI Details:

[Specific Issue Label]:
- Onset/duration:
- Location:
- Radiation/spread:
- Character/quality:
- Severity:
- Timing/pattern:
- Aggravating factors:
- Alleviating factors:
- Associated symptoms:
- Functional impact:
- Relevant safety modifiers (if specific to this issue):

(Repeat subsection for each distinct complaint.)

Treatments to Date:
- Current medications:
- Past medications:
- Procedures tried:
- Physical therapy / complementary therapy:

Diagnostics:
- Imaging:
- Labs:
- Other diagnostic testing:

MIPS / Quality Data:
- Smoking/tobacco use:
- Alcohol use:
- Falls history or fall risk:
- Job/work status:
- Advanced directive status:
- Depression screen result:
- Ambulatory assistive device use:

Intake Context (Template-Specific Patient Factors):
- (Include any remaining intake-derived patient information that does not fit above sections.)

Patient Goals:
-`,
    ],
  ]);
  const chain = prompt.pipe(llm);

  console.log("Invoking AI model...");
  const result = await chain.invoke({ summary: formattedSummary });

  console.log("\n=== AI GENERATED SUMMARY ===");
  console.log(result.content);
  console.log("=== AI SUMMARY SERVICE END ===\n");

  return ensureSectionHeaderLineBreaks(result.content);
}
