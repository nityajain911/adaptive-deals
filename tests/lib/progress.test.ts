import { describe, expect, it } from "vitest";
import { dealProgress, type ProgressFacts } from "@/lib/progress";
import type { UnresolvedWorkItem } from "@/lib/views";

/** Spec §3.4: one exhaustive derivation of stage, status and next action. */
const facts = (over: Partial<ProgressFacts> = {}): ProgressFacts => ({
  engineState: "options_ready",
  draftStale: false,
  fullyPaid: false,
  questionCountUnsent: 0,
  unansweredQuestions: 0,
  repliesNeedInterpretation: 0,
  attentionMessages: 0,
  workItems: [],
  unreviewedDecisionEvidence: 0,
  unmappedRequiredServices: 0,
  nextPayment: null,
  pendingDebit: null,
  buyerSetup: { linkUnpaid: false, mandatePending: false },
  changeRequestDetail: null,
  lastFailure: null,
  ...over,
});
const delivered = [{ version: 1, idempotencyKey: "k", kind: "proposal" as const, attempts: [], deliveredAt: "2026-10-01T09:23:00+05:30", reference: "conv-5" }];
const mk = (over: Record<string, unknown> = {}) => ({ status: "options_ready", deliveries: [], agreements: [], amendments: [], changeRequests: [], reviewRequired: null, selectedOption: null, ...over }) as never;
const active = [{ version: 1, status: "active" }];
const work = (kind: UnresolvedWorkItem["kind"], over: Partial<UnresolvedWorkItem> = {}): UnresolvedWorkItem => ({
  kind,
  sourceKind: kind === "not_restructured" ? "change_request" : "message",
  sourceId: "reply-1",
  version: 1,
  text: "Could we change this?",
  detail: "Buyer asked for a change.",
  occurredAt: "2026-12-01T11:05:00+05:30",
  note: null,
  dateAmbiguity: false,
  ...over,
});

describe("stage precedence", () => {
  it("a delivered deal is Track even if historical fields are unresolved", () => {
    const p = dealProgress(mk({ status: "sent", deliveries: delivered }), facts({ engineState: "ambiguous", questionCountUnsent: 2 }));
    expect([p.stage, p.kind, p.rule]).toEqual(["track", "waiting_on_buyer", "track.sent_awaiting_buyer"]);
    expect(p.stages).toEqual({ understand: "done", offer: "done", track: "current" });
  });
  it("merchant closed before sending stays in Offer and never resolves to Track", () => {
    const p = dealProgress(mk({ status: "merchant_rejected" }), facts());
    expect([p.stage, p.kind, p.stages.offer, p.stages.track]).toEqual(["offer", "terminal", "closed", "upcoming"]);
  });
  it("the migration review state blocks with Inspect records", () => {
    const p = dealProgress(mk({ status: "sent", reviewRequired: "Version 1 is marked sent but no delivery message is recorded.", agreements: [{ version: 1, status: "sent" }] }), facts());
    expect([p.stage, p.kind, p.primaryAction?.id]).toEqual(["offer", "action_required", "inspect_records"]);
    expect(p.headline).toMatch(/Saved deal records need review/);
  });
});

