# Persona P0 Integrity and Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Adaptive Deals show the current commercial truth, responsible actor, safe next action, contractual conditions and financial time basis, then replace repeated detail with a compact current-agreement summary.

**Architecture:** Extend the existing additive store and pure `dealProgress` derivation rather than adding routes or a parallel workflow. New action-item dispositions and decision-evidence guards sit in the service layer; canonical conditions remain inside hashed agreement terms. Pure view-model modules produce amendment differences, financial labels and current-agreement summaries for the existing Server Component pages.

**Tech Stack:** Next.js 16.3.8 App Router, React 19 Server/Client Components, TypeScript, Zod, Vitest, Playwright.

**Spec:** `docs/reviews/2026-10-04-five-persona-prioritised-change-list.md`

## Global Constraints

- Implement P0.1–P0.5 only. P1 manual-interpretation, revision-layout and mobile-comparison work stays out of scope except where a P0 state must render correctly at 390 px.
- Preserve option enumeration, commercial checks and economics. Do not change the frozen AI prompts, schemas, validators, run records, evaluation cases/results, committed live runs or `data/demo-run.json`.
- Preserve canonical hashing: every binding condition and contractual change must live in `CanonicalTerms` before merchant approval and buyer acceptance.
- Preserve the deterministic narrow reply parser. Do not introduce a new AI task or infer resolution from free text.
- Preserve agreement-version, mandate, collection and duplicate-payment guards. No message action may move money.
- Store additions are deterministic, additive and idempotently migrated. Inconsistent history sets `reviewRequired`; migration never invents buyer acceptance or delivery.
- All product figures come from canonical terms, attempts, the ledger or the outcome calculation. No display constants for commercial values.
- Simulated payment/channel states remain explicitly labelled. Do not add a fake checkout, WhatsApp composer, bank settlement or delivery-completion workflow.
- Keep Server Components as the page/data boundary and small Client Components for interactions, following the bundled Next.js 16.3.8 guidance.
- Preserve the two existing user-modified screenshots and the untracked persona-review evidence in the original checkout.
- Before completion, all 44 protected paths in `docs/superpowers/plans/frozen-assets.txt` must have no content diff from baseline.

## Review Focus

- A buyer sends a general proposal change while an amendment is waiting for acceptance: the new request must own the action without mutating either version.
- A buyer sends an acknowledgement after an offer is selected: it must not stale the decision, while a corrective clarification must.
- A full-scope option above ₹60,000 is selected: the buyer cannot accept without the MD-approval attestation, including on a later amendment.
- A declined/deferred/annual deal is viewed after the 90-day cutoff: proposed, current-contract, operational-collection and windowed-outcome figures must remain distinct.
- An old version or stale request is opened directly: it stays historical and can never become the current action or current-agreement summary.

---

### Task 1: Unified unresolved-work records and truthful progress precedence

**Files:**
- Modify: `lib/deal-records.ts`
- Modify: `lib/migrate.ts`
- Modify: `lib/service.ts`
- Modify: `lib/progress.ts`
- Modify: `lib/views.ts`
- Modify: `app/api/actions/route.ts`
- Modify: `app/deals/[dealId]/track/page.tsx`
- Modify: `components/client.tsx`
- Modify: `components/conversation-thread.tsx`
- Test: `tests/lib/migrate.test.ts`
- Test: `tests/lib/progress.test.ts`
- Test: `tests/lib/progress-journey.test.ts`
- Test: `tests/lib/reply-outcomes.test.ts`
- Test: `tests/lib/connected-journey.test.ts`

**Interfaces:**
- Produces: `WorkDisposition`, `WorkDispositionKind`, `unresolvedWork(state)`, `reviewWork(sourceKind, sourceId, disposition, note?)`, and new `DealProgress` rules `track.buyer_request`, `track.conflicting_evidence`, `track.not_restructured`, `track.follow_up_pending`.
- Consumes: existing `ConversationItem`, `ChangeRequest`, `HandledMessage`, `OutcomeRecord`, `noticeReplyOutcome` and current-version selection rules.
- Later tasks use: the shared current action from `dealProgress`; no page may re-derive ownership independently.

