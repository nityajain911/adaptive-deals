/**
 * SYNTHETIC CASE B FIXTURE (Zephyr Logistics): a procurement team asks for 15% off a six-month retainer and net-45 payment terms.
 * Every name, figure and date is illustrative. This file holds inputs only: the terms Pinecone agreed for this buyer. What they
 * allow, what they refuse and what they come to is worked out by the engine.
 */
import type { Merchant, TemplateConfig } from "@/domain/types";
import { heroMerchant } from "./hero";
import type { DealTerms } from "@/lib/deal-economics";

/** Pinecone will go to 10% for this buyer, and only against something in return (an advance). The buyer asked for 15%. */
export const ZEPHYR_DISCOUNT_LIMIT_BPS = 1000;

const plans = [
  { id: "upfront", label: "single payment at start", offsetsMonths: [0] },
  // Net-30 on the balance: 40% on signing, the rest a month later.
  { id: "advance_40", label: "40% on signing, the rest a month later", offsetsMonths: [0, 1], weightsBps: [4000, 6000] },
  // Net-45 from the invoice, rounded up to two months after the start.
  { id: "net_45", label: "all of it two months after the start", offsetsMonths: [2] },
];

/** The six-month retainer Meera quoted: ₹72,000 before GST. */
export const zephyrTemplates: TemplateConfig = {
  fullScope: [
    { packageId: "website-fixes", months: 1 },
    { packageId: "search-marketing", months: 6 },
    { packageId: "social-media", months: 6 },
    { packageId: "monthly-reporting", months: 6 },
  ],
  defaultStartDate: "2026-12-01",
  split_payment: { enabled: true, plans },
  phased_scope: {
    enabled: true,
    // The retainer without monthly reporting, for a buyer who said it can wait.
    phase1Scopes: [
      {
        id: "web-search-social-6m",
        label: "Website fixes + 6 months of search marketing and social media",
        items: [
          { packageId: "website-fixes", months: 1 },
          { packageId: "search-marketing", months: 6 },
          { packageId: "social-media", months: 6 },
        ],
      },
    ],
    plans,
  },
  deferred_start: { enabled: false, startDates: [], plans: [] },
  shorter_commitment: { enabled: false, terms: [] },
  // 0% and the 10% Pinecone allows, and the 15% the buyer asked about, so that the engine refuses it by name.
  discountsBps: [0, 1000, 1500],
};

export const zephyrMerchant: Merchant = {
  ...heroMerchant,
  policy: { ...heroMerchant.policy, discountLimitBps: ZEPHYR_DISCOUNT_LIMIT_BPS },
};

export const zephyrTerms: DealTerms = {
  discountLimitBps: ZEPHYR_DISCOUNT_LIMIT_BPS,
  templates: (({ fullScope: _unused, ...rest }) => rest)(zephyrTemplates),
};
