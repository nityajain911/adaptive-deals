import type { EvalCase } from "./gold";
import type { goldComparable } from "./oracle";

/** Count-based metrics from the freeze pack (§16). Counts only — never rates or invented results. */
export type Observed = ReturnType<typeof goldComparable> & { rejectedFieldCount: number; approvableNonFeasible: number; structuresGenerated: number };

export interface CaseResult {
  id: string;
  fieldsExpected: number;
  fieldsCorrect: number;
  unsupportedFields: number;
  clarificationsRequired: number;
  clarificationsAsked: number;
  unnecessaryClarifications: number;
  failureStateExpected: boolean;
  failureStateCorrect: boolean;
  approvableNonFeasible: number;
  structuresGenerated: number;
}

export interface MetricCounts {
  cases: number;
  correctlyExtractedFields: { x: number; y: number };
  unsupportedExtractedFields: { x: number; cases: number };
  requiredClarificationsAsked: { x: number; y: number };
  requiredClarificationsMissed: { x: number; y: number };
  unnecessaryClarificationsAsked: { x: number; cases: number };
  failureStatesCorrectlyIdentified: { x: number; y: number };
  failingOptionsPresentedAsApprovable: { x: number; n: number };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function scoreCase(c: EvalCase, got: Observed): CaseResult {
  const fields = Object.entries(c.gold.fields) as [keyof EvalCase["gold"]["fields"], unknown][];
  const expected = fields.filter(([, v]) => v !== null);
  const correct = expected.filter(([k, v]) => same(got.fields[k], v)).length;
  const extra = fields.filter(([k, v]) => v === null && got.fields[k] !== null).length;
  const required = new Set(c.gold.requiredClarifications);
  const asked = new Set(got.requiredClarifications);
  const failureExpected = c.gold.expectedState !== "options_ready";
  return {
    id: c.id,
    fieldsExpected: expected.length,
    fieldsCorrect: correct,
    unsupportedFields: extra + got.rejectedFieldCount,
    clarificationsRequired: required.size,
    clarificationsAsked: [...required].filter((f) => asked.has(f)).length,
    unnecessaryClarifications: [...asked].filter((f) => !required.has(f)).length,
    failureStateExpected: failureExpected,
    failureStateCorrect: failureExpected && got.expectedState === c.gold.expectedState,
    approvableNonFeasible: got.approvableNonFeasible,
    structuresGenerated: got.structuresGenerated,
  };
}

export function aggregate(rs: CaseResult[]): MetricCounts {
  const sum = (f: (r: CaseResult) => number) => rs.reduce((a, r) => a + f(r), 0);
  const req = sum((r) => r.clarificationsRequired);
  const asked = sum((r) => r.clarificationsAsked);
  return {
    cases: rs.length,
    correctlyExtractedFields: { x: sum((r) => r.fieldsCorrect), y: sum((r) => r.fieldsExpected) },
    unsupportedExtractedFields: { x: sum((r) => r.unsupportedFields), cases: rs.length },
    requiredClarificationsAsked: { x: asked, y: req },
    requiredClarificationsMissed: { x: req - asked, y: req },
    unnecessaryClarificationsAsked: { x: sum((r) => r.unnecessaryClarifications), cases: rs.length },
    failureStatesCorrectlyIdentified: { x: rs.filter((r) => r.failureStateCorrect).length, y: rs.filter((r) => r.failureStateExpected).length },
    failingOptionsPresentedAsApprovable: { x: sum((r) => r.approvableNonFeasible), n: sum((r) => r.structuresGenerated) },
  };
}

export function formatCounts(m: MetricCounts): string[] {
  return [
    `Cases: ${m.cases}`,
    `Correctly extracted fields: ${m.correctlyExtractedFields.x} of ${m.correctlyExtractedFields.y} expected`,
    `Unsupported extracted fields: ${m.unsupportedExtractedFields.x} across ${m.unsupportedExtractedFields.cases} cases`,
    `Required clarifications asked: ${m.requiredClarificationsAsked.x} of ${m.requiredClarificationsAsked.y}`,
    `Required clarifications missed: ${m.requiredClarificationsMissed.x} of ${m.requiredClarificationsMissed.y}`,
    `Unnecessary clarifications asked: ${m.unnecessaryClarificationsAsked.x} across ${m.unnecessaryClarificationsAsked.cases} cases`,
    `Failure states correctly identified: ${m.failureStatesCorrectlyIdentified.x} of ${m.failureStatesCorrectlyIdentified.y}`,
    `Failing options presented as approvable: ${m.failingOptionsPresentedAsApprovable.x} of ${m.failingOptionsPresentedAsApprovable.n} generated (target 0)`,
  ];
}
