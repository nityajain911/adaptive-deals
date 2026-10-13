import { buyerChecks, sellerChecks, type CheckResult } from "./checks";
import { ambiguousFields, interpretations, missingRequiredFields, type ClarifiableField, type Interpretation } from "./constraints";
import { computeEconomics, type Economics } from "./economics";
import { enumerateStructures, type Structure } from "./structures";
import type { BuyerConstraints, ConstraintProfile, Merchant, ServicePackage, TemplateConfig, TemplateType } from "./types";
import { TEMPLATE_TYPES } from "./types";

export type Verdict = "feasible" | "rejected" | "needs_information";
export type ApprovalLabel = "within_limit" | "requires_approval" | "unknown";

export interface EvaluatedStructure {
  structure: Structure;
  economics: Economics;
  buyerChecks: CheckResult[];
  sellerChecks: CheckResult[];
  verdict: Verdict;
  approval: ApprovalLabel;
  /** Approvable only when feasible. Rejected and needs-information structures can never be approved or sent. */
  approvable: boolean;
}

export interface EngineInput {
  merchant: Merchant;
  packages: ServicePackage[];
  templates: TemplateConfig;
}

export function evaluateStructure(s: Structure, c: BuyerConstraints, input: EngineInput): EvaluatedStructure {
  const economics = computeEconomics(s, input.merchant.policy);
  const b = buyerChecks(s, c);
  const sc = sellerChecks(s, economics, input.merchant.policy, input.packages);
  const all = [...b, ...sc];
  const verdict: Verdict = all.some((x) => x.status === "fail") ? "rejected" : all.some((x) => x.status === "needs_information") ? "needs_information" : "feasible";
  const ap = b.find((x) => x.id === "buyer_approval");
  const approval: ApprovalLabel = ap?.status === "requires_approval" ? "requires_approval" : ap?.status === "within_limit" ? "within_limit" : "unknown";
  return { structure: s, economics, buyerChecks: b, sellerChecks: sc, verdict, approval, approvable: verdict === "feasible" };
}

export interface EnumerationResult {
  /** Every template type that was enumerated (proof of full enumeration). */
  templatesEvaluated: TemplateType[];
  structures: EvaluatedStructure[];
  feasible: EvaluatedStructure[];
  rejected: EvaluatedStructure[];
  needsInformation: EvaluatedStructure[];
}

export function enumerateAndEvaluate(c: BuyerConstraints, input: EngineInput): EnumerationResult {
  const all = enumerateStructures(input.templates, input.packages, input.merchant.policy.gstRateBps);
  const structures = all.map((s) => evaluateStructure(s, c, input));
  const enabled = TEMPLATE_TYPES.filter((t) => input.templates[t].enabled);
  return {
    templatesEvaluated: enabled.filter((t) => structures.some((x) => x.structure.template === t)),
    structures,
    feasible: rankFeasible(structures.filter((x) => x.verdict === "feasible")),
    rejected: rankRejected(structures.filter((x) => x.verdict === "rejected")),
    needsInformation: structures.filter((x) => x.verdict === "needs_information"),
  };
}

const maxPayment = (x: EvaluatedStructure) => Math.max(...x.structure.payments.map((p) => p.totalPaise));

/**
 * Deterministic baseline ranking. Structures needing buyer approval always rank below
 * structures within the buyer's limit; then higher net contribution, lower peak funding,
 * lower largest payment, stable id.
 */
export function rankFeasible(xs: EvaluatedStructure[]): EvaluatedStructure[] {
  const approvalRank = (x: EvaluatedStructure) => (x.approval === "requires_approval" ? 1 : 0);
  return [...xs].sort(
    (a, b) =>
      approvalRank(a) - approvalRank(b) ||
      b.economics.netContributionPaise - a.economics.netContributionPaise ||
      a.economics.peakFundingPaise - b.economics.peakFundingPaise ||
      maxPayment(a) - maxPayment(b) ||
      a.structure.id.localeCompare(b.structure.id),
  );
}