- [ ] **Step 1: Write failing store and migration tests**

Add assertions that schema version 3 seeds `workDispositions: []`, migrates old stores idempotently, retains `handledMessages`, and treats migrated handled messages as follow-up records rather than proof of resolution.

- [ ] **Step 2: Run migration tests and verify RED**

Run: `npm test -- tests/lib/migrate.test.ts`

Expected: FAIL because schema version 3 and `workDispositions` do not exist.

- [ ] **Step 3: Add the additive work-disposition model and migration**

Define:

```ts
export type WorkSourceKind = "message" | "change_request";
export type WorkDispositionKind = "keep_current_terms" | "handled_outside" | "follow_up_pending";
export interface WorkDisposition {
  id: string;
  sourceKind: WorkSourceKind;
  sourceId: string;
  kind: WorkDispositionKind;
  note: string | null;
  actor: "merchant";
  at: string;
}
```

Add `workDispositions: WorkDisposition[]` to `DemoState`, seed it empty, set `STORE_SCHEMA_VERSION = 3`, and default it without rewriting existing records. Existing `handledMessages` remain historical evidence; absent an explicit resolving disposition, they mean follow-up is pending.

- [ ] **Step 4: Run migration tests and verify GREEN**

Run: `npm test -- tests/lib/migrate.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing progress and service tests for all unresolved-work states**

Cover these exact cases:

- A current proposal `change_request` produces merchant action **Review buyer request** before `track.sent_awaiting_buyer`.
- A counter-request on a merchant-approved amendment takes precedence over `track.amendment_buyer`.
- `not_restructured` produces **The requested date does not fit the confirmed limits. The original payment remains scheduled. Review with the buyer.** until disposition.
- A second conflicting notice reply takes precedence over the first open payment-change request.
- `follow_up_pending` remains action-required and shows its saved note/time; `keep_current_terms` and `handled_outside` resolve only their own source.
- An acknowledgement creates no action item.
- Stale earlier-version requests never become current.

- [ ] **Step 6: Run focused tests and verify RED**

Run: `npm test -- tests/lib/progress.test.ts tests/lib/progress-journey.test.ts tests/lib/reply-outcomes.test.ts tests/lib/connected-journey.test.ts`

Expected: FAIL on current waiting/up-to-date precedence and missing disposition action.

- [ ] **Step 7: Implement `unresolvedWork` and `reviewWork`**

Use deterministic references only:

- Proposal/amendment change request: inbound `ConversationItem.kind === "change_request"` for the latest delivered/current version with no resolving disposition.
- Conflicting notice evidence: a merchant-attention reply linked to the active version/payment while an open change request exists.
- Failed restructuring: current-version `ChangeRequest.state === "not_restructured"` with no resolving disposition.
- Existing handled message with no resolution: `follow_up_pending` and visible handling note.

`reviewWork` accepts only the three stable dispositions. `keep_current_terms` records that the current proposal/payment remains unchanged. `handled_outside` records the handoff and leaves terms/ledger untouched. `follow_up_pending` keeps the source actionable. Reject unknown, stale-version and already-resolved sources.

Expose one validated API action:

```ts
{ action: "review_work"; sourceKind: WorkSourceKind; sourceId: string; disposition: WorkDispositionKind; note?: string }
```

- [ ] **Step 8: Make `dealProgress` consume unresolved work in one precedence table**

Order Track states: migration review → terminal → unresolved current-version buyer request/counter-request → amendment merchant decision → amendment buyer decision → conflicting notice evidence → open date request → failed restructuring/follow-up pending → other merchant attention → buyer setup/system/payment states.

Derive buyer historical/declined/superseded next steps from the same facts through Task 5; Task 1 must expose the required source/version/disposition in `ProgressFacts`.

- [ ] **Step 9: Render the current work item and bounded dispositions**

On Track, put the action item before payments and outcomes. Show source text, unchanged terms/payment consequence, saved follow-up note, and buttons appropriate to the source:

- **Keep current terms**
- **Handle outside Adaptive Deals**
- **Follow-up still pending**

For unsupported free text, use **Review the buyer's request and agree the next step.** Use **ask for one exact date** only when the recorded reason is a date ambiguity.

- [ ] **Step 10: Run task tests and verify GREEN**

Run: `npm test -- tests/lib/migrate.test.ts tests/lib/progress.test.ts tests/lib/progress-journey.test.ts tests/lib/reply-outcomes.test.ts tests/lib/connected-journey.test.ts`

Expected: PASS; no network/model calls.

- [ ] **Step 11: Commit**

```bash
git add lib/deal-records.ts lib/migrate.ts lib/service.ts lib/progress.ts lib/views.ts app/api/actions/route.ts app/deals/[dealId]/track/page.tsx components/client.tsx components/conversation-thread.tsx tests/lib/migrate.test.ts tests/lib/progress.test.ts tests/lib/progress-journey.test.ts tests/lib/reply-outcomes.test.ts tests/lib/connected-journey.test.ts
git commit -m "fix: keep unresolved buyer work actionable"
```

### Task 2: Decision-evidence review boundary for stale offers and amendments

**Files:**
- Modify: `lib/deal-records.ts`
- Create: `lib/decision-evidence.ts`
- Modify: `lib/service.ts`
- Modify: `lib/progress.ts`
- Modify: `app/deals/[dealId]/offer/page.tsx`
- Modify: `app/deals/[dealId]/offer/preview/page.tsx`
- Modify: `app/api/actions/route.ts`
- Test: `tests/lib/decision-evidence.test.ts`
- Test: `tests/lib/delivery-flow.test.ts`
- Test: `tests/lib/service-journey.test.ts`
- Test: `tests/lib/progress.test.ts`

**Interfaces:**
- Consumes: Task 1 `WorkDisposition[]` and `reviewWork`.
- Produces: `decisionEvidenceSnapshot(state): string[]`, `unreviewedDecisionEvidence(state): ConversationItem[]`, and `SelectedOption.evidenceMessageIds: string[]`.
- Later tasks consume: `isDraftStale` and service approval/send gates only; UI does not decide evidence relevance.

- [ ] **Step 1: Write failing pure evidence tests**

Pin the bounded rule:

- Snapshot includes the buyer replies that supported recorded clarification answers when selection occurs.
- A later non-acknowledgement reply to one of those clarification threads is unreviewed commercial evidence.
- “Thanks”/acknowledgement is ignored.
- A later proposal request is owned by Task 1, not duplicated as decision evidence.
- A disposition **keep_current_terms** removes only its referenced evidence item from the unreviewed set.

- [ ] **Step 2: Run the pure test and verify RED**

Run: `npm test -- tests/lib/decision-evidence.test.ts`

Expected: FAIL because the evidence snapshot functions and selected-option field do not exist.

- [ ] **Step 3: Implement the evidence snapshot and additive selected-option field**

Add `evidenceMessageIds: string[]` to `SelectedOption`. Set it whenever an option is selected/refreshed. Migration defaults old selections to `[]` and therefore requires explicit review if newer relevant messages exist; it never claims a message was reviewed.

Do not put message IDs inside canonical terms or the terms hash. They protect the decision process, not the contract.

- [ ] **Step 4: Write failing service guard tests**

Exercise the reproduced failure:

1. Prepare ₹46,020 draft.
2. Add buyer reply: **Correction: our available budget is now only ₹20,000 including GST. Please do not send the ₹46,020 proposal.**
3. Assert preview/approval/send are blocked and progress is **Review newer buyer evidence before sending this offer.**
4. Record **keep_current_terms** with a merchant note; assert the exact draft must be reviewed again before approval.
5. Record **handled_outside**; assert no proposal is delivered and terms/collections do not change.

Also test two notice-date replies: the second blocks `proposeAmendment`; explicit **keep_current_terms** permits drafting only from the still-open first request and records that choice.

- [ ] **Step 5: Run service tests and verify RED**

Run: `npm test -- tests/lib/delivery-flow.test.ts tests/lib/service-journey.test.ts tests/lib/progress.test.ts`

Expected: FAIL because current fingerprinting ignores later messages.

- [ ] **Step 6: Enforce the boundary in every commercial action**

Before `reviewBuyerProposal`, `approveDraft`, `sendProposal`, `proposeAmendment` and `approveAmendment`, refuse relevant unreviewed evidence with one `ActionError`. Refresh selection fingerprint/evidence snapshot only after the merchant disposition, then require a fresh preview; never silently reuse prior approval.

Render the evidence-review card on Offer/Preview with old confirmed value, new message, source/time and the Task 1 dispositions. Do not parse the ₹20,000 correction into a new engine input in this task.

- [ ] **Step 7: Run task tests and verify GREEN**

Run: `npm test -- tests/lib/decision-evidence.test.ts tests/lib/delivery-flow.test.ts tests/lib/service-journey.test.ts tests/lib/progress.test.ts`

Expected: PASS; late evidence blocks action, acknowledgement does not, accepted agreements never mutate.

- [ ] **Step 8: Commit**

```bash
git add lib/deal-records.ts lib/decision-evidence.ts lib/service.ts lib/progress.ts app/deals/[dealId]/offer/page.tsx app/deals/[dealId]/offer/preview/page.tsx app/api/actions/route.ts tests/lib/decision-evidence.test.ts tests/lib/delivery-flow.test.ts tests/lib/service-journey.test.ts tests/lib/progress.test.ts
git commit -m "fix: block stale commercial decisions"
```

### Task 3: Option attribution and approval-condition continuity

**Files:**
- Modify: `domain/agreement.ts`
- Modify: `lib/views.ts`
- Modify: `lib/offer-copy.ts`
- Modify: `app/deals/[dealId]/offer/page.tsx`
- Modify: `components/offer/recommendation.tsx`
- Modify: `components/client.tsx`
- Modify: `components/proposal-content.tsx`
- Test: `tests/domain/agreement.test.ts`
- Test: `tests/lib/offer-copy.test.ts`
- Test: `tests/lib/offer-stage.test.ts`
- Test: `tests/lib/views.test.ts`
- Test: `tests/lib/service-journey.test.ts`

**Interfaces:**
- Produces: canonical condition `buyer_attests_required_approval`, `ProposalView.authorityReason: "phase_scope" | "required_approval" | null`, and recommendation presentation mode `"recommended" | "merchant_selected"`.
- Consumes: engine `EvaluatedStructure.approval` and existing `buyerAccept(..., { authorityConfirmed })`.
- Task 4 consumes: canonical terms and view conditions; it does not reinterpret engine checks.

- [ ] **Step 1: Write failing canonical-condition tests**

Assert:

- Phase scope retains `buyer_confirms_authority_for_phase_scope`.
- Every evaluated option with `approval === "requires_approval"` adds `buyer_attests_required_approval` before hashing.
- `buyerAccept` rejects either required condition when `authorityConfirmed` is false.
- A within-limit annual/phase option does not gain the MD-attestation condition.

- [ ] **Step 2: Run domain tests and verify RED**

Run: `npm test -- tests/domain/agreement.test.ts tests/lib/service-journey.test.ts`

Expected: FAIL because approval status is not currently included in canonical conditions.

- [ ] **Step 3: Add approval status to canonical agreement creation**

In `createAgreementVersion`, merge the structure requirements with `buyer_attests_required_approval` when `evaluated.approval === "requires_approval"`; sort/dedupe conditions before hashing. Keep `buildCanonicalTerms` deterministic.

Map the two reasons to buyer copy:

- Phase: **I confirm I am authorised to purchase this standalone scope.**
- Approval limit: **I confirm the required internal approval has been obtained. Adaptive Deals does not verify the approver's identity.**

- [ ] **Step 4: Write failing option-attribution tests**

Select the annual option and assert:

- Main badge is **Selected by you**, not **Recommended offer**.
- Rationale and condition come from that annual engine result and do not say it fits the approval limit.
- The engine-recommended option retains **Recommended offer**.
- Proposal preview and buyer page show the approval attestation.

- [ ] **Step 5: Run view tests and verify RED**

Run: `npm test -- tests/lib/offer-copy.test.ts tests/lib/offer-stage.test.ts tests/lib/views.test.ts`

Expected: FAIL on current fixed recommendation badge/fallback explanation and missing authority reason.

- [ ] **Step 6: Implement selected/recommended presentation and accurate fallback copy**

Pass presentation mode from Offer, derive default explanation from the selected evaluated structure's approval and payment pattern, and preserve AI attribution only where the validated AI text belongs to that structure.

- [ ] **Step 7: Run task tests and verify GREEN**

Run: `npm test -- tests/domain/agreement.test.ts tests/lib/service-journey.test.ts tests/lib/offer-copy.test.ts tests/lib/offer-stage.test.ts tests/lib/views.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add domain/agreement.ts lib/views.ts lib/offer-copy.ts app/deals/[dealId]/offer/page.tsx components/offer/recommendation.tsx components/client.tsx components/proposal-content.tsx tests/domain/agreement.test.ts tests/lib/offer-copy.test.ts tests/lib/offer-stage.test.ts tests/lib/views.test.ts tests/lib/service-journey.test.ts
git commit -m "fix: preserve offer approval conditions"
```

### Task 4: Complete amendment difference summary

**Files:**
- Create: `lib/amendment-diff.ts`
- Modify: `components/track/amendment-card.tsx`
- Modify: `app/proposal/[agreementId]/[version]/page.tsx`
- Modify: `components/proposal-content.tsx`
- Test: `tests/lib/amendment-diff.test.ts`
- Test: `tests/lib/views.test.ts`
- Test: `tests/lib/connected-journey.test.ts`

**Interfaces:**
- Consumes: canonical terms for `fromVersion` and `toVersion`, plus existing `Amendment.change`/`mandateFit`.
- Produces: `amendmentDiff(from: CanonicalTerms, to: CanonicalTerms): AmendmentDifference[]` with stable categories `payment_date`, `planned_invoice_date`, `amount`, `scope`, `service_period`, `mandate`.
- Task 5 current-agreement summary uses the active version only and does not recompute diffs.

- [ ] **Step 1: Write the failing pure diff tests**

For the hero amendment assert:

- Payment date changes 1 Dec → 21 Dec.
- Planned invoice date changes 1 Dec → 21 Dec and is labelled planned/not issued.
- Amount is unchanged.
- Scope, exclusions and service months are unchanged.
- Existing mandate still fits.

Also mutate scope in a fixture and assert the helper never reports it unchanged.

- [ ] **Step 2: Run the pure test and verify RED**

Run: `npm test -- tests/lib/amendment-diff.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the canonical diff helper**

