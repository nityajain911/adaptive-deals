import { normaliseAmount } from "./amounts";
import {
  addDays,
  compareDates,
  normaliseCurrentPeriod,
  normaliseRelativeDate,
  startOfMonth,
  type DateValue,
} from "./dates";
import type {
  AmountField,
  ApprovalScope,
  BudgetGap,
  BuyerConstraints,
  ClarificationAnswer,
  Confidence,
  ConstraintProfile,
  Evidence,
  GstInclusion,
  Message,
  OutsideTemplateRequest,
  ProfileField,
  ServicePackage,
} from "./types";

/**
 * Raw extraction as returned by the AI layer (after schema validation).
 * Raw text and evidence only — every value below is normalised here, by code.
 */
export const EXTRACTION_FIELD_KEYS = [
  "budget_now_amount",
  "budget_now_period",
  "next_budget_date",
  "next_budget_amount",
  "approval_limit_amount",
  "approval_limit_scope",
  "amounts_include_gst",
  "latest_start",
  "required_package",
  "optional_package",
  "other_constraint",
] as const;
export type ExtractionFieldKey = (typeof EXTRACTION_FIELD_KEYS)[number];

export interface RawExtractedField {
  key: string;
  rawText: string;
  evidenceQuote: string;
  messageId: string;
  confidence: Confidence;
}

export interface RawExtraction {
  fields: RawExtractedField[];
  ambiguities: { fieldKey: string; reason: string }[];
  missingRequired: string[];
  outsideTemplates: { rawText: string; evidenceQuote: string; messageId: string; kind: string }[];
  suspectedInstructions: { quote: string; messageId: string }[];
}

/** Request kinds the merchant's four templates can represent. Code, not AI, decides this. */
export const REPRESENTABLE_REQUEST_KINDS = new Set([
  "split_payment",
  "phased_scope",
  "deferred_start",
  "shorter_commitment",
]);

export const REQUIRED_FIELDS = ["budgetNow"] as const;

function verifyEvidence(quote: string, messageId: string, messages: Message[]): Evidence | string {
  const msg = messages.find((m) => m.id === messageId);
  if (!msg) return `message ${messageId} not found`;
  if (!quote.trim()) return "empty evidence quote";
  const start = msg.text.indexOf(quote);
  if (start < 0) return `evidence quote not found verbatim in message ${messageId}`;
  return { quote, messageId, start, end: start + quote.length };
}

function emptyField<T>(key: string, label: string, status: "missing" = "missing"): ProfileField<T> {
  return { key, label, rawText: null, value: null, unit: null, evidence: [], transformation: null, confidence: "high", status };
}

interface Verified {
  field: RawExtractedField;
  evidence: Evidence;
  message: Message;
}

/**
 * Build an evidence-backed constraint profile. Fields are rejected when their quote is not
 * found verbatim in the cited message, the raw text is not inside the quote, the key is
 * unsupported, or the value cannot be safely normalised.
 */
