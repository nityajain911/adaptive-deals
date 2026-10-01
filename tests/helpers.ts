import { applyClarificationAnswer, buildConstraintProfile, type RawExtraction } from "@/domain/constraints";
import type { EngineInput } from "@/domain/engine";
import type { ConstraintProfile, Message } from "@/domain/types";
import {
  heroClarificationAnswers,
  heroMerchant,
  heroMessages,
  heroPackages,
  heroSyntheticExtraction,
  heroTemplates,
  HERO_DEAL_ID,
} from "@/data/synthetic/hero";

export const heroInput = (): EngineInput => structuredClone({ merchant: heroMerchant, packages: heroPackages, templates: heroTemplates });

export function profileFrom(extraction: RawExtraction = heroSyntheticExtraction, messages: Message[] = heroMessages): ConstraintProfile {
  return buildConstraintProfile({ dealId: HERO_DEAL_ID, extraction, messages, packages: heroPackages, timeZone: heroMerchant.timeZone });
}

export function clarifiedHeroProfile(): ConstraintProfile {
  const A = heroClarificationAnswers;
  let p = profileFrom();
  p = applyClarificationAnswer(p, "amountsIncludeGst", A.gst.value, A.gst);
  p = applyClarificationAnswer(p, "approvalScope", A.approvalScope.value, A.approvalScope);
  return p;
}

export const msg = (text: string, timestamp = "2026-10-01T08:47:00+05:30", id = "m1"): Message => ({ id, dealId: HERO_DEAL_ID, author: "buyer", text, timestamp, source: "whatsapp" });

export const field = (key: string, rawText: string, evidenceQuote: string, messageId = "m1") => ({ key, rawText, evidenceQuote, messageId, confidence: "high" as const });

export const extraction = (fields: RawExtraction["fields"], extra: Partial<RawExtraction> = {}): RawExtraction => ({
  fields,
  ambiguities: [],
  missingRequired: [],
  outsideTemplates: [],
  suspectedInstructions: [],
  ...extra,
});
