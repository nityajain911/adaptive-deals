import "server-only";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { activate, assertPaymentsUnlocked, buyerAccept, buyerReject, createAgreementVersion, markSent, merchantApprove, type AgreementVersion } from "@/domain/agreement";
import { applyCollectionUpdate, proposeReschedule, transitionAmendment, type Amendment } from "@/domain/amendment";
import { DEMO_ANCHOR, FixedClock, SimulatedClock, type ClockAdvance } from "@/domain/clock";
import { scheduleAttempt, scheduleInternalRetry, submitAttempt, transitionAttempt, type CollectionAttempt } from "@/domain/collections";
import { interpretations } from "@/domain/constraints";
import { compareDates, localDateOf } from "@/domain/dates";
import type { EvaluatedStructure } from "@/domain/engine";
import { createMandate, transitionMandate, type Mandate } from "@/domain/mandate";
import { planAdvanceNotice, sendAdvanceNotice, type AdvanceNotice } from "@/domain/notices";
import { assertDealTransition, statusForEvaluation, type DealStatus } from "@/domain/state";
import type { Structure } from "@/domain/structures";
import type { Message } from "@/domain/types";
import { sum } from "@/domain/money";
import { liveAvailability } from "@/ai/config";
import { createLiveProvider } from "@/ai/live";
import { replayRun, runConstruct, type RunOutcome } from "@/ai/orchestrator";
import type { ModelProvider } from "@/ai/provider";
import { ReplayProvider } from "@/ai/replay-provider";
import type { RecordedAnswer, RunRecord } from "@/ai/run-record";
import { SyntheticAuthoredProvider } from "@/ai/synthetic-provider";
import { heroDeal } from "@/data/synthetic/hero-run";
import { heroBuyer, heroClarificationAnswers, heroDemoEvents, heroMerchant, heroScriptedReplies, HERO_DEAL_ID } from "@/data/synthetic/hero";
import { SCENARIOS } from "@/data/synthetic/scenarios";
import { paymentAdapters, type PaymentLinkState } from "@/integrations/razorpay";
import { DATA_DIR, readJson, serialised, writeJsonAtomic } from "./store";
import {
  amendmentMessageText,
  codeMessage,
  ConversationError,
  draftClarification,
  merchantSend,
  noticeMessageText,
  paymentLinkMessageText,
  proposalMessageText,
  receiveBuyerReply,
  rescheduledMessageText,
  type ConversationItem,
} from "@/domain/conversation";
import { CLASSIFICATION_LABEL } from "@/domain/replies";
import { createChangeRequest, RestructureError, transitionChangeRequest, type ChangeRequest } from "@/domain/restructure";

export const STORE_FILE = "store.json";
export const AGREEMENT_ID = "agr-hero";

/** Buyer proposal page for an exact version (standalone buyer route). */
export const proposalLink = (v: Pick<AgreementVersion, "agreementId" | "version">) => `/proposal/${v.agreementId}/v${v.version}`;

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
  /** sourceRunId: the complete stored run whose outputs this demo replays or continues. */
  run: { record: RunRecord; viewing: "replay" | "fresh"; sourceRunId?: string };
  agreements: AgreementVersion[];
  paymentLinks: PaymentLinkState[];
  mandate: (Mandate & { note: string }) | null;
  attempts: CollectionAttempt[];
  notices: AdvanceNotice[];
  extraMessages: Message[];
  amendments: Amendment[];
  events: TimelineEvent[];
  scenario: { id: string; record: RunRecord } | null;
  /** Simulated WhatsApp conversation (merchant ⇄ buyer), in order. */
  conversation: ConversationItem[];
  /** While true, no new AI-authored outbound drafts are created; inbound replies still arrive. */
  suggestionsPaused: boolean;
  changeRequests: ChangeRequest[];
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

const LIVE_RUN_ID = /^run-live-[a-f0-9]{8}$/;

/** A committed record of an actual live run (audit trail), from `data/live-runs/`. */
export function committedLiveRun(runId: string): RunRecord | null {
  if (!LIVE_RUN_ID.test(runId)) return null;
  try {
    return JSON.parse(readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "data/live-runs", `${runId}.json`), "utf8"));
  } catch {
    return null;
  }
}

