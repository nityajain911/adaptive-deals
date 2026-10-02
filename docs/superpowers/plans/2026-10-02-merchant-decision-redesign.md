# Merchant Decision Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the merchant experience around one recommended offer and three stages (Understand the buyer → Review the offer → Track the deal), with truthful current-state messaging driven by one pure derivation. Demo controls, presenter material and audit detail move out of the working view. A minimal outcome-learning loop is added.

**Architecture:**
- **State and service:** additive deal state (selected option, deliveries, outcomes, handled messages, interpretations, `eligibleAt`) behind a versioned, fail-safe migration. The atomic approve-and-send is split into select → draft → approve → send.
- **Derivation:** one pure `dealProgress` drives the banner, the stage tracker, redirects and the Now cards.
- **Routes:** new `/deals/[dealId]/…` routes, plus `/presenter`, a demo bar outside the merchant frame and a read-only audit drawer. The five legacy routes become redirects.

**Tech Stack:** Next.js 16.3.8 App Router (async `params`/`searchParams`, `connection()`, `router.refresh()`), React 19, TypeScript, Tailwind 4, Zod 4, Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-merchant-decision-redesign-design.md` (approved at `c907d1d`). Executors read the spec and this plan together. Section references (§) point to the spec.

## Global Constraints

- **Protected, no diff allowed:**
  - `ai/` (prompts, schemas, validators, orchestrator, run-record);
  - `evaluation/` (including `datasets/frozen/` and `FREEZE.json`);
  - `data/` (live runs, `demo-run.json`, synthetic replay and fixture);
  - `domain/replies.ts`, `domain/restructure.ts`, `domain/amendment.ts`, `domain/collections.ts`, `domain/agreement.ts`, `domain/engine.ts`, `domain/checks.ts`, `domain/economics.ts`, `domain/ledger.ts`, `domain/conversation.ts`.
- **Only allowed domain change:** two transitions in `domain/state.ts` (Task 1). Any other protected change: stop and report the conflict.
- **No Groq or other model calls** anywhere in tests or implementation. The frozen evaluation is never re-run.
- **Every figure comes from the engine, canonical terms, the ledger or deterministic code arithmetic on those.** AI never writes headlines or figures.
- **Copy rules (§5.1, §7):**
  - Before acceptance and payment, use *proposed sale* and *projected contribution*.
  - Never use *revenue recovered*, *cash recovered* or *guaranteed contribution*.
  - Use *realised contribution* only as the named target metric.
  - Never say "confirmed via WhatsApp" or imply a live WhatsApp connection.
- **Before writing route or layout code, read the Next.js docs** under `node_modules/next/dist/docs/01-app/` (layouts-and-pages, dynamic-routes, route-groups, redirecting, not-found), as AGENTS.md requires. Run `npx next typegen` after adding routes.
- **Persona suggestions are out of scope:** optional closure reasons, moving the ₹95,580 comparison, changing the outcome card's prominence.
- **Verification at the end of every phase:**
  - `npm test`, `npx tsc --noEmit`, `npm run lint`;
  - the immutable-asset check: **44/44**, derived from Git objects and never from the working tree.
    - 43 repository files are listed in `docs/superpowers/plans/frozen-assets.txt`. Each must match the same file at commit `c907d1d`:
      ```bash
      fail=0; for f in $(cat docs/superpowers/plans/frozen-assets.txt); do a=$(git show c907d1d:"$f" | shasum -a 256 | cut -d' ' -f1); b=$(shasum -a 256 "$f" | cut -d' ' -f1); [ "$a" = "$b" ] || { echo "CHANGED $f"; fail=1; }; done; echo "repo assets: $(wc -l < docs/superpowers/plans/frozen-assets.txt) checked, fail=$fail"
      ```
    - The 44th, `../FREEZE_PACK.md`, lies outside the repository and was never committed. It is compared against its recorded baseline hash `93cd3770ca7e33a37fd34f9acbbf941ffd3f39e414ce6033d9ac96a0449eab4b`, the value captured before this round, not regenerated: `shasum -a 256 ../FREEZE_PACK.md`.
  - `git diff --stat c907d1d -- ai evaluation data domain/replies.ts domain/restructure.ts domain/amendment.ts domain/collections.ts domain/agreement.ts domain/engine.ts domain/checks.ts domain/economics.ts domain/ledger.ts domain/conversation.ts` must be empty.
- **Screenshots:** the two screenshots already modified in the working tree (`artifacts/ui-review/desktop-5-change-requested.png`, `artifacts/ui-review/desktop-7-other-outcomes.png`) are never staged, deleted or overwritten. New review images use new filenames only. No phase runs the old Playwright suite, which writes those names.
- **Pitch:** `DEMO_SCRIPT.md` is the pitch narration. Its "Say" column is the 90-second voice-over. No separate pitch artifact exists.
- Commit after each task. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Review Focus

The five highest-risk scenarios. A reviewer should read these tests first at each gate.

| # | Risk | What could go wrong | Owning tests |
|---|---|---|---|
| 1 | Migration ambiguity | A saved store is guessed into "delivered" or "accepted", or history is rewritten | `tests/lib/migrate.test.ts`: "fails safely when a sent version has no delivery evidence", "never rewrites history and runs once", "infers delivery for a sent, accepted hero state"; `tests/lib/progress.test.ts`: "migration review state blocks with Inspect records"; e2e Task 18 test 7 |
| 2 | Stale send retry | A retry after reselection or closure delivers an old proposal, or a repeat send delivers twice | `tests/lib/delivery-flow.test.ts`: "an old retry cannot send after the merchant reselects or closes", "a failed send keeps the approval … retries idempotently", "selecting another option invalidates the previous draft" |
| 3 | Delivery-gated buyer access | The buyer page opens before a successful delivery, or a version-2 amendment page never opens | `tests/lib/delivery-flow.test.ts`: "a failed send … opens no buyer access", "an amendment's delivery is recorded when its message is sent"; e2e Task 18 test 5 (404 before delivery) |
| 4 | Metric cutoff | Costs keep accruing after day 90 while cash is cut off; incomplete data is presented as final | `tests/lib/outcome.test.ts`: "eligibleAt sets the window", "after day 90, later cash and costs are both excluded", "discloses refunds, estimated fees and committed costs" |
| 5 | Demo controls performing merchant decisions | Next demo step approves, sends or accepts on the merchant's or buyer's behalf | `tests/lib/demo-steps.test.ts`: "merchant steps only navigate", "the system endpoint refuses decisions"; e2e Task 18 test 3 ("Next never approves") and test 2 (bar hidden) |

---

## Phase map

| Phase | Delivers | Depends on | Phase acceptance |
|---|---|---|---|
| 1 | Additive state, migration, split approval and delivery, closures, `dealProgress` | — | Unit and service tests for §3 and §9 pass; existing suites pass after the listed test updates; protected paths unchanged |
| 2 | Three merchant stages, shared proposal content, preview, legacy redirects | 1 | Stage routes render the correct current, settled or upcoming content for every progress state; buyer route gated by delivery; manual walk-through in the dev server |
| 3 | Demo bar, rewritten demo steps, presenter page, read-only audit drawer | 1, 2 | No merchant or buyer decision executes through the demo endpoint; scripted chips and composer gone from the merchant view; audit drawer has no mutations |
| 4 | Outcome capture and measurement display | 1, 2 | Metric derivation tests (cutoff, disclosures, negative values, window/data status); outcome card and closed-offer summary render truthfully |
| 5 | Browser verification and documentation | 1–4 | Playwright suite (§10.2) passes at 1440 and 390; docs updated; release checks pass |

---

## File structure

**New pure modules (no `server-only`, unit-testable):**
- `lib/deal-records.ts`: record types (selected option, delivery, outcome, handled message, interpretation), reason-code tables, `decisionFingerprint`.
- `lib/migrate.ts`: `STORE_SCHEMA_VERSION`, `migrateState` (deterministic, run once).
- `lib/progress.ts`: `DealProgress` types and `dealProgress(state, facts)`.
- `lib/offer-copy.ts`: template headlines, the original-proposal figure, "achieves" and "changes" lines.
- `lib/outcome.ts`: `measurementCutoff`, `outcomeSummary` (provisional contribution and disclosures).
- `lib/demo-steps.ts`: typed storyboard steps (`merchant` | `buyer` | `system`).

**New server modules:**
- `lib/presenter-store.ts`: presenter-only flags in `presenter.json` (fail next send, pause view).
- `lib/delivery.ts`: simulated delivery adapter that consults the one-shot flag.

**Modified:**
- `domain/state.ts`: two transitions only.
- `lib/service.ts`: state fields, migration on load, new actions, demo-step execution limits.
- `lib/page-data.ts`: loads progress facts.
- `app/api/actions/route.ts`: new action schema.
- `app/proposal/[agreementId]/[version]/page.tsx`: delivery gate and shared content.
- `components/conversation-panel.tsx`: scoped thread, no chips or composer.
- `components/client.tsx`: new client controls.

**New routes:**
- `app/deals/[dealId]/{layout,page}.tsx`
- `app/deals/[dealId]/understand/page.tsx`
- `app/deals/[dealId]/offer/page.tsx`
- `app/deals/[dealId]/offer/preview/page.tsx`
- `app/deals/[dealId]/track/page.tsx`
- `app/presenter/page.tsx`

**New components:**
- `components/deal/{frame,stage-tracker,status-banner,now-card,settled}.tsx`
- `components/proposal-content.tsx`
- `components/offer/*`, `components/track/*`
- `components/demo-bar.tsx`
- `components/audit/*`
- `components/outcome-card.tsx`

**Legacy routes:** the existing pages under `app/(deal)/` (workspace, clarification, decision, agreement, timeline) and `app/page.tsx` become redirects. The `(deal)` layout is deleted with them.

**Tests (new):**
- `tests/helpers/drive.ts`
- `tests/lib/deal-records.test.ts`, `tests/lib/migrate.test.ts`, `tests/lib/progress.test.ts`
- `tests/lib/delivery-flow.test.ts`, `tests/lib/closures.test.ts`, `tests/lib/interpretation.test.ts`
- `tests/lib/offer-copy.test.ts`, `tests/lib/outcome.test.ts`, `tests/lib/demo-steps.test.ts`

**Tests (updated):** listed per task with reasons.

---

# Phase 1: Additive state, migration, delivery controls and `dealProgress`

### Task 1: Closure transitions in the deal state machine

**Files:**
- Modify: `domain/state.ts` (the `no_feasible_structure` and `outside_templates` rows of `DEAL_TRANSITIONS`)
- Test: `tests/domain/state-transitions.test.ts` (new)

**Interfaces:**
- Produces: `assertDealTransition("no_feasible_structure", "merchant_rejected")` and `assertDealTransition("outside_templates", "merchant_rejected")` succeed.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { assertDealTransition, DEAL_TRANSITIONS } from "@/domain/state";

describe("closure transitions (spec §3.1)", () => {
  it("allows closing no-feasible and outside-template results", () => {
    expect(() => assertDealTransition("no_feasible_structure", "merchant_rejected")).not.toThrow();
    expect(() => assertDealTransition("outside_templates", "merchant_rejected")).not.toThrow();
  });
  it("keeps existing closures and adds nothing else", () => {
    expect(DEAL_TRANSITIONS.options_ready).toContain("merchant_rejected");
    expect(DEAL_TRANSITIONS.approved).toContain("merchant_rejected");
    expect(() => assertDealTransition("sent", "merchant_rejected")).toThrow();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails:** `npx vitest run tests/domain/state-transitions.test.ts`. Expect a failure on the first test.
- [ ] **Step 3: Implement.** Add `"merchant_rejected"` to the two arrays:

```ts
  outside_templates: ["clarifying", "options_ready", "needs_information", "no_feasible_structure", "merchant_rejected", ...EXITS],
  no_feasible_structure: ["clarifying", "options_ready", "merchant_rejected", ...EXITS],
```

- [ ] **Step 4: Run `npm test` and confirm everything passes.**
- [ ] **Step 5: Commit** with message `Allow merchant closure from no-feasible and outside-template results`.

### Task 2: Record types, reason codes and decision fingerprint

**Files:**
- Create: `lib/deal-records.ts`
- Test: `tests/lib/deal-records.test.ts`

**Interfaces:**
- Produces:
  - `type SelectedOption = { structureId: string; fingerprint: string; selectedAt: string; draftVersion: number | null }`
  - `type DeliveryAttempt = { attemptId: string; at: string; status: "sent" | "failed"; failureReason: string | null }`
  - `type DeliveryRecord = { version: number; idempotencyKey: string; kind: "proposal" | "amendment"; attempts: DeliveryAttempt[]; deliveredAt: string | null; reference: string | null }`
  - `type OutcomeRecord = { id: string; type: OutcomeType; reasonCode: string | null; note: string | null; actor: "merchant" | "buyer" | "system"; at: string; dealId: string; version: number | null; source: { kind: "event" | "message" | "action"; id: string } | null }`
  - `type OutcomeType = "merchant_closed" | "buyer_declined" | "buyer_requested_change" | "buyer_accepted" | "option_selected"`
  - `type HandledMessage = { messageId: string; handledAt: string; actor: "merchant"; note: string | null }`
  - `type Interpretation = { messageId: string; questionId: string; value: string; quote: string; actor: "merchant"; at: string }`
  - `MERCHANT_CLOSE_REASONS`, `BUYER_DECLINE_REASONS`: `Record<code, label>`
  - `decisionFingerprint(eligibleIds: string[], selectedTerms: CanonicalTerms): string`
  - `deliveryKey(agreementId: string, version: number): string`
  - `isDelivered(deliveries: DeliveryRecord[], version: number): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildCanonicalTerms, deriveMandateTerms } from "@/domain/agreement";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate } from "@/domain/engine";
import { heroMerchant } from "@/data/synthetic/hero";
import { BUYER_DECLINE_REASONS, decisionFingerprint, deliveryKey, isDelivered, MERCHANT_CLOSE_REASONS } from "@/lib/deal-records";
import { clarifiedHeroProfile, heroInput } from "../helpers";

const result = () => enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput());
const termsOf = (i: number) => {
  const x = result().feasible[i];
  return buildCanonicalTerms({ dealId: "d", merchantId: "m", buyerId: "b", structure: x.structure, gstRateBps: 1800, mandate: deriveMandateTerms(x.structure, heroMerchant.policy) });
};

describe("decision fingerprint (spec §3.2)", () => {
  const ids = result().structures.filter((x) => x.approvable).map((x) => x.structure.id);
  it("is deterministic and ignores display order", () => {
    expect(decisionFingerprint(ids, termsOf(0))).toBe(decisionFingerprint([...ids].reverse(), termsOf(0)));
  });
  it("changes when the eligible set or the selected terms change", () => {
    expect(decisionFingerprint(ids.slice(1), termsOf(0))).not.toBe(decisionFingerprint(ids, termsOf(0)));
    expect(decisionFingerprint(ids, termsOf(1))).not.toBe(decisionFingerprint(ids, termsOf(0)));
  });
});

describe("reason codes are stable and separate from labels (spec §5.7)", () => {
  it("lists the approved merchant codes", () => {
    expect(Object.keys(MERCHANT_CLOSE_REASONS)).toEqual(["contribution_too_low", "scope_not_worth_delivering", "buyer_unlikely", "handled_elsewhere", "other"]);
    expect(MERCHANT_CLOSE_REASONS.handled_elsewhere).toBe("Will handle outside Adaptive Deals");
  });
  it("has buyer decline codes", () => {
    expect(Object.keys(BUYER_DECLINE_REASONS).length).toBeGreaterThan(1);
  });
});

describe("delivery identity", () => {
  it("one stable key per version; delivered only with a successful attempt", () => {
    expect(deliveryKey("agr-hero", 1)).toBe(deliveryKey("agr-hero", 1));
    expect(deliveryKey("agr-hero", 1)).not.toBe(deliveryKey("agr-hero", 2));
    const rec = { version: 1, idempotencyKey: deliveryKey("agr-hero", 1), kind: "proposal" as const, attempts: [{ attemptId: "a1", at: "t", status: "failed" as const, failureReason: "x" }], deliveredAt: null, reference: null };
    expect(isDelivered([rec], 1)).toBe(false);
    expect(isDelivered([{ ...rec, deliveredAt: "t2", reference: "r" }], 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails:** `npx vitest run tests/lib/deal-records.test.ts`. Expect "Cannot find module".
- [ ] **Step 3: Implement `lib/deal-records.ts`**

```ts
import { createHash } from "node:crypto";
import { canonicalJson, termsHash, type CanonicalTerms } from "@/domain/agreement";

export interface SelectedOption { structureId: string; fingerprint: string; selectedAt: string; draftVersion: number | null }
export interface DeliveryAttempt { attemptId: string; at: string; status: "sent" | "failed"; failureReason: string | null }
export interface DeliveryRecord { version: number; idempotencyKey: string; kind: "proposal" | "amendment"; attempts: DeliveryAttempt[]; deliveredAt: string | null; reference: string | null }
export type OutcomeType = "merchant_closed" | "buyer_declined" | "buyer_requested_change" | "buyer_accepted" | "option_selected";
export interface OutcomeRecord {
  id: string; type: OutcomeType; reasonCode: string | null; note: string | null; actor: "merchant" | "buyer" | "system"; at: string; dealId: string; version: number | null;
  source: { kind: "event" | "message" | "action"; id: string } | null;
}
export interface HandledMessage { messageId: string; handledAt: string; actor: "merchant"; note: string | null }
export interface Interpretation { messageId: string; questionId: string; value: string; quote: string; actor: "merchant"; at: string }

export const MERCHANT_CLOSE_REASONS = {
  contribution_too_low: "Margin or contribution too low",
  scope_not_worth_delivering: "Scope not worth delivering",
  buyer_unlikely: "Buyer unlikely to proceed",
  handled_elsewhere: "Will handle outside Adaptive Deals",
  other: "Other",
} as const;
export type MerchantCloseReason = keyof typeof MERCHANT_CLOSE_REASONS;

export const BUYER_DECLINE_REASONS = {
  budget: "Budget or timing doesn't work",
  scope: "Scope isn't what we need",
  approval: "Couldn't get internal approval",
  other: "Other",
} as const;
export type BuyerDeclineReason = keyof typeof BUYER_DECLINE_REASONS;

/** Deterministic: sorted eligible IDs + the selected option's canonical terms hash. */
export function decisionFingerprint(eligibleIds: string[], selectedTerms: CanonicalTerms): string {
  const payload = canonicalJson({ eligible: [...eligibleIds].sort(), selected: termsHash(selectedTerms) });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export const deliveryKey = (agreementId: string, version: number) => `deliver_${agreementId}_v${version}`;
export const isDelivered = (deliveries: DeliveryRecord[], version: number) => deliveries.some((d) => d.version === version && d.deliveredAt !== null);
```

- [ ] **Step 4: Run it and confirm it passes:** `npx vitest run tests/lib/deal-records.test.ts`.
- [ ] **Step 5: Commit** with message `Add deal record types, reason codes and decision fingerprint`.

### Task 3: Store fields, versioned migration and drive helper

**Files:**
- Create: `lib/migrate.ts`, `tests/lib/migrate.test.ts`, `tests/helpers/drive.ts`
- Modify:
  - `lib/service.ts`: the `DemoState` interface (lines ~63–85), `seedState`, `withDefaults` → `migrateState`, `getState`, `mutate`.

**Interfaces:**
- Consumes: Task 2 types.
- Produces:
  - `DemoState` gains `schemaVersion: number`, `eligibleAt: string`, `selectedOption: SelectedOption | null`, `deliveries: DeliveryRecord[]`, `outcomes: OutcomeRecord[]`, `handledMessages: HandledMessage[]`, `interpretations: Interpretation[]`, `reviewRequired: string | null`.
  - `export const STORE_SCHEMA_VERSION = 2`
  - `export function migrateState(raw: unknown): DemoState` (pure; idempotent)

**Migration rules (spec §9):**
- `eligibleAt` = `statusHistory[0].at` if present, else `DEMO_ANCHOR`.
- **Selected option:** if exactly one agreement version 1 exists, `{ structureId: v1.structureId, fingerprint: "migrated", selectedAt: v1.createdAt, draftVersion: v1.status === "draft" ? 1 : null }`. More than one candidate leaves `null`.
  - The `"migrated"` fingerprint marks a draft as needing review: a draft with this fingerprint is stale.
- **Deliveries:** for each agreement whose status is `sent`, `accepted`, `active`, `superseded` or `buyer_rejected`, find a code-authored conversation item of kind `proposal` (version 1) or `amendment` (later versions) with `refs.agreementVersion === version`.
  - If one exists, record a delivered record (one attempt, `at = item.sentAt`, `reference = item.id`).
  - If the agreement is in one of those statuses but no message exists, set `reviewRequired = "Version N is marked sent but no delivery message is recorded."` and record nothing for it.
- **Leave untouched:** `events`, `conversation`, `statusHistory`, `attempts`, `amendments`, `changeRequests`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { migrateState, STORE_SCHEMA_VERSION } from "@/lib/migrate";

const base = (over: Record<string, unknown> = {}) => ({
  schema: "adaptive-deals.store.v1", dealId: "deal-hero", status: "clarifying",
  statusHistory: [{ at: "2026-10-01T09:00:00+05:30", from: null, to: "stalled", reason: "x" }],
  clockAdvances: [], run: { record: {}, viewing: "replay" }, agreements: [], paymentLinks: [], mandate: null, attempts: [], notices: [],
  extraMessages: [], amendments: [], events: [{ id: "ev-1" }], scenario: null, conversation: [], suggestionsPaused: false, changeRequests: [], ...over,
});
const agreement = (version: number, status: string) => ({ agreementId: "agr-hero", version, structureId: `s${version}`, status, createdAt: "2026-10-01T09:22:00+05:30", terms: {}, termsHash: "h" });
const proposalMsg = (version: number, kind = "proposal") => ({ id: `conv-${version}`, kind, direction: "outbound", author: "code", sentAt: "2026-10-01T09:23:00+05:30", refs: { agreementVersion: version } });

describe("migrateState (spec §9)", () => {
  it("adds defaults and the schema version to a fresh pre-offer store", () => {
    const s = migrateState(base());
    expect(s.schemaVersion).toBe(STORE_SCHEMA_VERSION);
    expect(s.eligibleAt).toBe("2026-10-01T09:00:00+05:30");
    expect([s.selectedOption, s.deliveries, s.outcomes, s.reviewRequired]).toEqual([null, [], [], null]);
  });
  it("infers delivery for a sent, accepted hero state, so it stays in Track", () => {
    const s = migrateState(base({ status: "active", agreements: [agreement(1, "active")], conversation: [proposalMsg(1)] }));
    expect(s.deliveries).toEqual([expect.objectContaining({ version: 1, kind: "proposal", deliveredAt: "2026-10-01T09:23:00+05:30", reference: "conv-1" })]);
    expect(s.selectedOption?.structureId).toBe("s1");
    expect(s.reviewRequired).toBeNull();
  });
  it("infers amendment-version deliveries from the amendment message", () => {
    const s = migrateState(base({ status: "active", agreements: [agreement(1, "superseded"), agreement(2, "active")], conversation: [proposalMsg(1), proposalMsg(2, "amendment")] }));
    expect(s.deliveries.map((d) => [d.version, d.kind])).toEqual([[1, "proposal"], [2, "amendment"]]);
  });
  it("fails safely when a sent version has no delivery evidence", () => {
    const s = migrateState(base({ status: "sent", agreements: [agreement(1, "sent")], conversation: [] }));
    expect(s.deliveries).toEqual([]);
    expect(s.reviewRequired).toMatch(/Version 1 is marked sent but no delivery message is recorded/);
  });
  it("never rewrites history and runs once", () => {
    const raw = base({ status: "active", agreements: [agreement(1, "active")], conversation: [proposalMsg(1)] });
    const once = migrateState(raw);
    expect(once.events).toEqual(raw.events);
    expect(migrateState(once)).toEqual(once);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails:** `npx vitest run tests/lib/migrate.test.ts`.
- [ ] **Step 3: Implement `lib/migrate.ts`**

```ts
import { DEMO_ANCHOR } from "@/domain/clock";
import { deliveryKey, type DeliveryRecord } from "./deal-records";
import type { DemoState } from "./service";

export const STORE_SCHEMA_VERSION = 2;
const SENT_OR_LATER = new Set(["sent", "accepted", "active", "superseded", "buyer_rejected"]);

/** Deterministic, idempotent conversion of any saved store to the current schema. Never rewrites history. */
export function migrateState(raw: unknown): DemoState {
  const s = raw as DemoState;
  s.conversation ??= [];
  s.suggestionsPaused ??= false;
  s.changeRequests ??= [];
  if (s.schemaVersion === STORE_SCHEMA_VERSION) return s;
  s.eligibleAt ??= s.statusHistory?.[0]?.at ?? DEMO_ANCHOR;
  s.outcomes ??= [];
  s.handledMessages ??= [];
  s.interpretations ??= [];
  s.reviewRequired ??= null;
  if (s.deliveries === undefined) {
    const deliveries: DeliveryRecord[] = [];
    for (const v of s.agreements.filter((a) => SENT_OR_LATER.has(a.status))) {
      const msg = s.conversation.find((i) => i.direction === "outbound" && i.author === "code" && (i.kind === "proposal" || i.kind === "amendment") && i.refs.agreementVersion === v.version && i.sentAt);
      if (!msg) {
        s.reviewRequired = `Version ${v.version} is marked sent but no delivery message is recorded.`;
        continue;
      }
      deliveries.push({ version: v.version, idempotencyKey: deliveryKey(v.agreementId, v.version), kind: msg.kind === "amendment" ? "amendment" : "proposal", attempts: [{ attemptId: `${deliveryKey(v.agreementId, v.version)}_a1`, at: msg.sentAt!, status: "sent", failureReason: null }], deliveredAt: msg.sentAt!, reference: msg.id });
    }
    s.deliveries = deliveries;
  }
  if (s.selectedOption === undefined) {
    const v1 = s.agreements.filter((a) => a.version === 1);
    s.selectedOption = v1.length === 1 ? { structureId: v1[0].structureId, fingerprint: "migrated", selectedAt: v1[0].createdAt, draftVersion: v1[0].status === "draft" ? 1 : null } : null;
  }
  s.schemaVersion = STORE_SCHEMA_VERSION;
  return s;
}
```

- [ ] **Step 4: Wire into the service** (`lib/service.ts`):
  - Add the eight fields to `interface DemoState`, importing the types from `./deal-records`.
  - In `seedState` add `schemaVersion: STORE_SCHEMA_VERSION, eligibleAt: DEMO_ANCHOR, selectedOption: null, deliveries: [], outcomes: [], handledMessages: [], interpretations: [], reviewRequired: null`.
  - Replace both `withDefaults(...)` calls (in `getState` and `mutate`) with `migrateState(...)`, and delete `withDefaults`.
- [ ] **Step 5: Create `tests/helpers/drive.ts`.** It drives the hero story through the real merchant and buyer actions. Tasks 4–5 provide the functions it calls; until then it is unused.

```ts
import type * as Svc from "@/lib/service";

type S = Awaited<ReturnType<typeof Svc.getState>>;
type Stop = (s: S) => boolean;

/** Advance the hero story with real merchant, buyer and system actions until `stop` holds. */
export async function driveTo(svc: typeof Svc, stop: Stop, max = 20): Promise<S> {
  for (let i = 0; i < max; i++) {
    const s = await svc.getState();
    if (stop(s)) return s;
    const clar = s.conversation.filter((x) => x.kind === "clarification");
    if (s.status === "clarifying" && clar.some((d) => !d.sentAt)) await svc.sendQuestions();
    else if (s.status === "clarifying" && clar.some((d) => !s.conversation.some((r) => r.inReplyTo === d.id))) {
      for (const d of clar.filter((x) => !s.conversation.some((r) => r.inReplyTo === x.id))) await svc.buyerReply({ inReplyTo: d.id, scriptId: d.refs.questionId === "clar-gst" ? "clar-gst-yes" : "clar-approval-contract" });
    } else if (s.status === "clarifying") await svc.adoptRepliesAsAnswers();
    else if (s.status === "options_ready") {
      const v = await svc.reviewBuyerProposal();
      await svc.approveDraft(v.version, v.termsHash);
      await svc.sendProposal(v.version);
    } else if (s.status === "sent") {
      const v = s.agreements.find((x) => x.status === "sent")!;
      await svc.acceptAgreement(v.version, v.termsHash, v.terms.conditions.includes("buyer_confirms_authority_for_phase_scope"));
    } else if (s.status === "active" && s.mandate?.status === "pending") await svc.simulate("mandate_confirmed");
    else if (s.status === "active" && !s.conversation.some((x) => x.kind === "notice")) await svc.simulate("advance_notice");
    else if (s.status === "active" && !s.changeRequests.length) {
      const n = [...s.conversation].reverse().find((x) => x.kind === "notice")!;
      await svc.buyerReply({ inReplyTo: n.id, scriptId: "notice-cash-tight" });
    } else if (s.status === "active" && s.changeRequests.some((c) => c.state === "change_requested")) await svc.proposeAmendment();
    else if (s.amendments.at(-1)?.state === "proposed") await svc.approveAmendment(s.agreements.find((x) => x.status === "draft")!.termsHash);
    else if (s.amendments.at(-1)?.state === "merchant_approved") {
      const v = s.agreements.find((x) => x.status === "sent")!;
      await svc.acceptAmendment(v.termsHash, v.terms.conditions.includes("buyer_confirms_authority_for_phase_scope"));
    } else return s;
  }
  return svc.getState();
}
```

- [ ] **Step 6: Run `npx vitest run tests/lib/migrate.test.ts`, then `npm test`.** Every test passes; the existing suites use the old flow until Task 4 changes it.
- [ ] **Step 7: Commit** with message `Add versioned store migration and additive deal fields`.

### Task 4: Split approve-and-send: select → draft → approve → send, with delivery gate

**Files:**
- Create: `lib/presenter-store.ts`, `lib/delivery.ts`, `tests/lib/delivery-flow.test.ts`
- Modify:
  - `lib/service.ts`:
    - replace `prepareAgreement`/`approveAndSend` (lines ~358–386) with the new actions;
    - extend `approveAmendment` (lines ~695–707) additively;
    - update `demoNext` case `"approve"` to call the new actions (a temporary bridge until Task 13).
  - `app/api/actions/route.ts`: replace the `prepare_agreement`/`approve_and_send` schemas.
  - `app/proposal/[agreementId]/[version]/page.tsx`: the gate condition.

**Interfaces:**
- Consumes: Task 2 (`decisionFingerprint`, `deliveryKey`, `isDelivered`) and Task 3 (state fields).
- Produces:
  - `selectOption(structureId: string): Promise<DemoState>`: the merchant's **explicit** choice from **Select this offer**. Records an `option_selected` outcome (actor `merchant`) only when the choice differs from the current selection. Re-selecting the current option is a no-op: no record, no draft invalidation.
  - internal `applySelection(s, structureId, { explicit: boolean })`: shared by `selectOption` (explicit) and `reviewBuyerProposal` (automatic: no outcome record, because opening the recommended option is not attributed to the merchant)
  - `sendQuestions(): Promise<DemoState>`: atomic batch send of every unsent clarification draft (moved here from Task 5, because `tests/helpers/drive.ts` and this task's tests need it).
  - `reviewBuyerProposal(): Promise<AgreementVersion>`: selects the top recommendation if nothing is selected; prepares or reuses the draft; idempotent.
  - `approveDraft(version: number, termsHash: string): Promise<DemoState>`
  - `sendProposal(version: number): Promise<{ state: DemoState; delivered: boolean; failureReason: string | null }>`
  - `currentFingerprint(s: DemoState): Promise<{ fingerprint: string | null; eligibleIds: string[] }>`
  - `isDraftStale(s: DemoState): Promise<boolean>`
  - `readPresenterFlags()`, `setFailNextSend(on: boolean)` in `lib/presenter-store.ts`
  - `attemptDelivery(kind: "proposal" | "amendment"): Promise<{ ok: true; reference: string } | { ok: false; reason: string }>` in `lib/delivery.ts`

**Key rules (spec §3.3, §5.5):**
- `approveDraft` throws `ActionError` if the version isn't the selected draft, the hash differs, the draft is stale, or `reviewRequired` is set. On success the deal goes `options_ready → approved` and the agreement becomes `merchant_approved`. It sends nothing.
- `sendProposal` preconditions, all thrown as `ActionError` and checked before any attempt:
  - the deal status is `approved`;
  - the version equals `selectedOption.draftVersion`;
  - the draft is not stale;
  - `merchantApproval.termsHash === termsHash(v.terms)`;
  - `reviewRequired` is null.
  - If `isDelivered(version)` already holds, it returns the recorded success with no new attempt.
- **On success:** `markSent`; status `approved → sent`; `sendCode("proposal", …)`; the delivery record gets `deliveredAt` and the message ID as reference; event `proposal_delivered` (provenance `simulated`).
- **On failure:** append a failed attempt; the event `proposal_delivery_failed`; nothing else changes.
- **`approveAmendment`:** after its existing `sendCode(s, "amendment", …)`, append a delivered `DeliveryRecord` for `v2.version` with `kind: "amendment"`, the stable key and that message's ID. It never consults the presenter flag.
- **Buyer route gate:** `notFound()` unless `isDelivered(s.deliveries, version)`. This replaces the status-based check.

- [ ] **Step 1: Write the failing tests** in `tests/lib/delivery-flow.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { termsHash } from "@/domain/agreement";
import { isDelivered } from "@/lib/deal-records";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-delivery-"));
delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
type Svc = typeof import("@/lib/service");
let svc: Svc;
let presenter: typeof import("@/lib/presenter-store");
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("no network"); });
beforeAll(async () => { svc = await import("@/lib/service"); presenter = await import("@/lib/presenter-store"); });
afterAll(() => fetchSpy.mockRestore());

