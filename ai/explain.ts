import { formatDate } from "@/domain/dates";
import { enforceApprovalOrder, type EvaluatedStructure } from "@/domain/engine";
import { formatINR, sum } from "@/domain/money";
import { requestHash } from "./extract";
import { PROMPTS, type PromptDefinition } from "./prompts";
import type { StructuredRequest } from "./provider";
import { explanationSchemaFor } from "./schemas";

/**
 * The AI ranks and explains only engine-feasible structures, through aliases (A, B, …) and
 * placeholders. Code owns every figure: it fills placeholders from verified engine values.
 */
export const ALIASES = "ABCDEFGHIJKL".split("");

export interface AliasedOption {
  alias: string;
  structureId: string;
  label: string;
  approval: EvaluatedStructure["approval"];
  values: Record<string, string>;
}

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

export function placeholderValues(x: EvaluatedStructure): Record<string, string> {
  const s = x.structure;
  const e = x.economics;
  const v: Record<string, string> = {
    label: s.label,
    approval: x.approval === "requires_approval" ? "Needs buyer's MD approval" : "Within buyer's approval limit",
    total: formatINR(sum(s.payments.map((p) => p.totalPaise))),
    price_excl_gst: formatINR(s.pricePaise),
    payment_count: String(s.payments.length),
    largest_payment: formatINR(Math.max(...s.payments.map((p) => p.totalPaise))),
    first_payment_date: formatDate(s.payments[0].dueDate),
    last_payment_date: formatDate(s.payments.at(-1)!.dueDate),
    start_date: formatDate(s.startDate),
    net_contribution: formatINR(e.netContributionPaise),
    net_contribution_pct: pct(e.netContributionBps),
    peak_funding: formatINR(e.peakFundingPaise),
    peak_unpaid_value: formatINR(e.peakUnpaidServiceValuePaise),
  };
  s.payments.forEach((p, i) => {
    v[`payment_${i + 1}.total`] = formatINR(p.totalPaise);
    v[`payment_${i + 1}.date`] = formatDate(p.dueDate);
  });
  return v;
}

export function aliasOptions(feasible: EvaluatedStructure[]): AliasedOption[] {
  return feasible.slice(0, ALIASES.length).map((x, i) => ({ alias: ALIASES[i], structureId: x.structure.id, label: x.structure.label, approval: x.approval, values: placeholderValues(x) }));
}

export function buildExplanationRequest(options: AliasedOption[], prompt: PromptDefinition = PROMPTS.explain): StructuredRequest {
  const body = options
    .map((o) => {
      const facts = Object.entries(o.values)
        .map(([k, v]) => `    {${o.alias}.${k}} = ${v}`)
        .join("\n");
      return `Option ${o.alias}: ${o.label}\n  approval: ${o.approval === "requires_approval" ? "needs buyer's MD approval" : "within buyer's approval limit"}\n  placeholders (use these, never the values):\n${facts}`;
    })
    .join("\n\n");
  const user = `Engine-feasible options (already checked against buyer constraints and seller policy):\n\n${body}\n\nRank them for the merchant and explain the trade-offs.`;
  return { task: "explain", prompt, user, schema: explanationSchemaFor(prompt.version), inputHash: requestHash(prompt.version, user) };
}

const PLACEHOLDER = /\{([A-L])\.([a-z]+(?:_[a-z0-9]+)*(?:\.(?:total|date))?)\}/g;
/** Product labels that contain digits but are not figures. */
const LABEL_ALLOWLIST = /\bPhase 1\b/g;
const FORBIDDEN = /(bypass|get around|circumvent|avoid (?:the )?(?:md |buyer'?s )?approval|without (?:md |buyer'?s )?approval|stay (?:under|below) (?:the )?(?:limit|threshold)|guarantee)/i;