/** Enforce the approval ordering on any externally proposed order (e.g. an AI ranking). */
export function enforceApprovalOrder(ids: string[], feasible: EvaluatedStructure[]): EvaluatedStructure[] {
  const byId = new Map(feasible.map((x) => [x.structure.id, x]));
  const ordered = ids.map((id) => byId.get(id)).filter((x): x is EvaluatedStructure => !!x);
  for (const x of rankFeasible(feasible)) if (!ordered.includes(x)) ordered.push(x);
  return [...ordered.filter((x) => x.approval !== "requires_approval"), ...ordered.filter((x) => x.approval === "requires_approval")];
}

function rankRejected(xs: EvaluatedStructure[]): EvaluatedStructure[] {
  const fails = (x: EvaluatedStructure) => [...x.buyerChecks, ...x.sellerChecks].filter((c) => c.status === "fail").length;
  return [...xs].sort((a, b) => fails(a) - fails(b) || b.economics.netContributionPaise - a.economics.netContributionPaise || a.structure.id.localeCompare(b.structure.id));
}

export const failingChecks = (x: EvaluatedStructure) => [...x.buyerChecks, ...x.sellerChecks].filter((c) => c.status === "fail");

/**
 * Featured rejections for the Decision view. Chosen by rule from engine results — never by
 * structure ID — so a different fixture yields a different, still rule-consistent choice.
 *
 * Buyer-side featured rejection ("attractive but the buyer cannot carry it out"):
 *   candidates: rejected, full scope, every failed check is a buyer check;
 *   order: fewest failed checks → highest buyer appeal (smallest largest payment, incl. GST)
 *          → earliest delivery start → structure id (stable final tie-break only).
 * Seller-side featured rejection ("the buyer could pay this, the seller cannot afford it"):
 *   candidates: rejected, every failed check is a seller check;
 *   order: the same keys.
 */
export function featuredRejections(r: EnumerationResult): { buyer: EvaluatedStructure | null; seller: EvaluatedStructure | null } {
  const onlySide = (x: EvaluatedStructure, side: "buyer" | "seller") => failingChecks(x).every((c) => c.side === side);
  const pick = (xs: EvaluatedStructure[]) =>
    [...xs].sort(
      (a, b) =>
        failingChecks(a).length - failingChecks(b).length ||
        maxPayment(a) - maxPayment(b) ||
        a.structure.startDate.localeCompare(b.structure.startDate) ||
        a.structure.id.localeCompare(b.structure.id),
    )[0] ?? null;
  return {
    buyer: pick(r.rejected.filter((x) => x.structure.scopeKind === "full" && onlySide(x, "buyer"))),
    seller: pick(r.rejected.filter((x) => onlySide(x, "seller"))),
  };
}

// ── Clarification analysis ───────────────────────────────────────────────────

export interface ReadingOutcome {
  reading: string;
  verdict: Verdict;
  approval: ApprovalLabel;
  codes: string[];
}

export interface StructureDifference {
  structureId: string;
  label: string;
  outcomes: ReadingOutcome[];
}

export interface AmbiguityImpact {
  field: ClarifiableField;
  readings: string[];
  decisionRelevant: boolean;
  differences: StructureDifference[];
  feasibleCountByReading: Record<string, number>;
  withinLimitCountByReading: Record<string, number>;
}

/** Outcome that matters to the decision: the approval label only matters for feasible structures. */
const signature = (x: EvaluatedStructure) => (x.verdict === "feasible" ? `feasible|${x.approval}` : x.verdict);

/**
 * For each ambiguous field, evaluate the full enumeration under each of its readings
 * (for every combination of the other fields' readings) and report where outcomes differ.
 */
