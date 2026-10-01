import "server-only";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { activate, assertPaymentsUnlocked, buyerAccept, createAgreementVersion, markSent, merchantApprove, type AgreementVersion } from "@/domain/agreement";
import { applyCollectionUpdate, earliestDebitAfterUnavailableUntil, proposeReschedule, transitionAmendment, type Amendment } from "@/domain/amendment";
import { DEMO_ANCHOR, FixedClock, SimulatedClock, type ClockAdvance } from "@/domain/clock";
import { scheduleAttempt, scheduleInternalRetry, submitAttempt, transitionAttempt, type CollectionAttempt } from "@/domain/collections";
import { interpretations } from "@/domain/constraints";
import { compareDates, localDateOf, normaliseRelativeDate } from "@/domain/dates";
import type { EvaluatedStructure } from "@/domain/engine";
import { createMandate, transitionMandate, type Mandate } from "@/domain/mandate";
import { planAdvanceNotice, recordReplyToNotice, sendAdvanceNotice, type AdvanceNotice } from "@/domain/notices";
import { assertDealTransition, statusForEvaluation, type DealStatus } from "@/domain/state";
import type { Structure } from "@/domain/structures";
import type { Message } from "@/domain/types";
import { sum } from "@/domain/money";
import { createLiveProvider } from "@/ai/live";
import { replayRun, runConstruct, type RunOutcome } from "@/ai/orchestrator";
import type { ModelProvider } from "@/ai/provider";
import { ReplayProvider } from "@/ai/replay-provider";
import type { RecordedAnswer, RunRecord } from "@/ai/run-record";
import { SyntheticAuthoredProvider } from "@/ai/synthetic-provider";
import { heroDeal } from "@/data/synthetic/hero-run";
import { heroBuyer, heroDemoEvents, heroMerchant, HERO_DEAL_ID } from "@/data/synthetic/hero";
import { SCENARIOS } from "@/data/synthetic/scenarios";
import { paymentAdapters, type PaymentLinkState } from "@/integrations/razorpay";
import { readJson, serialised, writeJsonAtomic } from "./store";

export const STORE_FILE = "store.json";
export const AGREEMENT_ID = "agr-hero";

export type Provenance = "engine" | "merchant" | "buyer_demo" | "simulated" | "real_test" | "synthetic_replay" | "live_model";

export interface TimelineEvent {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  provenance: Provenance;
}

export interface DemoState {
  schema: "adaptive-deals.store.v1";
  dealId: string;
  status: DealStatus;
  statusHistory: { at: string; from: DealStatus | null; to: DealStatus; reason: string }[];
  clockAdvances: ClockAdvance[];
  run: { record: RunRecord; viewing: "replay" | "fresh" };
  agreements: AgreementVersion[];
  paymentLinks: PaymentLinkState[];
  mandate: (Mandate & { note: string }) | null;
  attempts: CollectionAttempt[];
  notices: AdvanceNotice[];
  extraMessages: Message[];
  amendments: Amendment[];
  events: TimelineEvent[];
  scenario: { id: string; record: RunRecord } | null;
}

export class ActionError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

// ── Bundled synthetic run ────────────────────────────────────────────────────

export function bundledSyntheticRun(): RunRecord {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data/synthetic/replay/hero-synthetic-run.json"), "utf8"));
}

const clockOf = (s: Pick<DemoState, "clockAdvances">) => new SimulatedClock(DEMO_ANCHOR, s.clockAdvances);

function event(s: DemoState, kind: string, title: string, provenance: Provenance, detail: string | null = null) {
  s.events.push({ id: `ev-${s.events.length + 1}`, at: clockOf(s).now(), kind, title, detail, provenance });
}

function setStatus(s: DemoState, to: DealStatus, reason: string) {
  if (s.status !== to) assertDealTransition(s.status, to);
  s.statusHistory.push({ at: clockOf(s).now(), from: s.status, to, reason });
  s.status = to;
}

/** Advance the demo clock only forwards, as an explicit recorded simulated action. */
function advanceTo(s: DemoState, to: string, reason: string) {
  const c = clockOf(s);
  if (Date.parse(to) <= Date.parse(c.now())) return;
  const adv = c.advanceTo(to, reason);
  s.clockAdvances.push(adv);
  // The run record keeps every deliberate demo time advance alongside the run it belongs to.
  s.run.record.clockAdvances = [...s.run.record.clockAdvances, adv];
  event(s, "clock_advanced", `Simulated date: ${localDateOf(to, heroMerchant.timeZone)}`, "simulated", reason);
}