Compare terms structurally by stable IDs. Return values from the terms; do not use display copy or the `Amendment.change` shortcut as the sole source.

- [ ] **Step 4: Write failing merchant/buyer rendering tests**

Assert both views show:

- **Payment date revised.**
- **Planned invoice date revised (not an issued invoice).**
- **Agreed scope and service months unchanged.**
- No **everything else stays unchanged** sentence.

- [ ] **Step 5: Run rendering tests and verify RED**

Run: `npm test -- tests/lib/views.test.ts tests/lib/connected-journey.test.ts`

Expected: FAIL on incomplete current summary.

- [ ] **Step 6: Render the same structured differences on merchant and buyer views**

Keep full canonical terms expandable and the existing hash approval/acceptance. Do not change amendment domain behaviour or invoice scheduling in this task.

- [ ] **Step 7: Run task tests and verify GREEN**

Run: `npm test -- tests/lib/amendment-diff.test.ts tests/lib/views.test.ts tests/lib/connected-journey.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/amendment-diff.ts components/track/amendment-card.tsx app/proposal/[agreementId]/[version]/page.tsx components/proposal-content.tsx tests/lib/amendment-diff.test.ts tests/lib/views.test.ts tests/lib/connected-journey.test.ts
git commit -m "fix: disclose complete amendment differences"
```