export function analyseAmbiguities(profile: ConstraintProfile, input: EngineInput): AmbiguityImpact[] {
  const interps = interpretations(profile);
  const evaluated = new Map<Interpretation, EnumerationResult>(interps.map((i) => [i, enumerateAndEvaluate(i.constraints, input)]));
  return ambiguousFields(profile).map((field) => {
    const readings = [...new Set(interps.map((i) => i.assignment[field]))];
    const diffs = new Map<string, StructureDifference>();
    // Group interpretations that agree on every other field.
    const groups = new Map<string, Interpretation[]>();
    for (const i of interps) {
      const key = JSON.stringify(Object.entries(i.assignment).filter(([k]) => k !== field));
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
    for (const group of groups.values()) {
      const results = group.map((i) => ({ reading: i.assignment[field], r: evaluated.get(i)! }));
      const ids = results[0].r.structures.map((x) => x.structure.id);
      for (const id of ids) {
        const per = results.map(({ reading, r }) => ({ reading, x: r.structures.find((s) => s.structure.id === id)! }));
        if (new Set(per.map((p) => signature(p.x))).size > 1 && !diffs.has(id)) {
          diffs.set(id, {
            structureId: id,
            label: per[0].x.structure.label,
            outcomes: per.map((p) => ({ reading: p.reading, verdict: p.x.verdict, approval: p.x.approval, codes: [...p.x.buyerChecks, ...p.x.sellerChecks].filter((c) => c.status !== "pass" && c.status !== "within_limit").map((c) => c.code) })),
          });
        }
      }
    }
    const countBy = (pred: (x: EvaluatedStructure) => boolean) =>
      Object.fromEntries(readings.map((rd) => [rd, Math.max(...interps.filter((i) => i.assignment[field] === rd).map((i) => evaluated.get(i)!.structures.filter(pred).length))]));
    return {
      field,
      readings,
      decisionRelevant: diffs.size > 0,
      differences: [...diffs.values()],
      feasibleCountByReading: countBy((x) => x.verdict === "feasible"),
      withinLimitCountByReading: countBy((x) => x.verdict === "feasible" && x.approval === "within_limit"),
    };
  });
}

// ── Deal-level outcome ───────────────────────────────────────────────────────

export type FailureState = "ambiguous" | "insufficient_information" | "outside_templates" | "no_feasible_deal";

export interface DealEvaluation {
  state: "options_ready" | FailureState;
  missingRequired: string[];
  ambiguities: AmbiguityImpact[];
  outsideTemplates: ConstraintProfile["outsideTemplateRequests"];
  /** Present once the profile resolves to a single interpretation. */
  result: EnumerationResult | null;
  /** Readings applied to non-decision-relevant ambiguities (they do not change any outcome). */
  assumedReadings: Record<string, string>;
}

export function evaluateDeal(profile: ConstraintProfile, input: EngineInput): DealEvaluation {
  // A discount is something the merchant can offer when their own offer types include one; with none, a request for it is outside what they approve.
  const canDiscount = input.templates.discountsBps.some((level) => level > 0);
  const outside = profile.outsideTemplateRequests.filter((r) => !r.representable && !(r.kind === "discount" && canDiscount));
  const missingRequired = missingRequiredFields(profile);
  const base = { missingRequired, outsideTemplates: outside, assumedReadings: {} as Record<string, string> };

  if (outside.length) return { ...base, state: "outside_templates", ambiguities: [], result: null };
  if (missingRequired.length) return { ...base, state: "insufficient_information", ambiguities: [], result: null };

  const ambiguities = analyseAmbiguities(profile, input);
  if (ambiguities.some((a) => a.decisionRelevant)) return { ...base, state: "ambiguous", ambiguities, result: null };

  // No remaining ambiguity changes any outcome: every interpretation gives the same result.
  const interp = interpretations(profile)[0];
  const result = enumerateAndEvaluate(interp.constraints, input);
  const state = result.feasible.length > 0 ? "options_ready" : result.needsInformation.length > 0 ? "insufficient_information" : "no_feasible_deal";
  return { ...base, state, ambiguities, result, assumedReadings: interp.assignment };
}