const at10 = (date: string) => `${date}T10:00:00+05:30`;

// ── Seed and load ────────────────────────────────────────────────────────────

/** Fresh demo state at the start of the storyboard: the bundled synthetic run, before answers. */
export async function seedState(record: RunRecord = bundledSyntheticRun(), viewing: "replay" | "fresh" = "replay"): Promise<DemoState> {
  const provider = new ReplayProvider(record.kind === "live" ? "recorded_replay" : "synthetic_replay", record.model, record.steps);
  const first = await runConstruct({ provider, kind: record.kind, runId: record.runId, clock: new FixedClock(), deal: heroDeal(), recordedAtWall: record.recordedAtWall });
  const s: DemoState = {
    schema: "adaptive-deals.store.v1",
    dealId: HERO_DEAL_ID,
    status: "stalled",
    statusHistory: [{ at: DEMO_ANCHOR, from: null, to: "stalled", reason: "Deal entered the workspace with a buyer conversation" }],
    clockAdvances: [],
    run: { record: first.record, viewing },
    agreements: [],
    paymentLinks: [],
    mandate: null,
    attempts: [],
    notices: [],
    extraMessages: [],
    amendments: [],
    events: [],
    scenario: null,
  };
  event(s, "run_loaded", record.kind === "live" ? "Stored live run loaded" : "Synthetic replay loaded", record.kind === "live" ? "live_model" : "synthetic_replay", `Run ${record.runId}`);
  setStatus(s, statusForEvaluation(first.evaluation), "Constraint extraction and full engine evaluation");
  return s;
}

export async function getState(): Promise<DemoState> {
  const s = await readJson<DemoState>(STORE_FILE);
  if (s) return s;
  return serialised(async () => {
    const again = await readJson<DemoState>(STORE_FILE);
    if (again) return again;
    const seeded = await seedState();
    await writeJsonAtomic(STORE_FILE, seeded);
    return seeded;
  });
}

async function mutate(fn: (s: DemoState) => Promise<void> | void): Promise<DemoState> {
  return serialised(async () => {
    const s = (await readJson<DemoState>(STORE_FILE)) ?? (await seedState());
    await fn(s);
    await writeJsonAtomic(STORE_FILE, s);
    return s;
  });
}

export async function resetToSeed(): Promise<DemoState> {
  return serialised(async () => {
    const s = await seedState();
    await writeJsonAtomic(STORE_FILE, s);
    return s;
  });
}

// ── Derived engine state (always recomputed from the run record, integrity-checked) ──

export async function currentOutcome(s: DemoState): Promise<RunOutcome> {
  return replayRun(s.run.record, heroDeal(), new FixedClock());
}

function activeVersion(s: DemoState): AgreementVersion | null {
  return [...s.agreements].reverse().find((v) => v.status === "active") ?? null;
}

async function structureForVersion(s: DemoState, v: AgreementVersion): Promise<EvaluatedStructure> {
  const amendment = s.amendments.find((a) => a.toVersion === v.version && a.state !== "rejected");
  if (amendment) return amendment.revised;
  const out = await currentOutcome(s);
  const x = out.evaluation.result?.structures.find((e) => e.structure.id === v.structureId);
  if (!x) throw new ActionError("Agreement structure is no longer in the evaluation");
  return x;
}

// ── Run live and replays ─────────────────────────────────────────────────────

function providerForContinuation(s: DemoState): ModelProvider {
  if (s.run.record.kind === "live" && s.run.viewing === "fresh") {
    const live = createLiveProvider();
    if (live) return live;
  }
  // Synthetic runs continue from the bundled synthetic outputs; replays from their own run.
  const pool = s.run.record.kind === "live" ? s.run.record.steps : bundledSyntheticRun().steps;
  return new ReplayProvider(s.run.record.kind === "live" ? "recorded_replay" : "synthetic_replay", s.run.record.model, pool);
}