### Task 5: Contract-state and time-bounded financial presentation

**Files:**
- Create: `lib/financial-view.ts`
- Modify: `lib/outcome.ts`
- Modify: `components/outcome-card.tsx`
- Modify: `app/deals/[dealId]/track/page.tsx`
- Test: `tests/lib/financial-view.test.ts`
- Test: `tests/lib/outcome.test.ts`
- Test: `tests/lib/outcome-card.test.ts`
- Test: `tests/lib/connected-journey.test.ts`

**Interfaces:**
- Consumes: current accepted `AgreementVersion | null`, canonical payment totals, `CollectionAttempt[]`, `OutcomeSummary`, simulated current time.
- Produces: `contractFinancialView(args): ContractFinancialView` with `state: "proposed" | "declined" | "accepted"`, `contractTotalPaise`, `collectedPaise`, `remainingPaise`, GST/pre-GST splits, `nextPayment`, and explicit labels.
- Task 6 consumes: this view inside the compact current-agreement summary.

- [ ] **Step 1: Write failing financial-view tests**

Pin five fixtures:

- Sent/unaccepted: proposed schedule only; no operational remaining/GST-to-collect.
- Declined: **No accepted contract recorded in Adaptive Deals** and proposed terms retained only as history.
- Phase after first payment: collected ₹23,010, remaining ₹23,010 incl. GST.
- Annual fully collected after cutoff: operational collected ₹1,41,600; windowed receipts ₹42,480 with cutoff shown.
- Deferred first receipt: operational collected ₹11,800; windowed receipts ₹0 with explanation.

