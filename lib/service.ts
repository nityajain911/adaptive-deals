import "server-only";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { activate, AgreementError, assertPaymentsUnlocked, buyerAccept, buyerReject, createAgreementVersion, markSent, merchantApprove, termsHash as computeTermsHash, type AgreementVersion } from "@/domain/agreement";
import { applyCollectionUpdate, proposeReschedule, transitionAmendment, type Amendment } from "@/domain/amendment";
import { DEMO_ANCHOR, FixedClock, SimulatedClock, type ClockAdvance } from "@/domain/clock";
import { scheduleAttempt, scheduleInternalRetry, submitAttempt, transitionAttempt, type CollectionAttempt } from "@/domain/collections";
import { interpretations } from "@/domain/constraints";
import { describeChangeRequest, validateChangeRequest, type ChangeRequestContext, type ChangeRequestDetail } from "@/domain/change-request";
import { compareDates, localDateOf } from "@/domain/dates";
import { evaluateDeal, evaluateStructure, type EvaluatedStructure } from "@/domain/engine";
import { eligibleStructures } from "./counter-eligibility";
import { STRATEGY_IDS, STRATEGY_LABEL, strategyView, type StrategyId, type StrategyView } from "@/domain/strategy";
import { CounterError, counterStructure, failingCounterChecks, isCounterStructureId } from "@/domain/counter";
import { lowestCompliantTotal } from "@/domain/corridor";
import { listValueOf } from "@/domain/deal-baseline";
import { canonicalJson } from "@/domain/agreement";
import { explainCheck } from "@/domain/copy";
import { createMandate, transitionMandate, type Mandate } from "@/domain/mandate";
import { planAdvanceNotice, sendAdvanceNotice, type AdvanceNotice } from "@/domain/notices";
import { assertDealTransition, statusForEvaluation, type DealStatus } from "@/domain/state";
import type { Structure } from "@/domain/structures";
import type { ContributionFloor, Merchant, Message } from "@/domain/types";
import { formatINR, lineWithGst, sum } from "@/domain/money";
import { liveAvailability } from "@/ai/config";
import { createLiveProvider } from "@/ai/live";
import { replayRun, runConstruct, type RunOutcome } from "@/ai/orchestrator";
import type { ModelProvider } from "@/ai/provider";
import { ReplayProvider } from "@/ai/replay-provider";
import type { RecordedAnswer, RunRecord } from "@/ai/run-record";
import { SyntheticAuthoredProvider } from "@/ai/synthetic-provider";
import { heroDeal } from "@/data/synthetic/hero-run";
import { heroClarificationAnswers, heroDemoEvents, heroScriptedReplies, HERO_DEAL_ID } from "@/data/synthetic/hero";
import { allDemoCases, DEFAULT_CASE_ID, demoCase, type CaseId, type DemoCase } from "@/data/synthetic/cases";
import { SCENARIOS } from "@/data/synthetic/scenarios";
import { paymentAdapters, type PaymentLinkState } from "@/integrations/razorpay";
import { DATA_DIR, readJson, serialised, writeJsonAtomic } from "./store";
import { BUYER_DECLINE_REASONS, isResolvingDisposition, decisionFingerprint, deliveryKey, isDelivered, MERCHANT_CLOSE_REASONS, type BuyerDeclineReason, type CounterOffer, type DeliveryRecord, type MerchantCloseReason, type HandledMessage, type Interpretation, type OutcomeRecord, type SelectedOption, type WorkDisposition, type WorkDispositionKind, type WorkSourceKind } from "./deal-records";
import { attemptDelivery } from "./delivery";
import { clearVault, readVaultedDeal, saveVaultedDeal } from "./deal-vault";
import { dealProgress, type DealProgress, type ProgressFacts } from "./progress";
import { SYSTEM_STEPS, type SystemStepId } from "./demo-steps";
import { noticeReplyOutcome, unresolvedWork } from "./views";
import { computeLedger } from "@/domain/ledger";
import { migrateState, STORE_SCHEMA_VERSION } from "./migrate";
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
import { ChangeRequestAlreadyOpenError, createChangeRequest, RestructureError, transitionChangeRequest, type ChangeRequest } from "@/domain/restructure";
import { decisionEvidenceSnapshot, unreviewedDecisionEvidence } from "./decision-evidence";
import { caseRecordedRunById, mappedCaseRun } from "./case-runs";
import { confirmScope, ScopeError, unmappedRequiredServices, type ScopeSource } from "./scope-confirmation";
import { answersMatchRecorded, DECISION_BRANCH_SCHEMA, deriveBranchOutcome, type DecisionBranch } from "./decision-branch";
import { captureBaseline, type DealBaseline } from "@/domain/deal-baseline";
import { activeEconomics, economicsVersion, getEconomicsStore } from "./economics-store";
import type { BusinessEconomics } from "@/domain/business-economics";
import { overrideValueText } from "./override-copy";
import { headlineFor, joinRules } from "./offer-copy";
import { effectiveHashOf, engineInputFor, overrideDirection, pinConflicts, type DealEconomics, type InputOverride, type OverrideField } from "./deal-economics";
import { ActionError } from "./action-error";
import { dealContextFor, pinnedEconomicsOf } from "./deal-context";
import { buildReevaluationPreview, type ReevaluationPreview } from "./reevaluation";

export { ActionError } from "./action-error";

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
  /** One active fictional commercial case. Switching it replaces the complete demo store. */
  caseId: CaseId;
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
  /** Set once the merchant has read the Understand stage and moved on, so a new deal opens there first. Absent on older stores. */
  understandReviewed?: boolean;
  changeRequests: ChangeRequest[];
  // ── Merchant-decision redesign (store schema 2; see lib/migrate.ts) ──
  schemaVersion: number;
  /** When the stalled deal entered Adaptive Deals; opens the 90-day measurement window. */
  eligibleAt: string;
  selectedOption: SelectedOption | null;
  deliveries: DeliveryRecord[];
  outcomes: OutcomeRecord[];
  handledMessages: HandledMessage[];
  workDispositions: WorkDisposition[];
  /** The merchant's counters to a buyer's request for a lower total; the latest is the live one. */
  counterOffers: CounterOffer[];
  interpretations: Interpretation[];
  /** Changed clarification answers, recomputed from the immutable parent run by code and engine. */
  decisionBranch: DecisionBranch | null;
  /** Set by migration when saved history cannot be inferred safely; blocks dependent actions. */
  reviewRequired: string | null;
  /** Immutable quoted prices, scope and GST basis for this deal. */
  baseline: DealBaseline;
  /** Account economics pinned to this deal, plus any explicit deal overrides. */
  economics: DealEconomics;
}

// ── Bundled synthetic run ────────────────────────────────────────────────────

export function bundledSyntheticRun(): RunRecord {
  return bundledCaseRun(DEFAULT_CASE_ID);
}

function bundledCaseRun(caseId: CaseId): RunRecord {
  const item = demoCase(caseId);
  if (!item) throw new ActionError("Unknown case", 404);
  return JSON.parse(readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), item.bundledRunPath), "utf8"));
}

/** Current fictional case, validated by migration before any action reads it. */
export function activeCase(s: Pick<DemoState, "caseId">): DemoCase {
  const item = demoCase(s.caseId);
  if (!item) throw new ActionError("Unknown case", 404);
  return item;
}

/** Historical hero runs remain replayable for audit; active product work always uses the case. */
/** The fixture context of the stored run, for checks that replay it. */
export const dealForStateExport = (s: Pick<DemoState, "caseId" | "run">) => dealForState(s);

function dealForState(s: Pick<DemoState, "caseId" | "run">) {
  return s.run.record.inputs.dealId === HERO_DEAL_ID ? heroDeal() : activeCase(s).deal;
}

/**
 * The run a case starts from: its mapped recorded model run when one is committed, otherwise the
 * credential-free hand-written sample. `ADAPTIVE_DEALS_DEMO_RUN=synthetic` always uses the sample.
 */
export function demoCaseRunRecord(caseId: CaseId, env: Record<string, string | undefined> = process.env): RunRecord {
  if (env.ADAPTIVE_DEALS_DEMO_RUN?.trim() !== "synthetic") {
    const recorded = mappedCaseRun(caseId);
    if (recorded) return recorded;
  }
  return bundledCaseRun(caseId);
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
  event(s, "clock_advanced", `Simulated date: ${localDateOf(to, activeCase(s).deal.merchant.timeZone)}`, "simulated", reason);
}

const at10 = (date: string) => `${date}T10:00:00+05:30`;

// ── Seed and load ────────────────────────────────────────────────────────────

/** Fresh demo state at the start of the storyboard: the bundled synthetic run, before answers. */
export async function seedState(record?: RunRecord, viewing: "replay" | "fresh" = "replay", requestedCaseId?: CaseId): Promise<DemoState> {
  const inferred = record ? allDemoCases().find((candidate) => candidate.deal.dealId === record.inputs.dealId)?.id : undefined;
  const caseId = requestedCaseId ?? inferred ?? DEFAULT_CASE_ID;
  const item = demoCase(caseId);
  if (!item) throw new ActionError("Unknown case", 404);
  const selectedRecord = record ?? demoCaseRunRecord(caseId);
  const active = await activeEconomics();
  const accountStore = await getEconomicsStore();
  const selectedEconomics = pinConflicts(captureBaseline({
    services: item.deal.packages,
    quotedScope: item.deal.templates.fullScope,
    quotedPrePaise: item.quote.prePaise,
    gstRateBps: item.deal.merchant.policy.gstRateBps,
    economicsVersion: active.version,
  }), active).length
    ? [...accountStore.versions].sort((a, b) => b.version - a.version).find((version) => {
        const candidate = captureBaseline({
          services: item.deal.packages,
          quotedScope: item.deal.templates.fullScope,
          quotedPrePaise: item.quote.prePaise,
          gstRateBps: item.deal.merchant.policy.gstRateBps,
          economicsVersion: version.version,
        });
        return pinConflicts(candidate, version).length === 0;
      })
    : active;
  if (!selectedEconomics) throw new ActionError("No compatible prices & costs version can evaluate this deal");
  const baseline = captureBaseline({
    services: item.deal.packages,
    quotedScope: item.deal.templates.fullScope,
    quotedPrePaise: item.quote.prePaise,
    gstRateBps: item.deal.merchant.policy.gstRateBps,
    economicsVersion: selectedEconomics.version,
  });
  const effectiveInput = engineInputFor({ merchant: item.deal.merchant, baseline, version: selectedEconomics, overrides: [] });
  const deal = selectedRecord.inputs.dealId === HERO_DEAL_ID ? heroDeal() : item.deal;
  if (selectedRecord.inputs.dealId !== deal.dealId) throw new ActionError("The selected run does not belong to this case");
  const provider = new ReplayProvider(selectedRecord.kind === "live" ? "recorded_replay" : "synthetic_replay", selectedRecord.model, selectedRecord.steps);
  const first = await runConstruct({ provider, kind: selectedRecord.kind, runId: selectedRecord.runId, clock: new FixedClock(), deal, previous: selectedRecord, recordedAtWall: selectedRecord.recordedAtWall });
  const s: DemoState = {
    schema: "adaptive-deals.store.v1",
    dealId: HERO_DEAL_ID,
    caseId,
    status: "stalled",
    statusHistory: [{ at: DEMO_ANCHOR, from: null, to: "stalled", reason: "Deal entered the workspace with a buyer conversation" }],
    clockAdvances: [],
    run: { record: first.record, viewing, sourceRunId: selectedRecord.runId },
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
    schemaVersion: STORE_SCHEMA_VERSION,
    eligibleAt: DEMO_ANCHOR,
    selectedOption: null,
    deliveries: [],
    outcomes: [],
    handledMessages: [],
    workDispositions: [],
    counterOffers: [],
    interpretations: [],
    decisionBranch: null,
    reviewRequired: null,
    baseline,
    economics: {
      pinned: { version: selectedEconomics.version, hash: selectedEconomics.hash },
      overrides: [],
      strategy: "protect_contribution",
      effectiveHash: effectiveHashOf(effectiveInput),
    },
  };
  event(s, "run_loaded", selectedRecord.kind === "live" ? "Stored live run loaded" : "Synthetic replay loaded", selectedRecord.kind === "live" ? "live_model" : "synthetic_replay", `Run ${selectedRecord.runId}`);
  if (selectedEconomics.version !== active.version) {
    event(s, "economics_compatible_version", `Prices & costs version ${selectedEconomics.version} applied`, "engine", `Version ${active.version} was incompatible with this deal's original services.`);
  }
  // The status follows the engine under the prices & costs this deal is pinned to, not the recording's own economics:
  // a merchant who changed a limit can make a question unnecessary (or an offer impossible) before the deal starts.
  setStatus(s, statusForEvaluation(economicsMatchRecording(s) ? first.evaluation : (await currentOutcome(s)).evaluation), "Constraint extraction and full engine evaluation");
  draftMissingClarifications(s);
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
  if (s) return migrateState(s);
  // Seeding reads the separately versioned economics store. Do that before taking the shared
  // write lock so the seed never tries to re-enter the same in-process queue.
  const seeded = await seedState();
  return serialised(async () => {
    const again = await readJson<DemoState>(STORE_FILE);
    if (again) return migrateState(again);
    await writeJsonAtomic(STORE_FILE, seeded);
    return seeded;
  });
}