export async function startLiveRun(): Promise<DemoState> {
  const provider = createLiveProvider();
  if (!provider) throw new ActionError("Run live needs ANTHROPIC_API_KEY. Without it the bundled synthetic replay is used and labelled as such.", 412);
  const runId = `run-live-${randomUUID().slice(0, 8)}`;
  const out = await runConstruct({ provider, kind: "live", runId, clock: new FixedClock(), deal: heroDeal(), recordedAtWall: new Date().toISOString() });
  await writeJsonAtomic(`runs/${runId}.json`, out.record);
  return serialised(async () => {
    const s = await seedState(out.record, "fresh");
    s.events = s.events.map((e) => (e.kind === "run_loaded" ? { ...e, title: "Live model run started" } : e));
    await writeJsonAtomic(STORE_FILE, s);
    return s;
  });
}

/** Load a previously stored live run as a replay ("Replay of an actual run"). */
export async function replayStoredRun(runId: string): Promise<DemoState> {
  if (!/^run-live-[a-f0-9]{8}$/.test(runId)) throw new ActionError("Unknown run", 404);
  const record = await readJson<RunRecord>(`runs/${runId}.json`);
  if (!record || record.kind !== "live") throw new ActionError("Only stored live runs can be replayed as actual runs", 404);
  return serialised(async () => {
    const s = await seedState(record, "replay");
    await writeJsonAtomic(STORE_FILE, s);
    return s;
  });
}

// ── Clarification ────────────────────────────────────────────────────────────

export interface AnswerInput {
  questionId: string;
  value: string;
  answerText: string;
  confirmedByBuyerVia: "whatsapp" | "email" | "call";
  answeredAt?: string;
}

export async function recordAnswers(inputs: AnswerInput[]): Promise<DemoState> {
  return mutate(async (s) => {
    if (s.status !== "clarifying") throw new ActionError(`Answers can only be recorded while clarifying (deal is ${s.status})`);
    const asked = new Set(s.run.record.displayed.questions.map((q) => q.id));
    if (inputs.length !== asked.size || !inputs.every((i) => asked.has(i.questionId))) throw new ActionError("Answer every clarification question");
    const answers: RecordedAnswer[] = inputs.map((i) => ({
      questionId: i.questionId,
      value: i.value,
      answerText: i.answerText.trim(),
      recordedBy: "Merchant (Pinecone Media Works)",
      confirmedByBuyerVia: i.confirmedByBuyerVia,
      answeredAt: i.answeredAt ?? clockOf(s).now(),
    }));
    const out = await runConstruct({ provider: providerForContinuation(s), kind: s.run.record.kind, runId: s.run.record.runId, clock: new FixedClock(), deal: heroDeal(), answers, previous: s.run.record });
    s.run = { record: out.record, viewing: s.run.viewing };
    for (const a of answers) event(s, "clarification_answered", `Answer recorded: ${a.answerText}`, "merchant", `Confirmed by buyer via ${a.confirmedByBuyerVia}`);
    setStatus(s, statusForEvaluation(out.evaluation), "Engine re-evaluated every template with the confirmed answers");
  });
}

// ── Decision and agreement ───────────────────────────────────────────────────

export async function prepareAgreement(structureId: string): Promise<AgreementVersion> {
  let created: AgreementVersion | null = null;
  await mutate(async (s) => {
    if (s.status !== "options_ready") throw new ActionError(`Options are not ready (deal is ${s.status})`);
    const out = await currentOutcome(s);
    const x = out.evaluation.result?.structures.find((e) => e.structure.id === structureId);
    if (!x) throw new ActionError("Unknown structure", 404);
    if (!x.approvable) throw new ActionError("Only engine-feasible structures can be approved; this one is in the rejected section");
    s.agreements = s.agreements.filter((v) => v.status !== "draft");
    created = createAgreementVersion({ agreementId: AGREEMENT_ID, version: 1, evaluated: x, dealId: s.dealId, merchantId: heroMerchant.id, buyerId: heroBuyer.id, policy: heroMerchant.policy, clock: clockOf(s) });
    s.agreements.push(created);
  });
  return created!;
}

export async function approveAndSend(version: number, termsHash: string): Promise<DemoState> {
  return mutate((s) => {
    const i = s.agreements.findIndex((v) => v.version === version && v.status === "draft");
    if (i < 0) throw new ActionError("No draft agreement version to approve");
    const approved = merchantApprove(s.agreements[i], termsHash, "Merchant (Pinecone Media Works)", clockOf(s));
    s.agreements[i] = markSent(approved);
    setStatus(s, "approved", `Merchant approved version ${version}`);
    setStatus(s, "sent", "Proposal sent to the buyer (Demo buyer view)");
    event(s, "merchant_approved", `Merchant approved version ${version}`, "merchant", `Terms hash ${termsHash}`);
  });
}