/** A stored live run: this machine's `.data/runs/` first, then the committed audit records. */
async function storedLiveRun(runId: string): Promise<RunRecord | null> {
  if (!LIVE_RUN_ID.test(runId)) return null;
  return (await readJson<RunRecord>(`runs/${runId}.json`)) ?? committedLiveRun(runId);
}

/**
 * The run the demo shows after a reset: the run named in `data/demo-run.json` (an actual live
 * run), unless ADAPTIVE_DEALS_DEMO_RUN overrides it ("synthetic" or a run ID). Falls back to the
 * bundled synthetic replay when no live run is available, so the demo always runs credential-free.
 */
export function demoRunRecord(env: Record<string, string | undefined> = process.env): RunRecord {
  const override = env.ADAPTIVE_DEALS_DEMO_RUN?.trim();
  if (override === "synthetic") return bundledSyntheticRun();
  let runId = override;
  if (!runId) {
    try {
      runId = (JSON.parse(readFileSync(path.join(process.cwd(), "data/demo-run.json"), "utf8")) as { runId?: string }).runId;
    } catch {
      runId = undefined;
    }
  }
  const live = runId ? committedLiveRun(runId) : null;
  return live && live.kind === "live" && live.status === "complete" ? live : bundledSyntheticRun();
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
export async function seedState(record: RunRecord = demoRunRecord(), viewing: "replay" | "fresh" = "replay"): Promise<DemoState> {
  const provider = new ReplayProvider(record.kind === "live" ? "recorded_replay" : "synthetic_replay", record.model, record.steps);
  const first = await runConstruct({ provider, kind: record.kind, runId: record.runId, clock: new FixedClock(), deal: heroDeal(), recordedAtWall: record.recordedAtWall });
  const s: DemoState = {
    schema: "adaptive-deals.store.v1",
    dealId: HERO_DEAL_ID,
    status: "stalled",
    statusHistory: [{ at: DEMO_ANCHOR, from: null, to: "stalled", reason: "Deal entered the workspace with a buyer conversation" }],
    clockAdvances: [],
    run: { record: first.record, viewing, sourceRunId: record.runId },
    agreements: [],
    paymentLinks: [],
    mandate: null,
    attempts: [],
    notices: [],
    extraMessages: [],
    amendments: [],
    events: [],
    scenario: null,
    conversation: [],
    suggestionsPaused: false,
    changeRequests: [],
  };
  event(s, "run_loaded", record.kind === "live" ? "Stored live run loaded" : "Synthetic replay loaded", record.kind === "live" ? "live_model" : "synthetic_replay", `Run ${record.runId}`);
  setStatus(s, statusForEvaluation(first.evaluation), "Constraint extraction and full engine evaluation");
  draftMissingClarifications(s);
  return s;
}

/** Older stores predate the conversation; fill the new fields without touching anything else. */
function withDefaults(s: DemoState): DemoState {
  s.conversation ??= [];
  s.suggestionsPaused ??= false;
  s.changeRequests ??= [];
  return s;
}

const itemId = (s: DemoState, prefix: string) => `${prefix}-${s.conversation.length + 1}`;

/** One draft per clarification question not yet drafted. AI drafts are skipped while paused. */
function draftMissingClarifications(s: DemoState) {
  if (s.status !== "clarifying") return;
  for (const q of s.run.record.displayed.questions) {
    if (s.conversation.some((i) => i.kind === "clarification" && i.refs.questionId === q.id)) continue;
    const d = draftClarification({ id: itemId(s, "conv"), dealId: s.dealId, questionId: q.id, text: q.question, wording: q.wording, at: clockOf(s).now(), paused: s.suggestionsPaused });
    if (d) s.conversation.push(d);
  }
}

function sendCode(s: DemoState, kind: Parameters<typeof codeMessage>[0]["kind"], text: string, refs: ConversationItem["refs"] = {}) {
  const m = codeMessage({ id: itemId(s, "conv"), dealId: s.dealId, kind, text, at: clockOf(s).now(), refs });
  s.conversation.push(m);
  event(s, `message_${kind}`, `Sent by Adaptive Deals: ${kind} message`, "simulated", text);
  return m;
}

export async function getState(): Promise<DemoState> {
  const s = await readJson<DemoState>(STORE_FILE);
  if (s) return withDefaults(s);
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
    const s = withDefaults((await readJson<DemoState>(STORE_FILE)) ?? (await seedState()));
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
  // Replays continue from the complete stored run they came from, never from another run.
  return new ReplayProvider(s.run.record.kind === "live" ? "recorded_replay" : "synthetic_replay", s.run.record.model, sourceSteps(s));
}

function sourceSteps(s: DemoState) {
  if (s.run.record.kind !== "live") return bundledSyntheticRun().steps;
  const id = s.run.sourceRunId ?? s.run.record.runId;
  return (committedLiveRunSync(id) ?? s.run.record).steps;
}

function committedLiveRunSync(runId: string): RunRecord | null {
  try {
    return JSON.parse(readFileSync(path.join(/*turbopackIgnore: true*/ DATA_DIR, "runs", `${runId}.json`), "utf8"));
  } catch {
    return committedLiveRun(runId);
  }
}

export async function startLiveRun(): Promise<DemoState> {
  const provider = createLiveProvider();
  const availability = liveAvailability();
  if (!provider || !availability.available) throw new ActionError(`Run live is unavailable: ${availability.available ? "no provider" : availability.reason}.`, 412);
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
  if (!LIVE_RUN_ID.test(runId)) throw new ActionError("Unknown run", 404);
  const record = await storedLiveRun(runId);
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
    s.run = { record: out.record, viewing: s.run.viewing, sourceRunId: s.run.sourceRunId };
    // Keep the stored copy of a live run complete, so "Replay of an actual run" replays all of it.
    if (out.record.kind === "live" && s.run.viewing === "fresh") await writeJsonAtomic(`runs/${out.record.runId}.json`, out.record);
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
    // The proposal link exists only now, after the merchant approved this exact version.
    const v = s.agreements[i];
    sendCode(s, "proposal", proposalMessageText(v.terms, v.version, proposalLink(v)), { agreementVersion: v.version });
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
      sendCode(s, "payment", paymentLinkMessageText({ amountPaise: link.amountPaise, url: link.shortUrl, simulated: link.mode === "simulated" }), { agreementVersion: v.version, attemptId: linkAttempt.id });
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
      sendCode(s, "notice", noticeMessageText(sent), { noticeId: sent.id, attemptId: sent.attemptId });
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
    // buyer_reply (secondary path): the scripted reply after a failed debit, through the same
    // bounded reply path as every other buyer message.
    const noticeItem = [...s.conversation].reverse().find((i) => i.kind === "notice" && i.sentAt);
    if (!noticeItem) throw new ActionError("The buyer can only reply to a notice that was sent");
    if (s.conversation.some((i) => i.inReplyTo === noticeItem.id)) throw new ActionError("The buyer already replied to this notice");
    applyBuyerReply(s, { inReplyTo: noticeItem.id, text: heroDemoEvents.buyerReply.text, at: heroDemoEvents.buyerReply.timestamp, scripted: true });
  });
}