async function mutate(fn: (s: DemoState) => Promise<void> | void): Promise<DemoState> {
  const beforeLock = await readJson<DemoState>(STORE_FILE);
  const seeded = beforeLock ? null : await seedState();
  return serialised(async () => {
    const s = migrateState((await readJson<DemoState>(STORE_FILE)) ?? seeded!);
    await fn(s);
    await writeJsonAtomic(STORE_FILE, s);
    return s;
  });
}

export async function resetToSeed(): Promise<DemoState> {
  const current = await readJson<DemoState>(STORE_FILE);
  const caseId = current ? migrateState(current).caseId : DEFAULT_CASE_ID;
  const s = await seedState(undefined, "replay", caseId);
  return serialised(async () => {
    // A full reset also forgets the deals that were set aside.
    await clearVault();
    await writeJsonAtomic(STORE_FILE, s);
    return s;
  });
}

/** Replace the one active demo atomically. Invalid cases leave the previous file unchanged. */
export async function startCase(caseId: string): Promise<DemoState> {
  const item = demoCase(caseId);
  if (!item) throw new ActionError("Unknown case", 404);
  const replacement = await seedState(undefined, "replay", item.id);
  event(replacement, "case_started", `Case started: ${item.title}`, "merchant", item.id);
  return serialised(async () => {
    await writeJsonAtomic(STORE_FILE, replacement);
    return replacement;
  });
}

/**
 * Open one of the deals. The deal being worked on is set aside with all its progress and the other is loaded, or started
 * fresh if it has not been started. Nothing is cleared: each deal keeps its own state.
 */
export async function openDeal(caseId: string): Promise<DemoState> {
  const item = demoCase(caseId);
  if (!item) throw new ActionError("Unknown case", 404);
  const saved = await readVaultedDeal<DemoState>(item.id);
  let replacement: DemoState;
  if (saved) replacement = migrateState(saved);
  else {
    replacement = await seedState(undefined, "replay", item.id);
    event(replacement, "case_started", `Case started: ${item.title}`, "merchant", item.id);
  }
  return serialised(async () => {
    const current = await readJson<DemoState>(STORE_FILE);
    if (current) {
      const open = migrateState(current);
      if (open.caseId === item.id) return open;
      await saveVaultedDeal(open.caseId, current);
    }
    await writeJsonAtomic(STORE_FILE, replacement);
    return replacement;
  });
}

export interface DealListing {
  caseId: CaseId;
  /** The deal being worked on now. */
  open: boolean;
  started: boolean;
  progress: DealProgress | null;
}

/** Every deal story with its own progress, read from its own saved state. Contacts nothing. */
export async function listDeals(): Promise<DealListing[]> {
  const current = await getState();
  const out: DealListing[] = [];
  for (const item of allDemoCases()) {
    if (item.id === current.caseId) {
      out.push({ caseId: item.id, open: true, started: true, progress: await progressOf(current).catch(() => null) });
      continue;
    }
    const saved = await readVaultedDeal<DemoState>(item.id);
    out.push({ caseId: item.id, open: false, started: !!saved, progress: saved ? await progressOf(migrateState(saved)).catch(() => null) : null });
  }
  return out;
}

// ── Derived engine state (always recomputed from the run record, integrity-checked) ──

export async function currentOutcome(s: DemoState, knownDeal?: ReturnType<typeof dealContextFor>): Promise<RunOutcome> {
  const fixtureDeal = dealForState(s);
  if (!s.decisionBranch && economicsMatchRecording(s)) {
    return withCounterOffers(s, await replayRun(s.run.record, fixtureDeal, new FixedClock()));
  }
  const deal = knownDeal ?? dealContextFor(s, await pinnedEconomicsOf(s));
  const initial = await initialOutcomeForBranch(s);
  const branch = s.decisionBranch ?? economicsBranch(s);
  return withCounterOffers(s, deriveBranchOutcome({ initial, branch, deal }));
}

/** Exact engine-input identity of the immutable run recording for this case. */
export function recordingInputHash(s: DemoState): string {
  return effectiveHashOf(dealForState(s));
}

export function economicsMatchRecording(s: DemoState): boolean {
  return s.economics.effectiveHash === recordingInputHash(s);
}

function economicsBranch(s: DemoState): DecisionBranch {
  return {
    schema: DECISION_BRANCH_SCHEMA,
    branchId: "branch-economics-" + s.economics.effectiveHash.slice(0, 12),
    parentRunId: sourceRecord(s).runId,
    createdAt: clockOf(s).now(),
    answers: structuredClone(sourceRecord(s).inputs.answers),
    reason: "economics_changed",
    answersChanged: false,
    scope: null,
    economics: { version: s.economics.pinned.version, effectiveHash: s.economics.effectiveHash },
    explanationSource: "code_fallback",
  };
}

/** Keep stored provenance aligned whenever a deal's effective economics changes. */
export function syncEconomicsBranch(s: DemoState): void {
  if (economicsMatchRecording(s)) {
    if (s.decisionBranch?.reason === "economics_changed" && !s.decisionBranch.scope && s.decisionBranch.answersChanged === false) s.decisionBranch = null;
    else if (s.decisionBranch) delete s.decisionBranch.economics;
    return;
  }
  if (!s.decisionBranch) {
    s.decisionBranch = economicsBranch(s);
    return;
  }
  s.decisionBranch = {
    ...s.decisionBranch,
    schema: DECISION_BRANCH_SCHEMA,
    economics: { version: s.economics.pinned.version, effectiveHash: s.economics.effectiveHash },
  };
}

const REEVALUATION_STATUSES = new Set<DealStatus>([
  "stalled",
  "clarifying",
  "options_ready",
  "needs_information",
  "no_feasible_structure",
  "outside_templates",
]);
const REEVALUATION_LOCKED = "This deal's sent or accepted version keeps the economics it was made with";

function assertReevaluationOpen(s: DemoState): void {
  if (!REEVALUATION_STATUSES.has(s.status)) throw new ActionError(REEVALUATION_LOCKED);
}

async function reevaluationParts(s: DemoState, toVersion?: number, candidate?: BusinessEconomics) {
  assertReevaluationOpen(s);
  const target = candidate ?? (toVersion === undefined ? await activeEconomics() : await economicsVersion(toVersion));
  if (!target) throw new ActionError(`Prices & costs version ${toVersion} is unavailable`, 404);
  const currentVersion = await pinnedEconomicsOf(s);
  const beforeDeal = dealContextFor(s, currentVersion);
  const beforeOutcome = await currentOutcome(s, beforeDeal);
  const blocked = pinConflicts(s.baseline, target);
  const afterDeal = blocked.length ? null : dealContextFor(s, target);
  const afterEvaluation = afterDeal ? evaluateDeal(beforeOutcome.profile, afterDeal) : null;
  const prospectiveHash = afterDeal ? effectiveHashOf(afterDeal) : null;
  const preview = buildReevaluationPreview({
    fromVersion: currentVersion.version,
    toVersion: target.version,
    blocked,
    beforeInput: beforeDeal,
    afterInput: afterDeal,
    beforeEvaluation: beforeOutcome.evaluation,
    afterEvaluation,
    staleDraftVersion: prospectiveHash !== null && prospectiveHash !== s.economics.effectiveHash
      ? s.selectedOption?.draftVersion ?? null
      : null,
    strategy: s.economics.strategy,
    baseline: s.baseline,
  });
  return { target, afterDeal, afterEvaluation, prospectiveHash, preview };
}

/** Preview an unactivated account draft against the current open deal without mutating either store. */
export async function previewReevaluationCandidate(target: BusinessEconomics) {
  const s = await getState();
  if (!REEVALUATION_STATUSES.has(s.status)) return null;
  const parts = await reevaluationParts(s, undefined, target);
  return { preview: parts.preview, evaluation: parts.afterEvaluation };
}

/** A read-only account-to-deal comparison. Quoted prices always come from the deal baseline. */
export async function previewReevaluation(toVersion?: number): Promise<ReevaluationPreview> {
  return (await reevaluationParts(await getState(), toVersion)).preview;
}

export async function reevaluationAvailable(s: DemoState): Promise<boolean> {
  if (!REEVALUATION_STATUSES.has(s.status)) return false;
  const active = await activeEconomics();
  if (active.version === s.economics.pinned.version || pinConflicts(s.baseline, active).length) return false;
  return effectiveHashOf(dealContextFor(s, active)) !== s.economics.effectiveHash;
}

/** Adopt a newer account version only after its exact effect has been previewed. */
export async function reevaluateDeal(toVersion: number): Promise<DemoState> {
  const before = await getState();
  const { target, afterDeal, afterEvaluation, prospectiveHash, preview } = await reevaluationParts(before, toVersion);
  if (preview.blocked.length) throw new ActionError(preview.blocked.join(" "));
  if (!preview.changesInputs || !afterDeal || !afterEvaluation || !prospectiveHash) {
    throw new ActionError("This version does not change this deal's economics");
  }
  return mutate((s) => {
    assertReevaluationOpen(s);
    if (s.economics.pinned.version !== before.economics.pinned.version || s.economics.effectiveHash !== before.economics.effectiveHash) {
      throw new ActionError("Prices & costs changed after this preview. Review it again.");
    }
    s.economics = {
      ...s.economics,
      pinned: { version: target.version, hash: target.hash },
      effectiveHash: prospectiveHash,
    };
    syncEconomicsBranch(s);
    setStatus(s, statusForEvaluation(afterEvaluation), `Prices & costs version ${target.version} applied after merchant review`);
    event(s, "economics_reevaluated", `Prices & costs version ${target.version} applied`, "merchant", preview.pricesNote);
  });
}

/**
 * The merchant's counter-offers join the engine's evaluated structures, so every place that looks a
 * structure up by id keeps working. Each was rechecked by the engine when it was made; the stored
 * result is used as is.
 */
function withCounterOffers(s: Pick<DemoState, "counterOffers">, out: RunOutcome): RunOutcome {
  const r = out.evaluation.result;
  if (!s.counterOffers?.length || !r) return out;
  const have = new Set(r.structures.map((x) => x.structure.id));
  const extra = s.counterOffers.map((c) => c.evaluated).filter((x) => !have.has(x.structure.id));
  return extra.length ? { ...out, evaluation: { ...out.evaluation, result: { ...r, structures: [...r.structures, ...extra] } } } : out;
}

/** Answers that govern the current decision, whether recorded in the run or in an application branch. */
export function decisionAnswers(s: DemoState): RecordedAnswer[] {
  return s.decisionBranch?.answers ?? s.run.record.inputs.answers;
}

/** Latest clarification draft or follow-up for one question. Earlier exchanges remain in history. */
export function latestClarificationForQuestion(s: Pick<DemoState, "conversation">, questionId: string): ConversationItem | null {
  return [...s.conversation].reverse().find((item) => item.kind === "clarification" && item.refs.questionId === questionId) ?? null;
}

function activeVersion(s: DemoState): AgreementVersion | null {
  return [...s.agreements].reverse().find((v) => v.status === "active") ?? null;
}