- [ ] **Step 2: Run the pure test and verify RED**

Run: `npm test -- tests/lib/financial-view.test.ts`

Expected: FAIL because the view model does not exist.

- [ ] **Step 3: Implement contract financial derivation**

Count only successful attempts linked to the accepted/current agreement for operational collections. Do not label future schedule value as owed before acceptance. Keep pre-GST and GST arithmetic from canonical terms/attempts.

- [ ] **Step 4: Write failing outcome/Track rendering tests**

Assert exact labels:

- **Payments recorded within the 90-day window** with visible cutoff.
- **Full-contract forecast** and **Provisional through [date]** where compared.
- **Modelled from planned service dates; actual delivery is not recorded.**
- Active Track leads with remaining amount including GST and next payment/exception.

- [ ] **Step 5: Run rendering tests and verify RED**

Run: `npm test -- tests/lib/outcome.test.ts tests/lib/outcome-card.test.ts tests/lib/connected-journey.test.ts`

Expected: FAIL on current unqualified labels and pre-acceptance balance presentation.

- [ ] **Step 6: Render the distinct financial scopes**

Keep the outcome arithmetic and frozen metric definition unchanged. Move the outcome card below operational/current-agreement facts. Preserve missing-refund/fee/future-cost disclosures.

- [ ] **Step 7: Run task tests and verify GREEN**