function schedulePayments(s: DemoState, v: AgreementVersion) {
  const total = sum(v.terms.paymentSchedule.map((p) => p.totalPaise));
  for (const p of v.terms.paymentSchedule) {
    if (s.attempts.some((a) => a.scheduleLineId === p.id && (a.status === "succeeded" || a.status === "scheduled" || a.status === "submitted"))) continue;
    s.attempts.push(scheduleAttempt(s.attempts, { agreementId: v.agreementId, agreementVersion: v.version, scheduleLineId: p.id, dueDate: p.dueDate.value, amountPaise: p.totalPaise, prePaise: p.prePaise, gstPaise: p.gstPaise, origin: "agreement", method: p.method as CollectionAttempt["method"] }, total, clockOf(s).now()));
  }
}

function planNotices(s: DemoState) {
  for (const a of s.attempts.filter((x) => x.status === "scheduled" && x.method === "recurring_debit")) {
    if (!s.notices.some((n) => n.attemptId === a.id)) s.notices.push(planAdvanceNotice(a, heroMerchant.policy));
  }
}

export async function acceptAgreement(version: number, termsHash: string, authorityConfirmed: boolean): Promise<DemoState> {
  return mutate(async (s) => {
    const i = s.agreements.findIndex((v) => v.version === version && v.status === "sent");
    if (i < 0) throw new ActionError("No sent agreement version to accept");
    s.agreements[i] = buyerAccept(s.agreements[i], termsHash, "Buyer (Demo buyer view)", clockOf(s), { authorityConfirmed });
    setStatus(s, "accepted", `Buyer accepted version ${version}`);
    event(s, "buyer_accepted", `Buyer accepted version ${version}`, "buyer_demo", `Terms hash ${termsHash}${authorityConfirmed ? " · authority for this scope confirmed" : ""}`);
    s.agreements[i] = activate(s.agreements[i]);
    const v = s.agreements[i];

    // Payment APIs become reachable only here, after matching hashes. The AI is not involved.
    assertPaymentsUnlocked(v);
    schedulePayments(s, v);
    const adapters = paymentAdapters(process.env, s.paymentLinks);
    const linkAttempt = s.attempts.find((a) => a.method === "payment_link" && a.status === "scheduled");
    if (linkAttempt) {
      const link = await adapters.links.createPaymentLink({ referenceId: linkAttempt.idempotencyKey, amountPaise: linkAttempt.amountPaise, description: `Adaptive Deals ${v.agreementId} v${v.version} · instalment ${linkAttempt.scheduleLineId}`, customerName: heroBuyer.name, notes: { agreement: v.agreementId, version: String(v.version), terms_hash: v.termsHash.slice(0, 32) } });
      s.paymentLinks.push(link);
      s.attempts = s.attempts.map((a) => (a.id === linkAttempt.id ? { ...a, razorpayId: link.id } : a));
      event(s, "payment_link_created", `Upfront payment link created`, link.mode === "real_test" ? "real_test" : "simulated", link.mode === "real_test" ? `Razorpay test mode · ${link.id}` : `Simulated · ${link.id}`);
    }
    if (v.terms.mandate) {
      const reg = await adapters.recurring.registerMandate({ referenceId: `${v.agreementId}_v${v.version}`, perDebitLimitPaise: v.terms.mandate.perDebitLimitPaise, endDate: v.terms.mandate.endDate.value, customerName: heroBuyer.name });
      s.mandate = { ...createMandate({ id: reg.id, agreementId: v.agreementId, agreementVersion: v.version, terms: v.terms.mandate, mode: reg.mode }), note: reg.note };
      event(s, "mandate_requested", "Mandate registration requested", "simulated", reg.note);
    }
    planNotices(s);
    setStatus(s, "active", "Matching merchant and buyer hashes; collection prepared");
  });
}

// ── Simulated events ─────────────────────────────────────────────────────────

export type SimulatedEvent = "payment_link_paid" | "mandate_confirmed" | "advance_notice" | "debit_failed" | "debit_succeeded" | "buyer_reply";