async function structureForVersion(s: DemoState, v: AgreementVersion, deal?: ReturnType<typeof dealContextFor>): Promise<EvaluatedStructure> {
  const amendment = s.amendments.find((a) => a.toVersion === v.version && a.state !== "rejected");
  if (amendment) return amendment.revised;
  const out = await currentOutcome(s, deal);
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

/** A sample workspace continues only from its own hand-written sample, never from a mapped recording. */
function sourceSteps(s: DemoState) {
  if (s.run.record.kind !== "live") return (s.run.record.inputs.dealId === HERO_DEAL_ID ? JSON.parse(readFileSync(path.join(process.cwd(), "data/synthetic/replay/hero-synthetic-run.json"), "utf8")) as RunRecord : bundledCaseRun(s.caseId)).steps;
  const id = s.run.sourceRunId ?? s.run.record.runId;
  return (caseRecordedRunById(id) ?? committedLiveRunSync(id) ?? s.run.record).steps;
}

function committedLiveRunSync(runId: string): RunRecord | null {
  try {
    return JSON.parse(readFileSync(path.join(/*turbopackIgnore: true*/ DATA_DIR, "runs", `${runId}.json`), "utf8"));
  } catch {
    return committedLiveRun(runId);
  }
}

function sourceRecord(s: DemoState): RunRecord {
  if (s.run.record.kind !== "live") return s.run.record.inputs.dealId === HERO_DEAL_ID ? (JSON.parse(readFileSync(path.join(process.cwd(), "data/synthetic/replay/hero-synthetic-run.json"), "utf8")) as RunRecord) : bundledCaseRun(s.caseId);
  const id = s.run.sourceRunId ?? s.run.record.runId;
  return caseRecordedRunById(id) ?? committedLiveRunSync(id) ?? s.run.record;
}

/** Replays only extraction and clarification from the immutable source, before any answer branch. */
export async function initialOutcomeForBranch(s: DemoState): Promise<RunOutcome> {
  const source = sourceRecord(s);
  const provider = new ReplayProvider(source.kind === "live" ? "recorded_replay" : "synthetic_replay", source.model, source.steps);
  return runConstruct({
    provider,
    kind: source.kind,
    runId: source.runId,
    clock: new FixedClock(),
    deal: dealForState(s),
    recordedAtWall: source.recordedAtWall,
    promptVersions: source.promptVersions,
  });
}

export async function startLiveRun(): Promise<DemoState> {
  const provider = createLiveProvider();
  const availability = liveAvailability();
  if (!provider || !availability.available) throw new ActionError(`Run live is unavailable: ${availability.available ? "no provider" : availability.reason}.`, 412);
  const current = await getState();
  const item = activeCase(current);
  const runId = `run-live-${randomUUID().slice(0, 8)}`;
  const out = await runConstruct({ provider, kind: "live", runId, clock: new FixedClock(), deal: item.deal, recordedAtWall: new Date().toISOString() });
  await writeJsonAtomic(`runs/${runId}.json`, out.record);
  const replacement = await seedState(out.record, "fresh", item.id);
  replacement.events = replacement.events.map((e) => (e.kind === "run_loaded" ? { ...e, title: "Live model run started" } : e));
  return serialised(async () => {
    await writeJsonAtomic(STORE_FILE, replacement);
    return replacement;
  });
}

/** Load a previously stored live run as a replay ("Replay of an actual run"). */
export async function replayStoredRun(runId: string): Promise<DemoState> {
  if (!LIVE_RUN_ID.test(runId)) throw new ActionError("Unknown run", 404);
  const record = await storedLiveRun(runId);
  if (!record || record.kind !== "live") throw new ActionError("Only stored live runs can be replayed as actual runs", 404);
  const item = allDemoCases().find((candidate) => candidate.deal.dealId === record.inputs.dealId);
  if (!item) throw new ActionError("Stored run does not belong to a demo case", 404);
  const replacement = await seedState(record, "replay", item.id);
  return serialised(async () => {
    await writeJsonAtomic(STORE_FILE, replacement);
    return replacement;
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
  const before = await getState();
  const deal = dealContextFor(before, await pinnedEconomicsOf(before));
  return mutate(async (s) => {
    s.understandReviewed = true;
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
    let out: RunOutcome;
    const source = sourceRecord(s);
    if (s.run.record.kind === "live" && s.run.viewing === "fresh" && economicsMatchRecording(s)) {
      out = await runConstruct({ provider: providerForContinuation(s), kind: s.run.record.kind, runId: s.run.record.runId, clock: new FixedClock(), deal: dealForState(s), answers, previous: s.run.record });
      s.run = { record: out.record, viewing: s.run.viewing, sourceRunId: s.run.sourceRunId };
      s.decisionBranch = null;
      // Keep the stored copy of a fresh live run complete, so it can later be replayed.
      await writeJsonAtomic(`runs/${out.record.runId}.json`, out.record);
    } else if (answersMatchRecorded(source, answers) && !s.decisionBranch?.scope && economicsMatchRecording(s)) {
      out = await runConstruct({ provider: providerForContinuation(s), kind: s.run.record.kind, runId: s.run.record.runId, clock: new FixedClock(), deal: dealForState(s), answers, previous: s.run.record });
      s.run = { record: out.record, viewing: s.run.viewing, sourceRunId: s.run.sourceRunId };
      s.decisionBranch = null;
    } else {
      const initial = await initialOutcomeForBranch(s);
      // What caused this recalculation: answers the recording never had, a service confirmation, or only the economics.
      const answersChanged = !answersMatchRecorded(source, answers);
      const branch: DecisionBranch = {
        schema: DECISION_BRANCH_SCHEMA,
        branchId: `branch-${randomUUID()}`,
        parentRunId: source.runId,
        createdAt: clockOf(s).now(),
        answers,
        reason: answersChanged ? "changed_clarification_answers" : s.decisionBranch?.scope ? "merchant_scope_confirmation" : "economics_changed",
        answersChanged,
        scope: s.decisionBranch?.scope ?? null,
        explanationSource: "code_fallback",
      };
      if (!economicsMatchRecording(s)) branch.economics = { version: s.economics.pinned.version, effectiveHash: s.economics.effectiveHash };
      // Finish derivation before mutating stored state. A failure therefore leaves the store intact.
      out = deriveBranchOutcome({ initial, branch, deal });
      s.decisionBranch = branch;
    }
    for (const a of answers) event(s, "clarification_answered", `Answer recorded: ${a.answerText}`, "merchant", `Confirmed by buyer via ${a.confirmedByBuyerVia}`);
    setStatus(s, statusForEvaluation(out.evaluation), "Engine re-evaluated every template with the confirmed answers");
  });
}

// ── Decision and agreement ───────────────────────────────────────────────────

// Approval is split from delivery (spec §3.3): select → draft → approve → send.

async function eligibleOf(s: DemoState, deal?: ReturnType<typeof dealContextFor>): Promise<{ out: RunOutcome; eligible: EvaluatedStructure[] }> {
  const out = await currentOutcome(s, deal);
  const r = out.evaluation.result;
  return { out, eligible: r ? eligibleStructures(s, r.structures) : [] };
}

function draftFor(s: DemoState, x: EvaluatedStructure, deal: ReturnType<typeof dealContextFor>): AgreementVersion {
  const item = activeCase(s);
  // A draft follows the last version that is not itself a draft; a withdrawn version that a counter-offer answers is the one it supersedes.
  const prior = s.agreements.filter((v) => v.status !== "draft").at(-1);
  const supersedes = prior && prior.status === "superseded" && s.counterOffers.some((c) => c.fromVersion === prior.version) ? prior.version : null;
  return createAgreementVersion({ agreementId: AGREEMENT_ID, version: prior ? prior.version + 1 : 1, supersedes, evaluated: x, dealId: s.dealId, merchantId: deal.merchant.id, buyerId: item.buyer.id, policy: deal.merchant.policy, clock: clockOf(s), merchantOverride: s.counterOffers.find((c) => c.evaluated.structure.id === x.structure.id)?.override ? { by: "Merchant (Pinecone Media Works)" } : null, economics: economicsRef(s) });
}

const economicsRef = (s: DemoState) => ({ version: s.economics.pinned.version, effectiveHash: s.economics.effectiveHash, strategy: s.economics.strategy });

/** The fingerprint the selected option would have now, from the unchanged engine. */
export async function currentFingerprint(s: DemoState, knownDeal?: ReturnType<typeof dealContextFor>): Promise<{ fingerprint: string | null; eligibleIds: string[] }> {
  const deal = knownDeal ?? dealContextFor(s, await pinnedEconomicsOf(s));
  const { eligible } = await eligibleOf(s, deal);
  const ids = eligible.map((x) => x.structure.id);
  const sel = eligible.find((x) => x.structure.id === s.selectedOption?.structureId);
  return { eligibleIds: ids, fingerprint: sel ? decisionFingerprint(ids, draftFor(s, sel, deal).terms, s.economics.effectiveHash) : null };
}

/** Stale: the decision changed since selection, or the selected option is no longer eligible. */
export async function isDraftStale(s: DemoState, deal?: ReturnType<typeof dealContextFor>): Promise<boolean> {
  if (!s.selectedOption) return false;
  const cur = await currentFingerprint(s, deal);
  const evidence = decisionEvidenceSnapshot(s);
  return cur.fingerprint === null || cur.fingerprint !== s.selectedOption.fingerprint || JSON.stringify(evidence) !== JSON.stringify(s.selectedOption.evidenceMessageIds);
}

/**
 * Required-service phrases the model extracted and code verified but could not map to any package,
 * until the merchant confirms the services. Read from the run's own extraction step.
 */
export function unmappedScopeOf(s: DemoState, out: Pick<RunOutcome, "profile">): ScopeSource[] {
  if (s.decisionBranch?.scope) return [];
  const step = s.run.record.steps.find((x) => x.task === "extract" && x.failure === null);
  return unmappedRequiredServices(out.profile, step, dealForState(s).messages);
}

function assertScopeConfirmed(s: DemoState, out: RunOutcome) {
  if (out.evaluation.state === "options_ready" && unmappedScopeOf(s, out).length) throw new ActionError("Confirm the required services before continuing this commercial decision");
}

function assertNoReview(s: DemoState) {
  if (s.reviewRequired) throw new ActionError(`Saved deal records need review: ${s.reviewRequired}`);
}

function assertNoNewDecisionEvidence(s: DemoState) {
  if (unreviewedDecisionEvidence(s).length) throw new ActionError("Review newer buyer evidence before continuing this commercial decision");
}

function assertNoUnresolvedCommercialWork(s: DemoState) {
  const blocking = unresolvedWork(s).find((w) => w.kind === "buyer_request" || w.kind === "conflicting_evidence" || w.kind === "follow_up_pending");
  if (blocking) throw new ActionError("Review the newer buyer request before continuing this commercial decision");
}

function outcome(s: DemoState, rec: Omit<OutcomeRecord, "id" | "at" | "dealId">) {
  s.outcomes.push({ id: `out-${s.outcomes.length + 1}`, at: clockOf(s).now(), dealId: s.dealId, ...rec });
}

async function applySelection(s: DemoState, structureId: string, opts: { explicit: boolean }, deal: ReturnType<typeof dealContextFor>) {
  assertNoReview(s);
  if (s.status !== "options_ready") throw new ActionError(`Options are not ready (deal is ${s.status})`);
  const { out, eligible } = await eligibleOf(s, deal);
  assertScopeConfirmed(s, out);
  const x = eligible.find((e) => e.structure.id === structureId);
  if (!x) throw new ActionError("That option cannot be selected: only engine-eligible options can be prepared");
  const fingerprint = decisionFingerprint(eligible.map((e) => e.structure.id), draftFor(s, x, deal).terms, s.economics.effectiveHash);
  const evidenceMessageIds = decisionEvidenceSnapshot(s);
  if (s.selectedOption?.structureId === structureId && s.selectedOption.fingerprint === fingerprint && JSON.stringify(s.selectedOption.evidenceMessageIds) === JSON.stringify(evidenceMessageIds)) {
    // Same and still valid. Choosing the option that was only following the recommendation makes it the merchant's own choice.
    if (opts.explicit && !s.selectedOption.explicit) {
      s.selectedOption = { ...s.selectedOption, explicit: true };
      outcome(s, { type: "option_selected", reasonCode: null, note: null, actor: "merchant", version: null, source: { kind: "action", id: structureId } });
    }
    return;
  }
  s.agreements = s.agreements.filter((v) => v.status !== "draft");
  s.selectedOption = { structureId, fingerprint, selectedAt: clockOf(s).now(), draftVersion: null, evidenceMessageIds, explicit: opts.explicit };
  // Opening the recommended option automatically is not attributed to the merchant.
  if (opts.explicit) outcome(s, { type: "option_selected", reasonCode: null, note: null, actor: "merchant", version: null, source: { kind: "action", id: structureId } });
}

/**
 * The feasible offers ranked by the deal's strategy. Code owns this order, and a merchant's
 * counter-offer is never part of it: it is the merchant's own choice, shown apart.
 */
export function strategyViewOf(s: DemoState, out: RunOutcome): StrategyView {
  return strategyView(strategyFeasibleOf(s, out), s.economics.strategy, s.baseline);
}

/** The feasible offers every strategy ranks: the engine's approvable offers, without any counter-offer. */
export function strategyFeasibleOf(s: DemoState, out: RunOutcome): EvaluatedStructure[] {
  const all = out.evaluation.result ? eligibleStructures(s, out.evaluation.result.structures) : [];
  // A merchant's own total is never ranked. An offer the engine listed itself stays in the ranking even when the merchant chose it.
  return all.filter((x) => !isCounterStructureId(x.structure.id));
}

// ── Deal-specific input overrides ────────────────────────────────────────────

const OVERRIDE_FIELDS: readonly OverrideField[] = ["direct_cost", "contribution_floor", "cash_exposure", "discount_limit"];
const wholeNumber = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

export interface InputOverrideRequest {
  field: OverrideField;
  /** The service a direct-cost override is for. */
  packageId?: string;
  value: number | ContributionFloor;
  reason: string;
}

/** The account's current value for the input, from the economics version this deal is pinned to. */
function accountValueFor(version: BusinessEconomics, field: OverrideField, packageId?: string): number | ContributionFloor {
  switch (field) {
    case "direct_cost":
      return version.services.find((service) => service.id === packageId)!.directCostPaise;
    case "contribution_floor":
      return structuredClone(version.guardrails.contributionFloor);
    case "cash_exposure":
      return version.guardrails.cashAtRiskLimitPaise;
    case "discount_limit":
      return version.guardrails.discountLimitBps;
  }
}

function validatedOverride(s: DemoState, version: BusinessEconomics, req: InputOverrideRequest): InputOverride {
  if (!OVERRIDE_FIELDS.includes(req.field)) throw new ActionError("That input cannot be overridden for a deal");
  const reason = (req.reason ?? "").trim();
  if (reason.length < 5) throw new ActionError("Give a short reason for this override (at least 5 characters)");
  if (reason.length > 300) throw new ActionError("Keep the reason under 300 characters");
  let packageId: string | undefined;
  if (req.field === "direct_cost") {
    if (!req.packageId) throw new ActionError("Choose the service this cost is for");
    if (!s.baseline.servicePrices.some((price) => price.packageId === req.packageId)) throw new ActionError("That service is not part of this deal");
    packageId = req.packageId;
  }
  if (req.field === "contribution_floor") {
    const f = req.value;
    const percentOk = (v: unknown) => v === null || (wholeNumber(v) && v >= 0 && v <= 10_000);
    const amountOk = (v: unknown) => v === null || (wholeNumber(v) && v >= 0);
    if (typeof f !== "object" || f === null || !percentOk(f.minPercentBps) || !amountOk(f.minPaise) || (f.combine !== "both" && f.combine !== "either") || (f.minPercentBps === null && f.minPaise === null)) {
      throw new ActionError("The contribution floor needs a percentage between 0% and 100%, an amount, or both");
    }
  } else {
    if (!wholeNumber(req.value)) throw new ActionError("The value must be a whole number of paise or basis points");
    if (req.field === "discount_limit" && (req.value < 0 || req.value > 10_000)) throw new ActionError("The maximum discount must be between 0% and 100%");
    if (req.value < 0) throw new ActionError(req.field === "direct_cost" ? "A direct cost cannot be negative" : "The cash exposure limit cannot be negative");
  }
  const accountValue = accountValueFor(version, req.field, packageId);
  return {
    id: `ovr-${s.events.length + 1}`,
    field: req.field,
    ...(packageId ? { packageId } : {}),
    value: structuredClone(req.value),
    accountValue,
    direction: overrideDirection(req.field, accountValue, req.value),
    reason,
    by: "Merchant (Pinecone Media Works)",
    at: clockOf(s).now(),
  };
}

/** Make `overrides` the deal's overrides: recompute its effective inputs, provenance and status. */
async function applyOverrides(s: DemoState, version: BusinessEconomics, overrides: InputOverride[], why: string): Promise<void> {
  s.economics = { ...s.economics, overrides };
  const deal = dealContextFor(s, version);
  s.economics = { ...s.economics, effectiveHash: effectiveHashOf(deal) };
  syncEconomicsBranch(s);
  const next = statusForEvaluation((await currentOutcome(s, deal)).evaluation);
  if (next !== s.status) setStatus(s, next, why);
}

const overrideLabel = (o: Pick<InputOverride, "field" | "packageId">, version: BusinessEconomics) =>
  o.field === "direct_cost" ? `${version.services.find((x) => x.id === o.packageId)?.name ?? o.packageId} · delivery cost` : { contribution_floor: "Lowest profit I'll accept", cash_exposure: "Most I'll spend before I'm paid", discount_limit: "Biggest discount I'll give" }[o.field];

/**
 * Change one assumption for this deal only, before the engine runs, with a reason. It never changes
 * the account economics or a quoted price. Only before a proposal is live.
 */
export async function addInputOverride(req: InputOverrideRequest): Promise<DemoState> {
  const before = await getState();
  const version = await pinnedEconomicsOf(before);
  return mutate(async (s) => {
    assertNoReview(s);
    assertReevaluationOpen(s);
    const override = validatedOverride(s, version, req);
    const replaced = s.economics.overrides.find((o) => o.field === override.field && o.packageId === override.packageId) ?? null;
    const rest = s.economics.overrides.filter((o) => o !== replaced);
    await applyOverrides(s, version, [...rest, override], "The engine re-evaluated this deal with the merchant's override");
    const word = override.direction === "loosens" ? "loosens" : override.direction === "tightens" ? "tightens" : "matches";
    event(s, "input_override_added", `Override for this deal: ${overrideLabel(override, version)}`, "merchant", `${word} the account rule${replaced ? " · replaces an earlier override" : ""} · reason: ${override.reason}`);
    if (replaced) event(s, "input_override_replaced", `Earlier override replaced: ${overrideLabel(replaced, version)}`, "merchant", `was ${overrideValueText(replaced.field, replaced.value)} · reason: ${replaced.reason}`);
  });
}

export async function removeInputOverride(id: string): Promise<DemoState> {
  const before = await getState();
  const version = await pinnedEconomicsOf(before);
  return mutate(async (s) => {
    assertNoReview(s);
    assertReevaluationOpen(s);
    const target = s.economics.overrides.find((o) => o.id === id);
    if (!target) throw new ActionError("There is no such override on this deal");
    await applyOverrides(s, version, s.economics.overrides.filter((o) => o !== target), "The engine re-evaluated this deal after an override was removed");
    event(s, "input_override_removed", `Override removed: ${overrideLabel(target, version)}`, "merchant", `reason it was made: ${target.reason}`);
  });
}

/** Whether the merchant has ever chosen a strategy for this deal, rather than being given the default. */
export const strategyChosen = (s: Pick<DemoState, "events">): boolean => s.events.some((e) => e.kind === "strategy_changed");

/**
 * Choose how feasible offers are ranked. It never adds an offer or relaxes a check. An automatic
 * selection follows the new leader; an explicit choice, and its draft, are kept.
 */
export async function setStrategy(strategy: StrategyId): Promise<DemoState> {
  if (!(STRATEGY_IDS as readonly string[]).includes(strategy)) throw new ActionError("Unknown strategy");
  return mutate((s) => {
    assertNoReview(s);
    if (!REEVALUATION_STATUSES.has(s.status)) throw new ActionError("A sent or accepted version keeps the strategy it was sent under");
    if (s.economics.strategy === strategy) {
      // Confirming the default is the merchant's own choice, recorded once.
      if (!strategyChosen(s)) event(s, "strategy_changed", `Strategy: ${STRATEGY_LABEL[strategy]}`, "merchant", null);
      return;
    }
    s.economics = { ...s.economics, strategy };
    if (s.selectedOption && !s.selectedOption.explicit) {
      s.agreements = s.agreements.filter((v) => v.status !== "draft");
      s.selectedOption = null;
    } else {
      // A draft that is kept will be sent under the strategy now in force.
      s.agreements = s.agreements.map((v) => (v.status === "draft" && v.economics ? { ...v, economics: { ...v.economics, strategy } } : v));
    }
    event(s, "strategy_changed", `Strategy: ${STRATEGY_LABEL[strategy]}`, "merchant", null);
  });
}

/** The merchant explicitly chose this option ("Select this offer"). */
export async function selectOption(structureId: string): Promise<DemoState> {
  const before = await getState();
  const deal = dealContextFor(before, await pinnedEconomicsOf(before));
  return mutate((s) => applySelection(s, structureId, { explicit: true }, deal));
}

/** Prepare (or reuse) the unsent draft for the selected option; selects the recommendation if needed. */
export async function reviewBuyerProposal(): Promise<AgreementVersion> {
  const before = await getState();
  const deal = dealContextFor(before, await pinnedEconomicsOf(before));
  let draft: AgreementVersion | null = null;
  await mutate(async (s) => {
    assertNoReview(s);
    assertNoNewDecisionEvidence(s);
    if (s.status !== "options_ready") throw new ActionError(`Options are not ready (deal is ${s.status})`);
    assertScopeConfirmed(s, (await eligibleOf(s, deal)).out);
    if (!s.selectedOption || (await isDraftStale(s, deal))) {
      const { out, eligible } = await eligibleOf(s, deal);
      const keep = s.selectedOption && eligible.some((e) => e.structure.id === s.selectedOption!.structureId) ? s.selectedOption.structureId : null;
      const strategy = strategyViewOf(s, out);
      const top = keep ?? strategy.leader?.structure.id;
      if (!top) throw new ActionError(strategy.mode === "discount_only" ? "No offer fits at the quoted prices. Select one of the permitted discounted offers first" : "No engine-eligible option to review");
      const wasExplicit = !!(keep && s.selectedOption?.explicit);
      if (keep) s.selectedOption = null; // force a fresh fingerprint for the kept option
      await applySelection(s, top, { explicit: false }, deal);
      if (wasExplicit) s.selectedOption = { ...s.selectedOption!, explicit: true };
    }
    const existing = s.agreements.find((v) => v.status === "draft" && v.version === s.selectedOption!.draftVersion);
    if (existing) {
      draft = existing;
      return;
    }
    const { eligible } = await eligibleOf(s, deal);
    const x = eligible.find((e) => e.structure.id === s.selectedOption!.structureId)!;
    s.agreements = s.agreements.filter((v) => v.status !== "draft");
    draft = draftFor(s, x, deal);
    s.agreements.push(draft);
    s.selectedOption = { ...s.selectedOption!, draftVersion: draft.version };
  });
  return draft!;
}

/** Merchant approves the exact draft they previewed. Sends nothing. */
export async function approveDraft(version: number, presentedHash: string): Promise<DemoState> {
  const before = await getState();
  const deal = dealContextFor(before, await pinnedEconomicsOf(before));
  return mutate(async (s) => {
    assertNoReview(s);
    assertNoNewDecisionEvidence(s);
    const i = s.agreements.findIndex((v) => v.version === version && v.status === "draft");
    if (i < 0 || s.selectedOption?.draftVersion !== version) throw new ActionError("This version is not the selected draft");
    if (await isDraftStale(s, deal)) throw new ActionError("The offer changed since this preview was opened (stale draft); review the updated proposal");
    try {
      s.agreements[i] = merchantApprove(s.agreements[i], presentedHash, "Merchant (Pinecone Media Works)", clockOf(s));
    } catch (e) {
      if (e instanceof AgreementError) throw new ActionError(e.message);
      throw e;
    }
    setStatus(s, "approved", `Merchant approved version ${version}`);
    event(s, "merchant_approved", `Merchant approved version ${version}`, "merchant", `Terms hash ${presentedHash}`);
  });
}

/**
 * Deliver an approved proposal (simulated channel) under the version's stable idempotency key.
 * Preconditions are checked on every send and retry. Buyer access opens only on success.
 */
export async function sendProposal(version: number): Promise<{ state: DemoState; delivered: boolean; failureReason: string | null }> {
  const before = await getState();
  const deal = dealContextFor(before, await pinnedEconomicsOf(before));
  let delivered = false;
  let failureReason: string | null = null;
  const state = await mutate(async (s) => {
    if (isDelivered(s.deliveries, version)) {
      delivered = true; // already delivered: return the recorded success, never deliver twice
      return;
    }
    assertNoReview(s);
    assertNoNewDecisionEvidence(s);
    if (s.status !== "approved") throw new ActionError(`The deal is not open for sending (deal is ${s.status})`);
    const i = s.agreements.findIndex((v) => v.version === version && v.status === "merchant_approved");
    if (i < 0 || s.selectedOption?.draftVersion !== version) throw new ActionError("This version is not the selected, approved proposal");
    if (await isDraftStale(s, deal)) throw new ActionError("The offer changed since approval (stale draft); review the updated proposal");
    const v = s.agreements[i];
    if (v.merchantApproval?.termsHash !== computeTermsHash(v.terms)) throw new ActionError("Merchant approval does not match the current terms");
    const key = deliveryKey(v.agreementId, version);
    let rec = s.deliveries.find((d) => d.version === version);
    if (!rec) {
      rec = { version, idempotencyKey: key, kind: "proposal", attempts: [], deliveredAt: null, reference: null };
      s.deliveries.push(rec);
    }
    const attemptId = `${key}_a${rec.attempts.length + 1}`;
    const r = await attemptDelivery("proposal");
    if (!r.ok) {
      rec.attempts.push({ attemptId, at: clockOf(s).now(), status: "failed", failureReason: r.reason });
      failureReason = r.reason;
      event(s, "proposal_delivery_failed", `Proposal version ${version} not delivered`, "simulated", r.reason);
      return;
    }
    s.agreements[i] = markSent(v);
    const msg = sendCode(s, "proposal", proposalMessageText(v.terms, v.version, proposalLink(v)), { agreementVersion: v.version });
    rec.attempts.push({ attemptId, at: clockOf(s).now(), status: "sent", failureReason: null });
    rec.deliveredAt = clockOf(s).now();
    rec.reference = msg.id;
    setStatus(s, "sent", "Proposal delivered to the buyer (simulated channel)");
    event(s, "proposal_delivered", `Proposal version ${version} delivered`, "simulated", key);
    // A buyer's request is answered by a counter-offer only once that counter has reached the buyer.
    // The same goes for a different offer sent in its place: the request is then answered with that offer, on the record.
    const withdrawn = [...s.counterOffers].reverse().find((c) => c.fromVersion === v.supersedes);
    if (withdrawn) {
      const isCounter = withdrawn.source !== "listed_offer" && withdrawn.evaluated.structure.id === v.structureId;
      s.workDispositions.push({
        id: `work-${s.workDispositions.length + 1}`,
        sourceKind: "message",
        sourceId: withdrawn.requestMessageId,
        kind: isCounter ? "countered" : "answered_with_offer",
        note: `${isCounter ? "Counter-offer" : "A different offer"} at ${formatINR(v.terms.pricing.totalPaise)} delivered as version ${v.version}`,
        actor: "merchant",
        at: clockOf(s).now(),
      });
    }
    delivered = true;
  });
  return { state, delivered, failureReason };
}

/** The merchant sends every unsent clarification draft as one atomic batch. */
export async function sendQuestions(): Promise<DemoState> {
  return mutate((s) => {
    const drafts = s.conversation.filter((i) => i.kind === "clarification" && !i.sentAt);
    if (!drafts.length) throw new ActionError("No questions to send");
    const at = clockOf(s).now();
    const sent = drafts.map((d) => {
      try {
        return merchantSend(d, at);
      } catch (e) {
        if (e instanceof ConversationError) throw new ActionError(e.message);
        throw e;
      }
    });
    for (const d of sent) {
      s.conversation[s.conversation.findIndex((x) => x.id === d.id)] = d;
      event(s, "clarification_sent", "Approved and sent by merchant", "merchant", d.text);
    }
  });
}

// ── Current stage and required action (spec §3.4) ─────────────────────────────

/** Facts for `dealProgress`, read from stored state and the replayed engine result. */
export async function progressFacts(s: DemoState): Promise<ProgressFacts> {
  const deal = dealContextFor(s, await pinnedEconomicsOf(s));
  const out = await currentOutcome(s, deal);
  const replyTo = (id: string) => [...s.conversation].reverse().find((r) => r.inReplyTo === id);
  const clar = s.run.record.displayed.questions.map((question) => latestClarificationForQuestion(s, question.id)).filter((item): item is ConversationItem => item !== null);
  const active = activeVersion(s);
  const resolved = new Set(s.workDispositions.filter((d) => isResolvingDisposition(d.kind)).filter((d) => d.sourceKind === "message").map((d) => d.sourceId));
  const handled = new Set(s.handledMessages.map((h) => h.messageId));
  const attention = s.conversation.filter((i) => {
    if (i.direction !== "inbound" || handled.has(i.id) || resolved.has(i.id)) return false;
    if (s.conversation.find((x) => x.id === i.inReplyTo)?.kind !== "notice") return false;
    const o = noticeReplyOutcome(i, s, active?.version ?? null);
    return o?.label === "Merchant attention needed" || o?.label === "Payment claimed — verification required";
  });
  const scheduled = s.attempts.filter((a) => a.status === "scheduled").sort((p, q) => compareDates(p.dueDate, q.dueDate));
  const submitted = s.attempts.some((a) => a.status === "submitted");
  const retry = s.attempts.find((a) => a.status === "scheduled" && a.origin === "internal_retry");
  let fullyPaid = false;
  if (active) {
    const x = await structureForVersion(s, active, deal);
    fullyPaid = computeLedger({ structure: x.structure as Structure, attempts: s.attempts, asOf: localDateOf(clockOf(s).now(), deal.merchant.timeZone), timeZone: deal.merchant.timeZone }).fullyPaid;
  }
  const cr = active ? s.changeRequests.find((c) => c.state === "change_requested" && c.agreementVersion === active.version) : undefined;
  const crAttempt = cr ? s.attempts.find((a) => a.id === cr.attemptId) : undefined;
  const lastAttempt = s.deliveries.find((d) => d.version === s.selectedOption?.draftVersion)?.attempts.at(-1);
  const workItems = unresolvedWork(s);
  return {
    engineState: out.evaluation.state,
    draftStale: s.status === "options_ready" ? await isDraftStale(s, deal) : false,
    fullyPaid,
    questionCountUnsent: s.status === "clarifying" ? clar.filter((d) => !d.sentAt).length : 0,
    unansweredQuestions: s.status === "clarifying" ? clar.filter((d) => d.sentAt && !replyTo(d.id)).length : 0,
    repliesNeedInterpretation: s.status === "clarifying" ? clar.filter((d) => replyTo(d.id) && !replyTo(d.id)!.refs.answerValue).length : 0,
    attentionMessages: attention.length,
    workItems,
    unreviewedDecisionEvidence: unreviewedDecisionEvidence(s).length,
    unmappedRequiredServices: unmappedScopeOf(s, out).length,
    nextPayment: scheduled[0] ? { amountPaise: scheduled[0].amountPaise, dueDate: scheduled[0].dueDate } : null,
    pendingDebit: submitted ? "submitted" : retry ? { retryOn: retry.dueDate } : null,
    buyerSetup: {
      linkUnpaid: s.attempts.some((a) => a.method === "payment_link" && a.status === "scheduled"),
      mandatePending: s.mandate?.status === "pending",
    },
    changeRequestDetail: cr && crAttempt ? { unavailableUntil: cr.unavailableUntil, lineDueDate: crAttempt.dueDate } : null,
    lastFailure: lastAttempt?.status === "failed" ? lastAttempt.failureReason : null,
  };
}

export async function progressOf(s: DemoState): Promise<DealProgress> {
  return dealProgress(s, await progressFacts(s));
}

// ── Required-services confirmation ───────────────────────────────────────────

/**
 * The merchant confirms which services the buyer requires when the extraction named a scope that
 * matched no package ("complete annual package"). The recorded run is not edited: this is product
 * state after the run, linked to the rejected phrase and its evidence, and the engine recalculates.
 */
export async function confirmRequiredServices(packageIds: string[]): Promise<DemoState> {
  const before = await getState();
  const deal = dealContextFor(before, await pinnedEconomicsOf(before));
  return mutate(async (s) => {
    s.understandReviewed = true;
    assertNoReview(s);
    if (s.deliveries.some((d) => d.deliveredAt)) throw new ActionError("The required services cannot be confirmed after the proposal was sent");
    if (s.decisionBranch?.scope) throw new ActionError("The required services are already confirmed for this deal");
    const sources = unmappedScopeOf(s, await currentOutcome(s, deal));
    if (!sources.length) throw new ActionError("There is nothing to confirm: every required service was mapped");
    if (s.status !== "options_ready") throw new ActionError(`Required services are confirmed once options are ready (deal is ${s.status})`);
    let confirmation;
    try {
      confirmation = confirmScope({ sources, packageIds, packages: deal.packages, confirmedAt: clockOf(s).now(), by: "Merchant (Pinecone Media Works)" });
    } catch (e) {
      if (e instanceof ScopeError) throw new ActionError(e.message);
      throw e;
    }
    const branch: DecisionBranch = s.decisionBranch
      ? { ...s.decisionBranch, scope: confirmation }
      : {
          schema: DECISION_BRANCH_SCHEMA,
          branchId: `branch-${randomUUID()}`,
          parentRunId: sourceRecord(s).runId,
          createdAt: clockOf(s).now(),
          answers: structuredClone(s.run.record.inputs.answers),
          reason: "merchant_scope_confirmation",
          answersChanged: false,
          scope: confirmation,
          explanationSource: "code_fallback",
        };
    // Finish derivation before mutating stored state. A failure therefore leaves the store intact.
    if (!economicsMatchRecording(s)) branch.economics = { version: s.economics.pinned.version, effectiveHash: s.economics.effectiveHash };
    const derived = deriveBranchOutcome({ initial: await initialOutcomeForBranch(s), branch, deal });
    s.decisionBranch = branch;
    const names = confirmation.packageIds.map((id) => deal.packages.find((p) => p.id === id)?.name ?? id);
    event(s, "required_services_confirmed", "Merchant confirmed the required services", "merchant", `${names.join(", ")} · from “${confirmation.sources.map((x) => x.rawText).join("”, “")}”`);
    const next = statusForEvaluation(derived.evaluation);
    if (next !== s.status) setStatus(s, next, "Engine re-evaluated every template with the merchant-confirmed services");
  });
}

// ── Closures, handled messages, interpretation (spec §3.3) ────────────────────

const CLOSABLE: DealStatus[] = ["options_ready", "approved", "no_feasible_structure", "outside_templates"];

/** Supported normalised values per clarification question; anything else needs the buyer's words to change. */
const SUPPORTED_VALUES: Record<string, string[]> = { "clar-gst": ["yes", "no"], "clar-approval": ["per_contract", "per_payment"] };

/** The merchant closes the deal from the Offer stage. Keeps every draft, approval and attempt. */
export async function closeByMerchant(reason: MerchantCloseReason, note?: string): Promise<DemoState> {
  return mutate((s) => {
    if (!CLOSABLE.includes(s.status)) {
      throw new ActionError(s.deliveries.some((d) => d.deliveredAt) ? "Don't proceed is not available after the proposal was sent" : `The deal cannot be closed from ${s.status}`);
    }
    if (!(reason in MERCHANT_CLOSE_REASONS)) throw new ActionError("Unknown reason");
    const version = s.selectedOption?.draftVersion ?? null;
    const trimmed = note?.trim() || null;
    setStatus(s, "merchant_rejected", `Merchant: ${MERCHANT_CLOSE_REASONS[reason]}`);
    event(s, "merchant_closed", "Closed in Adaptive Deals", "merchant", MERCHANT_CLOSE_REASONS[reason] + (trimmed ? ` · ${trimmed}` : ""));
    outcome(s, { type: "merchant_closed", reasonCode: reason, note: trimmed, actor: "merchant", version, source: { kind: "event", id: s.events.at(-1)!.id } });
  });
}

/** Records that the merchant addressed a buyer message outside the prototype. Changes nothing else. */
export async function markMessageHandled(messageId: string, note?: string): Promise<DemoState> {
  return mutate((s) => {
    const m = s.conversation.find((i) => i.id === messageId);
    const target = m?.inReplyTo ? s.conversation.find((i) => i.id === m.inReplyTo) : null;
    if (!m || m.direction !== "inbound" || target?.kind !== "notice") throw new ActionError("Only a buyer reply to a notice can be marked handled");
    if (s.handledMessages.some((h) => h.messageId === messageId)) throw new ActionError("This message is already marked handled");
    const trimmed = note?.trim() || null;
    s.handledMessages.push({ messageId, handledAt: clockOf(s).now(), actor: "merchant", note: trimmed });
    event(s, "message_handled", "Buyer message marked handled", "merchant", trimmed);
  });
}

/** Records the merchant's bounded decision for one current buyer work item. */
export async function reviewWork(sourceKind: WorkSourceKind, sourceId: string, disposition: WorkDispositionKind, note?: string): Promise<DemoState> {
  return mutate((s) => {
    const item = unresolvedWork(s).find((w) => w.sourceKind === sourceKind && w.sourceId === sourceId);
    const evidence = sourceKind === "message" ? unreviewedDecisionEvidence(s).find((m) => m.id === sourceId) : null;
    if (!item && !evidence) throw new ActionError("This work item is stale, unknown or already resolved");
    if (!(["keep_current_terms", "handled_outside", "follow_up_pending"] as WorkDispositionKind[]).includes(disposition)) throw new ActionError("Unknown work disposition");
    const trimmed = note?.trim() || null;
    s.workDispositions.push({
      id: `work-${s.workDispositions.length + 1}`,
      sourceKind,
      sourceId,
      kind: disposition,
      note: trimmed,
      actor: "merchant",
      at: clockOf(s).now(),
    });
    const title = disposition === "keep_current_terms" ? "Current terms kept" : disposition === "handled_outside" ? "Buyer request handled outside Adaptive Deals" : "Follow-up still pending";
    event(s, "work_reviewed", title, "merchant", trimmed);
  });
}

/**
 * The merchant interprets an unsupported clarification reply. Code verifies only that the quote is a
 * verbatim part of the buyer's message and the value is supported; the reading is merchant judgement.
 */
export async function interpretClarificationReply(messageId: string, value: string, quote: string): Promise<DemoState> {
  return mutate((s) => {
    if (s.status !== "clarifying") throw new ActionError("Answers can only be interpreted while clarifying");
    const i = s.conversation.findIndex((x) => x.id === messageId);
    const m = s.conversation[i];
    const q = m?.inReplyTo ? s.conversation.find((x) => x.id === m.inReplyTo) : null;
    if (!m || m.direction !== "inbound" || q?.kind !== "clarification" || !q.refs.questionId) throw new ActionError("Only a buyer reply to a clarification can be interpreted");
    if (m.refs.answerValue) throw new ActionError("This reply already carries its answer");
    if (!(SUPPORTED_VALUES[q.refs.questionId] ?? []).includes(value)) throw new ActionError("Choose a supported value for this question");
    const t = quote.trim();
    if (!t || !m.text.includes(t)) throw new ActionError("The supporting words must be a verbatim part of the buyer's message");
    s.interpretations.push({ messageId, questionId: q.refs.questionId, value, quote: t, actor: "merchant", at: clockOf(s).now() });
    s.conversation[i] = { ...m, refs: { ...m.refs, answerValue: value } };
    event(s, "merchant_interpretation", "Merchant interpreted the buyer's reply", "merchant", `“${t}” → ${value} (merchant judgement)`);
  });
}

const clarificationFollowUp = (questionId: string): string => {
  if (questionId === "clar-gst") return "I couldn't safely apply one GST basis. Please confirm one: both ₹50,000 and ₹60,000 include GST, or both exclude GST. If they use different bases, please say so and we'll keep this unresolved.";
  if (questionId === "clar-approval") return "Please confirm whether the ₹60,000 approval limit applies to each payment or to the full contract. If you're not sure, please say so and we'll keep this unresolved.";
  throw new ActionError("This clarification cannot be asked again automatically");
};

/** Merchant-authorised follow-up for an unclear buyer reply. It records no inferred value. */
export async function askClarificationAgain(messageId: string): Promise<DemoState> {
  return mutate((s) => {
    if (s.status !== "clarifying") throw new ActionError("A clarification follow-up is only available while clarifying");
    const reply = s.conversation.find((item) => item.id === messageId);
    const target = reply?.inReplyTo ? s.conversation.find((item) => item.id === reply.inReplyTo) : null;
    const questionId = target?.refs.questionId;
    if (!reply || reply.direction !== "inbound" || target?.kind !== "clarification" || !questionId) throw new ActionError("Only an unclear buyer reply to a clarification can be followed up");
    if (reply.refs.answerValue || s.interpretations.some((item) => item.messageId === reply.id)) throw new ActionError("This reply already has a supported answer");
    if (latestClarificationForQuestion(s, questionId)?.id !== target.id) throw new ActionError("A newer clarification already supersedes this reply");

    const draft = draftClarification({
      id: itemId(s, "conv"),
      dealId: s.dealId,
      questionId,
      text: clarificationFollowUp(questionId),
      wording: "code_fallback",
      at: clockOf(s).now(),
      paused: false,
    });
    if (!draft) throw new ActionError("The follow-up could not be drafted");
    const sent = merchantSend(draft, clockOf(s).now());
    s.conversation.push(sent);
    event(s, "clarification_follow_up", "Merchant asked the buyer to clarify", "merchant", `Reply ${reply.id} stayed unresolved; no value was inferred. ${sent.text}`);
  });
}

function schedulePayments(s: DemoState, v: AgreementVersion) {
  const total = sum(v.terms.paymentSchedule.map((p) => p.totalPaise));
  for (const p of v.terms.paymentSchedule) {
    if (s.attempts.some((a) => a.scheduleLineId === p.id && (a.status === "succeeded" || a.status === "scheduled" || a.status === "submitted"))) continue;
    s.attempts.push(scheduleAttempt(s.attempts, { agreementId: v.agreementId, agreementVersion: v.version, scheduleLineId: p.id, dueDate: p.dueDate.value, amountPaise: p.totalPaise, prePaise: p.prePaise, gstPaise: p.gstPaise, origin: "agreement", method: p.method as CollectionAttempt["method"] }, total, clockOf(s).now()));
  }
}

function planNotices(s: DemoState, policy: Merchant["policy"]) {
  for (const a of s.attempts.filter((x) => x.status === "scheduled" && x.method === "recurring_debit")) {
    if (!s.notices.some((n) => n.attemptId === a.id)) s.notices.push(planAdvanceNotice(a, policy));
  }
}

export async function acceptAgreement(version: number, termsHash: string, authorityConfirmed: boolean): Promise<DemoState> {
  const before = await getState();
  const deal = dealContextFor(before, await pinnedEconomicsOf(before));
  return mutate(async (s) => {
    assertNoUnresolvedCommercialWork(s);
    const i = s.agreements.findIndex((v) => v.version === version && v.status === "sent");
    if (i < 0) throw new ActionError("No sent agreement version to accept");
    s.agreements[i] = buyerAccept(s.agreements[i], termsHash, "Buyer (Demo buyer view)", clockOf(s), { authorityConfirmed });
    setStatus(s, "accepted", `Buyer accepted version ${version}`);
    event(s, "buyer_accepted", `Buyer accepted version ${version}`, "buyer_demo", `Terms hash ${termsHash}${authorityConfirmed ? " · authority for this scope confirmed" : ""}`);
    outcome(s, { type: "buyer_accepted", reasonCode: null, note: null, actor: "buyer", version, source: { kind: "event", id: s.events.at(-1)!.id } });
    s.agreements[i] = activate(s.agreements[i]);
    const v = s.agreements[i];

    // Payment APIs become reachable only here, after matching hashes. The AI is not involved.
    assertPaymentsUnlocked(v);
    schedulePayments(s, v);
    const adapters = paymentAdapters(process.env, s.paymentLinks);
    const linkAttempt = s.attempts.find((a) => a.method === "payment_link" && a.status === "scheduled");
    if (linkAttempt) {
      const link = await adapters.links.createPaymentLink({ referenceId: linkAttempt.idempotencyKey, amountPaise: linkAttempt.amountPaise, description: `Adaptive Deals ${v.agreementId} v${v.version} · instalment ${linkAttempt.scheduleLineId}`, customerName: activeCase(s).buyer.name, notes: { agreement: v.agreementId, version: String(v.version), terms_hash: v.termsHash.slice(0, 32) } });
      s.paymentLinks.push(link);
      s.attempts = s.attempts.map((a) => (a.id === linkAttempt.id ? { ...a, razorpayId: link.id } : a));
      event(s, "payment_link_created", `Upfront payment link created`, link.mode === "real_test" ? "real_test" : "simulated", link.mode === "real_test" ? `Razorpay test mode · ${link.id}` : `Simulated · ${link.id}`);
      sendCode(s, "payment", paymentLinkMessageText({ amountPaise: link.amountPaise, url: link.shortUrl, simulated: link.mode === "simulated" }), { agreementVersion: v.version, attemptId: linkAttempt.id });
    }
    if (v.terms.mandate) {
      const reg = await adapters.recurring.registerMandate({ referenceId: `${v.agreementId}_v${v.version}`, perDebitLimitPaise: v.terms.mandate.perDebitLimitPaise, endDate: v.terms.mandate.endDate.value, customerName: activeCase(s).buyer.name });
      s.mandate = { ...createMandate({ id: reg.id, agreementId: v.agreementId, agreementVersion: v.version, terms: v.terms.mandate, mode: reg.mode }), note: reg.note };
      event(s, "mandate_requested", "Mandate registration requested", "simulated", reg.note);
    }
    planNotices(s, deal.merchant.policy);
    setStatus(s, "active", "Matching merchant and buyer hashes; collection prepared");
  });
}

// ── Simulated events ─────────────────────────────────────────────────────────

export type SimulatedEvent = "payment_link_paid" | "mandate_confirmed" | "advance_notice" | "debit_failed" | "debit_succeeded" | "buyer_reply";

export async function simulate(kind: SimulatedEvent): Promise<DemoState> {
  const before = await getState();
  const deal = dealContextFor(before, await pinnedEconomicsOf(before));
  return mutate(async (s) => {
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
      const sent = sendAdvanceNotice(n, clockOf(s), activeCase(s).deal.merchant.timeZone);
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
      s.attempts = scheduleInternalRetry(s.attempts, failed, deal.merchant.policy.internalRetryAfterDays, total, now());
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
    reply = receiveBuyerReply({ id: itemId(s, "conv"), dealId: s.dealId, text: args.text, at, inReplyTo: args.inReplyTo, conversation: s.conversation, timeZone: activeCase(s).deal.merchant.timeZone, scripted: args.scripted, kind: args.kind, source: args.source });
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
      const cr = createChangeRequest({ id: `chg-${s.changeRequests.length + 1}`, reply, conversation: s.conversation, notices: s.notices, attempts: s.attempts, activeVersion: v.version, existing: s.changeRequests });
      s.changeRequests.push(cr);
      event(s, "change_requested", "Change requested", "engine", `Code read “${cr.phrase}” from the reply's own timestamp: unavailable through ${cr.unavailableUntil}; earliest proposed debit ${cr.earliestDebit} (${cr.scheduleLineId})`);
    } catch (e) {
      if (!(e instanceof RestructureError)) throw e;
      event(s, "merchant_attention", e instanceof ChangeRequestAlreadyOpenError ? "Merchant attention needed: a change request is already open" : "Merchant attention needed", "engine", e.message);
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
      const recorded =
        sc.context === "clarification" && "answerValue" in sc
          ? sourceRecord(s).inputs.answers.find((answer) => answer.questionId === target.refs.questionId && answer.value === sc.answerValue && answer.answerText === sc.text)
          : null;
      const at =
        sc.context === "clarification"
          ? (recorded?.answeredAt ?? Object.values(heroClarificationAnswers).find((a) => a.clarificationId === target.refs.questionId)!.answeredAt)
          : sc.context === "notice"
            ? heroDemoEvents.preventiveReplyAt
            : clockOf(s).now();
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
    event(s, "suggestions", paused ? "Suggested replies paused" : "Suggested replies resumed", "merchant", paused ? "Inbound messages are still recorded; no new suggested drafts are created." : null);
    if (!paused) draftMissingClarifications(s);
  });
}

/** Record the buyer's scripted clarification replies as the answers (confirmed via WhatsApp). */
export async function adoptRepliesAsAnswers(): Promise<DemoState> {
  const s = await getState();
  const inputs: AnswerInput[] = s.run.record.displayed.questions.map((q) => {
    const draft = latestClarificationForQuestion(s, q.id);
    if (!draft) throw new ActionError(`Send the question “${q.question}” first`);
    if (!draft.sentAt) throw new ActionError(`Send the question “${q.question}” first`);
    const reply = [...s.conversation].reverse().find((i) => i.inReplyTo === draft.id);
    if (!reply) throw new ActionError(`Waiting for the buyer's reply to “${q.question}”`);
    if (!reply.refs.answerValue) throw new ActionError(`Record the answer to “${q.question}” manually: typed replies are not interpreted`);
    // An interpreted reply is recorded with the merchant-selected verbatim quote (merchant judgement).
    const quote = s.interpretations.find((x) => x.messageId === reply.id)?.quote;
    return { questionId: q.id, value: reply.refs.answerValue, answerText: quote ?? reply.text, confirmedByBuyerVia: "whatsapp", answeredAt: reply.createdAt };
  });
  return recordAnswers(inputs);
}

/** Buyer asks for a change from the proposal page. Terms are not touched. */
export async function requestChange(version: number, text: string, topic?: "date" | "scope" | "price" | "other", detail?: ChangeRequestDetail): Promise<DemoState> {
  const before = await getState();
  const deal = dealContextFor(before, await pinnedEconomicsOf(before));
  return mutate((s) => {
    const v = s.agreements.find((x) => x.version === version);
    if (!v || v.status !== "sent") throw new ActionError("Only a sent proposal can receive a change request");
    const proposal = [...s.conversation].reverse().find((i) => (i.kind === "proposal" || i.kind === "amendment") && i.refs.agreementVersion === version);
    if (!proposal) throw new ActionError("No proposal message for this version");
    // A structured request is checked against the exact terms it refers to, and the merchant's message is built from it.
    let message = text.trim();
    if (detail) {
      const ctx = changeRequestContext(s, v, deal);
      const problem = validateChangeRequest(detail, ctx);
      if (problem) throw new ActionError(problem);
      if (detail.kind === "other" && message.length < 2) throw new ActionError("Tell us what you would like changed");
      message = describeChangeRequest(detail, message, ctx);
    } else if (message.length < 2) {
      throw new ActionError("Tell us what you would like changed");
    }
    const item = applyBuyerReply(s, { inReplyTo: proposal.id, text: message, at: clockOf(s).now(), scripted: false, kind: "change_request", source: "buyer_proposal_page" });
    const kind = detail?.kind ?? topic;
    if (kind || detail) s.conversation = s.conversation.map((m) => (m.id === item.id ? { ...m, refs: { ...m.refs, ...(kind ? { topic: kind } : {}), ...(detail && detail.kind !== "other" ? { request: detail } : {}) } } : m));
    event(s, "change_request_received", `Buyer requested a change to version ${version}`, "buyer_demo", "Terms are unchanged; the merchant decides how to respond.");
    // The buyer's message is the source evidence; the outcome links to it rather than copying it.
    outcome(s, { type: "buyer_requested_change", reasonCode: null, note: null, actor: "buyer", version, source: { kind: "message", id: item.id } });
  });
}

/** What a buyer's change request is checked against: the exact terms of the version they are looking at. */
function changeRequestContext(s: DemoState, v: AgreementVersion, deal: ReturnType<typeof dealContextFor>): ChangeRequestContext {
  return {
    currentTotalPaise: sum(v.terms.paymentSchedule.map((p) => p.totalPaise)),
    services: deal.packages.map((p) => ({ id: p.id, name: p.name })),
    includedIds: v.terms.scope.map((x) => x.packageId),
    lines: v.terms.paymentSchedule.map((p) => ({ id: p.id, date: p.dueDate.value, totalPaise: p.totalPaise })),
    today: localDateOf(clockOf(s).now(), deal.merchant.timeZone),
    gstRateBps: deal.merchant.policy.gstRateBps,
  };
}

export interface CounterCheck {
  currentTotalPaise: number;
  totalPaise: number;
  passes: boolean;
  failing: { id: string; code: string; text: string }[];
  /** Every rule checked, passed or failed, in the merchant's words. */
  rules: { id: string; side: "buyer" | "seller"; passed: boolean; text: string }[];
  contributionPaise: number;
  /** The amount is below the direct cost of the work, whatever the merchant's rules say. */
  negativeContribution: boolean;
  discountBps: number;
}

/** What a response to a buyer's price request is built from: the sent offer, the open request, and the engine's inputs. */
async function priceRequestContext(s: DemoState, knownDeal?: ReturnType<typeof dealContextFor>) {
  const deal = knownDeal ?? dealContextFor(s, await pinnedEconomicsOf(s));
  assertNoReview(s);
  const v = [...s.agreements].reverse().find((x) => x.status === "sent");
  if (s.status !== "sent" || !v) throw new ActionError("A counter-offer can be made only on a proposal the buyer has not yet accepted");
  if (s.amendments.some((a) => a.toVersion === v.version)) throw new ActionError("A revision cannot be countered on its amount; the buyer can request another change");
  const request = unresolvedWork(s).find((w) => w.kind === "buyer_request" && w.sourceKind === "message" && w.version === v.version);
  if (!request) throw new ActionError("There is no open buyer request to answer");
  const topic = s.conversation.find((m) => m.id === request.sourceId)?.refs.topic;
  if (topic !== "price") throw new ActionError("This request is not about the price, so it cannot be answered with a different total. Record your decision on it instead");
  const current = await structureForVersion(s, v, deal);
  const out = await currentOutcome(s, deal);
  const constraints = interpretations(out.profile)[0].constraints;
  return { v, request, current, out, constraints, deal };
}

/** Everything a counter-offer needs, computed from stored state and the unchanged engine. */
async function buildCounter(s: DemoState, totalPaise: number, knownDeal?: ReturnType<typeof dealContextFor>) {
  const ctx = await priceRequestContext(s, knownDeal);
  let evaluated: EvaluatedStructure;
  try {
    const structure = counterStructure(ctx.current.structure, totalPaise, ctx.deal.merchant.policy.gstRateBps);
    evaluated = evaluateStructure(structure, ctx.constraints, ctx.deal);
  } catch (e) {
    if (e instanceof CounterError) throw new ActionError(e.message);
    throw e;
  }
  return { v: ctx.v, request: ctx.request, current: ctx.current, evaluated, failing: failingCounterChecks(evaluated), deal: ctx.deal };
}

const totalOf = (x: EvaluatedStructure) => sum(x.structure.payments.map((p) => p.totalPaise));

/** Recheck a lower total with the engine, without changing anything. */
export async function checkCounterOffer(totalPaise: number): Promise<CounterCheck> {
  const s = await getState();
  const b = await buildCounter(s, totalPaise);
  return {
    currentTotalPaise: totalOf(b.current),
    totalPaise: totalOf(b.evaluated),
    passes: b.failing.length === 0,
    failing: b.failing.map((c) => ({ id: c.id, code: c.code, text: explainCheck(c) })),
    rules: [...b.evaluated.buyerChecks, ...b.evaluated.sellerChecks].map((c) => ({ id: c.id, side: c.side, passed: c.status !== "fail" && c.status !== "needs_information", text: explainCheck(c) })),
    contributionPaise: b.evaluated.economics.netContributionPaise,
    negativeContribution: b.evaluated.economics.netContributionPaise < 0,
    discountBps: b.evaluated.structure.discountBps,
  };
}

/**
 * Answer a buyer's request for a lower total. The engine rechecks the new amount; a failed rule needs
 * an explicit override, recorded as the merchant's decision. The sent version is withdrawn and the
 * counter becomes the selected option, to be previewed, approved and sent like any proposal.
 */
export interface CorridorOffer {
  structureId: string;
  headline: string;
  totalPaise: number;
  contributionPaise: number;
  approval: EvaluatedStructure["approval"];
}

export interface CorridorLadderRow extends CorridorOffer {
  discountBps: number;
  passes: boolean;
  isCurrent: boolean;
}

export interface CorridorView {
  currentTotalPaise: number;
  /** The buyer's amount as checked, including GST. */
  requestedTotalPaise: number | null;
  gstBasis: "including" | "excluding" | null;
  check: CounterCheck | null;
  lowestCompliantPaise: number | null;
  lowestUnavailable: "evaluation_limit" | null;
  /** The approved discount levels for the same offer, lower discount first. */
  ladder: CorridorLadderRow[];
  scopeAlternatives: CorridorOffer[];
  timingAlternatives: CorridorOffer[];
}

const withoutDiscount = (x: EvaluatedStructure) => canonicalJson({ template: x.structure.template, params: Object.fromEntries(Object.entries(x.structure.params).filter(([key]) => key !== "discount_bps" && key !== "counter_total_paise")) });
const asCorridorOffer = (x: EvaluatedStructure): CorridorOffer => ({ structureId: x.structure.id, headline: headlineFor(x), totalPaise: sum(x.structure.payments.map((p) => p.totalPaise)), contributionPaise: x.economics.netContributionPaise, approval: x.approval });

/**
 * What a buyer's request for a lower price does to the merchant's economics, computed from the
 * engine: the lowest total that meets every rule, the discounts their economics permit, and other ways to lower the buyer's payment.
 * Read-only; nothing here reaches the buyer.
 */
export async function corridorFor(args: { requestedPaise?: number; gstBasis?: "including" | "excluding" }): Promise<CorridorView> {
  const s = await getState();
  const ctx = await priceRequestContext(s);
  const gstRateBps = ctx.deal.merchant.policy.gstRateBps;
  const currentTotalPaise = totalOf(ctx.current);

  let check: CounterCheck | null = null;
  let requestedTotalPaise: number | null = null;
  if (args.requestedPaise !== undefined) {
    if (args.gstBasis !== "including" && args.gstBasis !== "excluding") throw new ActionError("Say whether the buyer's amount includes GST");
    requestedTotalPaise = args.gstBasis === "excluding" ? lineWithGst(args.requestedPaise, gstRateBps).totalPaise : args.requestedPaise;
    check = await checkCounterOffer(requestedTotalPaise);
  }

  const lowest = lowestCompliantTotal({ base: ctx.current.structure, constraints: ctx.constraints, engine: ctx.deal });
  const structures = ctx.out.evaluation.result?.structures ?? [];
  const key = withoutDiscount(ctx.current);
  const ladder: CorridorLadderRow[] = [...ctx.deal.templates.discountsBps]
    .sort((a, b) => a - b)
    .flatMap((discountBps) => {
      const x = structures.find((candidate) => withoutDiscount(candidate) === key && candidate.structure.discountBps === discountBps);
      return x ? [{ ...asCorridorOffer(x), discountBps, passes: x.approvable, isCurrent: x.structure.id === ctx.current.structure.id }] : [];
    });

  const currentScope = listValueOf(s.baseline.servicePrices, ctx.current.structure.scope);
  const datesOf = (x: EvaluatedStructure) => x.structure.payments.map((p) => p.dueDate).join(",");
  const others = strategyFeasibleOf(s, ctx.out).filter((x) => x.structure.discountBps === 0 && x.structure.id !== ctx.current.structure.id);
  const scopeAlternatives = others.filter((x) => listValueOf(s.baseline.servicePrices, x.structure.scope) < currentScope).map(asCorridorOffer);
  const timingAlternatives = others.filter((x) => listValueOf(s.baseline.servicePrices, x.structure.scope) === currentScope && datesOf(x) !== datesOf(ctx.current)).map(asCorridorOffer);

  return { currentTotalPaise, requestedTotalPaise, gstBasis: args.requestedPaise !== undefined ? (args.gstBasis ?? null) : null, check, lowestCompliantPaise: lowest.lowestCompliantPaise, lowestUnavailable: lowest.unavailableReason, ladder, scopeAlternatives, timingAlternatives };
}

/**
 * Answer the buyer's request with an offer the engine already listed and approved (a ladder level or another
 * way to pay). The sent version is withdrawn and that offer is selected, to be previewed, approved and sent like any proposal.
 */
export async function answerWithOffer(structureId: string): Promise<DemoState> {
  const before = await getState();
  const deal = dealContextFor(before, await pinnedEconomicsOf(before));
  return mutate(async (s) => {
    const ctx = await priceRequestContext(s, deal);
    if (structureId === ctx.v.structureId) throw new ActionError("That is the offer already sent");
    const target = strategyFeasibleOf(s, ctx.out).find((x) => x.structure.id === structureId);
    if (!target) throw new ActionError("That offer is not available to send");
    const at = clockOf(s).now();
    s.counterOffers.push({
      id: `counter-${s.counterOffers.length + 1}`,
      fromVersion: ctx.v.version,
      baseStructureId: ctx.v.structureId,
      targetTotalPaise: totalOf(target),
      evaluated: target,
      override: null,
      source: "listed_offer",
      requestMessageId: ctx.request.sourceId,
      createdAt: at,
      economics: economicsRef(s),
    });
    s.agreements = s.agreements.map((x) => (x.version === ctx.v.version ? { ...x, status: "superseded" as const } : x));
    setStatus(s, "options_ready", `Version ${ctx.v.version} withdrawn to answer the buyer's request`);
    s.selectedOption = null;
    await applySelection(s, target.structure.id, { explicit: true }, ctx.deal);
    event(s, "offer_prepared_for_request", `Offer prepared for the buyer's request: ${headlineFor(target)} · ${formatINR(totalOf(target))}`, "merchant", "An offer the engine had already approved, chosen by the merchant.");
  });
}

export interface CounterException {
  reason: string;
}

export async function makeCounterOffer(totalPaise: number, overrideConfirmed: boolean, acknowledgedChecks: string[], exception: CounterException = { reason: "" }): Promise<DemoState> {
  const before = await getState();
  const deal = dealContextFor(before, await pinnedEconomicsOf(before));
  return mutate(async (s) => {
    const b = await buildCounter(s, totalPaise, deal);
    // A loss is its own condition: a merchant whose rules have no floor would otherwise be able to send one unchallenged.
    const negative = b.evaluated.economics.netContributionPaise < 0;
    const needsException = b.failing.length > 0 || negative;
    if (needsException && !overrideConfirmed) throw new ActionError(b.failing.length ? "This amount does not meet your rules. Confirm the override to continue" : "This amount is below your direct costs. Confirm the override to continue");
    // The merchant overrides exactly the rules they were shown, never ones that appeared since.
    const failingCodes = b.failing.map((c) => c.code).sort();
    if (b.failing.length && JSON.stringify([...acknowledgedChecks].sort()) !== JSON.stringify(failingCodes)) throw new ActionError("Acknowledge the rules shown for this amount. They have changed; check the amount again");
    const reason = (exception.reason ?? "").trim();
    if (needsException && reason.length < 5) throw new ActionError("Give a short reason for sending this amount (at least 5 characters)");
    if (reason.length > 300) throw new ActionError("Keep the reason under 300 characters");
    const at = clockOf(s).now();
    const by = "Merchant (Pinecone Media Works)";
    // Stored exactly as the engine returned it. A failed rule is not made to pass: the merchant's override is a separate record.
    const evaluated: EvaluatedStructure = b.evaluated;
    s.counterOffers.push({
      id: `counter-${s.counterOffers.length + 1}`,
      fromVersion: b.v.version,
      baseStructureId: b.v.structureId,
      targetTotalPaise: totalPaise,
      evaluated,
      override: needsException ? { by, at, checks: b.failing.map((c) => c.code), reason, negativeContribution: negative } : null,
      source: "custom_total",
      requestMessageId: b.request.sourceId,
      createdAt: at,
      economics: economicsRef(s),
    });
    s.agreements = s.agreements.map((x) => (x.version === b.v.version ? { ...x, status: "superseded" as const } : x));
    setStatus(s, "options_ready", `Version ${b.v.version} withdrawn to answer the buyer's request`);
    s.selectedOption = null;
    await applySelection(s, evaluated.structure.id, { explicit: true }, b.deal);
    event(s, "counter_offer_created", `Counter-offer at ${formatINR(totalOf(evaluated))} prepared`, "merchant", needsException ? `Merchant override${negative ? " of a loss" : ""}${b.failing.length ? ` of: ${joinRules(b.failing.map((c) => explainCheck(c)))}` : ""} · reason: ${reason}` : "The engine rechecked it: every rule passes.");
  });
}

/** Buyer declines a sent proposal. No payment setup is created. */
export async function declineAgreement(version: number, reason?: BuyerDeclineReason): Promise<DemoState> {
  return mutate((s) => {
    const i = s.agreements.findIndex((x) => x.version === version && x.status === "sent");
    if (i < 0) throw new ActionError("No sent proposal to decline");
    if (s.amendments.some((a) => a.toVersion === version)) throw new ActionError("Declining a revision is not supported in this prototype; request a change instead");
    s.agreements[i] = buyerReject(s.agreements[i], "Buyer (Demo buyer view)", clockOf(s));
    const proposal = [...s.conversation].reverse().find((x) => x.kind === "proposal" && x.refs.agreementVersion === version);
    if (reason !== undefined && !(reason in BUYER_DECLINE_REASONS)) throw new ActionError("Unknown decline reason");
    const item = proposal ? applyBuyerReply(s, { inReplyTo: proposal.id, text: "Declined the proposal", at: clockOf(s).now(), scripted: false, kind: "decline", source: "buyer_proposal_page" }) : null;
    outcome(s, { type: "buyer_declined", reasonCode: reason ?? null, note: null, actor: "buyer", version, source: item ? { kind: "message", id: item.id } : null });
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
  const before = await getState();
  const deal = dealContextFor(before, await pinnedEconomicsOf(before));
  return mutate(async (s) => {
    assertNoNewDecisionEvidence(s);
    assertNoUnresolvedCommercialWork(s);
    if (s.status !== "active") throw new ActionError(`Amendments start from an active agreement (deal is ${s.status})`);
    const v = activeVersion(s)!;
    // Only a request under the active version; a stale earlier-version request never blocks it.
    const ci = s.changeRequests.findIndex((c) => c.state === "change_requested" && c.agreementVersion === v.version);
    if (ci < 0) throw new ActionError("No change request to act on");
    const cr = s.changeRequests[ci];
    if (s.attempts.some((a) => a.status === "submitted")) throw new ActionError("Awaiting payment outcome; rescheduling is blocked until it is known");

    const out = await currentOutcome(s, deal);
    const constraints = interpretations(out.profile)[0].constraints;
    const current = await structureForVersion(s, v, deal);
    const amendment = proposeReschedule({
      id: `amd-${s.amendments.length + 1}`,
      from: v,
      structure: current.structure as Structure,
      lineId: cr.scheduleLineId,
      newDueDate: cr.earliestDebit,
      constraints,
      engine: deal,
      mandate: s.mandate!,
      trigger: cr.timing === "preventive" ? "buyer_message" : "failed_debit",
      triggerRefs: [cr.attemptId, cr.noticeId!, cr.replyId],
      at: clockOf(s).now(),
      economics: economicsRef(s),
    });
    s.amendments.push(amendment);
    const from = current.structure.payments.find((p) => p.id === cr.scheduleLineId)!.dueDate;
    if (amendment.state === "rejected") {
      const failing = [...amendment.revised.buyerChecks, ...amendment.revised.sellerChecks].filter((c) => c.status === "fail" || c.status === "needs_information").map((c) => c.code);
      s.changeRequests[ci] = transitionChangeRequest(cr, "not_restructured", clockOf(s).now(), `Recheck failed: ${failing.join(", ")}`, amendment.id);
      event(s, "amendment_not_possible", `Revision ${from} → ${cr.earliestDebit} does not pass the checks`, "engine", failing.join(", "));
      return;
    }
    s.agreements.push(createAgreementVersion({ agreementId: v.agreementId, version: v.version + 1, evaluated: amendment.revised, dealId: s.dealId, merchantId: deal.merchant.id, buyerId: activeCase(s).buyer.id, policy: deal.merchant.policy, clock: clockOf(s), supersedes: v.version, economics: economicsRef(s) }));
    s.changeRequests[ci] = transitionChangeRequest(cr, "draft_amendment", clockOf(s).now(), `Draft amendment: ${from} → ${cr.earliestDebit}`, amendment.id);
    event(s, "amendment_proposed", `Draft amendment: ${from} → ${cr.earliestDebit}`, "engine", `${cr.transformation}. Rechecked buyer constraints, seller economics and mandate fit (${amendment.mandateFit.fits ? "fits the existing mandate" : "fresh authorisation required"}).`);
    setStatus(s, "amending", cr.timing === "preventive" ? "Draft amendment after the buyer's change request" : "Draft amendment after a failed debit");
  });
}

export async function approveAmendment(termsHash: string): Promise<DemoState> {
  return mutate((s) => {
    assertNoNewDecisionEvidence(s);
    assertNoUnresolvedCommercialWork(s);
    const a = s.amendments.at(-1);
    if (!a || a.state !== "proposed") throw new ActionError("No proposed revision");
    const i = s.agreements.findIndex((v) => v.version === a.toVersion && v.status === "draft");
    s.agreements[i] = markSent(merchantApprove(s.agreements[i], termsHash, "Merchant (Pinecone Media Works)", clockOf(s)));
    s.amendments[s.amendments.length - 1] = transitionAmendment(a, "merchant_approved", clockOf(s).now());
    event(s, "merchant_approved", `Merchant approved revision (version ${a.toVersion})`, "merchant", `Terms hash ${termsHash}`);
    const v2 = s.agreements[i];
    const line = v2.terms.paymentSchedule.find((l) => l.id === a.change.lineId)!;
    const amendmentMsg = sendCode(s, "amendment", amendmentMessageText({ fromDate: a.change.fromDueDate, toDate: a.change.toDueDate, amountPaise: line.totalPaise, version: v2.version, link: proposalLink(v2) }), { agreementVersion: v2.version, amendmentId: a.id });
    // Same delivery-access gate as the initial proposal (spec §5.5). Amendment delivery always succeeds here.
    const key = deliveryKey(v2.agreementId, v2.version);
    s.deliveries.push({ version: v2.version, idempotencyKey: key, kind: "amendment", attempts: [{ attemptId: `${key}_a1`, at: clockOf(s).now(), status: "sent", failureReason: null }], deliveredAt: clockOf(s).now(), reference: amendmentMsg.id });
  });
}

export async function acceptAmendment(termsHash: string, authorityConfirmed: boolean): Promise<DemoState> {
  const before = await getState();
  const deal = dealContextFor(before, await pinnedEconomicsOf(before));
  return mutate(async (s) => {
    assertNoUnresolvedCommercialWork(s);
    let a = s.amendments.at(-1);
    if (!a || a.state !== "merchant_approved") throw new ActionError("No revision awaiting buyer acceptance");
    const i = s.agreements.findIndex((v) => v.version === a!.toVersion && v.status === "sent");
    s.agreements[i] = buyerAccept(s.agreements[i], termsHash, "Buyer (Demo buyer view)", clockOf(s), { authorityConfirmed });
    a = transitionAmendment(a, "buyer_accepted", clockOf(s).now());
    event(s, "buyer_accepted", `Buyer accepted revision (version ${a.toVersion})`, "buyer_demo", `Terms hash ${termsHash}`);
    outcome(s, { type: "buyer_accepted", reasonCode: null, note: null, actor: "buyer", version: a.toVersion, source: { kind: "event", id: s.events.at(-1)!.id } });

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
      const reg = await paymentAdapters(process.env).recurring.registerMandate({ referenceId: `${v2.agreementId}_v${v2.version}`, perDebitLimitPaise: v2.terms.mandate.perDebitLimitPaise, endDate: v2.terms.mandate.endDate.value, customerName: activeCase(s).buyer.name });
      s.mandate = { ...createMandate({ id: reg.id, agreementId: v2.agreementId, agreementVersion: v2.version, terms: v2.terms.mandate, mode: reg.mode }), note: reg.note };
      event(s, "mandate_requested", "Fresh mandate authorisation requested", "simulated", reg.note);
    }
    planNotices(s, deal.merchant.policy);
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
    const current = activeCase(s).deal;
    const out = await runConstruct({ provider, kind: "synthetic_replay", runId: `run-${sc.id}`, clock: new FixedClock(), deal: { ...current, dealId: sc.id, messages: sc.messages } });
    s.scenario = { id: sc.id, record: out.record };
  });
}

// ── The buyer completes setup from the proposal page ─────────────────────────

/**
 * After accepting, the buyer pays the upfront payment and authorises automatic payments in one step on
 * the same page. Both are simulated events (nothing real moves) and reuse the same two transitions the
 * presenter's system steps use, in the same order. Repeating the call, or calling it when part of the
 * setup is already done, completes only what is left; with nothing left it changes nothing.
 */
export async function buyerCompleteSetup(): Promise<DemoState> {
  let s = await getState();
  const v = activeVersion(s);
  if (!v || v.status !== "active") throw new ActionError("Accept the proposal before paying");
  const linkDue = s.attempts.some((a) => a.method === "payment_link" && a.status === "scheduled" && a.agreementVersion === v.version);
  const mandatePending = s.mandate?.status === "pending";
  if (!linkDue && !mandatePending) return s;
  if (linkDue) s = await simulate("payment_link_paid");
  if (s.mandate?.status === "pending") s = await simulate("mandate_confirmed");
  return mutate((st) => {
    event(st, "buyer_setup_completed", "Buyer paid the upfront payment and set up automatic payment", "buyer_demo", "Simulated: no real money moved.");
  });
}

// ── Demo system steps (spec §8.1; plan Task 13) ──────────────────────────────

/**
 * Execute one labelled system event from the demo bar. Merchant and buyer decisions are never
 * executable here. The notice steps are refused until the buyer's setup (upfront link, mandate)
 * is complete; every clock move is recorded in the state and the run record.
 */
export async function runSystemStep(id: SystemStepId): Promise<DemoState> {
  if (!(SYSTEM_STEPS as readonly string[]).includes(id)) throw new ActionError("Not a system step");
  if (id === "pay_upfront_link") return simulate("payment_link_paid");
  if (id === "confirm_mandate") return simulate("mandate_confirmed");
  return mutate((s) => {
    const setupIncomplete = s.attempts.some((a) => a.method === "payment_link" && a.status === "scheduled") || s.mandate?.status !== "confirmed";
    if (setupIncomplete) throw new ActionError("Buyer setup is not complete: the upfront link must be paid and the mandate confirmed first");
    const n = s.notices.find((x) => !x.sentAt && s.attempts.find((a) => a.id === x.attemptId)?.status === "scheduled");
    if (!n) throw new ActionError("No advance notice is due");
    if (id === "advance_to_notice") {
      advanceTo(s, at10(n.sendOn), "Simulated: advance to the scheduled advance-notice date");
      return;
    }
    if (Date.parse(clockOf(s).now()) < Date.parse(at10(n.sendOn))) throw new ActionError(`Advance the simulated date to ${n.sendOn} first`);
    const sent = sendAdvanceNotice(n, clockOf(s), activeCase(s).deal.merchant.timeZone);
    s.notices = s.notices.map((x) => (x.id === n.id ? sent : x));
    event(s, "advance_notice_sent", `Advance notice sent for ${n.dueDate}`, "simulated", sent.text);
    sendCode(s, "notice", noticeMessageText(sent), { noticeId: sent.id, attemptId: sent.attemptId });
  });
}


/** The merchant has read what the buyer needs and is moving on to the offer. */
export async function markUnderstandReviewed(): Promise<DemoState> {
  return mutate((s) => {
    s.understandReviewed = true;
  });
}