Run: `npm test -- tests/lib/financial-view.test.ts tests/lib/outcome.test.ts tests/lib/outcome-card.test.ts tests/lib/connected-journey.test.ts`

Expected: PASS; all exact fixture amounts reconcile.

- [ ] **Step 8: Commit**

```bash
git add lib/financial-view.ts lib/outcome.ts components/outcome-card.tsx app/deals/[dealId]/track/page.tsx tests/lib/financial-view.test.ts tests/lib/outcome.test.ts tests/lib/outcome-card.test.ts tests/lib/connected-journey.test.ts
git commit -m "fix: separate contract and outcome finances"
```

### Task 6: Compact current-agreement and state-aware buyer summary

**Files:**
- Create: `lib/current-agreement.ts`
- Create: `components/track/current-agreement.tsx`
- Modify: `components/deal/stage-shell.tsx`
- Modify: `app/deals/[dealId]/layout.tsx`
- Modify: `app/deals/[dealId]/track/page.tsx`
- Modify: `lib/views.ts`
- Modify: `app/proposal/[agreementId]/[version]/page.tsx`
- Modify: `components/proposal-content.tsx`
- Test: `tests/lib/current-agreement.test.ts`
- Test: `tests/lib/views.test.ts`
- Test: `tests/lib/connected-journey.test.ts`