export async function simulate(kind: SimulatedEvent): Promise<DemoState> {
  return mutate((s) => {
    const v = activeVersion(s);
    if (!v) throw new ActionError("No active agreement");
    const total = sum(v.terms.paymentSchedule.map((p) => p.totalPaise));
    const now = () => clockOf(s).now();

    if (kind === "payment_link_paid") {
      const a = s.attempts.find((x) => x.method === "payment_link" && x.status === "scheduled");
      if (!a) throw new ActionError("No unpaid payment link");
      const link = s.paymentLinks.find((l) => l.id === a.razorpayId);
      if (link?.mode === "real_test") throw new ActionError("This link is in Razorpay test mode: use Check status instead of a simulated event");
      advanceTo(s, at10(a.dueDate), "Simulated: buyer pays the upfront payment link");
      s.attempts = submitAttempt(s.attempts, a.id, total, now()).map((x) => (x.id === a.id ? transitionAttempt(x, "succeeded", now(), "Simulated event: payment link paid", `pay_sim_${a.scheduleLineId}`) : x));
      s.paymentLinks = s.paymentLinks.map((l) => (l.id === a.razorpayId ? { ...l, status: "paid", amountPaidPaise: l.amountPaise } : l));
      event(s, "payment_succeeded", "Upfront payment received", "simulated", "Simulated event: payment link paid");
      return;
    }
    if (kind === "mandate_confirmed") {
      if (!s.mandate || s.mandate.status !== "pending") throw new ActionError("No pending mandate");
      s.mandate = { ...transitionMandate(s.mandate, "confirmed"), note: s.mandate.note };
      event(s, "mandate_confirmed", "Mandate registration confirmed", "simulated", "Simulated event: buyer authorised the mandate");
      return;
    }
    if (kind === "advance_notice") {
      const n = s.notices.find((x) => !x.sentAt && s.attempts.find((a) => a.id === x.attemptId)?.status === "scheduled");
      if (!n) throw new ActionError("No advance notice is due");
      advanceTo(s, at10(n.sendOn), "Simulated: Adaptive Deals sends its advance notice");
      const sent = sendAdvanceNotice(n, clockOf(s), heroMerchant.timeZone);
      s.notices = s.notices.map((x) => (x.id === n.id ? sent : x));
      event(s, "advance_notice_sent", `Advance notice sent for ${n.dueDate}`, "simulated", sent.text);
      return;
    }
    if (kind === "debit_failed" || kind === "debit_succeeded") {
      if (!s.mandate || s.mandate.status !== "confirmed") throw new ActionError("The mandate must be confirmed before a recurring debit");
      const a = [...s.attempts].filter((x) => x.method === "recurring_debit" && x.status === "scheduled" && x.origin !== "internal_retry").sort((p, q) => compareDates(p.dueDate, q.dueDate))[0];
      if (!a) throw new ActionError("No recurring debit is scheduled");
      advanceTo(s, at10(a.dueDate), `Simulated: recurring debit on ${a.dueDate}`);
      s.attempts = submitAttempt(s.attempts, a.id, total, now());
      if (kind === "debit_succeeded") {
        s.attempts = s.attempts.map((x) => (x.id === a.id ? transitionAttempt(x, "succeeded", now(), "Simulated event: debit succeeded", `pay_sim_${a.scheduleLineId}`) : x));
        event(s, "payment_succeeded", `Recurring debit of ${a.dueDate} succeeded`, "simulated", "Simulated event");
        return;
      }
      s.attempts = s.attempts.map((x) => (x.id === a.id ? transitionAttempt(x, "failed", now(), "Simulated event: debit failed") : x));
      const failed = s.attempts.find((x) => x.id === a.id)!;
      s.attempts = scheduleInternalRetry(s.attempts, failed, heroMerchant.policy.internalRetryAfterDays, total, now());
      event(s, "debit_failed", `Recurring debit of ${a.dueDate} failed`, "simulated", `Simulated event · Adaptive Deals internal retry scheduled for ${s.attempts.at(-1)!.dueDate}`);
      return;
    }
    // buyer_reply
    const n = [...s.notices].reverse().find((x) => x.sentAt);
    if (!n) throw new ActionError("The buyer can only reply to a notice that was sent");
    if (s.extraMessages.some((m) => m.inReplyTo === n.id)) throw new ActionError("The buyer already replied to this notice");
    advanceTo(s, heroDemoEvents.buyerReply.timestamp, "Simulated: buyer replies to the advance notice");
    const reply = recordReplyToNotice(n, { id: heroDemoEvents.buyerReply.id, dealId: s.dealId, author: "buyer", text: heroDemoEvents.buyerReply.text, timestamp: heroDemoEvents.buyerReply.timestamp, source: heroDemoEvents.buyerReply.source });
    s.extraMessages.push(reply);
    event(s, "buyer_message", `Buyer: “${reply.text}”`, "simulated", `Reply to advance notice ${n.id}`);
  });
}

