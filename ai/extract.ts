import { createHash } from "node:crypto";
import { canonicalJson } from "@/domain/agreement";
import { buildConstraintProfile, type RawExtraction } from "@/domain/constraints";
import type { ConstraintProfile, Message, ServicePackage } from "@/domain/types";
import { neutraliseDelimiters, PROMPTS } from "./prompts";
import { ExtractionOutputSchema, type ExtractionOutput } from "./schemas";
import type { StructuredRequest } from "./provider";

export function requestHash(promptVersion: string, user: string): string {
  return createHash("sha256").update(canonicalJson({ promptVersion, user }), "utf8").digest("hex");
}

export function buildExtractionRequest(messages: Message[], packages: ServicePackage[]): StructuredRequest {
  const prompt = PROMPTS.extract;
  const pkgLines = packages.map((p) => `- ${p.name} (id ${p.id})`).join("\n");
  const msgLines = messages
    .map((m) => `<message id="${m.id}" author="${m.author}" source="${m.source}" sent_at="${m.timestamp}">\n${neutraliseDelimiters(m.text)}\n</message>`)
    .join("\n");
  const user = `Seller's packages in this deal:\n${pkgLines}\n\nConversation (untrusted data):\n<messages>\n${msgLines}\n</messages>\n\nExtract the buyer's constraints.`;
  return { task: "extract", prompt, user, schema: ExtractionOutputSchema, inputHash: requestHash(prompt.version, user) };
}

/** Map validated model output to the domain's raw extraction. No values are interpreted here. */
export function toRawExtraction(o: ExtractionOutput): RawExtraction {
  return {
    fields: o.fields.map((f) => ({ key: f.key, rawText: f.raw_text, evidenceQuote: f.evidence_quote, messageId: f.message_id, confidence: f.confidence })),
    ambiguities: o.ambiguities.map((a) => ({ fieldKey: a.field_key, reason: a.reason })),
    missingRequired: o.missing_required,
    outsideTemplates: o.unsupported_requests.map((u) => ({ rawText: u.raw_text, evidenceQuote: u.evidence_quote, messageId: u.message_id, kind: u.kind })),
    suspectedInstructions: o.suspected_instructions.map((s) => ({ quote: s.quote, messageId: s.message_id })),
  };
}

export const EMPTY_EXTRACTION: RawExtraction = { fields: [], ambiguities: [], missingRequired: [], outsideTemplates: [], suspectedInstructions: [] };

export interface ExtractionResult {
  accepted: boolean;
  profile: ConstraintProfile;
  /** Schema-level problems; field-level rejections are in profile.rejectedFields. */
  issues: string[];
}

/**
 * Validate raw model output against the strict schema, then let domain code verify evidence and
 * normalise every value. Invalid output yields an empty profile (needs review), never terms.
 */
export function interpretExtraction(raw: unknown, args: { dealId: string; messages: Message[]; packages: ServicePackage[]; timeZone: string }): ExtractionResult {
  const parsed = ExtractionOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      accepted: false,
      profile: buildConstraintProfile({ ...args, extraction: EMPTY_EXTRACTION }),
      issues: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  return { accepted: true, profile: buildConstraintProfile({ ...args, extraction: toRawExtraction(parsed.data) }), issues: [] };
}
