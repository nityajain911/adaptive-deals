import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDelivered } from "@/lib/deal-records";
import { interpretExtraction } from "@/ai/extract";
import { evaluateDeal, failingChecks } from "@/domain/engine";
import { blueHarborCase } from "../fixtures/blue-harbor-case";
import { failedChecksBlockingEveryStructure, suggestedMerchantCloseReason } from "@/lib/reason-codes";
import { driveTo } from "../helpers/drive";

/** Spec §3.3, §5.7: closures, handled messages, buyer reasons. No network. */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-close-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic"; // pinned to the labelled hand-written sample: this suite asserts that run
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
type Svc = typeof import("@/lib/service");
let svc: Svc;
let presenter: typeof import("@/lib/presenter-store");
beforeAll(async () => {
  svc = await import("@/lib/service");
  presenter = await import("@/lib/presenter-store");
});
afterAll(() => fetchSpy.mockRestore());
type S = Awaited<ReturnType<Svc["getState"]>>;
const snap = (s: S) => JSON.stringify({ a: s.attempts, l: s.paymentLinks, g: s.agreements, m: s.mandate, d: s.deliveries, c: s.changeRequests, st: s.status });

describe("evidence-based merchant closure reasons", () => {
  it("suggests the requested-start-date reason for Blue Harbor's actual failed checks", () => {
    // Blue Harbor is no longer a demo case; its retained fixture keeps this journey testable.
    const item = blueHarborCase;
    const { profile } = interpretExtraction(item.expected.extraction, { dealId: item.deal.dealId, messages: item.deal.messages, packages: item.deal.packages, timeZone: item.deal.merchant.timeZone });
    const evaluation = evaluateDeal(profile, { merchant: item.deal.merchant, packages: item.deal.packages, templates: item.deal.templates });
    const allFailures = [...new Set(evaluation.result!.structures.flatMap((structure) => failingChecks(structure).map((check) => check.code)))];
    expect(allFailures).toEqual(["START_AFTER_LATEST_START", "CASH_AT_RISK_ABOVE_LIMIT", "REQUIRED_PACKAGE_EXCLUDED"]);
    const codes = failedChecksBlockingEveryStructure(evaluation.result!.structures);
    expect(codes).toEqual(["START_AFTER_LATEST_START"]);
    expect(suggestedMerchantCloseReason(codes)).toBe("cannot_meet_start_date");
  });

  it("does not suggest a reason without a matching failed check or when supported reasons conflict", () => {
    expect(suggestedMerchantCloseReason([])).toBeNull();
    expect(suggestedMerchantCloseReason(["BUDGET_EXCEEDS_CURRENT_PERIOD"])).toBeNull();
    expect(suggestedMerchantCloseReason(["START_AFTER_LATEST_START", "CONTRIBUTION_BELOW_FLOOR"])).toBeNull();
  });
});

describe("merchant closure", () => {
  it("closes from options ready; nothing is deleted; the record has provenance", async () => {
    await svc.resetToSeed();
    await driveTo(svc, (s) => s.status === "options_ready");
    const before = await svc.getState();
    const s = await svc.closeByMerchant("contribution_too_low", "Below our usual margin");
    expect(s.status).toBe("merchant_rejected");
    expect(s.events.length).toBeGreaterThan(before.events.length);
    expect(s.conversation).toEqual(before.conversation);
    const rec = s.outcomes.at(-1)!;
    expect(rec).toMatchObject({ type: "merchant_closed", reasonCode: "contribution_too_low", note: "Below our usual margin", actor: "merchant" });
    expect(s.events.find((e) => e.id === rec.source!.id)?.kind).toBe("merchant_closed");
  });

  it("closes an approved-but-unsent proposal, keeps its history, and an old retry cannot send it", async () => {
    await svc.resetToSeed();
    await presenter.setFailNextSend(false);
    await driveTo(svc, (s) => s.status === "options_ready");
    const v = await svc.reviewBuyerProposal();
    await svc.approveDraft(v.version, v.termsHash);
    await presenter.setFailNextSend(true);
    await svc.sendProposal(v.version);
    const s = await svc.closeByMerchant("handled_elsewhere");
    expect(s.agreements[0].merchantApproval?.termsHash).toBe(v.termsHash);
    expect(s.deliveries[0].attempts.map((a) => a.status)).toEqual(["failed"]);
    await expect(svc.sendProposal(v.version)).rejects.toThrow(/not open for sending/);
    expect(isDelivered((await svc.getState()).deliveries, v.version)).toBe(false);
  });

  it("is unavailable after a successful send", async () => {
    await svc.resetToSeed();
    await presenter.setFailNextSend(false);
    await driveTo(svc, (s) => s.status === "sent");
    await expect(svc.closeByMerchant("other")).rejects.toThrow(/not available after the proposal was sent/);
  });
});

describe("buyer decisions", () => {
  it("decline records an optional reason linked to the decline message", async () => {
    const s = await svc.declineAgreement(1, "budget");
    const rec = s.outcomes.at(-1)!;
    expect(rec).toMatchObject({ type: "buyer_declined", reasonCode: "budget", actor: "buyer", version: 1 });
    expect(s.conversation.find((i) => i.id === rec.source!.id)?.kind).toBe("decline");
  });
  it("a change request links its outcome to the buyer's message instead of copying it", async () => {
    await svc.resetToSeed();
    await driveTo(svc, (s) => s.status === "sent");
    const s = await svc.requestChange(1, "Could the second payment move to 15 December?");
    const rec = s.outcomes.at(-1)!;
    expect(rec).toMatchObject({ type: "buyer_requested_change", reasonCode: null, note: null, actor: "buyer" });
    expect(s.conversation.find((i) => i.id === rec.source!.id)?.text).toBe("Could the second payment move to 15 December?");
  });
});

describe("handled buyer messages", () => {
  it("marking a message handled changes no payment, mandate, collection, agreement or delivery data", async () => {
    await svc.resetToSeed();
    const st = await driveTo(svc, (x) => x.conversation.some((i) => i.kind === "notice"));
    const notice = st.conversation.find((i) => i.kind === "notice")!;
    const r = await svc.buyerReply({ inReplyTo: notice.id, text: "I paid" });
    const reply = r.conversation.at(-1)!;
    const before = snap(r);
    const s = await svc.markMessageHandled(reply.id, "Checked the bank statement");
    expect(snap(s)).toBe(before);
    expect(s.handledMessages).toEqual([expect.objectContaining({ messageId: reply.id, actor: "merchant", note: "Checked the bank statement" })]);
    await expect(svc.markMessageHandled(reply.id)).rejects.toThrow(/already/);
    await expect(svc.markMessageHandled(notice.id)).rejects.toThrow(/Only a buyer reply to a notice/);
  });
});

describe("batch questions", () => {
  it("sends exactly the unresolved questions, each with separate evidence", async () => {
    const s0 = await svc.resetToSeed();
    const drafts = s0.conversation.filter((i) => i.kind === "clarification").map((i) => i.id);
    const s = await svc.sendQuestions();
    const sent = s.conversation.filter((i) => drafts.includes(i.id));
    expect(sent.map((i) => [i.state, !!i.sentAt])).toEqual(drafts.map(() => ["approved_and_sent_by_merchant", true]));
    expect(s.events.filter((e) => e.kind === "clarification_sent")).toHaveLength(drafts.length);
    await expect(svc.sendQuestions()).rejects.toThrow(/No questions to send/);
  });
  it("made no network call", () => expect(fetchSpy).not.toHaveBeenCalled());
});
