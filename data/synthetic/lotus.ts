/**
 * SYNTHETIC CASE A FIXTURE (Lotus Row Interiors): a buyer holds a rival's quote of ₹80,000 for the year and will not go above it.
 * Every name, figure and date is illustrative. This file holds inputs only: the terms Pinecone agreed for this buyer. What fits,
 * what is refused and what it comes to is worked out by the engine.
 */
import type { TemplateConfig } from "@/domain/types";
import type { DealTerms } from "@/lib/deal-economics";
import { heroMerchant } from "./hero";

/** The buyer pays by payment link in one go: that is the only way to pay offered. */
const upfront = [{ id: "upfront", label: "single payment at start", offsetsMonths: [0] }];

/** The annual plan Meera quoted: ₹1,20,000 before GST. Pinecone does not discount, so the commitments are shorter, never cheaper. */
export const lotusTemplates: TemplateConfig = {
  fullScope: [
    { packageId: "website-fixes", months: 1 },
    { packageId: "search-marketing", months: 12 },
    { packageId: "social-media", months: 12 },
    { packageId: "monthly-reporting", months: 12 },
  ],
  defaultStartDate: "2026-11-01",
  split_payment: { enabled: true, plans: upfront },
  phased_scope: { enabled: false, phase1Scopes: [], plans: [] },
  deferred_start: { enabled: false, startDates: [], plans: [] },
  // The same four services for fewer months: three, five (the longest that fits ₹80,000) and six (which does not).
  shorter_commitment: { enabled: true, terms: [3, 5, 6].map((termMonths) => ({ termMonths, plans: upfront })) },
  // 0%, and the 44% that matching ₹80,000 for the year would take, so that the engine refuses it by name.
  discountsBps: [0, 4400],
  discountOn: ["split_payment"],
};

export const lotusMerchant = heroMerchant;

export const lotusTerms: DealTerms = {
  discountLimitBps: 0,
  templates: (({ fullScope: _unused, ...rest }) => rest)(lotusTemplates),
};