describe("Understand and Offer rows", () => {
  it("send questions → waiting → interpret → use answers → missing information", () => {
    const U = (f: Partial<ProgressFacts>) => dealProgress(mk({ status: "clarifying" }), facts({ engineState: "ambiguous", ...f }));
    expect(U({ questionCountUnsent: 2 }).primaryAction?.label).toBe("Send 2 questions to buyer");
    expect(U({ questionCountUnsent: 2 }).headline).toBe("Confirm two details before we can recommend an offer.");
    expect(U({ questionCountUnsent: 1 }).primaryAction?.label).toBe("Send question to buyer");
    expect([U({ unansweredQuestions: 1 }).kind, U({ unansweredQuestions: 1 }).primaryAction]).toEqual(["waiting_on_buyer", null]);
    expect(U({ repliesNeedInterpretation: 1 }).primaryAction?.id).toBe("interpret_reply");
    expect(U({}).primaryAction?.id).toBe("use_answers");
    expect(dealProgress(mk({ status: "needs_information" }), facts({ engineState: "insufficient_information" })).primaryAction?.id).toBe("send_missing_question");
    expect(U({}).stages).toEqual({ understand: "current", offer: "upcoming", track: "upcoming" });
  });
  it("an unmapped required scope holds the deal at Understand until the merchant confirms it", () => {
    const p = dealProgress(mk(), facts({ unmappedRequiredServices: 1 }));
    expect([p.stage, p.rule, p.kind, p.actor, p.primaryAction, p.headline]).toEqual(["understand", "understand.scope", "action_required", "merchant", { id: "confirm_required_services", label: "Confirm required services" }, "Confirm which services the buyer requires before we recommend an offer."]);
    expect(p.stages).toEqual({ understand: "current", offer: "upcoming", track: "upcoming" });
    // Only once options exist, and never after the deal has moved on.
    expect(dealProgress(mk({ status: "clarifying" }), facts({ engineState: "ambiguous", questionCountUnsent: 2, unmappedRequiredServices: 1 })).rule).toBe("understand.send");
    expect(dealProgress(mk({ status: "no_feasible_structure" }), facts({ engineState: "no_feasible_deal", unmappedRequiredServices: 1 })).rule).toBe("offer.no_feasible");
    expect(dealProgress(mk({ status: "merchant_rejected" }), facts({ unmappedRequiredServices: 1 })).rule).toBe("offer.closed");
    expect(dealProgress(mk({ deliveries: delivered, status: "sent", agreements: [{ version: 1, status: "sent" }] }), facts({ unmappedRequiredServices: 1 })).stage).toBe("track");
    // Confirmed (nothing left unmapped): the offer is next.
    expect(dealProgress(mk(), facts({ unmappedRequiredServices: 0 })).rule).toBe("offer.review");
  });
  it("offer: review, stale, retry, no-feasible, outside templates", () => {
    expect(dealProgress(mk(), facts()).primaryAction?.id).toBe("review_buyer_proposal");
    expect(dealProgress(mk(), facts({ draftStale: true })).primaryAction?.id).toBe("review_updated_proposal");
    const retry = dealProgress(mk({ status: "approved" }), facts({ lastFailure: "Simulated delivery failure" }));
    expect([retry.primaryAction?.id, retry.blockingReason]).toEqual(["retry_sending", "Simulated delivery failure"]);
    expect(dealProgress(mk({ status: "no_feasible_structure" }), facts({ engineState: "no_feasible_deal" })).headline).toBe("No offer fits both the buyer's confirmed limits and your current rules.");
    expect(dealProgress(mk({ status: "outside_templates" }), facts({ engineState: "outside_templates" })).primaryAction?.label).toBe("Mark as handled outside Adaptive Deals");
  });
  it("newer buyer evidence blocks the offer before stale-draft handling", () => {
    const p = dealProgress(mk(), facts({ draftStale: true, unreviewedDecisionEvidence: 1 }));
    expect([p.rule, p.headline, p.primaryAction?.label]).toEqual(["offer.new_evidence", "Review newer buyer evidence before sending this offer.", "Review buyer evidence"]);
  });
});