// ── Simulated conversation ──────────────────────────────────────────────────

/**
 * Record a simulated buyer reply and act on code's classification. Used identically for
 * pre-scripted and typed replies, and for replay and live-run states: no model is called.
 */
function applyBuyerReply(s: DemoState, args: { inReplyTo: string; text: string; at: string; scripted: boolean; answerValue?: string; kind?: "buyer_reply" | "change_request" | "decline"; source?: ConversationItem["source"] }): ConversationItem {
  if (Date.parse(args.at) > Date.parse(clockOf(s).now())) advanceTo(s, args.at, "Simulated: buyer reply arrives");
  const at = Date.parse(args.at) < Date.parse(clockOf(s).now()) ? clockOf(s).now() : args.at;
  let reply: ConversationItem;
  try {
    reply = receiveBuyerReply({ id: itemId(s, "conv"), dealId: s.dealId, text: args.text, at, inReplyTo: args.inReplyTo, conversation: s.conversation, timeZone: heroMerchant.timeZone, scripted: args.scripted, kind: args.kind, source: args.source });
  } catch (e) {
    if (e instanceof ConversationError) throw new ActionError(e.message);
    throw e;
  }
  if (args.answerValue) reply = { ...reply, refs: { ...reply.refs, answerValue: args.answerValue } };
  s.conversation.push(reply);
  const target = s.conversation.find((i) => i.id === reply.inReplyTo)!;
  s.extraMessages.push({ id: reply.id, dealId: s.dealId, author: "buyer", text: reply.text, timestamp: reply.createdAt, source: "whatsapp", inReplyTo: target.refs.noticeId ?? target.id });
  const c = reply.classification!;
  const label = `${args.scripted ? "Scripted" : "Typed"} simulated reply`;
  event(s, "buyer_message", `Buyer: “${reply.text}”`, "simulated", `${label} · reply to ${target.kind} ${target.id}${target.kind === "clarification" ? "" : ` · ${CLASSIFICATION_LABEL[c.kind]}`}`);

  if (target.kind !== "notice") return reply; // clarification answers and proposal replies change nothing here
  if (c.kind === "payment_claimed") event(s, "payment_claimed", "Payment claimed — verification required", "engine", "Recorded only. Payment status, collection attempts and the ledger change only from a verified payment event.");
  else if (c.kind === "acknowledgement") event(s, "acknowledgement", "Acknowledgement only", "engine", "No terms are accepted and no collection is authorised by this reply.");
  else if (c.kind === "needs_attention") event(s, "merchant_attention", "Merchant attention needed", "engine", c.detail);
  else {
    try {
      const v = activeVersion(s);
      if (!v) throw new RestructureError("No active agreement");
      const cr = createChangeRequest({ id: `chg-${s.changeRequests.length + 1}`, reply, conversation: s.conversation, notices: s.notices, attempts: s.attempts, activeVersion: v.version });
      s.changeRequests.push(cr);
      event(s, "change_requested", "Change requested", "engine", `Code read “${cr.phrase}” from the reply's own timestamp: unavailable through ${cr.unavailableUntil}; earliest proposed debit ${cr.earliestDebit} (${cr.scheduleLineId})`);
    } catch (e) {
      if (!(e instanceof RestructureError)) throw e;
      event(s, "merchant_attention", "Merchant attention needed", "engine", e.message);
    }
  }
  return reply;
}