export function buildConstraintProfile(args: {
  dealId: string;
  extraction: RawExtraction;
  messages: Message[];
  packages: ServicePackage[];
  timeZone: string;
}): ConstraintProfile {
  const { extraction, messages, timeZone, dealId, packages } = args;
  const rejected: ConstraintProfile["rejectedFields"] = [];
  const verified = new Map<string, Verified[]>();

  for (const f of extraction.fields) {
    if (!(EXTRACTION_FIELD_KEYS as readonly string[]).includes(f.key)) {
      rejected.push({ key: f.key, reason: "unsupported field", rawText: f.rawText });
      continue;
    }
    const ev = verifyEvidence(f.evidenceQuote, f.messageId, messages);
    if (typeof ev === "string") {
      rejected.push({ key: f.key, reason: ev, rawText: f.rawText });
      continue;
    }
    if (!f.evidenceQuote.includes(f.rawText)) {
      rejected.push({ key: f.key, reason: "raw text is not contained in its evidence quote", rawText: f.rawText });
      continue;
    }
    const message = messages.find((m) => m.id === f.messageId)!;
    verified.set(f.key, [...(verified.get(f.key) ?? []), { field: f, evidence: ev, message }]);
  }

  const one = (key: ExtractionFieldKey) => verified.get(key)?.[0];
  const flagged = new Map(extraction.ambiguities.map((a) => [a.fieldKey, a.reason]));

  // Budget now: amount + period, both normalised from the cited message.
  const budgetNow = emptyField<ConstraintProfile["budgetNow"]["value"] & object>("budgetNow", "Budget available now");
  const amt = one("budget_now_amount");
  const per = one("budget_now_period");
  if (amt) {
    const a = normaliseAmount(amt.field.rawText);
    const p = per ? normaliseCurrentPeriod(per.field.rawText, per.message.timestamp, timeZone) : null;
    if (!a.ok) rejected.push({ key: "budget_now_amount", reason: a.reason, rawText: amt.field.rawText });
    else if (!p || !p.ok) {
      Object.assign(budgetNow, {
        rawText: amt.field.rawText,
        evidence: [amt.evidence],
        status: "missing",
        note: p && !p.ok ? p.reason : "Budget period not stated",
      });
    } else {
      Object.assign(budgetNow, {
        rawText: `${amt.field.rawText} · ${per!.field.rawText}`,
        value: { amountPaise: a.paise, period: p.period },
        unit: "INR paise",
        evidence: dedupeEvidence([amt.evidence, per!.evidence]),
        transformation: `${a.transformation}; ${p.transformation}`,
        confidence: lowest(amt.field.confidence, per!.field.confidence),
        status: "stated",
      });
    }
  }

  // Next budget: availability date (month precision kept) and optional amount.
  const nextBudget = emptyField<NonNullable<ConstraintProfile["nextBudget"]["value"]>>("nextBudget", "Next budget");
  const nb = one("next_budget_date");
  if (nb) {
    const d = normaliseRelativeDate(nb.field.rawText, nb.message.timestamp, timeZone);
    if (d.ok) {
      const nbAmt = one("next_budget_amount");
      const nbA = nbAmt ? normaliseAmount(nbAmt.field.rawText) : null;
      Object.assign(nextBudget, {
        rawText: nb.field.rawText,
        value: { available: d.value, amountPaise: nbA && nbA.ok ? nbA.paise : null },
        unit: d.value.precision,
        evidence: dedupeEvidence([nb.evidence, ...(nbAmt ? [nbAmt.evidence] : [])]),
        transformation: d.transformation,
        confidence: nb.field.confidence,
        status: "stated",
        note: nbA && nbA.ok ? undefined : "Next budget amount not stated; engine checks timing only for payments after it",
      });
    } else if (d.kind === "ambiguous") {
      Object.assign(nextBudget, {
        rawText: nb.field.rawText,
        evidence: [nb.evidence],
        status: "ambiguous",
        readings: d.readings.map((r) => ({ available: r, amountPaise: null })),
        note: d.reason,
      });
    } else rejected.push({ key: "next_budget_date", reason: d.reason, rawText: nb.field.rawText });
  }

  // Approval limit amount and its scope.
  const approvalLimit = emptyField<{ amountPaise: number }>("approvalLimit", "Buyer approval limit");
  const approvalScope = emptyField<ApprovalScope>("approvalScope", "Approval limit applies");
  const al = one("approval_limit_amount");
  if (al) {
    const a = normaliseAmount(al.field.rawText);
    if (!a.ok) rejected.push({ key: "approval_limit_amount", reason: a.reason, rawText: al.field.rawText });
    else {
      Object.assign(approvalLimit, {
        rawText: al.field.rawText,
        value: { amountPaise: a.paise },
        unit: "INR paise",
        evidence: [al.evidence],
        transformation: a.transformation,
        confidence: al.field.confidence,
        status: "stated",
      });
      const sc = one("approval_limit_scope");
      const scopeValue = sc ? parseApprovalScope(sc.field.rawText) : null;
      if (sc && scopeValue && !flagged.has("approval_limit_scope")) {
        Object.assign(approvalScope, { rawText: sc.field.rawText, value: scopeValue, evidence: [sc.evidence], transformation: "scope keyword", confidence: sc.field.confidence, status: "stated" });
      } else {
        Object.assign(approvalScope, {
          rawText: al.field.rawText,
          evidence: [al.evidence],
          status: "ambiguous",
          readings: ["per_payment", "per_contract"],
          note: flagged.get("approval_limit_scope") ?? "The message does not say whether the limit applies per payment or per contract",
        });
      }
    }
  }

  // GST inclusion: profile-wide. Unknown whenever an amount is stated without an explicit GST statement.
  // GST basis: one profile-wide value, but it counts as stated only when its evidence explicitly
  // covers every stated amount. A GST phrase attached to one amount is never extended to another.
  const amountsIncludeGst = emptyField<GstInclusion>("amountsIncludeGst", "Amounts include GST");
  const statedAmounts = statedAmountFields({ budgetNow, approvalLimit });
  const gst = one("amounts_include_gst");
  const gstValue = gst ? parseGstInclusion(gst.field.rawText) : null;
  const rawOf: Record<AmountField, string | undefined> = { budgetNow: amt?.field.rawText, approvalLimit: al?.field.rawText };
  const gstCovers = gst ? statedAmounts.filter((f) => rawOf[f] && gst.field.evidenceQuote.includes(rawOf[f]!)) : [];
  const uncovered = statedAmounts.filter((f) => !gstCovers.includes(f));
  if (gst && gstValue && !flagged.has("amounts_include_gst") && uncovered.length === 0) {
    Object.assign(amountsIncludeGst, { rawText: gst.field.rawText, value: gstValue, evidence: [gst.evidence], transformation: "GST keyword", confidence: gst.field.confidence, status: "stated", covers: gstCovers });
  } else if (statedAmounts.length) {
    Object.assign(amountsIncludeGst, {
      evidence: dedupeEvidence([...budgetNow.evidence, ...approvalLimit.evidence]),
      status: "ambiguous",
      readings: ["yes", "no"],
      note:
        flagged.get("amounts_include_gst") ??
        (gst && gstValue ? `GST basis stated only for ${gstCovers.map((f) => rawOf[f]).join(", ") || "no amount"}; not confirmed for ${uncovered.map((f) => rawOf[f]).join(", ")}` : "Amounts are stated without saying whether GST is included"),
    });
  }

  const latestStart = emptyField<DateValue>("latestStart", "Latest start date");
  const ls = one("latest_start");
  if (ls) {
    const d = normaliseRelativeDate(ls.field.rawText, ls.message.timestamp, timeZone);
    if (d.ok) Object.assign(latestStart, { rawText: ls.field.rawText, value: d.value, unit: d.value.precision, evidence: [ls.evidence], transformation: d.transformation, confidence: ls.field.confidence, status: "stated" });
    else rejected.push({ key: "latest_start", reason: d.reason, rawText: ls.field.rawText });
  }

  const pkgField = (key: "required_package" | "optional_package", label: string) => {
    const f = emptyField<string[]>(key === "required_package" ? "requiredPackages" : "optionalPackages", label);
    const ids: string[] = [];
    const ev: Evidence[] = [];
    for (const v of verified.get(key) ?? []) {
      const pkg = matchPackage(v.field.rawText, packages);
      if (!pkg) rejected.push({ key, reason: "does not match a deal package", rawText: v.field.rawText });
      else {
        ids.push(pkg.id);
        ev.push(v.evidence);
      }
    }
    if (ids.length) Object.assign(f, { value: ids, evidence: ev, status: "stated", transformation: "matched to deal packages" });
    return f;
  };

  const otherConstraints = (verified.get("other_constraint") ?? []).map((v, i) => ({
    ...emptyField<string>(`other_${i}`, "Other constraint"),
    rawText: v.field.rawText,
    value: v.field.rawText,
    evidence: [v.evidence],
    confidence: v.field.confidence,
    status: "stated" as const,
  }));

  const outsideTemplateRequests: OutsideTemplateRequest[] = [];
  for (const o of extraction.outsideTemplates) {
    const ev = verifyEvidence(o.evidenceQuote, o.messageId, messages);
    if (typeof ev === "string") {
      rejected.push({ key: "outside_template", reason: ev, rawText: o.rawText });
      continue;
    }
    const representable = REPRESENTABLE_REQUEST_KINDS.has(o.kind);
    outsideTemplateRequests.push({
      rawText: o.rawText,
      evidence: [ev],
      kind: o.kind,
      representable,
      reason: representable
        ? `Representable by the merchant-approved ${o.kind.replace(/_/g, " ")} template`
        : `"${o.kind.replace(/_/g, " ")}" cannot be represented by split payment, phased scope, deferred start, or shorter commitment`,
    });
  }

  // Suspected instructions are recorded for review only. They never alter policy or instructions.
  const suspectedInstructions = extraction.suspectedInstructions.filter((s) => typeof verifyEvidence(s.quote, s.messageId, messages) !== "string");

  const profile: ConstraintProfile = {
    dealId,
    budgetNow,
    nextBudget,
    approvalLimit,
    approvalScope,
    amountsIncludeGst,
    latestStart,
    requiredPackages: pkgField("required_package", "Required packages"),
    optionalPackages: pkgField("optional_package", "Optional packages"),
    otherConstraints,
    derivedBudgetGap: null,
    outsideTemplateRequests,
    suspectedInstructions,
    rejectedFields: rejected,
  };
  profile.derivedBudgetGap = deriveBudgetGap(profile);
  return profile;
}

