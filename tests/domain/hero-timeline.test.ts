import { describe, expect, it } from "vitest";
import { activate, buyerAccept, createAgreementVersion, markSent, merchantApprove, type AgreementVersion } from "@/domain/agreement";
import { applyCollectionUpdate, earliestDebitAfterUnavailableUntil, proposeReschedule, RETRY_REMOVED_COPY, transitionAmendment } from "@/domain/amendment";
import { planAdvanceNotice, recordReplyToNotice, sendAdvanceNotice, type AdvanceNotice } from "@/domain/notices";
import type { Message } from "@/domain/types";
import { SimulatedClock, DEMO_ANCHOR } from "@/domain/clock";
import { scheduleAttempt, scheduleInternalRetry, submitAttempt, transitionAttempt, type CollectionAttempt } from "@/domain/collections";
import { interpretations } from "@/domain/constraints";
import { localDateOf, normaliseRelativeDate } from "@/domain/dates";
import { enumerateAndEvaluate } from "@/domain/engine";
import { computeLedger } from "@/domain/ledger";
import { createMandate, transitionMandate } from "@/domain/mandate";
import { heroBuyer, heroDemoEvents as EV, heroMerchant, HERO_DEAL_ID } from "@/data/synthetic/hero";
import { clarifiedHeroProfile, heroInput } from "../helpers";