type ScriptedReply = (typeof heroScriptedReplies)[number];

/** A buyer reply chosen from the demo operator's scripts, or typed by the operator. */
export async function buyerReply(args: { inReplyTo: string; scriptId?: string; text?: string }): Promise<DemoState> {
  return mutate((s) => {
    const target = s.conversation.find((i) => i.id === args.inReplyTo);
    if (!target) throw new ActionError("Unknown message", 404);
    if (args.scriptId) {
      const sc: ScriptedReply | undefined = heroScriptedReplies.find((r) => r.id === args.scriptId);
      if (!sc) throw new ActionError("Unknown scripted reply", 404);
      if (sc.context !== target.kind) throw new ActionError(`That scripted reply answers a ${sc.context}, not a ${target.kind}`);
      if ("questionId" in sc && sc.questionId !== target.refs.questionId) throw new ActionError("That scripted reply answers a different question");
      const at = sc.context === "clarification" ? Object.values(heroClarificationAnswers).find((a) => a.clarificationId === target.refs.questionId)!.answeredAt : sc.context === "notice" ? heroDemoEvents.preventiveReplyAt : clockOf(s).now();
      applyBuyerReply(s, { inReplyTo: target.id, text: sc.text, at, scripted: true, answerValue: "answerValue" in sc ? sc.answerValue : undefined });
      return;
    }
    if (!args.text?.trim()) throw new ActionError("Choose a scripted reply or type one");
    applyBuyerReply(s, { inReplyTo: target.id, text: args.text, at: clockOf(s).now(), scripted: false });
  });
}

/** The merchant sends a clarification draft. Nothing is sent automatically. */
export async function sendClarification(itemId: string): Promise<DemoState> {
  return mutate((s) => {
    const i = s.conversation.findIndex((x) => x.id === itemId);
    if (i < 0) throw new ActionError("Unknown draft", 404);
    try {
      s.conversation[i] = merchantSend(s.conversation[i], clockOf(s).now());
    } catch (e) {
      if (e instanceof ConversationError) throw new ActionError(e.message);
      throw e;
    }
    event(s, "clarification_sent", "Approved and sent by merchant", "merchant", s.conversation[i].text);
  });
}