describe("Track precedence is exhaustive (rows 1–10)", () => {
  const T = (over: Record<string, unknown>, f: Partial<ProgressFacts>) => dealProgress(mk({ status: "active", deliveries: delivered, agreements: active, ...over }), facts(f));
  it("rows in order", () => {
    expect(T({ status: "buyer_rejected" }, {}).rule).toBe("track.terminal");
    expect(T({ status: "buyer_rejected" }, {}).stages.track).toBe("closed");
    expect(T({ status: "amending", amendments: [{ state: "proposed", toVersion: 2 }] }, { attentionMessages: 1 }).primaryAction?.label).toBe("Review revised terms");
    expect(T({ status: "amending", amendments: [{ state: "merchant_approved", toVersion: 2 }] }, {}).kind).toBe("waiting_on_buyer");
    expect(T({ changeRequests: [{ state: "change_requested", agreementVersion: 1 }] }, { changeRequestDetail: { unavailableUntil: "2026-12-20", lineDueDate: "2026-12-01" } }).primaryAction?.label).toBe("Draft revised terms");
    expect(T({ changeRequests: [{ state: "change_requested", agreementVersion: 0 }] }, { nextPayment: { amountPaise: 2301000, dueDate: "2026-12-01" } }).rule).toBe("track.next_payment"); // stale excluded
    expect(T({}, { attentionMessages: 2 }).primaryAction?.label).toBe("Review 2 buyer messages");
    expect(T({}, { attentionMessages: 1 }).primaryAction?.label).toBe("Review buyer message");
    expect(T({}, { buyerSetup: { linkUnpaid: true, mandatePending: true } }).headline).toBe("Buyer accepted. Waiting for the buyer to pay the upfront link and authorise recurring payments.");
    expect(T({}, { buyerSetup: { linkUnpaid: false, mandatePending: true } }).kind).toBe("waiting_on_buyer");
    expect(T({}, { pendingDebit: "submitted" }).kind).toBe("waiting_on_system");
    expect(T({}, { pendingDebit: { retryOn: "2026-12-04" } }).headline).toBe("Debit failed · retry scheduled for 4 Dec 2026.");
    expect(T({}, { nextPayment: { amountPaise: 2301000, dueDate: "2026-12-21" } }).headline).toBe("Up to date · next payment ₹23,010 on 21 Dec 2026.");
    expect(T({}, { fullyPaid: true }).headline).toBe("All scheduled payments collected.");
    expect(T({}, { fullyPaid: true }).kind).toBe("informational");
    expect(T({ status: "completed" }, {}).stages.track).toBe("completed");
  });
  it("puts current buyer work ahead of waiting and amendment states in the documented order", () => {
    expect(T({ status: "sent" }, { workItems: [work("buyer_request")] }).rule).toBe("track.buyer_request");
    expect(T({ status: "sent" }, { workItems: [work("buyer_request")] }).primaryAction?.label).toBe("Review buyer request");
    expect(T({ status: "amending", amendments: [{ state: "merchant_approved", toVersion: 2 }] }, { workItems: [work("buyer_request", { version: 2 })] }).rule).toBe("track.buyer_request");
    expect(T({}, { workItems: [work("conflicting_evidence")] }).rule).toBe("track.conflicting_evidence");
    expect(T({ changeRequests: [{ state: "change_requested", agreementVersion: 1 }] }, { workItems: [work("conflicting_evidence")], changeRequestDetail: { unavailableUntil: "2026-12-20", lineDueDate: "2026-12-01" } }).rule).toBe("track.conflicting_evidence");
    expect(T({}, { workItems: [work("not_restructured")] }).headline).toBe("The requested date does not fit the confirmed limits. The original payment remains scheduled. Review with the buyer.");
    const pending = T({}, { workItems: [work("follow_up_pending", { note: "Buyer will call tomorrow", occurredAt: "2026-12-02T09:00:00+05:30" })] });
    expect([pending.rule, pending.kind, pending.primaryAction?.label]).toEqual(["track.follow_up_pending", "action_required", "Review follow-up"]);
  });
  it("never falls back silently", () => {
    expect(() => T({}, {})).toThrow(/unmapped Track state/);
  });
  it("invariants: at most one current stage; a primary action exactly when action is required", () => {
    const all = [
      T({}, { nextPayment: { amountPaise: 1, dueDate: "2026-12-21" } }),
      T({ status: "sent" }, {}),
      T({}, { attentionMessages: 1 }),
      T({ status: "buyer_rejected" }, {}),
      dealProgress(mk(), facts()),
      dealProgress(mk({ status: "merchant_rejected" }), facts()),
      dealProgress(mk({ status: "clarifying" }), facts({ engineState: "ambiguous", unansweredQuestions: 1 })),
    ];
    for (const p of all) {
      expect(Object.values(p.stages).filter((x) => x === "current").length).toBeLessThanOrEqual(1);
      expect(p.kind === "action_required").toBe(p.primaryAction !== null);
    }
  });
});