describe("hero timeline: failed debit → buyer reply → approved amendment", () => {
  const TZ = heroMerchant.timeZone;
  const clock = new SimulatedClock(DEMO_ANCHOR);
  const input = heroInput();
  const constraints = interpretations(clarifiedHeroProfile())[0].constraints;
  const chosen = enumerateAndEvaluate(constraints, input).feasible[0];
  const total = chosen.structure.payments.reduce((a, p) => a + p.totalPaise, 0);

  let v1: AgreementVersion = createAgreementVersion({ agreementId: "agr-hero", version: 1, evaluated: chosen, dealId: HERO_DEAL_ID, merchantId: heroMerchant.id, buyerId: heroBuyer.id, policy: heroMerchant.policy, clock });
  v1 = merchantApprove(v1, v1.termsHash, "merchant", clock);
  v1 = buyerAccept(markSent(v1), v1.termsHash, "buyer (demo view)", clock, { authorityConfirmed: true });
  v1 = activate(v1);
  let mandate = transitionMandate(createMandate({ id: "mdt-1", agreementId: v1.agreementId, agreementVersion: 1, terms: v1.terms.mandate!, mode: "simulated" }), "confirmed");

  let attempts: CollectionAttempt[] = [];
  for (const p of chosen.structure.payments) {
    attempts = [...attempts, scheduleAttempt(attempts, { agreementId: v1.agreementId, agreementVersion: 1, scheduleLineId: p.id, dueDate: p.dueDate, amountPaise: p.totalPaise, prePaise: p.prePaise, gstPaise: p.gstPaise, origin: "agreement", method: p.method }, total, clock.now())];
  }

  let notice: AdvanceNotice;
  let reply: Message;

  it("records every simulated time advance explicitly, including the advance notice before the debit", () => {
    clock.advanceTo(EV.upfrontPaidAt, "Simulated: upfront payment-link paid");
    attempts = submitAttempt(attempts, attempts[0].id, total, clock.now());
    attempts = attempts.map((a) => (a.id === attempts[0].id ? transitionAttempt(a, "succeeded", clock.now(), "Simulated event: payment link paid", "pay_sim_1") : a));

    notice = planAdvanceNotice(attempts[1], heroMerchant.policy);
    expect(notice).toMatchObject({ scheduleLineId: "pay-2", dueDate: "2026-12-01", sendOn: "2026-11-28", amountPaise: 2_301_000, mode: "simulated" });
    expect(() => sendAdvanceNotice(notice, clock, TZ)).toThrow(/due on 2026-11-28/); // still 1 Nov
    clock.advanceTo(EV.advanceNoticeAt, "Simulated: Adaptive Deals advance notice sent");
    notice = sendAdvanceNotice(notice, clock, TZ);
    expect(notice.sentAt).toBe(EV.advanceNoticeAt);

    clock.advanceTo(EV.failedDebitAt, "Simulated: recurring debit fails");
    attempts = submitAttempt(attempts, attempts[1].id, total, clock.now());
    attempts = attempts.map((a) => (a.id === attempts[1].id ? transitionAttempt(a, "failed", clock.now(), "Simulated event: debit failed") : a));
    attempts = scheduleInternalRetry(attempts, attempts[1], heroMerchant.policy.internalRetryAfterDays, total, clock.now());

    expect(clock.advances.map((a) => a.to)).toEqual([EV.upfrontPaidAt, EV.advanceNoticeAt, EV.failedDebitAt]);
    expect(clock.advances.every((a) => a.simulated)).toBe(true);
    expect(() => clock.advanceTo(EV.upfrontPaidAt, "backwards")).toThrow();
  });

  it("keeps ledger amounts separate after the failed debit", () => {
    const ledger = computeLedger({ structure: chosen.structure, attempts, asOf: localDateOf(clock.now(), TZ), timeZone: TZ });
    expect(ledger.collected).toEqual({ prePaise: 1_950_000, gstPaise: 351_000, totalPaise: 2_301_000 });
    expect(ledger.balance).toEqual({ prePaise: 1_950_000, gstPaise: 351_000, totalPaise: 2_301_000 });
    expect(ledger.unpaidServiceValuePaise).toBe(950_000); // 29,000 delivered by 30 Nov − 19,500 received
    expect(ledger.fundingRequirementPaise).toBe(0); // 16,500 costs − 19,500 received
    expect(ledger.fullyPaid).toBe(false);
  });

  it("records the buyer's message as a reply to the advance notice", () => {
    clock.advanceTo(EV.buyerReply.timestamp, "Simulated: buyer replies to advance notice");
    reply = recordReplyToNotice(notice, { id: EV.buyerReply.id, dealId: HERO_DEAL_ID, author: "buyer", text: EV.buyerReply.text, timestamp: EV.buyerReply.timestamp, source: EV.buyerReply.source });
    expect(reply.inReplyTo).toBe(notice.id);
    expect(reply.text).toContain(EV.buyerReply.evidenceQuote);
    expect(() => recordReplyToNotice({ ...notice, sentAt: null }, reply)).toThrow(/not sent/);
  });

  it("normalises 'till the 20th' from the reply's own timestamp; revised debit is the next day and passes every check", () => {
    const parsed = normaliseRelativeDate(EV.buyerReply.rawDate, reply.timestamp, TZ);
    expect(parsed.ok && parsed.value).toEqual({ value: "2026-12-20", precision: "day" });
    const newDate = earliestDebitAfterUnavailableUntil((parsed as { value: { value: string; precision: "day" } }).value);
    expect(newDate).toBe("2026-12-21");

    let amendment = proposeReschedule({ id: "amd-1", from: v1, structure: chosen.structure, lineId: "pay-2", newDueDate: newDate, constraints, engine: input, mandate, trigger: "failed_debit", triggerRefs: [attempts[1].id, notice.id, reply.id], at: clock.now() });
    expect(amendment.state).toBe("proposed");
    expect(amendment.triggerRefs).toEqual([attempts[1].id, notice.id, reply.id]);
    expect(amendment.change).toEqual({ lineId: "pay-2", fromDueDate: "2026-12-01", toDueDate: "2026-12-21" });
    expect(amendment.revised.verdict).toBe("feasible");
    expect(amendment.mandateFit.fits).toBe(true);
    expect(amendment.mandateFit.freshAuthorisationRequired).toBe(false);

    // A new agreement version with its own hash; both parties approve that exact hash.
    let v2 = createAgreementVersion({ agreementId: v1.agreementId, version: 2, evaluated: amendment.revised, dealId: HERO_DEAL_ID, merchantId: heroMerchant.id, buyerId: heroBuyer.id, policy: heroMerchant.policy, clock, supersedes: 1 });
    expect(v2.termsHash).not.toBe(v1.termsHash);
    v2 = merchantApprove(v2, v2.termsHash, "merchant", clock);
    amendment = transitionAmendment(amendment, "merchant_approved", clock.now());
    v2 = buyerAccept(markSent(v2), v2.termsHash, "buyer (demo view)", clock, { authorityConfirmed: true });
    amendment = transitionAmendment(amendment, "buyer_accepted", clock.now());

    const update = applyCollectionUpdate({ attempts, amendment, newVersion: v2, agreementTotalPaise: total, at: clock.now() });
    amendment = transitionAmendment(amendment, "collection_updated", clock.now());
    v2 = activate(v2);
    amendment = transitionAmendment(amendment, "active", clock.now());

    expect(update.removed).toHaveLength(1);
    expect(update.removed[0].origin).toBe("internal_retry");
    expect(update.removed[0].history.at(-1)!.note).toBe(RETRY_REMOVED_COPY);
    expect(update.scheduled).toHaveLength(1);
    expect(update.scheduled[0]).toMatchObject({ dueDate: "2026-12-21", agreementVersion: 2, origin: "amendment", status: "scheduled" });
    // Failed attempt stays in history; the paid line is never charged again.
    expect(update.attempts.find((a) => a.id === attempts[1].id)!.status).toBe("failed");
    expect(update.attempts.filter((a) => a.scheduleLineId === "pay-1" && a.status === "scheduled")).toHaveLength(0);
    expect(amendment.history.map((h) => h.state)).toEqual(["proposed", "merchant_approved", "buyer_accepted", "collection_updated", "active"]);
    expect(v2.merchantApproval!.termsHash).toBe(v2.buyerAcceptance!.termsHash);
  });

  it("requires fresh authorisation when a revision exceeds the mandate", () => {
    const late = proposeReschedule({ id: "amd-x", from: v1, structure: chosen.structure, lineId: "pay-2", newDueDate: "2027-03-15", constraints, engine: input, mandate, trigger: "buyer_message", triggerRefs: [], at: clock.now() });
    expect(late.state).toBe("rejected"); // March falls in the buyer's budget gap
    expect(late.mandateFit.reasons.map((r) => r.code)).toContain("AFTER_END_DATE");
    expect(late.mandateFit.freshAuthorisationRequired).toBe(true);
    mandate = transitionMandate(mandate, "revoked");
    const revoked = proposeReschedule({ id: "amd-y", from: v1, structure: chosen.structure, lineId: "pay-2", newDueDate: "2026-12-21", constraints, engine: input, mandate, trigger: "buyer_message", triggerRefs: [], at: clock.now() });
    expect(revoked.mandateFit.fits).toBe(false);
  });
});