/**
 * Budget-gap rule: with a current-period budget and a stated next-budget date, the period between
 * them has no additional available budget.
 */
export function deriveBudgetGap(profile: ConstraintProfile, nextOverride?: DateValue): BudgetGap | null {
  const bn = profile.budgetNow.value;
  const next = nextOverride ?? profile.nextBudget.value?.available;
  if (!bn || !next) return null;
  const from = addDays(bn.period.end, 1);
  const untilStart = next.precision === "month" ? startOfMonth(next.value) : next.value;
  if (compareDates(untilStart, from) <= 0) return null;
  return {
    from,
    until: next,
    evidence: dedupeEvidence([...profile.budgetNow.evidence, ...profile.nextBudget.evidence]),
    rule: "Current-period budget plus a later next-budget date: no additional budget is available between them",
  };
}

function parseApprovalScope(raw: string): ApprovalScope | null {
  const t = raw.toLowerCase();
  const perPayment = /\b(per|each|any single|every)\s+(payment|instalment|installment|invoice|transaction)\b/.test(t);
  const perContract = /\b(per|whole|total|full|entire)\s+(contract|deal|agreement|order|engagement)\b|\bin total\b/.test(t);
  if (perPayment === perContract) return null;
  return perPayment ? "per_payment" : "per_contract";
}