/** Razorpay test mode: poll the payment link status instead of relying on a public webhook. */
export async function checkPaymentLinkStatus(): Promise<DemoState> {
  return mutate(async (s) => {
    const v = activeVersion(s);
    const a = s.attempts.find((x) => x.method === "payment_link" && x.status === "scheduled");
    const link = s.paymentLinks.find((l) => l.id === a?.razorpayId);
    if (!v || !a || !link) throw new ActionError("No unpaid payment link");
    if (link.mode !== "real_test") throw new ActionError("Simulated links are paid with the Simulate control");
    const latest = await paymentAdapters(process.env).links.fetchPaymentLink(link.id);
    s.paymentLinks = s.paymentLinks.map((l) => (l.id === link.id ? latest : l));
    if (latest.status === "paid") {
      const total = sum(v.terms.paymentSchedule.map((p) => p.totalPaise));
      s.attempts = submitAttempt(s.attempts, a.id, total, clockOf(s).now()).map((x) => (x.id === a.id ? transitionAttempt(x, "succeeded", clockOf(s).now(), "Razorpay test mode: link paid", link.id) : x));
      event(s, "payment_succeeded", "Upfront payment received", "real_test", `Razorpay test mode · ${link.id}`);
    } else event(s, "payment_link_checked", `Payment link status: ${latest.status}`, "real_test", link.id);
  });
}

// ── Amendment ────────────────────────────────────────────────────────────────

const UNAVAILABLE_UNTIL = /\b(?:till|until|upto|up to)\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)\b/i;

export async function proposeAmendment(): Promise<DemoState> {
  return mutate(async (s) => {
    if (s.status !== "active") throw new ActionError(`Amendments start from an active agreement (deal is ${s.status})`);
    const v = activeVersion(s)!;
    const failed = [...s.attempts].reverse().find((a) => a.status === "failed");
    if (!failed) throw new ActionError("No failed debit to amend");
    const reply = [...s.extraMessages].reverse().find((m) => m.inReplyTo);
    if (!reply) throw new ActionError("Waiting for the buyer's reply");
    const phrase = UNAVAILABLE_UNTIL.exec(reply.text)?.[0];
    if (!phrase) throw new ActionError("The reply does not state when cash is available; ask the buyer");
    const parsed = normaliseRelativeDate(phrase, reply.timestamp, heroMerchant.timeZone);
    if (!parsed.ok) throw new ActionError(`Cannot normalise “${phrase}”: ${parsed.reason}`);
    const newDate = earliestDebitAfterUnavailableUntil(parsed.value);

    const out = await currentOutcome(s);
    const constraints = interpretations(out.profile)[0].constraints;
    const current = await structureForVersion(s, v);
    const amendment = proposeReschedule({
      id: `amd-${s.amendments.length + 1}`,
      from: v,
      structure: current.structure as Structure,
      lineId: failed.scheduleLineId,
      newDueDate: newDate,
      constraints,
      engine: { merchant: heroMerchant, packages: heroDeal().packages, templates: heroDeal().templates },
      mandate: s.mandate!,
      trigger: "failed_debit",
      triggerRefs: [failed.id, reply.inReplyTo!, reply.id],
      at: clockOf(s).now(),
    });
    s.amendments.push(amendment);
    event(s, "amendment_proposed", `Revision proposed: ${failed.dueDate} → ${newDate}`, "engine", `“${phrase}” read from the reply's own timestamp as ${parsed.value.value}; earliest debit is the next day`);
    if (amendment.state === "rejected") return;
    s.agreements.push(createAgreementVersion({ agreementId: v.agreementId, version: v.version + 1, evaluated: amendment.revised, dealId: s.dealId, merchantId: heroMerchant.id, buyerId: heroBuyer.id, policy: heroMerchant.policy, clock: clockOf(s), supersedes: v.version }));
    setStatus(s, "amending", "Revision proposed after a failed debit");
  });
}