export async function setSuggestionsPaused(paused: boolean): Promise<DemoState> {
  return mutate((s) => {
    s.suggestionsPaused = paused;
    event(s, "suggestions", paused ? "Suggested replies paused" : "Suggested replies resumed", "merchant", paused ? "Inbound messages are still recorded; no new AI drafts are created." : null);
    if (!paused) draftMissingClarifications(s);
  });
}

/** Record the buyer's scripted clarification replies as the answers (confirmed via WhatsApp). */
export async function adoptRepliesAsAnswers(): Promise<DemoState> {
  const s = await getState();
  const inputs: AnswerInput[] = s.run.record.displayed.questions.map((q) => {
    const draft = s.conversation.find((i) => i.kind === "clarification" && i.refs.questionId === q.id && i.sentAt);
    if (!draft) throw new ActionError(`Send the question “${q.question}” first`);
    const reply = [...s.conversation].reverse().find((i) => i.inReplyTo === draft.id);
    if (!reply) throw new ActionError(`Waiting for the buyer's reply to “${q.question}”`);
    if (!reply.refs.answerValue) throw new ActionError(`Record the answer to “${q.question}” manually: typed replies are not interpreted`);
    return { questionId: q.id, value: reply.refs.answerValue, answerText: reply.text, confirmedByBuyerVia: "whatsapp", answeredAt: reply.createdAt };
  });
  return recordAnswers(inputs);
}

/** Buyer asks for a change from the proposal page. Terms are not touched. */
export async function requestChange(version: number, text: string): Promise<DemoState> {
  return mutate((s) => {
    const v = s.agreements.find((x) => x.version === version);
    if (!v || v.status !== "sent") throw new ActionError("Only a sent proposal can receive a change request");
    const proposal = [...s.conversation].reverse().find((i) => (i.kind === "proposal" || i.kind === "amendment") && i.refs.agreementVersion === version);
    if (!proposal) throw new ActionError("No proposal message for this version");
    applyBuyerReply(s, { inReplyTo: proposal.id, text, at: clockOf(s).now(), scripted: false, kind: "change_request", source: "buyer_proposal_page" });
    event(s, "change_request_received", `Buyer requested a change to version ${version}`, "buyer_demo", "Terms are unchanged; the merchant decides how to respond.");
  });
}