async function toOptions() {
  await svc.resetToSeed();
  await presenter.setFailNextSend(false);
  await svc.sendQuestions();
  const s = await svc.getState();
  for (const d of s.conversation.filter((x) => x.kind === "clarification")) await svc.buyerReply({ inReplyTo: d.id, scriptId: d.refs.questionId === "clar-gst" ? "clar-gst-yes" : "clar-approval-contract" });
  await svc.adoptRepliesAsAnswers();
}

describe("select → draft → approve → send (spec §3.3)", () => {
  it("preview and approval use the same canonical hash; approval sends nothing", async () => {
    await toOptions();
    const v = await svc.reviewBuyerProposal();
    expect(v.status).toBe("draft");
    expect(v.termsHash).toBe(termsHash(v.terms));
    expect((await svc.reviewBuyerProposal()).version).toBe(v.version); // idempotent
    await expect(svc.approveDraft(v.version, "0".repeat(64))).rejects.toThrow(/does not match/);
    const s = await svc.approveDraft(v.version, v.termsHash);
    expect([s.status, s.agreements[0].status]).toEqual(["approved", "merchant_approved"]);
    expect(s.conversation.some((i) => i.kind === "proposal")).toBe(false);
    expect(isDelivered(s.deliveries, v.version)).toBe(false);
  });
  it("a failed send keeps the approval, opens no buyer access, and retries idempotently", async () => {
    await presenter.setFailNextSend(true);
    const failed = await svc.sendProposal(1);
    expect(failed.delivered).toBe(false);
    expect(failed.state.status).toBe("approved");
    expect(failed.state.agreements[0].merchantApproval).not.toBeNull();
    expect(failed.state.deliveries[0].attempts.map((a) => a.status)).toEqual(["failed"]);
    expect((await presenter.readPresenterFlags()).failNextSend).toBe(false); // one-shot
    const ok = await svc.sendProposal(1);
    expect(ok.delivered).toBe(true);
    expect(ok.state.status).toBe("sent");
    expect(ok.state.deliveries[0].attempts.map((a) => a.status)).toEqual(["failed", "sent"]);
    const again = await svc.sendProposal(1);
    expect(again.state.deliveries[0].attempts).toHaveLength(2); // no duplicate delivery
    expect(again.state.conversation.filter((i) => i.kind === "proposal")).toHaveLength(1);
  });
  it("opening the recommended option is not a merchant choice; explicit selection is recorded once", async () => {
    await toOptions();
    await svc.reviewBuyerProposal();
    expect((await svc.getState()).outcomes.filter((o) => o.type === "option_selected")).toEqual([]);
    const out = await svc.currentOutcome(await svc.getState());
    const alt = out.explanation!.order[1];
    await svc.selectOption(alt);
    await svc.selectOption(alt); // same option again: no duplicate, no invalidation
    const recs = (await svc.getState()).outcomes.filter((o) => o.type === "option_selected");
    expect(recs).toEqual([expect.objectContaining({ actor: "merchant", source: { kind: "action", id: alt } })]);
  });
  it("selecting another option invalidates the previous draft; failing options cannot be selected", async () => {
    await toOptions();
    const out = await svc.currentOutcome(await svc.getState());
    const failing = out.evaluation.result!.rejected[0].structure.id;
    await expect(svc.selectOption(failing)).rejects.toThrow(/cannot be selected/);
    const v = await svc.reviewBuyerProposal();
    const other = out.explanation!.order[1];
    await svc.selectOption(other);
    const s = await svc.getState();
    expect(s.selectedOption!.structureId).toBe(other);
    expect(s.selectedOption!.draftVersion).toBeNull();
    await expect(svc.approveDraft(v.version, v.termsHash)).rejects.toThrow(/selected|stale/);
  });
  it("an old retry cannot send after the merchant reselects or closes", async () => {
    await toOptions();
    const v = await svc.reviewBuyerProposal();
    await svc.approveDraft(v.version, v.termsHash);
    await presenter.setFailNextSend(true);
    await svc.sendProposal(v.version);
    await svc.closeByMerchant("buyer_unlikely");
    await expect(svc.sendProposal(v.version)).rejects.toThrow(/not open for sending/);
    expect(isDelivered((await svc.getState()).deliveries, v.version)).toBe(false);
  });
  it("an amendment's delivery is recorded when its message is sent; the presenter flag never affects it", async () => {
    const { driveTo } = await import("../helpers/drive");
    await svc.resetToSeed();
    await presenter.setFailNextSend(false);
    await driveTo(svc, (s) => s.amendments.at(-1)?.state === "proposed");
    await presenter.setFailNextSend(true);
    const v2 = (await svc.getState()).agreements.find((x) => x.version === 2)!;
    const s = await svc.approveAmendment(v2.termsHash);
    expect(isDelivered(s.deliveries, 2)).toBe(true);
    expect(s.deliveries.find((d) => d.version === 2)!.kind).toBe("amendment");
    expect((await presenter.readPresenterFlags()).failNextSend).toBe(true); // untouched
    await presenter.setFailNextSend(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails:** `npx vitest run tests/lib/delivery-flow.test.ts`.
- [ ] **Step 3: Implement `lib/presenter-store.ts`**

```ts
import "server-only";
import { readJson, serialised, writeJsonAtomic } from "./store";

/** Presenter-only flags. Never part of the deal state, deal exports or the merchant audit. */
export interface PresenterFlags { failNextSend: boolean }
const FILE = "presenter.json";
export async function readPresenterFlags(): Promise<PresenterFlags> {
  return { failNextSend: false, ...((await readJson<PresenterFlags>(FILE)) ?? {}) };
}
export async function setFailNextSend(on: boolean): Promise<void> {
  await serialised(async () => writeJsonAtomic(FILE, { ...(await readPresenterFlags()), failNextSend: on }));
}
/** Read and clear the one-shot flag. */
export async function consumeFailNextSend(): Promise<boolean> {
  const f = await readPresenterFlags();
  if (f.failNextSend) await writeJsonAtomic(FILE, { ...f, failNextSend: false });
  return f.failNextSend;
}
```

  `consumeFailNextSend` is called from inside `mutate` (already serialised), so it writes directly.

- [ ] **Step 4: Implement `lib/delivery.ts`**

```ts
import "server-only";
import { consumeFailNextSend } from "./presenter-store";

/** Simulated delivery channel. Only initial proposals honour the presenter's one-shot failure. */
export async function attemptDelivery(kind: "proposal" | "amendment"): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (kind === "proposal" && (await consumeFailNextSend())) return { ok: false, reason: "Simulated delivery failure (presenter: fail next send)" };
  return { ok: true };
}
```

- [ ] **Step 5: Implement the service actions** (replacing `prepareAgreement` and `approveAndSend`):

```ts
async function eligibleOf(s: DemoState) {
  const out = await currentOutcome(s);
  const r = out.evaluation.result;
  return { out, eligible: r ? r.structures.filter((x) => x.approvable) : [] };
}
function draftTermsFor(s: DemoState, x: EvaluatedStructure) {
  return createAgreementVersion({ agreementId: AGREEMENT_ID, version: 1, evaluated: x, dealId: s.dealId, merchantId: heroMerchant.id, buyerId: heroBuyer.id, policy: heroMerchant.policy, clock: clockOf(s) });
}
export async function currentFingerprint(s: DemoState): Promise<{ fingerprint: string | null; eligibleIds: string[] }> {
  const { eligible } = await eligibleOf(s);
  const sel = eligible.find((x) => x.structure.id === s.selectedOption?.structureId);
  return { eligibleIds: eligible.map((x) => x.structure.id), fingerprint: sel ? decisionFingerprint(eligible.map((x) => x.structure.id), draftTermsFor(s, sel).terms) : null };
}
export async function isDraftStale(s: DemoState): Promise<boolean> {
  if (!s.selectedOption) return false;
  const cur = await currentFingerprint(s);
  return cur.fingerprint === null || cur.fingerprint !== s.selectedOption.fingerprint;
}
function assertNoReview(s: DemoState) {
  if (s.reviewRequired) throw new ActionError(`Saved deal records need review: ${s.reviewRequired}`);
}

async function applySelection(s: DemoState, structureId: string, opts: { explicit: boolean }) {
  assertNoReview(s);
  if (s.status !== "options_ready") throw new ActionError(`Options are not ready (deal is ${s.status})`);
  const { eligible } = await eligibleOf(s);
  const x = eligible.find((e) => e.structure.id === structureId);
  if (!x) throw new ActionError("That option cannot be selected: only engine-eligible options can be prepared");
  const fingerprint = decisionFingerprint(eligible.map((e) => e.structure.id), draftTermsFor(s, x).terms);
  if (s.selectedOption?.structureId === structureId && s.selectedOption.fingerprint === fingerprint) return; // same, still valid: no-op
  s.agreements = s.agreements.filter((v) => v.status !== "draft");
  s.selectedOption = { structureId, fingerprint, selectedAt: clockOf(s).now(), draftVersion: null };
  if (opts.explicit) s.outcomes.push({ id: `out-${s.outcomes.length + 1}`, type: "option_selected", reasonCode: null, note: null, actor: "merchant", at: clockOf(s).now(), dealId: s.dealId, version: null, source: { kind: "action", id: structureId } });
}

/** The merchant explicitly chose this option ("Select this offer"). */
export async function selectOption(structureId: string): Promise<DemoState> {
  return mutate((s) => applySelection(s, structureId, { explicit: true }));
}

export async function reviewBuyerProposal(): Promise<AgreementVersion> {
  const s = await getState();
  // Keep an existing, still-valid selection; otherwise (none, or stale) select the engine's top-ranked option.
  if (!s.selectedOption || (await isDraftStale(s))) {
    const { eligible } = await eligibleOf(s);
    const keep = s.selectedOption && eligible.some((e) => e.structure.id === s.selectedOption!.structureId) ? s.selectedOption.structureId : null;
    const top = keep ?? (await currentOutcome(s)).explanation?.order[0] ?? eligible[0]?.structure.id;
    if (!top) throw new ActionError("No engine-eligible option to review");
    await mutate((st) => applySelection(st, top, { explicit: false })); // automatic: not a merchant choice
  }
  let draft: AgreementVersion | null = null;
  await mutate(async (st) => {
    const existing = st.agreements.find((v) => v.status === "draft" && v.version === st.selectedOption!.draftVersion);
    if (existing) { draft = existing; return; }
    const { eligible } = await eligibleOf(st);
    const x = eligible.find((e) => e.structure.id === st.selectedOption!.structureId)!;
    draft = draftTermsFor(st, x);
    st.agreements.push(draft);
    st.selectedOption = { ...st.selectedOption!, draftVersion: draft.version };
  });
  return draft!;
}

export async function approveDraft(version: number, presentedHash: string): Promise<DemoState> {
  return mutate(async (s) => {
    assertNoReview(s);
    const i = s.agreements.findIndex((v) => v.version === version && v.status === "draft");
    if (i < 0 || s.selectedOption?.draftVersion !== version) throw new ActionError("This version is not the selected draft");
    if (await isDraftStale(s)) throw new ActionError("The offer changed since this preview was opened (stale draft); review the updated proposal");
    s.agreements[i] = merchantApprove(s.agreements[i], presentedHash, "Merchant (Pinecone Media Works)", clockOf(s));
    setStatus(s, "approved", `Merchant approved version ${version}`);
    event(s, "merchant_approved", `Merchant approved version ${version}`, "merchant", `Terms hash ${presentedHash}`);
  });
}

export async function sendProposal(version: number): Promise<{ state: DemoState; delivered: boolean; failureReason: string | null }> {
  let delivered = false;
  let failureReason: string | null = null;
  const state = await mutate(async (s) => {
    if (isDelivered(s.deliveries, version)) { delivered = true; return; }
    assertNoReview(s);
    if (s.status !== "approved") throw new ActionError(`The deal is not open for sending (deal is ${s.status})`);
    const i = s.agreements.findIndex((v) => v.version === version && v.status === "merchant_approved");
    if (i < 0 || s.selectedOption?.draftVersion !== version) throw new ActionError("This version is not the selected, approved proposal");
    if (await isDraftStale(s)) throw new ActionError("The offer changed since approval (stale draft); review the updated proposal");
    const v = s.agreements[i];
    if (v.merchantApproval?.termsHash !== termsHash(v.terms)) throw new ActionError("Merchant approval does not match the current terms");
    const key = deliveryKey(v.agreementId, version);
    let rec = s.deliveries.find((d) => d.version === version);
    if (!rec) { rec = { version, idempotencyKey: key, kind: "proposal", attempts: [], deliveredAt: null, reference: null }; s.deliveries.push(rec); }
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
    delivered = true;
  });
  return { state, delivered, failureReason };
}
```

  Add `sendQuestions` (atomic: every `merchantSend` is computed before anything is written back):

```ts
export async function sendQuestions(): Promise<DemoState> {
  return mutate((s) => {
    const drafts = s.conversation.filter((i) => i.kind === "clarification" && !i.sentAt);
    if (!drafts.length) throw new ActionError("No questions to send");
    const at = clockOf(s).now();
    const sent = drafts.map((d) => {
      try { return merchantSend(d, at); } catch (e) { if (e instanceof ConversationError) throw new ActionError(e.message); throw e; }
    });
    for (const d of sent) {
      s.conversation[s.conversation.findIndex((x) => x.id === d.id)] = d;
      event(s, "clarification_sent", "Approved and sent by merchant", "merchant", d.text);
    }
  });
}
```

  Route: add `z.object({ action: z.literal("send_questions") })` → `svc.sendQuestions()`.

  Add the imports: `termsHash` from `@/domain/agreement`; `decisionFingerprint`, `deliveryKey`, `isDelivered` from `./deal-records`; `attemptDelivery` from `./delivery`.

  In `approveAmendment`, after `sendCode(s, "amendment", …)`, capture the returned message and append:

```ts
    s.deliveries.push({ version: v2.version, idempotencyKey: deliveryKey(v2.agreementId, v2.version), kind: "amendment", attempts: [{ attemptId: `${deliveryKey(v2.agreementId, v2.version)}_a1`, at: clockOf(s).now(), status: "sent", failureReason: null }], deliveredAt: clockOf(s).now(), reference: amendmentMsg.id });
```

  Bridge in `demoNext` case `"approve"`: `const d = await reviewBuyerProposal(); await approveDraft(d.version, d.termsHash); next = (await sendProposal(d.version)).state;`

- [ ] **Step 6: Route schema.** In `app/api/actions/route.ts`, replace the `prepare_agreement` and `approve_and_send` entries with:

```ts
  z.object({ action: z.literal("select_option"), structureId: z.string().max(200) }),
  z.object({ action: z.literal("review_buyer_proposal") }),
  z.object({ action: z.literal("approve_and_send_draft"), version: z.number().int().positive(), termsHash: Hash }),
  z.object({ action: z.literal("retry_send"), version: z.number().int().positive() }),
```

  Handlers:
  - `select_option` → `selectOption`;
  - `review_buyer_proposal` → `const v = await svc.reviewBuyerProposal(); result = { version: v.version };`
  - `approve_and_send_draft` → `await svc.approveDraft(a.version, a.termsHash); result = await svc.sendProposal(a.version).then((r) => ({ delivered: r.delivered, failureReason: r.failureReason }));`
  - `retry_send` → the same as above without approval.

- [ ] **Step 7: Buyer route gate.** In `app/proposal/[agreementId]/[version]/page.tsx`, replace `if (!v || v.status === "draft" || v.status === "merchant_approved") notFound();` with `if (!v || !isDelivered(s.deliveries, v.version)) notFound();`.
- [ ] **Step 8: Update the existing tests that asserted the old atomic flow:**
  - `tests/lib/service-journey.test.ts:45-55`: `prepareAgreement` plus `approveAndSend(1, …)` becomes `reviewBuyerProposal()` → `approveDraft` (the wrong-hash assertion moves here) → `sendProposal`. **Reason:** approval and sending are now separate transitions (§3.3).
  - `tests/lib/connected-journey.test.ts:76-82`: the assertion "a proposal link exists only after merchant approval" becomes "only after a successful delivery". Assert that no `proposal` item exists after `approveDraft`, and that one exists after `sendProposal`. **Reason:** the buyer-access gate moved from approval to delivery.
  - `tests/lib/connected-journey.test.ts`, `tests/lib/payments-guard.test.ts`, `tests/lib/reply-outcomes.test.ts`: replace every `demoNext()` loop with `driveTo(svc, stop)` from `tests/helpers/drive.ts`, using the same stop condition. **Reason:** the guided demo will stop executing merchant decisions (Task 13); tests must drive the real actions.
  - `tests/lib/connected-journey.test.ts:268,278`: replace the `nextDemoStep(...)?.id` stale assertions with `dealProgress` assertions (in Task 6).
- [ ] **Step 9: Run `npx vitest run tests/lib/delivery-flow.test.ts`, then `npm test`, `npx tsc --noEmit` and `npm run lint`.** All pass.
- [ ] **Step 10: Commit** with message `Split approve-and-send into select, draft, approve and delivery with idempotent retry`.

### Task 5: Merchant closure, batch questions, handled messages, interpretation, buyer reasons

**Files:**
- Modify: `lib/service.ts`, `app/api/actions/route.ts`
- Test: `tests/lib/closures.test.ts`, `tests/lib/interpretation.test.ts`

**Interfaces:**
- Produces:
  - `closeByMerchant(reason: MerchantCloseReason, note?: string): Promise<DemoState>`
  - `markMessageHandled(messageId: string, note?: string): Promise<DemoState>`
  - `interpretClarificationReply(messageId: string, value: string, quote: string): Promise<DemoState>`
  - `declineAgreement(version: number, reason?: BuyerDeclineReason)`
  - `requestChange(version: number, text: string)`, which now also appends a `buyer_requested_change` outcome linked to the created message.

**Rules:**
- **`closeByMerchant`:**
  - allowed statuses: `options_ready`, `approved`, `no_feasible_structure`, `outside_templates`;
  - throws `"Don't proceed is not available after the proposal was sent"` for any status at or after `sent`;
  - sets the status to `merchant_rejected`; keeps drafts, approvals and failed attempts;
  - appends outcome `merchant_closed` with the reason and note.
- **`markMessageHandled`:**
  - the message must be inbound and must answer a notice;
  - records a `HandledMessage`; duplicates are refused;
  - mutates nothing else.
- **`interpretClarificationReply`:**
  - the message must be an inbound reply to a sent clarification, without `answerValue`, while `clarifying`;
  - `value` must be in the supported set for that question (`clar-gst`: `yes|no`; `clar-approval`: `per_contract|per_payment`);
  - `quote.trim()` must be a non-empty verbatim substring of the message text;
  - records an `Interpretation` and sets `answerValue` on a copy of the reply's refs.
  - `adoptRepliesAsAnswers` then uses interpretations for replies without `answerValue`, passing `answerText = quote`.
- **`declineAgreement(version, reason?)`:** appends a `buyer_declined` outcome with `reasonCode` and links its `source` to the existing `decline` conversation item.

- [ ] **Step 1: Write the failing tests** in `tests/lib/closures.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { driveTo } from "../helpers/drive";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-close-"));
delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("no network"); });
type Svc = typeof import("@/lib/service");
let svc: Svc;
beforeAll(async () => { svc = await import("@/lib/service"); });
const snap = (s: Awaited<ReturnType<Svc["getState"]>>) => JSON.stringify({ a: s.attempts, l: s.paymentLinks, g: s.agreements, m: s.mandate, d: s.deliveries, c: s.changeRequests });

describe("closures and outcome records (spec §3.3, §5.7)", () => {
  it("merchant closes from options ready; nothing is deleted; the record has provenance", async () => {
    await svc.resetToSeed();
    await driveTo(svc, (s) => s.status === "options_ready");
    const before = await svc.getState();
    const s = await svc.closeByMerchant("contribution_too_low", "Below our usual margin");
    expect(s.status).toBe("merchant_rejected");
    expect(s.events.length).toBeGreaterThan(before.events.length);
    expect(s.outcomes.at(-1)).toMatchObject({ type: "merchant_closed", reasonCode: "contribution_too_low", note: "Below our usual margin", actor: "merchant" });
  });
  it("merchant closes an approved-but-unsent proposal and keeps its history", async () => {
    await svc.resetToSeed();
    await driveTo(svc, (s) => s.status === "options_ready");
    const v = await svc.reviewBuyerProposal();
    await svc.approveDraft(v.version, v.termsHash);
    const s = await svc.closeByMerchant("handled_elsewhere");
    expect(s.agreements[0].merchantApproval?.termsHash).toBe(v.termsHash);
  });
  it("Don't proceed is unavailable after a successful send", async () => {
    await svc.resetToSeed();
    await driveTo(svc, (s) => s.status === "sent");
    await expect(svc.closeByMerchant("other")).rejects.toThrow(/not available after the proposal was sent/);
  });
  it("buyer decline records an optional reason linked to the decline message", async () => {
    const s = await svc.declineAgreement(1, "budget");
    const rec = s.outcomes.at(-1)!;
    expect(rec).toMatchObject({ type: "buyer_declined", reasonCode: "budget", actor: "buyer" });
    expect(s.conversation.find((i) => i.id === rec.source!.id)?.kind).toBe("decline");
  });
  it("marking a buyer message handled changes no payment, mandate, collection, agreement or delivery data", async () => {
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
  });
  it("sendQuestions sends exactly the unresolved questions, each with separate evidence", async () => {
    const s0 = await svc.resetToSeed();
    const drafts = s0.conversation.filter((i) => i.kind === "clarification").map((i) => i.id);
    const s = await svc.sendQuestions();
    const sent = s.conversation.filter((i) => drafts.includes(i.id));
    expect(sent.map((i) => [i.state, !!i.sentAt])).toEqual(drafts.map(() => ["approved_and_sent_by_merchant", true]));
    await expect(svc.sendQuestions()).rejects.toThrow(/No questions to send/);
  });
});
```

  And `tests/lib/interpretation.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-interp-"));
delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("no network"); });
type Svc = typeof import("@/lib/service");
let svc: Svc;
beforeAll(async () => { svc = await import("@/lib/service"); });

describe("merchant interpretation of an unsupported clarification reply (spec §3.3, §4)", () => {
  it("requires a supported value and a verbatim quote; never touches the AI run record", async () => {
    await svc.resetToSeed();
    const s1 = await svc.sendQuestions();
    const gst = s1.conversation.find((i) => i.refs.questionId === "clar-gst")!;
    const s2 = await svc.buyerReply({ inReplyTo: gst.id, text: "yes they are with gst" });
    const reply = s2.conversation.at(-1)!;
    const runBefore = JSON.stringify(s2.run.record);
    await expect(svc.interpretClarificationReply(reply.id, "maybe", "with gst")).rejects.toThrow(/supported value/);
    await expect(svc.interpretClarificationReply(reply.id, "yes", "includes GST")).rejects.toThrow(/verbatim/);
    const s3 = await svc.interpretClarificationReply(reply.id, "yes", "with gst");
    expect(s3.interpretations).toEqual([expect.objectContaining({ messageId: reply.id, value: "yes", quote: "with gst", actor: "merchant" })]);
    expect(JSON.stringify(s3.run.record)).toBe(runBefore);
  });
});
```

- [ ] **Step 2: Run both and confirm they fail.**
- [ ] **Step 3: Implement the service functions**

```ts
const CLOSABLE: DealStatus[] = ["options_ready", "approved", "no_feasible_structure", "outside_templates"];
const SUPPORTED_VALUES: Record<string, string[]> = { "clar-gst": ["yes", "no"], "clar-approval": ["per_contract", "per_payment"] };

function outcome(s: DemoState, rec: Omit<OutcomeRecord, "id" | "at" | "dealId">) {
  s.outcomes.push({ id: `out-${s.outcomes.length + 1}`, at: clockOf(s).now(), dealId: s.dealId, ...rec });
}

export async function closeByMerchant(reason: MerchantCloseReason, note?: string): Promise<DemoState> {
  return mutate((s) => {
    if (!CLOSABLE.includes(s.status)) throw new ActionError(s.deliveries.some((d) => d.deliveredAt) ? "Don't proceed is not available after the proposal was sent" : `The deal cannot be closed from ${s.status}`);
    if (!(reason in MERCHANT_CLOSE_REASONS)) throw new ActionError("Unknown reason");
    const version = s.selectedOption?.draftVersion ?? null;
    setStatus(s, "merchant_rejected", `Merchant: ${MERCHANT_CLOSE_REASONS[reason]}`);
    event(s, "merchant_closed", "Closed in Adaptive Deals", "merchant", MERCHANT_CLOSE_REASONS[reason] + (note ? ` · ${note}` : ""));
    outcome(s, { type: "merchant_closed", reasonCode: reason, note: note?.trim() || null, actor: "merchant", version, source: { kind: "event", id: s.events.at(-1)!.id } });
  });
}

export async function markMessageHandled(messageId: string, note?: string): Promise<DemoState> {
  return mutate((s) => {
    const m = s.conversation.find((i) => i.id === messageId);
    const target = m?.inReplyTo ? s.conversation.find((i) => i.id === m.inReplyTo) : null;
    if (!m || m.direction !== "inbound" || target?.kind !== "notice") throw new ActionError("Only a buyer reply to a notice can be marked handled");
    if (s.handledMessages.some((h) => h.messageId === messageId)) throw new ActionError("This message is already marked handled");
    s.handledMessages.push({ messageId, handledAt: clockOf(s).now(), actor: "merchant", note: note?.trim() || null });
    event(s, "message_handled", "Buyer message marked handled", "merchant", note?.trim() || null);
  });
}

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
```

  In `adoptRepliesAsAnswers`, use `answerText: s.interpretations.find((x) => x.messageId === reply.id)?.quote ?? reply.text` so an interpreted answer's recorded text is the verbatim quote.

  In `declineAgreement`, add the `reason?: BuyerDeclineReason` parameter. After `applyBuyerReply(...)`, capture the returned item and call `outcome(s, { type: "buyer_declined", reasonCode: reason ?? null, note: null, actor: "buyer", version, source: { kind: "message", id: item.id } })`.

  In `requestChange`, after `applyBuyerReply`, call `outcome(s, { type: "buyer_requested_change", reasonCode: null, note: null, actor: "buyer", version, source: { kind: "message", id: item.id } })`.

  Add the route schema entries:
  - `close_by_merchant` (reason enum of the `MERCHANT_CLOSE_REASONS` keys, note max 300);
  - `mark_message_handled` (messageId, note);
  - `interpret_reply` (messageId, value max 20, quote 1–300);
  - an optional `reason` on `decline` (enum of the `BUYER_DECLINE_REASONS` keys).
  - Remove the old `send_clarification`, `set_suggestions_paused` and `buyer_reply_typed` entries only in Task 13; they remain until then.
- [ ] **Step 4: Run the two files, then `npm test`, `npx tsc --noEmit` and `npm run lint`.** All pass.
- [ ] **Step 5: Commit** with message `Add merchant closure, batch questions, handled messages, interpretation and buyer reasons`.

### Task 6: `dealProgress`: pure, exhaustive derivation

**Files:**
- Create: `lib/progress.ts`, `tests/lib/progress.test.ts`
- Modify:
  - `lib/service.ts`: add `export async function progressOf(s: DemoState): Promise<DealProgress>`, which builds the facts and calls `dealProgress`.
  - `tests/lib/connected-journey.test.ts:268,278`: replace the `nextDemoStep` assertions.

**Interfaces:**
- Produces:

```ts
export type StageId = "understand" | "offer" | "track";
export type ProgressKind = "action_required" | "waiting_on_buyer" | "waiting_on_system" | "informational" | "terminal";
export type StageStatus = "done" | "current" | "upcoming" | "closed" | "completed";
export type PrimaryActionId =
  | "send_questions" | "use_answers" | "interpret_reply" | "send_missing_question"
  | "review_buyer_proposal" | "review_updated_proposal" | "retry_sending" | "close_in_adaptive_deals" | "mark_handled_outside"
  | "review_revised_terms" | "draft_revised_terms" | "review_buyer_message" | "inspect_records";
export interface DealProgress {
  stage: StageId;
  stages: Record<StageId, StageStatus>;
  kind: ProgressKind;
  actor: "merchant" | "buyer" | "system" | null;
  headline: string;
  primaryAction: { id: PrimaryActionId; label: string } | null;
  blockingReason: string | null;
  version: number | null;
  rule: string; // the matched table row, for tests and the audit
}
export interface ProgressFacts {
  engineState: "ambiguous" | "insufficient_information" | "outside_templates" | "no_feasible_deal" | "options_ready";
  draftStale: boolean;
  fullyPaid: boolean;
  questionCountUnsent: number;
  unansweredQuestions: number;
  repliesNeedInterpretation: number;
  attentionMessages: number;
  nextPayment: { amountPaise: number; dueDate: string } | null;
  pendingDebit: "submitted" | { retryOn: string } | null;
  buyerSetup: { linkUnpaid: boolean; mandatePending: boolean };
  changeRequestDetail: { unavailableUntil: string; lineDueDate: string } | null;
  lastFailure: string | null;
}
export function dealProgress(s: ProgressState, f: ProgressFacts): DealProgress;
```

`ProgressState` is `Pick<DemoState, "status" | "deliveries" | "agreements" | "amendments" | "changeRequests" | "reviewRequired" | "selectedOption">`. It is imported as a type from `./service` to avoid a runtime cycle.

**Derivation (spec §3.4).** `stages` is computed from `stage` plus terminal handling:
- Earlier stages are `done`; later stages are `upcoming`.
- On a terminal result, the final stage is `closed` (`merchant_rejected` / `buyer_rejected`) or `completed`.

Precedence:

1. `reviewRequired` → the review state: stage `offer` if any agreement exists, else `understand`; `action_required`; primary `inspect_records`.
2. Any delivered version → **Track**, rows 1–10 in the spec's order:
   - (1) `buyer_rejected` or `completed`;
   - (2) amendment `proposed`;
   - (3) amendment `merchant_approved`;
   - (4) a `change_requested` request under the active version (stale ones excluded);
   - (5) `attentionMessages > 0`;
   - (6) status `sent`;
   - (7) `buyerSetup.linkUnpaid || buyerSetup.mandatePending`: one combined headline;
   - (8) `pendingDebit`;
   - (9) `nextPayment`;
   - (10) `fullyPaid`.
   - If no row matches, throw `Error("dealProgress: unmapped Track state")`. Tests guarantee coverage, so there is never a silent fallback.
3. `merchant_rejected` without delivery → Offer, terminal.
4. Status `approved` → Offer, `retry_sending`, with `lastFailure` as the blocking reason.
5. `engineState === "options_ready"` → Offer, primary `review_updated_proposal` if `draftStale`, else `review_buyer_proposal`.
6. `no_feasible_deal` → Offer, `close_in_adaptive_deals`. `outside_templates` → Offer, `mark_handled_outside`.
7. Otherwise Understand:
   - `questionCountUnsent > 0` → `send_questions` (label "Send 2 questions to buyer" or "Send question to buyer");
   - `unansweredQuestions > 0` → `waiting_on_buyer`;
   - `repliesNeedInterpretation > 0` → `interpret_reply`;
   - `engineState === "ambiguous"` → `use_answers`;
   - `insufficient_information` → `send_missing_question`.

Headlines use the exact strings in the spec's §3.4 tables, formatted with `formatINR` and `formatDate` from facts.

- [ ] **Step 1: Write the failing tests.** Build state fixtures with a `mk(over)` helper that returns a minimal `ProgressState`, and `facts(over)` with neutral defaults. Required cases, each with `expect(p.rule)` and kind and headline assertions:

```ts
import { describe, expect, it } from "vitest";
import { dealProgress, type ProgressFacts } from "@/lib/progress";

const facts = (over: Partial<ProgressFacts> = {}): ProgressFacts => ({
  engineState: "options_ready", draftStale: false, fullyPaid: false, questionCountUnsent: 0, unansweredQuestions: 0, repliesNeedInterpretation: 0,
  attentionMessages: 0, nextPayment: null, pendingDebit: null, buyerSetup: { linkUnpaid: false, mandatePending: false }, changeRequestDetail: null, lastFailure: null, ...over,
});
const delivered = [{ version: 1, idempotencyKey: "k", kind: "proposal" as const, attempts: [], deliveredAt: "2026-10-01T09:23:00+05:30", reference: "conv-5" }];
const mk = (over: Record<string, unknown> = {}) => ({ status: "options_ready", deliveries: [], agreements: [], amendments: [], changeRequests: [], reviewRequired: null, selectedOption: null, ...over }) as never;
const active = [{ version: 1, status: "active" }];

describe("stage precedence (spec §3.4)", () => {
  it("a delivered deal is Track even if historical fields are unresolved", () => {
    const p = dealProgress(mk({ status: "sent", deliveries: delivered }), facts({ engineState: "ambiguous", questionCountUnsent: 2 }));
    expect([p.stage, p.kind, p.rule]).toEqual(["track", "waiting_on_buyer", "track.sent_awaiting_buyer"]);
    expect(p.stages).toEqual({ understand: "done", offer: "done", track: "current" });
  });
  it("merchant closed before sending stays in Offer and never resolves to Track", () => {
    const p = dealProgress(mk({ status: "merchant_rejected" }), facts());
    expect([p.stage, p.kind, p.stages.offer, p.stages.track]).toEqual(["offer", "terminal", "closed", "upcoming"]);
  });
  it("migration review state blocks with Inspect records", () => {
    const p = dealProgress(mk({ status: "sent", reviewRequired: "Version 1 is marked sent but no delivery message is recorded.", agreements: [{ version: 1, status: "sent" }] }), facts());
    expect([p.stage, p.primaryAction?.id]).toEqual(["offer", "inspect_records"]);
  });
});

describe("Understand and Offer rows", () => {
  it("Send 2 questions → waiting → use answers → interpret", () => {
    expect(dealProgress(mk({ status: "clarifying" }), facts({ engineState: "ambiguous", questionCountUnsent: 2 })).primaryAction?.label).toBe("Send 2 questions to buyer");
    expect(dealProgress(mk({ status: "clarifying" }), facts({ engineState: "ambiguous", questionCountUnsent: 1 })).primaryAction?.label).toBe("Send question to buyer");
    expect(dealProgress(mk({ status: "clarifying" }), facts({ engineState: "ambiguous", unansweredQuestions: 1 })).kind).toBe("waiting_on_buyer");
    expect(dealProgress(mk({ status: "clarifying" }), facts({ engineState: "ambiguous", repliesNeedInterpretation: 1 })).primaryAction?.id).toBe("interpret_reply");
    expect(dealProgress(mk({ status: "clarifying" }), facts({ engineState: "ambiguous" })).primaryAction?.id).toBe("use_answers");
  });
  it("offer: review, stale, retry, no-feasible, outside templates", () => {
    expect(dealProgress(mk(), facts()).primaryAction?.id).toBe("review_buyer_proposal");
    expect(dealProgress(mk(), facts({ draftStale: true })).primaryAction?.id).toBe("review_updated_proposal");
    const retry = dealProgress(mk({ status: "approved" }), facts({ lastFailure: "Simulated delivery failure" }));
    expect([retry.primaryAction?.id, retry.blockingReason]).toEqual(["retry_sending", "Simulated delivery failure"]);
    expect(dealProgress(mk({ status: "no_feasible_structure" }), facts({ engineState: "no_feasible_deal" })).headline).toBe("No offer fits both the buyer's confirmed limits and your current rules.");
    expect(dealProgress(mk({ status: "outside_templates" }), facts({ engineState: "outside_templates" })).primaryAction?.label).toBe("Mark as handled outside Adaptive Deals");
  });
});

describe("Track precedence is exhaustive (spec §3.4 rows 1–10)", () => {
  const T = (over: Record<string, unknown>, f: Partial<ProgressFacts>) => dealProgress(mk({ status: "active", deliveries: delivered, agreements: active, ...over }), facts(f));
  it("rows in order", () => {
    expect(T({ status: "buyer_rejected" }, {}).rule).toBe("track.terminal");
    expect(T({ status: "amending", amendments: [{ state: "proposed" }] }, { attentionMessages: 1 }).primaryAction?.label).toBe("Review revised terms");
    expect(T({ status: "amending", amendments: [{ state: "merchant_approved" }] }, {}).kind).toBe("waiting_on_buyer");
    expect(T({ changeRequests: [{ state: "change_requested", agreementVersion: 1 }] }, { changeRequestDetail: { unavailableUntil: "2026-12-20", lineDueDate: "2026-12-01" } }).primaryAction?.label).toBe("Draft revised terms");
    expect(T({ changeRequests: [{ state: "change_requested", agreementVersion: 0 }] }, { nextPayment: { amountPaise: 2301000, dueDate: "2026-12-01" } }).rule).toBe("track.next_payment"); // stale excluded
    expect(T({}, { attentionMessages: 2 }).primaryAction?.label).toBe("Review 2 buyer messages");
    expect(T({}, { buyerSetup: { linkUnpaid: true, mandatePending: true } }).headline).toBe("Buyer accepted. Waiting for the buyer to pay the upfront link and authorise recurring payments.");
    expect(T({}, { buyerSetup: { linkUnpaid: false, mandatePending: true } }).kind).toBe("waiting_on_buyer");
    expect(T({}, { pendingDebit: { retryOn: "2026-12-04" } }).headline).toBe("Debit failed · retry scheduled for 4 Dec 2026.");
    expect(T({}, { nextPayment: { amountPaise: 2301000, dueDate: "2026-12-21" } }).headline).toBe("Up to date · next payment ₹23,010 on 21 Dec 2026.");
    expect(T({}, { fullyPaid: true }).headline).toBe("All scheduled payments collected.");
    expect(T({}, { fullyPaid: true }).kind).toBe("informational");
  });
  it("never falls back silently", () => {
    expect(() => T({}, {})).toThrow(/unmapped Track state/);
  });
  it("invariants: one current stage, one primary action, waiting and informational add no action", () => {
    for (const p of [T({}, { nextPayment: { amountPaise: 1, dueDate: "2026-12-21" } }), T({ status: "sent" }, {}), dealProgress(mk(), facts())]) {
      expect(Object.values(p.stages).filter((x) => x === "current").length).toBeLessThanOrEqual(1);
      expect(p.kind === "action_required").toBe(p.primaryAction !== null);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement `lib/progress.ts`**

```ts
import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import { isDelivered } from "./deal-records";
import type { DemoState } from "./service";

/* types exactly as in the Interfaces block above */

const ORDER: StageId[] = ["understand", "offer", "track"];
function stagesFor(stage: StageId, end: "closed" | "completed" | null): Record<StageId, StageStatus> {
  const i = ORDER.indexOf(stage);
  return Object.fromEntries(ORDER.map((id, j) => [id, j < i ? "done" : j > i ? "upcoming" : end ?? "current"])) as Record<StageId, StageStatus>;
}
type R = Omit<DealProgress, "stages">;
const act = (stage: StageId, rule: string, headline: string, id: PrimaryActionId, label: string, version: number | null = null, blockingReason: string | null = null): R =>
  ({ stage, rule, headline, kind: "action_required", actor: "merchant", primaryAction: { id, label }, blockingReason, version });
const info = (stage: StageId, rule: string, kind: Exclude<ProgressKind, "action_required">, actor: DealProgress["actor"], headline: string, version: number | null = null): R =>
  ({ stage, rule, headline, kind, actor, primaryAction: null, blockingReason: null, version });

export function dealProgress(s: ProgressState, f: ProgressFacts): DealProgress {
  const r = resolve(s, f);
  const end = r.kind !== "terminal" ? null : s.status === "completed" ? "completed" : "closed";
  return { ...r, stages: stagesFor(r.stage, end) };
}

function resolve(s: ProgressState, f: ProgressFacts): R {
  const activeV = [...s.agreements].reverse().find((v) => v.status === "active")?.version ?? null;
  const latest = s.agreements.at(-1)?.version ?? null;
  if (s.reviewRequired) return act(s.agreements.length ? "offer" : "understand", "review.required", `Saved deal records need review before this deal can continue. ${s.reviewRequired}`, "inspect_records", "Inspect records");

  if (s.deliveries.some((d) => d.deliveredAt !== null)) {
    const a = s.amendments.at(-1);
    if (s.status === "buyer_rejected") return info("track", "track.terminal", "terminal", null, `Buyer declined offer version ${latest}.`, latest);
    if (s.status === "completed") return info("track", "track.terminal", "terminal", null, "Deal completed.", latest);
    if (a?.state === "proposed") return act("track", "track.amendment_merchant", "The buyer asked to move a payment. Review the revised terms.", "review_revised_terms", "Review revised terms", a.toVersion);
    if (a?.state === "merchant_approved") return info("track", "track.amendment_buyer", "waiting_on_buyer", "buyer", "Waiting for the buyer to accept the revised terms.", a.toVersion);
    const cr = s.changeRequests.find((c) => c.state === "change_requested" && c.agreementVersion === activeV);
    if (cr && f.changeRequestDetail) return act("track", "track.change_request", `The buyer can't pay until after ${formatDate(f.changeRequestDetail.unavailableUntil)}. Draft revised terms.`, "draft_revised_terms", "Draft revised terms", activeV);
    if (f.attentionMessages > 0) return act("track", "track.attention", f.attentionMessages === 1 ? "A buyer message needs your reply." : `${f.attentionMessages} buyer messages need your reply.`, "review_buyer_message", f.attentionMessages === 1 ? "Review buyer message" : `Review ${f.attentionMessages} buyer messages`, activeV);
    if (s.status === "sent") return info("track", "track.sent_awaiting_buyer", "waiting_on_buyer", "buyer", `Waiting for the buyer to review offer version ${latest}.`, latest);
    const { linkUnpaid, mandatePending } = f.buyerSetup;
    if (linkUnpaid || mandatePending) {
      const what = linkUnpaid && mandatePending ? "pay the upfront link and authorise recurring payments" : linkUnpaid ? "pay the upfront link" : "authorise recurring payments";
      return info("track", "track.buyer_setup", "waiting_on_buyer", "buyer", `Buyer accepted. Waiting for the buyer to ${what}.`, activeV);
    }
    if (f.pendingDebit === "submitted") return info("track", "track.debit_pending", "waiting_on_system", "system", "Awaiting payment outcome.", activeV);
    if (f.pendingDebit) return info("track", "track.debit_pending", "waiting_on_system", "system", `Debit failed · retry scheduled for ${formatDate(f.pendingDebit.retryOn)}.`, activeV);
    if (f.nextPayment) return info("track", "track.next_payment", "informational", null, `Up to date · next payment ${formatINR(f.nextPayment.amountPaise)} on ${formatDate(f.nextPayment.dueDate)}.`, activeV);
    if (f.fullyPaid) return info("track", "track.fully_paid", "informational", null, "All scheduled payments collected.", activeV);
    throw new Error("dealProgress: unmapped Track state");
  }

  if (s.status === "merchant_rejected") return info("offer", "offer.closed", "terminal", null, "Closed in Adaptive Deals.", latest);
  if (s.status === "approved") return act("offer", "offer.approved_unsent", "Approved · not yet sent to the buyer.", "retry_sending", "Retry sending", latest, f.lastFailure);
  if (f.engineState === "options_ready")
    return f.draftStale
      ? act("offer", "offer.stale", "The offer changed since you reviewed it.", "review_updated_proposal", "Review updated proposal")
      : act("offer", "offer.review", "Review this offer before sending it.", "review_buyer_proposal", "Review buyer proposal");
  if (f.engineState === "no_feasible_deal") return act("offer", "offer.no_feasible", "No offer fits both the buyer's confirmed limits and your current rules.", "close_in_adaptive_deals", "Close in Adaptive Deals");
  if (f.engineState === "outside_templates") return act("offer", "offer.outside_templates", "This request needs a custom arrangement.", "mark_handled_outside", "Mark as handled outside Adaptive Deals");

  if (f.questionCountUnsent > 0) return act("understand", "understand.send", `Confirm ${f.questionCountUnsent === 1 ? "one detail" : `${f.questionCountUnsent} details`} before we can recommend an offer.`, "send_questions", f.questionCountUnsent === 1 ? "Send question to buyer" : `Send ${f.questionCountUnsent} questions to buyer`);
  if (f.unansweredQuestions > 0) return info("understand", "understand.waiting", "waiting_on_buyer", "buyer", "Waiting for the buyer to answer.");
  if (f.repliesNeedInterpretation > 0) return act("understand", "understand.interpret", "One answer needs your interpretation.", "interpret_reply", "Interpret buyer's reply");
  if (f.engineState === "ambiguous") return act("understand", "understand.use_answers", "The buyer answered. Use these answers to build an offer.", "use_answers", "Use these answers");
  return act("understand", "understand.missing", "We need the buyer's budget before we can recommend an offer.", "send_missing_question", "Send question to buyer");
}
```

  `isDelivered` is imported for `progressOf`'s callers; delete the import if lint flags it as unused here.
- [ ] **Step 4: Implement `progressOf(s)` in `lib/service.ts`.** It computes `ProgressFacts` from state:
  - `engineState`: `(await currentOutcome(s)).evaluation.state`;
  - `draftStale`: `isDraftStale(s)`;
  - `fullyPaid`: `computeLedger(...)` for the active version's structure, as of the current local date (`.fullyPaid`);
  - questions: unsent and unanswered counts from `conversation`;
  - `repliesNeedInterpretation`: clarification replies without `answerValue`;
  - `attentionMessages`: notice replies whose `noticeReplyOutcome(...)` label is "Merchant attention needed" or "Payment claimed — verification required", and that are not in `handledMessages`;
  - `nextPayment`: the earliest `scheduled` attempt;
  - `pendingDebit`: a `submitted` attempt, or the latest `failed` attempt with a scheduled `internal_retry`;
  - `buyerSetup`: from the payment link attempt and the mandate;
  - `changeRequestDetail`: from the actionable change request;
  - `lastFailure`: the last failed delivery attempt's reason.
- [ ] **Step 4b: Add a service-level test** in `tests/lib/progress.test.ts`, using `driveTo` and a temp data dir, that walks the hero storyboard. After each step, `progressOf(s)` returns a defined result, exactly one stage is current, and the pending mandate yields `waiting_on_buyer` (never "No pending actions").
- [ ] **Step 5: Update `tests/lib/connected-journey.test.ts:268,278`:** `expect((await svc.progressOf(await S())).primaryAction?.id).not.toBe("draft_revised_terms")` before the fresh request, and `.toBe("draft_revised_terms")` after it. **Reason:** stale-request actionability is now asserted through `dealProgress`, not the demo step.
- [ ] **Step 6: Run `npm test`, `npx tsc --noEmit` and `npm run lint`.** All pass.
- [ ] **Step 7: Commit** with message `Add dealProgress: one exhaustive derivation of stage, status and next action`.

**Phase 1 verification:**
- `npm test`, typecheck and lint pass.
- The immutable-asset check passes (44/44).
- The protected-path diff is empty.
- The build log entry lists every updated test and why.

---

# Phase 2: Three merchant stages and the shared proposal preview

**Before coding,** read `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`, `03-api-reference/03-file-conventions/dynamic-routes.md`, `route-groups.md`, `03-api-reference/04-functions/redirect.md` and `not-found.md`.

### Task 7: Pure offer copy (headlines, original proposal, achieves and changes)

**Files:**
- Create: `lib/offer-copy.ts`, `tests/lib/offer-copy.test.ts`

**Interfaces:**
- Produces:
  - `headlineFor(x: EvaluatedStructure): string`
  - `originalProposal(): { prePaise: number; gstPaise: number; totalPaise: number; gstRateBps: number }`: computed from the fixture's `heroTemplates.fullScope` × `heroPackages` list prices using `gstOn` from `domain/money`.
  - `offerSummary(x: EvaluatedStructure, original: ReturnType<typeof originalProposal>): { achieves: string[]; changes: string[] }`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate } from "@/domain/engine";
import { headlineFor, offerSummary, originalProposal } from "@/lib/offer-copy";
import { clarifiedHeroProfile, heroInput } from "../helpers";

const r = () => enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput());
const byTemplate = (t: string) => r().structures.find((x) => x.structure.template === t)!;

describe("code-written headlines by template (spec §5.1)", () => {
  it("one headline per template type", () => {
    expect(headlineFor(byTemplate("phased_scope"))).toBe("Start with a standalone three-month package");
    expect(headlineFor(byTemplate("split_payment"))).toBe("Keep the annual scope and split the payments");
    expect(headlineFor(byTemplate("deferred_start"))).toBe("Start when the buyer's next budget opens");
    expect(headlineFor(byTemplate("shorter_commitment"))).toBe("Offer a shorter commitment");
  });
});
describe("original proposal and changes", () => {
  it("₹1,20,000 + 18% GST = ₹1,41,600", () => {
    expect(originalProposal()).toEqual({ prePaise: 12_000_000, gstPaise: 2_160_000, totalPaise: 14_160_000, gstRateBps: 1800 });
  });
  it("the ₹95,580 line appears only on a matching GST basis; never called lost or recovered", () => {
    const top = r().feasible.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!;
    const s = offerSummary(top, originalProposal());
    expect(s.changes).toContain("The customer-facing proposal value is ₹95,580 lower than the original annual proposal.");
    expect(s.changes.join(" ")).not.toMatch(/lost|recovered/i);
    expect(offerSummary(top, { ...originalProposal(), gstRateBps: 0 }).changes.join(" ")).not.toMatch(/₹95,580/);
    expect(s.achieves[0]).toBe("A proposed sale of ₹46,020 including GST.");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement.**
  - Headlines: a `Record<TemplateType, (x) => string>`. Phased scope uses the phase month count, `Math.max(...x.structure.scope.map((i) => i.months))`, written as a word (`["one","two","three","four","five","six"]`).
  - `originalProposal`: sums `listPricePaise × months` over `fullScope`, then applies GST per line with the same half-up rule the engine uses. Reuse the exported money helper; check `domain/money.ts` for `gstForPre`.
  - **Achieves:** the proposed sale; the projected contribution, formatted with "based on configured costs and fees"; for a phase scope, "A standalone three-month package the buyer can approve within the confirmed limit." (only when `x.approval === "within_limit"`).
  - **Changes:**
    - the excluded package names plus "months N–12" for phased packages;
    - the difference line only when `x.structure` GST rate bps equals `original.gstRateBps`;
    - "No work outside the three-month package is committed."
- [ ] **Step 4: Run it and confirm it passes.**
- [ ] **Step 5: Commit** with message `Add code-written offer headlines and original-proposal comparison`.

### Task 8: Shared proposal content component

**Files:**
- Create: `components/proposal-content.tsx`
- Modify: `app/proposal/[agreementId]/[version]/page.tsx`. Move the sections from "What's included" to "What happens next" into the component; the page keeps its header, status banner, actions, change requests and agreement details.
- Test: `tests/lib/views.test.ts` (existing `proposalView` tests stay; add a render test with `react-dom/server`)

**Interfaces:**
- Produces: `ProposalContent({ view, changedLineId, previousDueDate }: { view: ProposalView; changedLineId?: string | null; previousDueDate?: string | null })`, a server component with no actions, rendered from `proposalView(...)`.

- [ ] **Step 1: Write the failing render test**

```ts
import { renderToStaticMarkup } from "react-dom/server";
import { ProposalContent } from "@/components/proposal-content";
it("renders only buyer-safe canonical content (spec §5.6)", () => {
  const v = version(1, "sent");
  const html = renderToStaticMarkup(ProposalContent({ view: proposalView(v, heroPackages, heroMerchant.policy) }));
  for (const p of v.terms.paymentSchedule) expect(html).toContain(formatINR(p.totalPaise));
  expect(html).not.toMatch(/contribution|cash-at-risk|funding|margin|floor|rejected/i);
});
```

- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement** by moving the existing JSX blocks verbatim into `components/proposal-content.tsx` and importing it in the buyer page.
- [ ] **Step 4: Run `npm test`.** It passes, and the buyer page is visually unchanged (check in the dev server).
- [ ] **Step 5: Commit** with message `Extract shared buyer proposal content`.

### Task 9: Deal frame, stage tracker, status banner and deal-home redirect

**Files:**
- Create:
  - `app/deals/[dealId]/layout.tsx`, `app/deals/[dealId]/page.tsx`
  - `components/deal/frame.tsx`, `components/deal/stage-tracker.tsx`, `components/deal/status-banner.tsx`
  - `lib/deal-page.ts` (a server loader: `loadDeal(dealId)` returns `{ s, out, progress, today }`; `notFound()` for unknown IDs)
- Modify: `components/merchant-header.tsx` (unchanged visually; reused).

**Interfaces:**
- Consumes: `progressOf` (Task 6).
- Produces:
  - `stageHref(dealId, stage)`, giving `/deals/${dealId}/${stage}`;
  - `<StageTracker progress />`, an ordered list with `aria-current="step"` on the current stage and a status word per stage;
  - `<StatusBanner progress viewing />`: the actor tag + headline, and **Go to current stage →** when `viewing !== progress.stage`.
  - `<StageShell dealId viewing>{children}</StageShell>` (`components/deal/stage-shell.tsx`, server): renders the deal title, `StatusBanner`, `StageTracker` and the Audit details entry, then `children`.
- **Layout decision:** a page cannot pass `viewing` up to its parent layout. So `app/deals/[dealId]/layout.tsx` renders only the merchant header, the demo-bar slot and `<main>`. Each stage page (`understand`, `offer`, `offer/preview`, `track`) renders `<StageShell dealId viewing="…">` itself, with its own literal stage. This is server-rendered and needs no client route hook. Each page calls `loadDeal` (React `cache`), so the store is read once per request.

- [ ] **Step 1: Read the Next.js docs listed at the start of Phase 2.**
- [ ] **Step 2: Implement `lib/deal-page.ts`**

```ts
import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { DEMO_ANCHOR, SimulatedClock } from "@/domain/clock";
import { localDateOf } from "@/domain/dates";
import { heroMerchant } from "@/data/synthetic/hero";
import { currentOutcome, getState, progressOf } from "./service";

export const DEAL_IDS = ["hero"] as const;
export const loadDeal = cache(async (dealId: string) => {
  if (!(DEAL_IDS as readonly string[]).includes(dealId)) notFound();
  await connection();
  const s = await getState();
  const out = await currentOutcome(s);
  const now = new SimulatedClock(DEMO_ANCHOR, s.clockAdvances).now();
  return { s, out, progress: await progressOf(s), now, today: localDateOf(now, heroMerchant.timeZone) };
});
export const stageHref = (dealId: string, stage: "understand" | "offer" | "track") => `/deals/${dealId}/${stage}`;
```

- [ ] **Step 3: Implement the layout and the stage shell.**
  - `layout.tsx`: `MerchantHeader`, then `<main id="main">{children}</main>`, then the footer "Synthetic data · fictional merchant and buyer". The demo bar is added in Task 13.
  - `components/deal/stage-shell.tsx`:

```tsx
import { loadDeal } from "@/lib/deal-page";
import { StageTracker } from "./stage-tracker";
import { StatusBanner } from "./status-banner";
import type { StageId } from "@/lib/progress";

export async function StageShell({ dealId, viewing, children }: { dealId: string; viewing: StageId; children: React.ReactNode }) {
  const { progress } = await loadDeal(dealId);
  return (
    <div className="mx-auto w-full max-w-[1200px] px-3 py-4 sm:px-6 sm:py-6">
      <h1 className="text-[22px] font-bold tracking-tight text-ink sm:text-[26px]">Kestrel Lane Clinics · Annual digital marketing</h1>
      <StatusBanner progress={progress} viewing={viewing} dealId={dealId} />
      <StageTracker progress={progress} dealId={dealId} />
      <div className="mt-5">{children}</div>
    </div>
  );
}
```

  The Audit details entry is a disabled placeholder button until Task 15.
- [ ] **Step 4: Implement `app/deals/[dealId]/page.tsx`:** `const { dealId } = await props.params; const { progress } = await loadDeal(dealId); redirect(stageHref(dealId, progress.stage));`
- [ ] **Step 5: Run `npx next typegen && npx tsc --noEmit`.** In the dev server, open `/deals/hero`: it redirects to `/deals/hero/understand`. `/deals/nope` returns 404.
- [ ] **Step 6: Commit** with message `Add deal frame, stage tracker and current-stage redirect`.

### Task 10: Understand the buyer stage

**Files:**
- Create:
  - `app/deals/[dealId]/understand/page.tsx`
  - `components/understand/blocking-card.tsx`, `components/understand/questions-card.tsx`, `components/understand/interpret-form.tsx` (client)
- Modify:
  - `components/conversation-panel.tsx`: add `scope: "understand" | "track"`; remove the scripted-chip block and `<TypedReply>` (the demo bar replaces them in Task 13); remove the pause button.
  - `components/client.tsx`: add `PrimaryActionButton` (wraps `ActionButton` with the primary style and `data-testid="primary-action"`).

**Content (spec §4):**
- **Current:**
  - the blocking card;
  - the questions card: the full text of each question, "Suggested by AI", why it matters, the single primary action from `progress.primaryAction`;
  - the "Waiting for the buyer" state;
  - "Use these answers" (`adopt_replies`);
  - "Interpret buyer's reply" opens `InterpretForm`;
  - the compact conversation with **Show full conversation** (`<details>`) and a **See evidence** toggle.
- **Settled:** "Buyer constraints confirmed for offer version {n} · {fmtTime(answeredAt of the last recorded answer)}", "Buyer constraints confirmed from the conversation", a link to the current stage, and read-only details (constraint list, Q&A, evidence labelled "Source: simulated WhatsApp conversation").

- [ ] **Step 1: Write the failing test** (`tests/lib/understand-copy.test.ts`, a pure check of the blocking-card lines builder `blockingLines(profile, original)` exported from `components/understand/blocking-card.tsx`'s companion `lib/understand-copy.ts`):

```ts
it("keeps GST basis and precision (spec §4)", () => {
  const lines = blockingLines(clarifiedHeroProfile(), originalProposal());
  expect(lines).toEqual([
    "Original annual proposal: ₹1,41,600 including GST",
    "Current-quarter budget: ₹50,000 including GST, until 31 Dec 2026",
    "Next budget: April 2027 · exact day not provided",
    "Contracts above ₹60,000 including GST require MD approval (per contract)",
  ]);
  expect(lines.join(" ")).not.toMatch(/1 Apr|via WhatsApp/);
});
```

- [ ] **Step 2: Run it and confirm it fails;** implement `lib/understand-copy.ts` (`blockingLines`), formatting from the confirmed profile fields with `formatINR`, `formatDate` and `formatDateValue`. Run until it passes.
- [ ] **Step 3: Implement the page and components.** Branch on `progress.stages.understand` (`current` vs `done`). In current mode, render the single primary action from `progress.primaryAction`, mapped to its endpoint:
  - `send_questions` → `{ action: "send_questions" }`;
  - `use_answers` → `{ action: "adopt_replies" }`;
  - `interpret_reply` → opens `InterpretForm`.
- [ ] **Step 4: `InterpretForm`** (client): select from the supported values, a quote input with a hint ("Copy the exact words from the buyer's message"), the note "Code checks these words appear in the buyer's message; whether they support the value is your judgement", and submit `{ action: "interpret_reply", messageId, value, quote }`.
- [ ] **Step 5: Run `npm test`, typecheck and lint.** In the dev server, reset and walk Understand: send questions, wait, reply via `/api/actions` (`buyer_reply` scripted), use answers. Settled mode shows no "Ambiguous".
- [ ] **Step 6: Commit** with message `Add Understand the buyer stage`.

### Task 11: Review the offer stage and preview

**Files:**
- Create:
  - `app/deals/[dealId]/offer/page.tsx`, `app/deals/[dealId]/offer/preview/page.tsx`
  - `components/offer/recommendation.tsx`, `components/offer/alternatives.tsx`, `components/offer/rejections.tsx`, `components/offer/dont-proceed.tsx` (client), `components/offer/preview-actions.tsx` (client)

**Content (spec §5):**
- **Current, with a recommendation:**
  - the headline (`headlineFor`), the context line, and the offer (total, payments, scope, projected contribution);
  - "Passes your configured contribution and funding rules.";
  - **See economics and applied rules**, which opens the audit drawer at "economics" in Task 15 and until then a `<details>` with the same content;
  - What this offer achieves, What changes from the original proposal;
  - Why this offer (at most two lines + `explanationAttribution`);
  - the primary **Review buyer proposal** (`review_buyer_proposal`, then `router.push(preview)`);
  - Compare alternatives (`<details>`, with **Select this offer** → `select_option` only for `approvable`);
  - Don't proceed (sheet);
  - Why other options didn't fit (`<details>` → featured two → nested `<details>` full list);
  - the success-measure line.
- **Other results:** the retry, stale, no-feasible, outside-template and closed rows from `progress`.
- **Settled:** "Offer version {n} sent · {fmtTime(delivery.deliveredAt)}" plus the amendment wording when version 2 exists.
- **Preview:**
  - **Preview · Not sent to the buyer** framing;
  - `ProposalContent` from the draft's canonical terms;
  - the primary **Approve and send to buyer** → `approve_and_send_draft { version, termsHash }`; on `delivered` go to Track, otherwise to Offer;
  - **Back to offer**;
  - collapsed Agreement details (version + hash);
  - a stale draft shows "The offer changed since you reviewed it." with **Review updated proposal**.

- [ ] **Step 1: Write the failing test** (`tests/lib/offer-stage.test.ts`): a server-render smoke test of `Recommendation` with the hero top option.
  - Exactly one element with `data-testid="primary-action"`, labelled "Review buyer proposal".
  - No text "Peak funding requirement" outside the collapsed details element. Assert that the string appears only inside `<details`.
  - The text "Success measure: realised contribution from this deal within 90 days." appears.
- [ ] **Step 2: Run it and confirm it fails;** implement the components; run until it passes.
- [ ] **Step 3: Implement the preview page:** `const { s } = await loadDeal(dealId); const v = s.agreements.find((x) => x.version === s.selectedOption?.draftVersion && x.status === "draft");`. If none, `redirect(stageHref(dealId, "offer"))`. Render `ProposalContent` with `proposalView(v, heroPackages, heroMerchant.policy)`.
- [ ] **Step 4: `DontProceed`** (client): a dialog with radio buttons for `MERCHANT_CLOSE_REASONS` (stable codes as values), an optional note (max 300), and confirm → `{ action: "close_by_merchant", reason, note }`. Variants:
  - for no-feasible, the default `contribution_too_low` and the title **Close in Adaptive Deals**;
  - for outside templates, the default `handled_elsewhere` and the title **Mark as handled outside Adaptive Deals**.
- [ ] **Step 5: Run the tests, typecheck and lint.** In the dev server: offer → preview → approve and send → Track. Also check the failure path: use the presenter flag via `node -e` writing `.data/presenter.json` `{"failNextSend":true}`; it returns to Offer with **Retry sending**.
- [ ] **Step 6: Commit** with message `Add Review the offer stage and merchant proposal preview`.

### Task 12: Track the deal stage and legacy redirects

**Files:**
- Create:
  - `app/deals/[dealId]/track/page.tsx`
  - `components/track/now-card.tsx`, `components/track/payment-schedule.tsx`, `components/track/amendment-card.tsx`, `components/track/attention-card.tsx` (client: Mark as handled with a note)
- Modify:
  - `app/page.tsx`: `redirect("/deals/hero")`.
  - Replace the bodies of `app/(deal)/{workspace,clarification,decision,agreement,timeline}/page.tsx` with `redirect("/deals/hero")`, keeping the `?role=buyer` handling in agreement: redirect to the current delivered proposal link.
  - Delete `app/(deal)/layout.tsx`, and move the redirect pages to `app/workspace/page.tsx` etc. (the same URLs, no group).
  - Delete the now-unused `components/step-nav.tsx`, `components/other-outcomes.tsx` (moved in Task 14) and `components/rules.tsx` (moved in Task 15) only in their own tasks. In this task, delete `components/step-nav.tsx`.
- Test: `tests/lib/track-copy.test.ts`

**Interfaces:**
- Produces:
  - `scheduleRows(s, activeVersion): { lineId; dueDate; was: string | null; amountPaise; method; status: string }[]`: one row per schedule line, using the latest attempt per line, with "Retry scheduled for D" when an `internal_retry` is scheduled;
  - `collectionTruth(s, amendment): string[]` (spec §6.1), in `lib/track-copy.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
it("amendment copy reflects the original debit's real state (spec §6.1)", () => {
  expect(collectionTruth(stateWith({ original: "scheduled" }), amendment)).toEqual([
    "No revised payment date becomes active until both you and the buyer approve.",
    "Original 1 Dec 2026 debit: still scheduled.",
    "Revised date 21 Dec 2026: pending approval.",
  ]);
  expect(collectionTruth(stateWith({ original: "failed", retry: "scheduled" }), amendment)).toContain("Internal retry scheduled for 4 Dec 2026.");
  expect(collectionTruth(stateWith({ original: "failed", retry: "removed" }), amendment)).toContain("Internal retry removed.");
});
it("a failed line with an active retry shows the retry as its status", () => {
  expect(scheduleRows(stateWith({ original: "failed", retry: "scheduled" }), 1).find((r) => r.lineId === "pay-2")!.status).toBe("Retry scheduled for 4 Dec 2026");
});
```

  `stateWith` builds attempts using `scheduleAttempt` and `transitionAttempt` from `domain/collections` (read-only use).

- [ ] **Step 2: Run them and confirm they fail;** implement `lib/track-copy.ts`; run until they pass.
- [ ] **Step 3: Implement the Track page:**
  - the Now card (headline, primary action mapped from `progress.primaryAction.id`:
    - `review_revised_terms` scrolls to and opens the amendment card;
    - `draft_revised_terms` → `propose_amendment`;
    - `review_buyer_message` opens the attention card);
  - secondary waiting actions: open the buyer proposal, copy the link, and the delivery status line;
  - the payment schedule with collapsed Payment details (the ledger);
  - the amendment card ("What changes" / "What stays the same", rechecks in `<details>`, `collectionTruth`; **Approve revised terms** → `approve_amendment` only inside the opened card);
  - the attention card;
  - the conversation (`scope="track"`, the last two messages, collapsed);
  - a placeholder slot for the Outcome card (Task 17).
- [ ] **Step 4: Legacy redirects.** Move the files and replace their bodies. Confirm with `curl -sI localhost:3100/timeline` that the response is a 307 to `/deals/hero`.
- [ ] **Step 5: Run `npx next typegen`, `npm test`, typecheck and lint.** Walk the full story in the dev server, using `/api/actions` for buyer and system steps.
- [ ] **Step 6: Commit** with message `Add Track the deal stage and legacy redirects`.

**Phase 2 verification:**
- Tests, typecheck and lint pass, and `next build` succeeds.
- Asset check and protected diff pass.
- Manual walk-through at 1440 and 390: each stage shows only current or settled or upcoming content.

---

# Phase 3: Demo controls, presenter page and read-only audit drawer

### Task 13: Typed demo steps; the demo endpoint executes only system events and simulated replies

**Files:**
- Create:
  - `lib/demo-steps.ts` (pure: `nextDemoStep(s, progress)`)
  - `components/demo-bar.tsx` (client), `tests/lib/demo-steps.test.ts`
- Modify:
  - `lib/service.ts`: delete the old `DemoStep`, `nextDemoStep` and `demoNext`; add `runSystemStep(id)` and `advanceClock(toIso, reason)`.
  - `app/api/actions/route.ts`: replace `demo_next` with `demo_system_step { stepId }` and `advance_clock { to }`; remove `send_clarification`, `set_suggestions_paused` (moved to presenter) and `buyer_reply_typed` (`buyer_reply` gains an optional `text`).
  - `app/deals/[dealId]/layout.tsx` and `app/proposal/layout.tsx`: render `<DemoBar>` above the frame.

**Interfaces:**
- Produces:

```ts
export type DemoStepType = "merchant" | "buyer" | "system";
export interface DemoStep { id: string; type: DemoStepType; label: string; href: string; systemAction: SystemStepId | null }
export type SystemStepId = "pay_upfront_link" | "confirm_mandate" | "advance_to_notice" | "send_notice";
export function nextDemoStep(s: DemoState, progress: DealProgress, dealId: string): DemoStep | null;
export function replyContext(s: DemoState): { inReplyTo: string; label: string; scripts: { id: string; text: string }[] } | null;
```

**Rules (spec §8.1):**
- **Merchant steps** (`send_questions`, `use_answers`, `review_buyer_proposal`, `retry_sending`, `draft_revised_terms`, `review_revised_terms`, `review_buyer_message`): `systemAction: null`, label "Next: …", href to the stage.
- **Buyer acceptance:** `type: "buyer"`, href to the delivered proposal link.
- **Clarification and notice replies** go through `replyContext` (the Simulated buyer reply control), not Next.
- **Canonical guided storyboard: the preventive path** (applicant decision, 2026-10-03, replacing the earlier failed-debit insertion):
  1. **Merchant** reviews, approves and sends the proposal (product actions only; the bar navigates).
  2. **Buyer** explicitly accepts on the buyer page (the bar opens the page).
  3. **System:** `pay_upfront_link` ("Simulate: buyer pays the upfront link on 1 Nov 2026"), then `confirm_mandate` ("Simulate: buyer authorises the mandate").
  4. Track reads "Up to date · next payment ₹23,010 on 1 Dec 2026."
  5. **System:** `advance_to_notice` ("Advance simulated date to 28 Nov 2026", recorded clock advance), then `send_notice` ("Send scheduled advance notice").
  6. **Buyer reply** through **Simulated buyer reply**: "Cash is tight till the 20th.", timestamped 28 Nov 2026 12:30 IST and linked to that notice. Unchanged rules give unavailable through 20 Dec and earliest debit 21 Dec.
  7. **Merchant** drafts, reviews and approves the revised terms.
  8. **Buyer** explicitly accepts the amendment on the buyer page.
  9. Track reads the payment rescheduled to 21 Dec 2026 under version 2. Before acceptance the original 1 Dec debit remains scheduled; after it, it is removed and the revised payment scheduled. No failed debit or internal retry occurs on this path.
- **The failed-debit path is a secondary presenter scenario only.** It is reachable from `/presenter` with labelled, dated simulations and is never offered by the guided demo. Its permanent test (`tests/lib/progress-journey.test.ts`, failed-debit path) is kept.
- The upfront payment is part of the canonical demo sequence only; no domain payment policy is added.
- **Buyer-setup gate:** `nextDemoStep` never offers `advance_to_notice` or `send_notice` while the upfront link is unpaid or the mandate is pending, and `runSystemStep` refuses them with `ActionError("Buyer setup is not complete")`. The guided demo never offers a failed debit at all.
- **Clock visibility:** every clock movement is recorded in `clockAdvances` and in the run record (`s.run.record.clockAdvances`). The demo bar shows the current simulated date after any advance.
- `runSystemStep` throws `ActionError("Not a system step")` for any other ID.

- [ ] **Step 1: Write the failing tests**

```ts
describe("demo steps never perform merchant or buyer decisions (spec §8.1)", () => {
  it("merchant steps only navigate", async () => {
    await svc.resetToSeed();
    const s = await svc.getState();
    const step = nextDemoStep(s, await svc.progressOf(s), "hero")!;
    expect([step.type, step.systemAction, step.href]).toEqual(["merchant", null, "/deals/hero/understand"]);
  });
  it("the system endpoint refuses decisions", async () => {
    for (const id of ["send_questions", "review_buyer_proposal", "approve_and_send", "accept", "approve_revised_terms"]) await expect(svc.runSystemStep(id as never)).rejects.toThrow(/Not a system step/);
  });
  it("cannot reach the notice or failed-debit scene while buyer setup is incomplete", async () => {
    await svc.resetToSeed();
    await driveTo(svc, (x) => x.status === "active"); // accepted: link unpaid, mandate pending
    let s = await svc.getState();
    expect(nextDemoStep(s, await svc.progressOf(s), "hero")!.systemAction).toBe("pay_upfront_link");
    for (const id of ["advance_to_notice", "send_notice"] as const) await expect(svc.runSystemStep(id)).rejects.toThrow(/Buyer setup is not complete/);
    s = await svc.runSystemStep("pay_upfront_link");
    expect(nextDemoStep(s, await svc.progressOf(s), "hero")!.systemAction).toBe("confirm_mandate");
    for (const id of ["advance_to_notice", "send_notice"] as const) await expect(svc.runSystemStep(id)).rejects.toThrow(/Buyer setup is not complete/);
    s = await svc.runSystemStep("confirm_mandate");
    expect(nextDemoStep(s, await svc.progressOf(s), "hero")!.systemAction).toBe("advance_to_notice");
  });
  it("the guided demo never offers a failed debit on the canonical preventive path", async () => {
    await svc.resetToSeed();
    for (let i = 0; i < 40; i++) {
      const s = await svc.getState();
      const step = nextDemoStep(s, await svc.progressOf(s), "hero");
      if (!step) break;
      expect(step.label).not.toMatch(/fail/i);
      const before = s.events.length;
      await driveTo(svc, (x) => x.events.length !== before, 2, "preventive");
    }
  });
  it("time advancement is its own recorded step before the notice", async () => {
    await driveTo(svc, (x) => x.status === "active" && x.mandate?.status === "confirmed"); // helper pays the upfront link first
    let s = await svc.getState();
    expect(nextDemoStep(s, await svc.progressOf(s), "hero")!.systemAction).toBe("advance_to_notice");
    s = await svc.runSystemStep("advance_to_notice");
    expect(s.clockAdvances.at(-1)!.to).toBe("2026-11-28T10:00:00+05:30");
    expect(s.run.record.clockAdvances.at(-1)!.to).toBe("2026-11-28T10:00:00+05:30");
    expect(s.conversation.some((i) => i.kind === "notice")).toBe(false);
    expect(nextDemoStep(s, await svc.progressOf(s), "hero")!.systemAction).toBe("send_notice");
  });
});
```

  (Mandate confirmation happens through `driveTo` here; in the demo bar it is the `confirm_mandate` system step.)

- [ ] **Step 2: Run them and confirm they fail;** implement `lib/demo-steps.ts` and the service functions; run until they pass.
- [ ] **Step 3: `DemoBar`** (client, outside the frame):
  - the label "Demo controls · simulated" and the simulated date;
  - Next (a system step posts `demo_system_step`, then `router.refresh()`; otherwise a `Link` to `href`);
  - Simulated buyer reply: a `<select>` of scripts plus a "Type a reply…" textarea posting `buyer_reply { inReplyTo, scriptId | text }`;
  - an overflow `<details>` with Reset demo (confirm), Open presenter page (`/presenter`) and Hide demo controls;
  - visibility in `localStorage["adaptive-deals.demo-bar"]`, with a small fixed "Show demo controls" button when hidden.
- [ ] **Step 4: Update `components/conversation-panel.tsx` and `components/client.tsx`:** confirm the scripted chips, `TypedReply` and pause button are gone. Keep `TypedReply` logic inside `DemoBar` as "Type a reply…", including its valid-target rule (commit `e2d2642`).
- [ ] **Step 5: Run `npm test`, typecheck and lint.** In the dev server, the 90-second journey runs with the bar, and every merchant step requires clicking the product button.
- [ ] **Step 6: Commit** with message `Add demo controls bar; demo endpoint runs only system events and simulated replies`.

### Task 14: Presenter page

**Files:**
- Create: `app/presenter/page.tsx`, `components/presenter/*.tsx` (client controls)
- Move: `components/other-outcomes.tsx` → `components/presenter/other-outcomes.tsx`
- Modify: `app/api/actions/route.ts`: add `presenter_fail_next_send { on }`, `presenter_pause_ai { paused }` (calls the existing `setSuggestionsPaused`), and keep `run_live`, `replay_run`, `run_scenario` and `simulate` (all events, including the failed-debit path).
- Test: `tests/lib/presenter.test.ts`

**Content (spec §8.2):**
- the label "Presenter · not part of the merchant product";
- Run live ("Makes a new external model call · new run ID") / Replay stored run ("No model call");
- scenarios; all simulations; Fail next send (shows its state, resettable); Pause AI suggestions ("Existing drafts remain unchanged; no new AI-worded drafts while paused");
- the run record (run ID, prompt versions, provider, model, step outcomes); the full event log; raw `outcomes`, `deliveries` and `handledMessages`;
- integrity: replay-integrity result (`replayRun` succeeded), and prompt hashes vs `FREEZE.json` via `currentPromptHashes()` from `evaluation/runner` (read-only import).

- [ ] **Step 1: Write the failing test.** The live-run isolation guarantee, with a fake provider. Imports: `createHash` from `node:crypto`; `existsSync`, `readdirSync`, `readFileSync` from `node:fs`; `path` from `node:path`; `vi` from `vitest`. Set `ADAPTIVE_DEALS_DATA_DIR` to a temp directory first.

```ts
it("a live run never overwrites pinned or frozen data (spec §8.2)", async () => {
  const files = ["data/demo-run.json", "evaluation/datasets/frozen/FREEZE.json", ...readdirSync("data/live-runs").map((f) => `data/live-runs/${f}`)];
  const sha = () => files.map((f) => createHash("sha256").update(readFileSync(f)).digest("hex")).join(",");
  const before = sha();
  vi.doMock("@/ai/live", () => ({ createLiveProvider: () => new SyntheticAuthoredProvider({}, []) }));
  vi.doMock("@/ai/config", () => ({ liveAvailability: () => ({ available: true, provider: "groq", model: "fake" }) }));
  const svc = await import("@/lib/service");
  const s = await svc.startLiveRun();
  expect(s.run.record.runId).toMatch(/^run-live-[a-f0-9]{8}$/);
  expect(sha()).toBe(before);
  expect(readdirSync("data/live-runs")).not.toContain(`${s.run.record.runId}.json`);
  expect(existsSync(path.join(process.env.ADAPTIVE_DEALS_DATA_DIR!, "runs", `${s.run.record.runId}.json`))).toBe(true);
});
```

  `SyntheticAuthoredProvider` is a protected, read-only import. If its constructor requires arguments that this fake can't satisfy, use the bundled synthetic run's steps through `ReplayProvider` instead. Either way, no network call.

- [ ] **Step 2: Run it and confirm it fails or passes.** If the existing behaviour already passes, keep the test as the guarantee. Implement the page.
- [ ] **Step 3: Run tests, typecheck and lint.** Commit with message `Add presenter page with isolated presenter controls`.

### Task 15: Read-only merchant audit drawer

**Files:**
- Create:
  - `components/audit/audit-drawer.tsx` (client shell: native `<dialog>`, focus trap, Escape, focus return, full screen below 640 px, opens at a section via a `CustomEvent("adaptive-deals:open-audit", { detail: section })`)
  - `components/audit/sections.tsx` (server-rendered, read-only content)
  - `lib/audit.ts` (pure: `auditSources(s, run)` and `whoDidWhat(run, explanation)`)
- Move: the content of `components/rules.tsx` into `sections.tsx` ("Applied merchant rules"); delete `components/rules.tsx`.
- Modify: `app/deals/[dealId]/layout.tsx` (Audit details opens the drawer); `components/offer/recommendation.tsx` (See economics and applied rules opens the "economics" section).
- Test: `tests/lib/audit.test.ts`

**Interfaces:**
- Produces:
  - `auditSources(...)`: `{ item: string; source: "Simulated WhatsApp conversation" | "Clarification message" | "Synthetic deal fixture" | "Simulated payment record" | "Merchant interpretation of buyer message" | "Deterministic calculation from configured inputs" | string /* "AI run <id> · <promptVersion>" */ }[]`
  - `whoDidWhat(...)`: `{ ai: string[]; code: string[]; merchant: string[]; buyer: string[] }`

- [ ] **Step 1: Write the failing tests**

```ts
it("labels each source truthfully (spec §8.3)", () => {
  const src = auditSources(state, run);
  expect(src.find((x) => x.item === "Original annual proposal")!.source).toBe("Synthetic deal fixture");
  expect(src.find((x) => x.item.startsWith("Current-quarter budget"))!.source).toBe("Simulated WhatsApp conversation");
  expect(src.find((x) => x.item === "Constraint extraction")!.source).toBe(`AI run ${run.runId} · extract.v2`);
});
it("credits code, not AI, when AI prose failed validation", () => {
  const w = whoDidWhat(run, { ...explanation, source: { ranking: "ai", text: "code_fallback" } });
  expect(w.ai.join(" ")).not.toMatch(/explanation/i);
  expect(w.code.join(" ")).toMatch(/wrote the recommendation explanation because the AI wording did not pass validation/);
});
it("the audit drawer contains no mutation controls", () => {
  const html = renderToStaticMarkup(AuditSections({ ...props }));
  expect(html).not.toMatch(/<form|data-action=|\/api\/actions/);
  expect(html).not.toMatch(/<button(?![^>]*data-audit-nav)/); // only section-navigation buttons
});
```

- [ ] **Step 2: Run them and confirm they fail;** implement; run until they pass.
- [ ] **Step 3: In the dev server,** open Audit details on each stage, press Tab through it (focus stays inside), press Escape (focus returns to the button), and check the layout at 390 px.
- [ ] **Step 4: Commit** with message `Add read-only deal audit drawer with truthful sources and run-specific attribution`.

**Phase 3 verification:**
- Tests, typecheck, lint and build pass.
- Asset check and protected diff pass.
- Manual check with the demo bar hidden: every merchant decision is still reachable.

---

# Phase 4: Outcome capture and measurement display

### Task 16: Outcome summary and metric derivation

**Files:**
- Create: `lib/outcome.ts`, `tests/lib/outcome.test.ts`

**Interfaces:**
- Produces:

```ts
export function measurementCutoff(eligibleAt: string, now: string): { cutoff: string; windowEnded: boolean };
export interface OutcomeSummary {
  proposedTotalPaise: number | null;      // incl. GST
  acceptedTotalPaise: number | null;      // incl. GST; null = not accepted
  collected: { totalPaise: number; prePaise: number };
  provisionalContributionPaise: number;   // modelled inputs only
  window: "in_progress" | "ended";
  data: "incomplete";
  label: string;                          // e.g. "Window in progress · incomplete inputs"
  disclosures: string[];
  inputs: { cashPrePaise: number; estimatedFeesPaise: number; costsIncurredPaise: number; cutoff: string };
}
export function outcomeSummary(args: { s: DemoState; acceptedStructure: Structure | null; policy: MerchantPolicy; now: string; timeZone: string }): OutcomeSummary;
```

**Calculation (spec §7.2):**
- Cutoff = min(`now`, `eligibleAt` + 90 days).
- Cash = succeeded attempts whose `receiptDate` is on or before the cutoff date (`prePaise`).
- Fees = Σ `expectedFee(amountPaise, policy.paymentFeeBps)` over those attempts.
- Costs = `computeEconomics(acceptedStructure, policy).series` at the last point with `date ≤ cutoffDate` (`costsIncurredPaise`), or 0 if there is no accepted structure.
- Provisional = cash − fees − costs.

- [ ] **Step 1: Write the failing tests**

```ts
describe("outcome metric (spec §7.2)", () => {
  it("eligibleAt sets the window; earlier imported messages cannot move it", () => {
    expect(measurementCutoff("2026-10-01T09:00:00+05:30", "2026-11-01T10:00:00+05:30")).toEqual({ cutoff: "2026-11-01T10:00:00+05:30", windowEnded: false });
    expect(measurementCutoff("2026-10-01T09:00:00+05:30", "2027-02-01T10:00:00+05:30")).toEqual({ cutoff: "2026-12-30T09:00:00+05:30", windowEnded: true });
  });
  it("incurred costs can make the provisional value negative before cash arrives", () => {
    const o = outcomeSummary({ s: acceptedNoCash("2026-11-02T10:00:00+05:30"), acceptedStructure: heroTop(), policy: heroMerchant.policy, now: "2026-11-02T10:00:00+05:30", timeZone: "Asia/Kolkata" });
    expect(o.inputs.costsIncurredPaise).toBeGreaterThan(0);
    expect(o.provisionalContributionPaise).toBeLessThan(0);
  });
  it("after day 90, later cash and costs are both excluded; status reports window and data", () => {
    const o = outcomeSummary({ s: paidAfterWindow(), acceptedStructure: heroTop(), policy: heroMerchant.policy, now: "2027-03-01T10:00:00+05:30", timeZone: "Asia/Kolkata" });
    expect(o.inputs.cutoff).toBe("2026-12-30T09:00:00+05:30");
    expect(o.label).toBe("Window ended · incomplete inputs");
    expect(o.data).toBe("incomplete");
  });
  it("discloses refunds, estimated fees and committed costs; never zeroes refunds", () => {
    const o = outcomeSummary({ s: acceptedNoCash("2026-11-02T10:00:00+05:30"), acceptedStructure: heroTop(), policy: heroMerchant.policy, now: "2026-11-02T10:00:00+05:30", timeZone: "Asia/Kolkata" });
    expect(o.disclosures).toEqual([
      "Refund data is not modelled in this prototype. No refund amount has been assumed.",
      "Estimated payment fees at configured rate (2%) — not an actual settled Razorpay fee record.",
      "Includes modelled costs incurred up to the measurement cutoff. Irrevocably committed future costs are not modelled.",
    ]);
    expect(JSON.stringify(o)).not.toMatch(/Refunds: ₹0/);
  });
});
```

  `acceptedNoCash` and `paidAfterWindow` build minimal `DemoState` objects using `scheduleAttempt` and `transitionAttempt`; `heroTop()` is the hero recommended structure from `enumerateAndEvaluate`.

- [ ] **Step 2: Run them and confirm they fail;** implement; run until they pass.
- [ ] **Step 3: Commit** with message `Add provisional outcome summary with explicit measurement cutoff`.

### Task 17: Outcome card, closed-offer summary, offer hint and buyer reason inputs

**Files:**
- Create: `components/outcome-card.tsx`, `components/offer/closed-summary.tsx`
- Modify:
  - `app/deals/[dealId]/track/page.tsx` (render the card);
  - `app/deals/[dealId]/offer/page.tsx` (closed summary; the hint is already present);
  - `components/client.tsx` (`DeclineButton` gains an optional reason select using `BUYER_DECLINE_REASONS`);
  - `app/proposal/[agreementId]/[version]/page.tsx`.
- Test: `tests/lib/outcome-card.test.ts`

**Content (spec §7.2–7.3):**
- **Card:**
  - the headline "Provisional contribution from modelled inputs" with its sentence;
  - the status label;
  - rows for proposed, accepted ("Not accepted" when null) and verified cash (incl. and excl. GST);
  - recorded signals (only the outcome records and existing events that exist, with their reason labels);
  - the collapsed calculation with inputs and disclosures;
  - the learning-policy paragraph verbatim.
- **Closed summary:** proposed value (if a draft existed), "Not accepted", "Payments recorded in Adaptive Deals: ₹0.", the reason label, and "Measurement: included — the denominator counts every eligible stalled deal, including those that never sign."

- [ ] **Step 1: Write the failing render tests:**
  - the learning-policy text equals the spec's paragraph exactly;
  - no "realised contribution" value is shown as a figure; the phrase appears only in the metric name;
  - the closed summary contains "Payments recorded in Adaptive Deals: ₹0." and not "verified cash".
- [ ] **Step 2: Run them and confirm they fail;** implement; run until they pass.
- [ ] **Step 3: Run tests, typecheck, lint and build;** check in the dev server.
- [ ] **Step 4: Commit** with message `Add outcome and learning card and closed-offer summary`.

**Phase 4 verification:**
- Tests, typecheck, lint and build pass.
- Asset check and protected diff pass.

---

# Phase 5: Browser verification and documentation

### Task 18: Rewrite the Playwright journey

**Files:**
- Modify: `e2e/journey.spec.ts` (rewrite), `playwright.config.ts` (unchanged unless a timeout needs raising)
- Screenshots: `artifacts/ui-review/`, new filenames only (below). Delete nothing. In particular, never touch the two pre-existing modified files `desktop-5-change-requested.png` and `desktop-7-other-outcomes.png`; obsolete images are left for the applicant to remove.

**Tests (spec §10.2), one `test()` each:**
1. **The 90-second storyboard driven by the demo bar.** At each beat, assert the banner headline, the stage tracker's current stage and the single `primary-action`. Screenshots: `desktop-1-understand`, `desktop-2-offer`, `desktop-3-preview`, `desktop-4-buyer-proposal`, `desktop-5-track-waiting`, `desktop-6-amendment`, `desktop-7-rescheduled`.
2. **Bar hidden:** the same merchant decisions are completed by clicking only product buttons; buyer steps happen on the buyer page; system steps are posted through `/api/actions` from the test (not through the UI).
3. **Next never approves:** after clicking Next on the offer step, no agreement has `merchantApproval` (read `.data-e2e/store.json`).
4. **Explicit time:** clicking "Advance simulated date to 28 Nov 2026" adds a clock advance and no notice; the next step sends it.
5. **Stale preview, failed send and retry:**
   - set `.data-e2e/presenter.json` `{"failNextSend":true}`;
   - approve, which lands on Offer with **Retry sending**;
   - `/proposal/agr-hero/v1` returns 404;
   - retry, which lands on Track.
6. **Legacy routes:** `/workspace`, `/clarification`, `/decision`, `/agreement` and `/timeline` each land on the current stage.
7. **Migration:**
   - write a v1-schema store (no `schemaVersion`) with a sent and accepted hero state → opens on Track;
   - write one with a sent agreement and no proposal message → banner "Saved deal records need review", **Inspect records** opens the audit drawer, and approval is refused.
8. **Audit:** source labels; attribution reflects the code fallback for the stored run; no presenter control (Run live, Fail next send) is reachable from the merchant frame or the drawer.
9. **Other outcomes:** live on `/presenter` only.
10. **Layout:** 390 × 844 with no horizontal scroll on every stage, the preview and the buyer page; the audit drawer is full-screen at 390. Screenshots: `mobile-1-understand`, `mobile-2-offer`, `mobile-3-buyer-proposal`, `mobile-4-track`.
11. **Keyboard:** tracker links; drawer focus trap, Escape and focus return; every `<details>` disclosure toggles with Enter and Space.
12. **Initial Offer viewport:** no rejection card and no "Peak funding requirement" visible before expanding.

- [ ] **Step 1: Write the spec file** with the 12 tests, using `page.getByTestId("primary-action")`, `getByTestId("status-banner")` and `getByTestId("stage-tracker")` (the data-testids added in Phase 2).
- [ ] **Step 2: Stop the dev server, run `npx playwright test`,** and fix the product (not the tests) until 12/12 pass.
- [ ] **Step 3: Visually review every screenshot.** Commit with message `Rewrite browser journey for the three-stage merchant flow`.

### Task 18b: Persona trust and comprehension checkpoint (stop for the applicant)

**No product code in this task.** Run it after Task 18 passes and before any documentation or recording.

- [ ] **Step 1: Prepare a review pack** in `docs/superpowers/plans/persona-checkpoint.md`:
  - links to the Task 18 screenshots for each storyboard beat (desktop and 390 px);
  - the spec §1.2 six questions;
  - per persona, which beats to review and the trust questions to ask.
  - The applicant names the five personas; the agent does not invent persona results.
- [ ] **Step 2: Stop and hand the pack to the applicant.** They run the persona review, recording counts and verbatim comments, no percentages, and decide which final copy or usability corrections to make.
- [ ] **Step 3: Apply only the corrections the applicant approves.** Copy wording, ordering and visibility of existing elements are in scope. Persona feature suggestions are not (no new features in this build). Re-run Task 18's suite after any change.
- [ ] **Step 4: Commit any approved corrections,** with message `Apply persona checkpoint corrections`, listing each correction and its source comment.

### Task 19: Documentation and release checks

**Files:**
- Modify: `DEMO_SCRIPT.md`, `ONE_PAGE_PRODUCT_NOTE.md`, `PRODUCT_DECISIONS.md`, `README.md`, `AI_BUILD_LOG.md` (append only)
- Create: `scripts/check-release.ts` and `package.json` script `"check:release": "tsx scripts/check-release.ts"`

**Content:**
- **Demo script = pitch narration:** the six-beat storyboard (spec §11). The "Say" column is the 90-second voice-over, naming only controls visible in the built flow. There is no separate pitch artifact to update.
- **Product note:**
  - replace the "Validation plan" item 2 (obtain and run the frozen set) with the completed frozen evaluation: 20 cases authored with Codex at the applicant's direction (agent-authored, non-independent), the prompts `extract.v2`, `clarify.v1` and `explain.v3`, and the recorded counts from `AI_BUILD_LOG.md`;
  - distinguish the provisional contribution from the intended metric;
  - add the learning policy;
  - leave the `[APPLICANT]` judgement prompts in place.
- **Product decisions:** the new architecture, `dealProgress` tables, delivery gate, closure rules, metric cutoff and disclosures, and migration.
- **README:** routes, demo bar, presenter page, audit drawer.
- **Build log:**
  - append an entry listing each phase, every updated test and its reason, verification results, and the unfamiliar-user protocol (results left for the applicant);
  - leave the `[APPLICANT]` sections untouched.
- **`scripts/check-release.ts`**, two modes (two release gates):
  - **Checks:**
    - (a) remaining `[APPLICANT]` placeholders in `ONE_PAGE_PRODUCT_NOTE.md` and `AI_BUILD_LOG.md`;
    - (b) banned phrases ("revenue recovered", "cash recovered", "guaranteed contribution", "confirmed via WhatsApp") in merchant-facing code (`app/deals`, `components/{deal,understand,offer,track,outcome-card.tsx,proposal-content.tsx}`) and in `DEMO_SCRIPT.md`;
    - (c) the factual product-note sections no longer mention obtaining or running the frozen set as future work.
  - **`npm run check:release -- --build`, the build-completion gate:** exits 0 when (b) and (c) pass. Remaining `[APPLICANT]` placeholders are listed as "awaiting applicant" and do not fail this gate; nothing else may fail it.
  - **`npm run check:release -- --submission`, the submission-readiness gate:** exits 0 only when (a), (b) and (c) all pass. It must pass after the applicant completes their sections and before submission.

- [ ] **Step 1: Update the docs.**
- [ ] **Step 2: Implement `check-release.ts` and run both modes.**
  - `--build` must exit 0. Its output lists the `[APPLICANT]` placeholders awaiting the applicant.
  - `--submission` is expected to exit 1 for exactly those placeholders, and for nothing else.
  - Report both results.
- [ ] **Step 3: Final verification:**
  - `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx playwright test`;
  - immutable-asset check (44/44), prompt hashes equal to `FREEZE.json`, empty protected diff;
  - credential scan (`rzp_(live|test)_[A-Za-z0-9]{8,}|gsk_[A-Za-z0-9]{20,}|sk-ant-` across tracked and new files);
  - no Groq calls.
- [ ] **Step 4: Commit** with message `Update demo script, product note, decisions, README and build log for the redesign`.

---

## Spec coverage check

| Spec section | Task(s) |
|---|---|
| §1.5–1.6 boundaries | Global constraints; phase verification |
| §2.1 routes, redirects, not-found | 9, 12 |
| §2.2 frame, banner, tracker | 9 |
| §2.3 current / settled / upcoming | 10, 11, 12 |
| §3.1 statuses, transitions | 1 |
| §3.2 stored state, fingerprint, presenter store | 2, 3, 4 |
| §3.3 actions, send preconditions, closures, interpretation, buyer reasons | 4, 5 |
| §3.4 `dealProgress`, review state, Track table, invariants | 6 |
| §4 Understand | 10 |
| §5.1–5.4 Offer, preview, settled | 7, 11 |
| §5.5 amendment delivery gate | 4 |
| §5.6 shared content | 8 |
| §5.7 Don't proceed | 5, 11 |
| §6 Track | 12 |
| §7 outcomes, metric, closed summary, hint | 16, 17 (hint in 11) |
| §8.1 demo bar, typed steps, explicit time | 13 |
| §8.2 presenter, live-run isolation | 14 |
| §8.3 audit drawer | 15 |
| §9 migration | 3 (review state in 6) |
| §10 verification | Each task, 18, 18b, 19 |
| §11 docs, release check | 19 |