export async function approveAmendment(termsHash: string): Promise<DemoState> {
  return mutate((s) => {
    const a = s.amendments.at(-1);
    if (!a || a.state !== "proposed") throw new ActionError("No proposed revision");
    const i = s.agreements.findIndex((v) => v.version === a.toVersion && v.status === "draft");
    s.agreements[i] = markSent(merchantApprove(s.agreements[i], termsHash, "Merchant (Pinecone Media Works)", clockOf(s)));
    s.amendments[s.amendments.length - 1] = transitionAmendment(a, "merchant_approved", clockOf(s).now());
    event(s, "merchant_approved", `Merchant approved revision (version ${a.toVersion})`, "merchant", `Terms hash ${termsHash}`);
  });
}

export async function acceptAmendment(termsHash: string, authorityConfirmed: boolean): Promise<DemoState> {
  return mutate(async (s) => {
    let a = s.amendments.at(-1);
    if (!a || a.state !== "merchant_approved") throw new ActionError("No revision awaiting buyer acceptance");
    const i = s.agreements.findIndex((v) => v.version === a!.toVersion && v.status === "sent");
    s.agreements[i] = buyerAccept(s.agreements[i], termsHash, "Buyer (Demo buyer view)", clockOf(s), { authorityConfirmed });
    a = transitionAmendment(a, "buyer_accepted", clockOf(s).now());
    event(s, "buyer_accepted", `Buyer accepted revision (version ${a.toVersion})`, "buyer_demo", `Terms hash ${termsHash}`);

    const v2 = s.agreements[i];
    assertPaymentsUnlocked(v2);
    const update = applyCollectionUpdate({ attempts: s.attempts, amendment: a, newVersion: v2, agreementTotalPaise: sum(v2.terms.paymentSchedule.map((p) => p.totalPaise)), at: clockOf(s).now() });
    s.attempts = update.attempts;
    a = transitionAmendment(a, "collection_updated", clockOf(s).now());
    for (const r of update.removed) event(s, "attempt_removed", r.history.at(-1)!.note, "engine", r.idempotencyKey);
    s.agreements[i] = activate(v2);
    s.agreements = s.agreements.map((v) => (v.version === a!.fromVersion ? { ...v, status: "superseded" } : v));
    a = transitionAmendment(a, "active", clockOf(s).now());
    s.amendments[s.amendments.length - 1] = a;
    if (a.mandateFit.freshAuthorisationRequired && v2.terms.mandate) {
      const reg = await paymentAdapters(process.env).recurring.registerMandate({ referenceId: `${v2.agreementId}_v${v2.version}`, perDebitLimitPaise: v2.terms.mandate.perDebitLimitPaise, endDate: v2.terms.mandate.endDate.value, customerName: heroBuyer.name });
      s.mandate = { ...createMandate({ id: reg.id, agreementId: v2.agreementId, agreementVersion: v2.version, terms: v2.terms.mandate, mode: reg.mode }), note: reg.note };
      event(s, "mandate_requested", "Fresh mandate authorisation requested", "simulated", reg.note);
    }
    planNotices(s);
    setStatus(s, "active", `Version ${v2.version} active; collection updated`);
  });
}

// ── Failure-state scenarios ─────────────────────────────────────────────────

export async function runScenario(id: string | null): Promise<DemoState> {
  return mutate(async (s) => {
    if (id === null) {
      s.scenario = null;
      return;
    }
    const sc = SCENARIOS.find((x) => x.id === id);
    if (!sc) throw new ActionError("Unknown scenario", 404);
    const provider = new SyntheticAuthoredProvider({ extract: sc.extraction }, []);
    const out = await runConstruct({ provider, kind: "synthetic_replay", runId: `run-${sc.id}`, clock: new FixedClock(), deal: { ...heroDeal(), dealId: sc.id, messages: sc.messages } });
    s.scenario = { id: sc.id, record: out.record };
  });
}

// ── Guided demo (deterministic storyboard) ──────────────────────────────────

export interface DemoStep {
  id: string;
  window: string;
  view: "workspace" | "clarification" | "decision" | "agreement" | "timeline";
  title: string;
  role: "merchant" | "buyer";
}

