/**
 * The exact conversations the three committed Groq recordings (data/case-recorded-runs) were made on. The
 * product's cases were later rewritten to read like real WhatsApp messages, so these recordings no longer
 * belong to any case the merchant can start. They are kept, unchanged, as evidence of what the frozen
 * prompts did on real model output, and they replay only against these exact messages.
 */
import type { DealContext } from "@/ai/orchestrator";
import { demoCase, type CaseId } from "./cases";

export const RECORDED_CASE_MESSAGES: Record<CaseId, DealContext["messages"]> = {
  "reduced-scope": [
      {
        id: "reduced-1",
        dealId: "case-reduced-scope",
        author: "merchant",
        text: "Following our call, our annual proposal is Website fixes, Search marketing, Social media and Monthly reporting for ₹1,20,000 plus GST. The aim is to repair the booking journey and then build a steady enquiry pipeline.",
        timestamp: "2026-09-29T16:10:00+05:30",
        source: "whatsapp",
      },
      {
        id: "reduced-2",
        dealId: "case-reduced-scope",
        author: "buyer",
        text: "The broken booking page is costing us enquiries, so Website fixes and Search marketing are the pieces we need now. Social media can wait. We have ₹50,000 left this quarter and new budget opens in April. I have not confirmed whether that amount or our ₹60,000 MD approval limit includes GST, and I need to check whether the limit is per payment or for the whole contract. A smaller website-and-search phase would still solve the immediate problem, and I can buy that phase if it fits the confirmed limit.",
        timestamp: "2026-10-01T08:47:00+05:30",
        source: "whatsapp",
      },
    ],
  "preserve-scope": [
      {
        id: "preserve-1",
        dealId: "case-preserve-scope",
        author: "merchant",
        text: "Our ₹1,20,000 plus GST annual proposal covers Website fixes, Search marketing, Social media and Monthly reporting for the full admissions cycle.",
        timestamp: "2026-09-29T16:20:00+05:30",
        source: "whatsapp",
      },
      {
        id: "preserve-2",
        dealId: "case-preserve-scope",
        author: "buyer",
        text: "We need the complete annual package—Website fixes, Search marketing, Social media and Monthly reporting—for the admissions launch, so please do not reduce the scope. We have ₹10,000 available this quarter. The ₹10,000 budget and ₹15,000 approval limit per payment both exclude GST. Our next campaign budget opens on 1st May 2027. Timing is flexible if the full annual programme remains intact.",
        timestamp: "2026-10-01T08:50:00+05:30",
        source: "whatsapp",
      },
    ],
  "no-fit": [
      {
        id: "no-fit-1",
        dealId: "case-no-fit",
        author: "merchant",
        text: "Our launch proposal is Website fixes, Search marketing, Social media and Monthly reporting for ₹1,20,000 plus GST, with delivery starting in November.",
        timestamp: "2026-09-29T16:30:00+05:30",
        source: "whatsapp",
      },
      {
        id: "no-fit-2",
        dealId: "case-no-fit",
        author: "buyer",
        text: "The retail launch cannot move: work must start by the 15th this month. We have ₹2,00,000 available this quarter, including GST, and need Website fixes, Search marketing, Social media and Monthly reporting. If no approved structure can meet that date, tell us plainly rather than changing the scope or timing.",
        timestamp: "2026-10-01T08:55:00+05:30",
        source: "whatsapp",
      },
    ],
};

/** The case's deal as it was when the recording was made. */
export const recordedDeal = (id: CaseId): DealContext => ({ ...demoCase(id)!.deal, messages: structuredClone(RECORDED_CASE_MESSAGES[id]) });