/** Validate free text: only known placeholders, no literal figures, no approval-bypass framing. */
export function checkText(text: string, options: AliasedOption[]): string | null {
  const byAlias = new Map(options.map((o) => [o.alias, o]));
  for (const m of text.matchAll(PLACEHOLDER)) {
    const o = byAlias.get(m[1]);
    if (!o || !(m[2] in o.values)) return `unknown placeholder {${m[1]}.${m[2]}}`;
  }
  const stripped = text.replace(PLACEHOLDER, "").replace(/\bOption [A-L]\b|\b[A-L]\b/g, "").replace(LABEL_ALLOWLIST, "");
  if (/[0-9₹%]/.test(stripped)) return "contains a literal figure, date or percentage";
  if (/\{[^}]*\}/.test(stripped)) return "contains a malformed placeholder";
  if (FORBIDDEN.test(text)) return "suggests avoiding approval or promises an outcome";
  return null;
}

export function fillPlaceholders(text: string, options: AliasedOption[]): string {
  const byAlias = new Map(options.map((o) => [o.alias, o]));
  return text.replace(PLACEHOLDER, (_, a: string, k: string) => byAlias.get(a)!.values[k]);
}

/** Code-authored comparison used when model text is unavailable or rejected. */
export function fallbackComparison(options: AliasedOption[]): string {
  return options
    .map((o) => `Option ${o.alias} — {${o.alias}.label}: {${o.alias}.approval}; {${o.alias}.payment_count} payment(s) totalling {${o.alias}.total}, largest {${o.alias}.largest_payment}; net contribution {${o.alias}.net_contribution}; peak funding requirement {${o.alias}.peak_funding}.`)
    .join(" ");
}

export interface ExplanationResult {
  /** Final order of feasible structure ids, with approval ordering enforced by code. */
  order: string[];
  options: AliasedOption[];
  comparisonTemplate: string;
  comparison: string;
  notes: { structureId: string; text: string }[];
  source: { ranking: "ai" | "code"; text: "ai" | "code_fallback" };
  issues: string[];
}

const LEGACY = new Set(["explain.v1", "explain.v2"]);

export function interpretExplanation(raw: unknown | null, feasible: EvaluatedStructure[], promptVersion: string = PROMPTS.explain.version): ExplanationResult {
  const options = aliasOptions(feasible);
  const issues: string[] = [];
  let rankingIds: string[] | null = null;
  let template: string | null = null;
  const notes: ExplanationResult["notes"] = [];

  if (raw !== null) {
    const parsed = explanationSchemaFor(promptVersion).safeParse(raw);
    if (!parsed.success) issues.push(`schema: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    else {
      const known = new Map(options.map((o) => [o.alias, o.structureId]));
      const unknown = parsed.data.ranking.filter((a) => !known.has(a));
      if (unknown.length) issues.push(`ranking referenced options the engine did not mark feasible (${unknown.join(", ")}); ignored`);
      const ids = [...new Set(parsed.data.ranking.filter((a) => known.has(a)).map((a) => known.get(a)!))];
      // Reported from explain.v3 on (earlier runs are replayed exactly as they were recorded).
      if (!LEGACY.has(promptVersion) && new Set(parsed.data.ranking).size < parsed.data.ranking.length) issues.push("ranking repeated options; duplicates removed");
      if (ids.length < options.length) issues.push("ranking omitted feasible options; code appended them");
      rankingIds = ids;
      const problem = checkText(parsed.data.comparison, options);
      if (problem) issues.push(`comparison rejected: ${problem}`);
      else template = parsed.data.comparison;
      for (const n of parsed.data.option_notes) {
        const id = known.get(n.option);
        const p = id ? checkText(n.note, options) : "unknown option";
        if (p) issues.push(`note for ${n.option} rejected: ${p}`);
        else notes.push({ structureId: id!, text: fillPlaceholders(n.note, options) });
      }
    }
  }

  const ordered = enforceApprovalOrder(rankingIds ?? [], feasible).map((x) => x.structure.id);
  if (rankingIds && ordered.join() !== [...rankingIds, ...ordered.filter((id) => !rankingIds!.includes(id))].join()) {
    issues.push("approval ordering enforced: options needing MD approval ranked below options within the limit");
  }
  const comparisonTemplate = template ?? fallbackComparison(options);
  return {
    order: ordered,
    options,
    comparisonTemplate,
    comparison: fillPlaceholders(comparisonTemplate, options),
    notes,
    source: { ranking: rankingIds && rankingIds.length ? "ai" : "code", text: template ? "ai" : "code_fallback" },
    issues,
  };
}