**Interfaces:**
- Consumes: Task 1 `DealProgress`, Task 4 canonical amendment truth, Task 5 `ContractFinancialView`, active/historical agreement version and package names.
- Produces: `currentAgreementSummary(args): CurrentAgreementSummary` with `kind`, `title`, `version`, included/excluded scope, planned service period, later-work statement, financial summary, readiness boundary and next action.
- UI contract: exactly one compact summary above payments/outcomes; details remain expandable.

- [ ] **Step 1: Write failing summary tests**

Cover proposed phase, accepted phase v1, active phase v2, full annual, deferred annual, declined and superseded versions. Assert:

- Phase title never says accepted annual contract.
- Website fixes once; search/reporting Nov–Jan; social media excluded; no later phase agreed.
- V2 uses current payment facts and retains Nov–Jan service period.
- Paid phase and annual remain active with planned service end; neither claims delivery complete.
- Readiness wording distinguishes acceptance, payment and mandate from **Delivery readiness is not tracked here**.
- Historical version cannot become the current summary.

- [ ] **Step 2: Run the pure test and verify RED**

Run: `npm test -- tests/lib/current-agreement.test.ts`

Expected: FAIL because the summary module does not exist.

- [ ] **Step 3: Implement the pure summary and dynamic deal title**

Derive names/months from canonical terms and hero package metadata. The page heading uses the proposed/current structure title; original **Annual digital marketing opportunity** appears only as secondary context where useful.

- [ ] **Step 4: Write failing buyer lifecycle tests**

Assert:

- Sent: explains review/response and proposed payment setup.
- Change requested: **Waiting for Pinecone Media Works** above response controls.
- Accepted: shows upfront pending/paid, mandate pending/confirmed, next debit, failure/retry and all payments collected from recorded events.
- Declined: historical, no payment setup instructions.
- Superseded: historical with current-version link, no forward-looking old schedule instructions.
- Accepted revision: revised schedule is in effect; no “until you accept” text.
- All payment/channel states remain labelled simulated.

- [ ] **Step 5: Run buyer view tests and verify RED**

Run: `npm test -- tests/lib/views.test.ts tests/lib/connected-journey.test.ts`

Expected: FAIL on current static `nextSteps` and incomplete payment state.

- [ ] **Step 6: Render the compact merchant summary and state-aware buyer status**

Keep hashes, detailed schedules and audit provenance collapsed. The compact summary replaces repeated heading/payment/context content; do not add another always-expanded dashboard card.

- [ ] **Step 7: Run task tests and verify GREEN**