function parseGstInclusion(raw: string): GstInclusion | null {
  const t = raw.toLowerCase();
  const incl = /\b(incl\.?|including|inclusive of|includes|with)\s+gst\b|\bgst[- ]inclusive\b/.test(t);
  const excl = /\b(excl\.?|excluding|exclusive of|plus|\+|before|without)\s*gst\b|\bgst[- ]exclusive\b|\bgst extra\b/.test(t);
  if (incl === excl) return null;
  return incl ? "yes" : "no";
}

function matchPackage(raw: string, packages: ServicePackage[]): ServicePackage | undefined {
  const t = raw.toLowerCase();
  return packages.find((p) => t.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(t));
}

function dedupeEvidence(evs: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  return evs.filter((e) => {
    const k = `${e.messageId}:${e.start}:${e.end}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const ORDER: Confidence[] = ["low", "medium", "high"];
const lowest = (a: Confidence, b: Confidence): Confidence => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);

// ── Clarification answers ────────────────────────────────────────────────────

export type ClarifiableField = "amountsIncludeGst" | "approvalScope" | "nextBudget";

export function statedAmountFields(p: Pick<ConstraintProfile, "budgetNow" | "approvalLimit">): AmountField[] {
  return (["budgetNow", "approvalLimit"] as const).filter((f) => p[f].value !== null || p[f].rawText !== null);
}

export class ClarificationError extends Error {}

/** Apply a merchant-recorded, buyer-confirmed answer. Returns a new profile. */
export function applyClarificationAnswer(
  profile: ConstraintProfile,
  field: ClarifiableField,
  value: GstInclusion | ApprovalScope | DateValue,
  answer: ClarificationAnswer,
): ConstraintProfile {
  const next: ConstraintProfile = structuredClone(profile);
  if (field === "amountsIncludeGst") {
    if (value !== "yes" && value !== "no") throw new Error("GST answer must be yes or no");
    // The profile-wide basis is used only when the answer explicitly names every stated amount.
    const required = statedAmountFields(next);
    const covered = answer.coversAmounts ?? [];
    const missing = required.filter((f) => !covered.includes(f));
    if (missing.length) {
      throw new ClarificationError(`GST answer does not name ${missing.join(" and ")}; the GST basis of every stated amount must be confirmed explicitly`);
    }
    next.amountsIncludeGst = { ...next.amountsIncludeGst, value, status: "stated", readings: undefined, clarification: answer, transformation: "clarification answer", confidence: "high", covers: [...required] };
  } else if (field === "approvalScope") {
    if (value !== "per_payment" && value !== "per_contract") throw new Error("Approval scope answer must be per_payment or per_contract");
    next.approvalScope = { ...next.approvalScope, value, status: "stated", readings: undefined, clarification: answer, transformation: "clarification answer", confidence: "high" };
  } else {
    if (typeof value !== "object") throw new Error("Next-budget answer must be a date value");
    next.nextBudget = {
      ...next.nextBudget,
      value: { available: value, amountPaise: next.nextBudget.value?.amountPaise ?? null },
      status: "stated",
      readings: undefined,
      clarification: answer,
      transformation: "clarification answer",
      confidence: "high",
    };
  }
  next.derivedBudgetGap = deriveBudgetGap(next);
  return next;
}

// ── Interpretations ──────────────────────────────────────────────────────────

export interface Interpretation {
  /** e.g. { amountsIncludeGst: "yes", approvalScope: "per_contract" } */
  assignment: Record<string, string>;
  constraints: BuyerConstraints;
}

export function ambiguousFields(profile: ConstraintProfile): ClarifiableField[] {
  const out: ClarifiableField[] = [];
  if (profile.amountsIncludeGst.status === "ambiguous") out.push("amountsIncludeGst");
  if (profile.approvalScope.status === "ambiguous") out.push("approvalScope");
  if (profile.nextBudget.status === "ambiguous") out.push("nextBudget");
  return out;
}

export function missingRequiredFields(profile: ConstraintProfile): string[] {
  return REQUIRED_FIELDS.filter((k) => profile[k].status !== "stated");
}

/** Every combination of safe readings for the profile's ambiguous fields. */
export function interpretations(profile: ConstraintProfile): Interpretation[] {
  const fields = ambiguousFields(profile);
  const readingsOf = (f: ClarifiableField): { label: string; value: unknown }[] => {
    if (f === "nextBudget") return (profile.nextBudget.readings ?? []).map((r) => ({ label: r.available.value, value: r }));
    return ((profile[f].readings ?? []) as string[]).map((r) => ({ label: r, value: r }));
  };
  let combos: { assignment: Record<string, string>; values: Record<string, unknown> }[] = [{ assignment: {}, values: {} }];
  for (const f of fields) {
    combos = combos.flatMap((c) => readingsOf(f).map((r) => ({ assignment: { ...c.assignment, [f]: r.label }, values: { ...c.values, [f]: r.value } })));
  }
  return combos.map((c) => ({ assignment: c.assignment, constraints: resolveConstraints(profile, c.values) }));
}

function gstBasisOf(profile: ConstraintProfile, hypothetical: boolean): BuyerConstraints["gstBasis"] {
  const f = profile.amountsIncludeGst;
  if (hypothetical) return { source: "reading under evaluation", covers: statedAmountFields(profile) };
  if (f.status !== "stated" || !f.covers) return null;
  return { source: f.clarification ? `clarification:${f.clarification.clarificationId}` : `message:${f.evidence[0]?.messageId}`, covers: f.covers };
}

function resolveConstraints(profile: ConstraintProfile, overrides: Record<string, unknown>): BuyerConstraints {
  const nextBudget = (overrides.nextBudget as ConstraintProfile["nextBudget"]["value"]) ?? profile.nextBudget.value;
  return {
    budgetNow: profile.budgetNow.value,
    nextBudget,
    approvalLimit: profile.approvalLimit.value,
    approvalScope: (overrides.approvalScope as ApprovalScope) ?? profile.approvalScope.value,
    amountsIncludeGst: (overrides.amountsIncludeGst as GstInclusion) ?? profile.amountsIncludeGst.value,
    gstBasis: gstBasisOf(profile, "amountsIncludeGst" in overrides),
    latestStart: profile.latestStart.value,
    requiredPackages: profile.requiredPackages.value ?? [],
    budgetGap: nextBudget ? deriveBudgetGap(profile, nextBudget.available) : profile.derivedBudgetGap,
  };
}