/** The next storyboard step for the current state. Pure: derived from stored state only. */
export function nextDemoStep(s: DemoState): DemoStep | null {
  const v1 = s.agreements.find((v) => v.version === 1);
  const amendment = s.amendments.at(-1);
  const link = s.attempts.find((a) => a.method === "payment_link");
  if (s.status === "clarifying") return { id: "answer", window: "15–25 s", view: "clarification", title: "Record the buyer's confirmed answers", role: "merchant" };
  if (s.status === "options_ready") return { id: "approve", window: "25–50 s", view: "decision", title: "Approve and send the top-ranked feasible option", role: "merchant" };
  if (s.status === "sent" && v1) return { id: "accept", window: "50–62 s", view: "agreement", title: "Buyer accepts the same terms hash", role: "buyer" };
  if (s.status === "active" && link?.status === "scheduled") return { id: "pay_link", window: "62–66 s", view: "timeline", title: "Simulate: buyer pays the upfront payment link", role: "merchant" };
  if (s.status === "active" && s.mandate?.status === "pending") return { id: "mandate", window: "66–68 s", view: "timeline", title: "Simulate: mandate registration confirmed", role: "merchant" };
  if (s.status === "active" && !amendment && s.notices.some((n) => !n.sentAt)) return { id: "notice", window: "68–70 s", view: "timeline", title: "Simulate: Adaptive Deals sends its advance notice", role: "merchant" };
  if (s.status === "active" && !amendment && !s.attempts.some((a) => a.status === "failed")) return { id: "fail", window: "70–72 s", view: "timeline", title: "Simulate failed debit", role: "merchant" };
  if (s.status === "active" && !amendment && !s.extraMessages.length) return { id: "reply", window: "72–74 s", view: "timeline", title: "Simulate: buyer replies “cash tight till the 20th”", role: "merchant" };
  if (s.status === "active" && !amendment) return { id: "propose", window: "74–76 s", view: "timeline", title: "Propose the revision and check mandate fit", role: "merchant" };
  if (amendment?.state === "proposed") return { id: "amend_approve", window: "76–78 s", view: "timeline", title: "Merchant approves the revision", role: "merchant" };
  if (amendment?.state === "merchant_approved") return { id: "amend_accept", window: "78–80 s", view: "agreement", title: "Buyer accepts the revision", role: "buyer" };
  if (s.status === "active" && amendment?.state === "active" && s.scenario?.id !== "scenario-no-feasible") return { id: "close", window: "80–90 s", view: "timeline", title: "Close: metric, approval boundary and a no-feasible-deal example", role: "merchant" };
  return null;
}

/** Perform the next storyboard step with the pinned synthetic inputs. */
export async function demoNext(): Promise<{ state: DemoState; step: DemoStep | null }> {
  const s = await getState();
  const step = nextDemoStep(s);
  if (!step) return { state: s, step: null };
  const { heroClarificationAnswers: A } = await import("@/data/synthetic/hero");
  let next: DemoState = s;
  switch (step.id) {
    case "answer":
      next = await recordAnswers([
        { questionId: A.gst.clarificationId, value: A.gst.value, answerText: A.gst.answerText, confirmedByBuyerVia: A.gst.confirmedByBuyerVia, answeredAt: A.gst.answeredAt },
        { questionId: A.approvalScope.clarificationId, value: A.approvalScope.value, answerText: A.approvalScope.answerText, confirmedByBuyerVia: A.approvalScope.confirmedByBuyerVia, answeredAt: A.approvalScope.answeredAt },
      ]);
      break;
    case "approve": {
      const top = (await currentOutcome(s)).explanation?.order[0];
      if (!top) throw new ActionError("No feasible option to approve");
      const draft = await prepareAgreement(top);
      next = await approveAndSend(draft.version, draft.termsHash);
      break;
    }
    case "accept": {
      const v = s.agreements.find((x) => x.status === "sent")!;
      next = await acceptAgreement(v.version, v.termsHash, v.terms.conditions.includes("buyer_confirms_authority_for_phase_scope"));
      break;
    }
    case "pay_link":
      next = await simulate("payment_link_paid");
      break;
    case "mandate":
      next = await simulate("mandate_confirmed");
      break;
    case "notice":
      next = await simulate("advance_notice");
      break;
    case "fail":
      next = await simulate("debit_failed");
      break;
    case "reply":
      next = await simulate("buyer_reply");
      break;
    case "propose":
      next = await proposeAmendment();
      break;
    case "amend_approve": {
      const v = s.agreements.find((x) => x.status === "draft")!;
      next = await approveAmendment(v.termsHash);
      break;
    }
    case "amend_accept": {
      const v = s.agreements.find((x) => x.status === "sent")!;
      next = await acceptAmendment(v.termsHash, v.terms.conditions.includes("buyer_confirms_authority_for_phase_scope"));
      break;
    }
    case "close":
      next = await runScenario("scenario-no-feasible");
      break;
  }
  return { state: next, step };
}