Run: `npm test -- tests/lib/current-agreement.test.ts tests/lib/views.test.ts tests/lib/connected-journey.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/current-agreement.ts components/track/current-agreement.tsx components/deal/stage-shell.tsx app/deals/[dealId]/layout.tsx app/deals/[dealId]/track/page.tsx lib/views.ts app/proposal/[agreementId]/[version]/page.tsx components/proposal-content.tsx tests/lib/current-agreement.test.ts tests/lib/views.test.ts tests/lib/connected-journey.test.ts
git commit -m "feat: focus Track on the current agreement"
```

### Task 7: Whole-flow browser proof, protected-boundary verification and documentation

**Files:**
- Modify: `e2e/journey.spec.ts`
- Modify: `PRODUCT_DECISIONS.md`
- Modify: `AI_BUILD_LOG.md`
- Create: `docs/reviews/2026-10-04-p0-build-verification.md`

**Interfaces:**
- Consumes: all Task 1–6 interfaces through public routes and API actions.
- Produces: browser evidence for the final demo and a verification record; no new product behaviour.

- [ ] **Step 1: Add failing browser journeys for the five P0 risks**

Add serial journeys that prove:

1. Proposal change request changes merchant ownership and explicit **Keep current terms** disposition restores truthful waiting state.
2. Late clarification correction blocks preview/send until reviewed; no delivery occurs while blocked.
3. Annual selected option says **Selected by you** and buyer acceptance requires MD-approval attestation.
4. Failed restructure stays action-required with original payment visible.
5. Phase v2 summary shows current scope/service period/remaining amount, while annual/deferred/declined states show correct financial scopes.

Extend the 390 px test only for overflow/focus regressions caused by P0 components; do not redesign P1 comparisons.

- [ ] **Step 2: Run new browser tests and verify RED before final wiring**

Run: `npm run test:e2e -- --grep "P0"`

Expected: FAIL on at least one assertion before the final page wiring is complete. If Tasks 1–6 already make every test pass, record that finding and add the missing user-visible assertion rather than weakening the test.

- [ ] **Step 3: Complete only the wiring/documentation needed by the failing journeys**

Document these product decisions:

- Messages can block commercial actions without entering canonical terms.
- Only explicit merchant disposition resolves an action item.
- MD approval is buyer-attested, not identity-verified.
- Operational collections and the 90-day outcome window are distinct.
- Delivery dates are planned/modelled; actual completion is outside Adaptive Deals.

The AI build log must say no prompt/schema/model/evaluation change was made and no frozen run was rerun.

- [ ] **Step 4: Run the full verification suite**

Run sequentially:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Expected: all pass. Record exact counts; do not reuse prior counts.

- [ ] **Step 5: Verify the protected boundary**

Use `docs/superpowers/plans/frozen-assets.txt` to compare every listed path against the implementation branch's merge base. Confirm:

- 44/44 protected paths unchanged.
- No live model call or frozen evaluation rerun.
- No diff in `ai/`, `evaluation/`, `data/live-runs/`, `data/demo-run.json`, `domain/engine.ts`, `domain/checks.ts`, `domain/economics.ts` or `domain/replies.ts`.

- [ ] **Step 6: Write the verification record**

In `docs/reviews/2026-10-04-p0-build-verification.md`, record commits, exact checks/counts, protected-path result, known simulated boundaries, screenshots intentionally not regenerated, and any deferred minor findings from final review.

- [ ] **Step 7: Commit**

```bash
git add e2e/journey.spec.ts PRODUCT_DECISIONS.md AI_BUILD_LOG.md docs/reviews/2026-10-04-p0-build-verification.md
git commit -m "test: verify persona P0 journeys"
```

## Completion criteria

- Tasks 1–7 committed independently with their named tests passing.
- Full unit/integration, typecheck, lint, production build and browser suite pass from committed code.
- Final whole-branch review has no unresolved Critical or Important findings.
- Every review finding fixed during the final pass has a test observed RED then GREEN.
- Protected paths remain unchanged and no AI/frozen evaluation is rerun.
- The working merchant and buyer views answer the seven release questions in the spec without Audit.
- P1 and explicitly deferred productisation features remain absent.
