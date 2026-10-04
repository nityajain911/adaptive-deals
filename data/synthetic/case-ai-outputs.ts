/** Hand-authored development outputs for the three fictional demo cases. No model produced these. */
import type { AiTask, ClarificationOutput, ExplanationOutput, ExtractionOutput } from "@/ai/schemas";
import { allDemoCases, type CaseId } from "./cases";

const extraction = Object.fromEntries(allDemoCases().map((item) => [item.id, item.expected.extraction])) as Record<CaseId, ExtractionOutput>;

const reducedClarification: ClarificationOutput = {
  questions: [
    { field: "amountsIncludeGst", question: "Do both ₹50,000 and ₹60,000 include GST?" },
    { field: "approvalScope", question: "Is ₹60,000 the limit per payment or for the full contract?" },
  ],
};

const reducedExplanation: ExplanationOutput = {
  ranking: ["A"],
  comparison: "Option A keeps the work the buyer needs now and uses the engine-checked payment schedule.",
  option_notes: [],
};

const preserveExplanation: ExplanationOutput = {
  ranking: ["A"],
  comparison: "Option A preserves the requested scope and starts when the buyer's stated budget is available.",
  option_notes: [],
};

export const caseAuthoredOutputs: Record<CaseId, Partial<Record<AiTask, unknown>>> = {
  "reduced-scope": { extract: extraction["reduced-scope"], clarify: reducedClarification, explain: reducedExplanation },
  "preserve-scope": { extract: extraction["preserve-scope"], explain: preserveExplanation },
  "no-fit": { extract: extraction["no-fit"] },
};

export const CASE_SYNTHETIC_RUN_IDS: Record<CaseId, string> = {
  "reduced-scope": "run-synthetic-reduced-scope-0001",
  "preserve-scope": "run-synthetic-preserve-scope-0001",
  "no-fit": "run-synthetic-no-fit-0001",
};