/** Buyer declines a sent proposal. No payment setup is created. */
export async function declineAgreement(version: number): Promise<DemoState> {
  return mutate((s) => {
    const i = s.agreements.findIndex((x) => x.version === version && x.status === "sent");
    if (i < 0) throw new ActionError("No sent proposal to decline");
    if (s.amendments.some((a) => a.toVersion === version)) throw new ActionError("Declining a revision is not supported in this prototype; request a change instead");
    s.agreements[i] = buyerReject(s.agreements[i], "Buyer (Demo buyer view)", clockOf(s));
    const proposal = [...s.conversation].reverse().find((x) => x.kind === "proposal" && x.refs.agreementVersion === version);
    if (proposal) applyBuyerReply(s, { inReplyTo: proposal.id, text: "Declined the proposal", at: clockOf(s).now(), scripted: false, kind: "decline", source: "buyer_proposal_page" });
    setStatus(s, "buyer_rejected", `Buyer declined version ${version}`);
    event(s, "buyer_declined", `Buyer declined version ${version}`, "buyer_demo", "No payment setup was created.");
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

/** The "cash unavailable until" phrase in a buyer reply, located by code. */
export const unavailableUntilPhrase = (text: string) => UNAVAILABLE_UNTIL.exec(text)?.[0] ?? null;

/**
 * Draft an amendment from an open change request. Code rechecks buyer constraints, seller
 * economics and mandate fit; a failed recheck records "not restructured" and changes nothing.
 */
export async function proposeAmendment(): Promise<DemoState> {
  return mutate(async (s) => {
    if (s.status !== "active") throw new ActionError(`Amendments start from an active agreement (deal is ${s.status})`);
    const v = activeVersion(s)!;
    const ci = s.changeRequests.findIndex((c) => c.state === "change_requested");
    if (ci < 0) throw new ActionError("No change request to act on");
    const cr = s.changeRequests[ci];
    if (cr.agreementVersion !== v.version) throw new ActionError("The change request refers to an earlier version");
    if (s.attempts.some((a) => a.status === "submitted")) throw new ActionError("Awaiting payment outcome; rescheduling is blocked until it is known");

    const out = await currentOutcome(s);
    const constraints = interpretations(out.profile)[0].constraints;
    const current = await structureForVersion(s, v);
    const amendment = proposeReschedule({
      id: `amd-${s.amendments.length + 1}`,
      from: v,
      structure: current.structure as Structure,
      lineId: cr.scheduleLineId,
      newDueDate: cr.earliestDebit,
      constraints,
      engine: { merchant: heroMerchant, packages: heroDeal().packages, templates: heroDeal().templates },
      mandate: s.mandate!,
      trigger: cr.timing === "preventive" ? "buyer_message" : "failed_debit",
      triggerRefs: [cr.attemptId, cr.noticeId!, cr.replyId],
      at: clockOf(s).now(),
    });
    s.amendments.push(amendment);
    const from = current.structure.payments.find((p) => p.id === cr.scheduleLineId)!.dueDate;
    if (amendment.state === "rejected") {
      const failing = [...amendment.revised.buyerChecks, ...amendment.revised.sellerChecks].filter((c) => c.status === "fail" || c.status === "needs_information").map((c) => c.code);
      s.changeRequests[ci] = transitionChangeRequest(cr, "not_restructured", clockOf(s).now(), `Recheck failed: ${failing.join(", ")}`, amendment.id);
      event(s, "amendment_not_possible", `Revision ${from} → ${cr.earliestDebit} does not pass the checks`, "engine", failing.join(", "));
      return;
    }
    s.agreements.push(createAgreementVersion({ agreementId: v.agreementId, version: v.version + 1, evaluated: amendment.revised, dealId: s.dealId, merchantId: heroMerchant.id, buyerId: heroBuyer.id, policy: heroMerchant.policy, clock: clockOf(s), supersedes: v.version }));
    s.changeRequests[ci] = transitionChangeRequest(cr, "draft_amendment", clockOf(s).now(), `Draft amendment: ${from} → ${cr.earliestDebit}`, amendment.id);
    event(s, "amendment_proposed", `Draft amendment: ${from} → ${cr.earliestDebit}`, "engine", `${cr.transformation}. Rechecked buyer constraints, seller economics and mandate fit (${amendment.mandateFit.fits ? "fits the existing mandate" : "fresh authorisation required"}).`);
    setStatus(s, "amending", cr.timing === "preventive" ? "Draft amendment after the buyer's change request" : "Draft amendment after a failed debit");
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
    const v2 = s.agreements[i];
    const line = v2.terms.paymentSchedule.find((l) => l.id === a.change.lineId)!;
    sendCode(s, "amendment", amendmentMessageText({ fromDate: a.change.fromDueDate, toDate: a.change.toDueDate, amountPaise: line.totalPaise, version: v2.version, link: proposalLink(v2) }), { agreementVersion: v2.version, amendmentId: a.id });
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
    const ci = s.changeRequests.findIndex((c) => c.amendmentId === a!.id && c.state === "draft_amendment");
    if (ci >= 0) s.changeRequests[ci] = transitionChangeRequest(s.changeRequests[ci], "payment_rescheduled", clockOf(s).now(), "Collection updated after both approvals");
    const newAttempt = update.scheduled.find((x) => x.scheduleLineId === a!.change.lineId);
    if (newAttempt) sendCode(s, "payment", rescheduledMessageText({ toDate: newAttempt.dueDate, amountPaise: newAttempt.amountPaise }), { agreementVersion: v2.version, attemptId: newAttempt.id });
    event(s, "payment_rescheduled", "Payment rescheduled", "engine", newAttempt ? `${a.change.fromDueDate} → ${newAttempt.dueDate} under version ${v2.version}` : null);
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
  const amendment = s.amendments.at(-1);
  const drafts = s.conversation.filter((i) => i.kind === "clarification");
  const unsent = drafts.filter((i) => !i.sentAt);
  const unanswered = drafts.filter((i) => i.sentAt && !s.conversation.some((r) => r.inReplyTo === i.id));
  const noticeItem = [...s.conversation].reverse().find((i) => i.kind === "notice");
  const openChange = s.changeRequests.find((c) => c.state === "change_requested");
  if (s.status === "clarifying" && drafts.length && unsent.length) return { id: "send", window: "15–19 s", view: "workspace", title: "Merchant sends the drafted questions", role: "merchant" };
  if (s.status === "clarifying" && unanswered.length) return { id: "replies", window: "19–23 s", view: "workspace", title: "Simulated buyer replies to both questions", role: "merchant" };
  if (s.status === "clarifying") return { id: "answers", window: "23–27 s", view: "workspace", title: "Use the buyer's replies as the confirmed answers", role: "merchant" };
  if (s.status === "options_ready") return { id: "approve", window: "27–48 s", view: "decision", title: "Approve and send the recommended structure", role: "merchant" };
  if (s.status === "sent" && !amendment) return { id: "accept", window: "48–62 s", view: "agreement", title: "Buyer accepts the exact version", role: "buyer" };
  if (s.status === "active" && s.mandate?.status === "pending") return { id: "mandate", window: "62–64 s", view: "timeline", title: "Simulate: mandate registration confirmed", role: "merchant" };
  if (s.status === "active" && !amendment && !noticeItem) return { id: "notice", window: "64–67 s", view: "timeline", title: "Simulate: Adaptive Deals sends its advance notice", role: "merchant" };
  if (s.status === "active" && !amendment && noticeItem && !s.conversation.some((r) => r.inReplyTo === noticeItem.id)) return { id: "reply", window: "67–70 s", view: "workspace", title: "Simulated buyer reply: “Cash is tight till the 20th.”", role: "merchant" };
  if (s.status === "active" && openChange) return { id: "propose", window: "70–74 s", view: "timeline", title: "Draft the amendment and recheck the agreement", role: "merchant" };
  if (amendment?.state === "proposed") return { id: "amend_approve", window: "74–78 s", view: "timeline", title: "Merchant approves the revised version", role: "merchant" };
  if (amendment?.state === "merchant_approved") return { id: "amend_accept", window: "78–82 s", view: "agreement", title: "Buyer accepts the revised version", role: "buyer" };
  if (s.status === "active" && amendment?.state === "active" && s.scenario?.id !== "scenario-no-feasible") return { id: "close", window: "82–90 s", view: "timeline", title: "Close: no-feasible boundary and the primary metric", role: "merchant" };
  return null;
}

/** Perform the next storyboard step with the pinned synthetic inputs. */
export async function demoNext(): Promise<{ state: DemoState; step: DemoStep | null }> {
  const s = await getState();
  const step = nextDemoStep(s);
  if (!step) return { state: s, step: null };
  let next: DemoState = s;
  switch (step.id) {
    case "send":
      for (const d of s.conversation.filter((x) => x.kind === "clarification" && !x.sentAt)) next = await sendClarification(d.id);
      break;
    case "replies":
      for (const d of s.conversation.filter((x) => x.kind === "clarification" && x.sentAt && !s.conversation.some((r) => r.inReplyTo === x.id))) {
        const script = heroScriptedReplies.find((r) => r.context === "clarification" && r.questionId === d.refs.questionId);
        if (!script) throw new ActionError(`No scripted reply for ${d.refs.questionId}`);
        next = await buyerReply({ inReplyTo: d.id, scriptId: script.id });
      }
      break;
    case "answers":
      next = await adoptRepliesAsAnswers();
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
    case "mandate":
      next = await simulate("mandate_confirmed");
      break;
    case "notice":
      next = await simulate("advance_notice");
      break;
    case "reply": {
      const noticeItem = [...s.conversation].reverse().find((i) => i.kind === "notice")!;
      next = await buyerReply({ inReplyTo: noticeItem.id, scriptId: "notice-cash-tight" });
      break;
    }
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
