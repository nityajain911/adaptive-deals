import type { RunStep } from "@/ai/run-record";
import { UNMAPPED_PACKAGE_REASON } from "@/domain/constraints";
import type { ConstraintProfile, Evidence, Message, ServicePackage } from "@/domain/types";
import type { ModelProvenance } from "./model-provenance";

/**
 * The merchant's confirmation of required services the extraction named but code could not map to
 * any package in the deal (for example "complete annual package"). The recorded extraction is never
 * edited: the confirmation is product state after the run, linked to the rejected phrase and its
 * verbatim evidence, and the engine recalculates from it.
 */
export interface ScopeSource {
  /** The phrase the model extracted, as rejected by code. */
  rawText: string;
  evidenceQuote: string;
  messageId: string;
  /** The extraction request this phrase came from, so the confirmation points at one recorded step. */
  extractInputHash: string;
}

export interface ScopeConfirmation {
  kind: "required_services";
  packageIds: string[];
  confirmedAt: string;
  by: string;
  sources: ScopeSource[];
}

export class ScopeError extends Error {}

type ExtractFields = { key?: string; raw_text?: string; evidence_quote?: string; message_id?: string }[];

/** Required-service phrases the model returned and code verified, but could not map to a package. */
export function unmappedRequiredServices(profile: Pick<ConstraintProfile, "rejectedFields">, extractStep: Pick<RunStep, "rawOutput" | "inputHash"> | undefined, messages: Message[]): ScopeSource[] {
  const raw = ((extractStep?.rawOutput as { fields?: ExtractFields } | null | undefined)?.fields ?? []) as ExtractFields;
  const found: ScopeSource[] = [];
  for (const rejected of profile.rejectedFields) {
    if (rejected.key !== "required_package" || rejected.reason !== UNMAPPED_PACKAGE_REASON || rejected.rawText === null) continue;
    const field = raw.find((f) => f.key === "required_package" && f.raw_text === rejected.rawText);
    const message = messages.find((m) => m.id === field?.message_id);
    if (!field?.evidence_quote || !field.message_id || !message?.text.includes(field.evidence_quote)) continue;
    if (found.some((s) => s.rawText === rejected.rawText)) continue;
    found.push({ rawText: rejected.rawText, evidenceQuote: field.evidence_quote, messageId: field.message_id, extractInputHash: extractStep!.inputHash });
  }
  return found;
}

/** Validate the merchant's choice and record it. Package IDs are stored once, in catalogue order. */
export function confirmScope(args: { sources: ScopeSource[]; packageIds: string[]; packages: ServicePackage[]; confirmedAt: string; by: string }): ScopeConfirmation {
  if (!args.sources.length) throw new ScopeError("There is nothing to confirm: every required service was mapped");
  if (!args.packageIds.length) throw new ScopeError("Choose at least one service the buyer requires");
  const known = new Set(args.packages.map((p) => p.id));
  const unknown = args.packageIds.find((id) => !known.has(id));
  if (unknown) throw new ScopeError(`“${unknown}” is not a service in this deal`);
  const chosen = new Set(args.packageIds);
  return { kind: "required_services", packageIds: args.packages.filter((p) => chosen.has(p.id)).map((p) => p.id), confirmedAt: args.confirmedAt, by: args.by, sources: args.sources.map((s) => ({ ...s })) };
}

const evidenceKey = (e: Evidence) => `${e.messageId}:${e.start}:${e.end}`;

/** A new profile whose required scope is the merchant's confirmed services. The input is not changed. */
export function applyScopeConfirmation(profile: ConstraintProfile, confirmation: ScopeConfirmation, messages: Message[], packages: ServicePackage[]): ConstraintProfile {
  const known = new Set(packages.map((p) => p.id));
  const evidence: Evidence[] = [...profile.requiredPackages.evidence];
  for (const source of confirmation.sources) {
    const text = messages.find((m) => m.id === source.messageId)?.text ?? "";
    const start = text.indexOf(source.evidenceQuote);
    if (start < 0) throw new ScopeError(`The evidence for “${source.rawText}” is no longer in its message`);
    const item: Evidence = { quote: source.evidenceQuote, messageId: source.messageId, start, end: start + source.evidenceQuote.length };
    if (!evidence.some((e) => evidenceKey(e) === evidenceKey(item))) evidence.push(item);
  }
  return {
    ...structuredClone(profile),
    requiredPackages: {
      ...structuredClone(profile.requiredPackages),
      value: confirmation.packageIds.filter((id) => known.has(id)),
      evidence,
      status: "stated",
      transformation: "merchant-confirmed required services",
      confidence: "high",
      merchantConfirmation: { confirmedAt: confirmation.confirmedAt, by: confirmation.by, unmappedPhrases: confirmation.sources.map((s) => s.rawText) },
    },
  };
}

/** The one plain line that says who did what for a confirmed scope. */
export function scopeAttribution(extraction: Pick<ModelProvenance, "modelMade" | "providerName">): string {
  const phrase = extraction.modelMade ? `${extraction.providerName} extracted the phrase` : "Phrase from the hand-written sample extraction";
  return `${phrase} · merchant confirmed the services · engine recalculated the options.`;
}
