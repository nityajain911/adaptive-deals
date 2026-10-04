# Judge-proof Conversations and Scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every clarification direction work, give the hero recommendation credible conversational evidence, and demonstrate three materially different commercial decisions through one active demo workspace.

**Architecture:** Preserve every historical AI artifact and add an application-level `decisionBranch` for answer combinations the parent replay never saw. Recompute branch outcomes through the unchanged domain engine, use code fallback explanations with explicit attribution, and add a `caseId`-driven catalog that atomically reseeds the existing single store. The pre-acceptance counter-offer loop remains a later go/no-go build.

**Tech Stack:** Next.js 16.3.8 App Router, React 19, TypeScript 5, Zod 4, Vitest 5, Playwright 1.63, local JSON store, existing deterministic domain engine and immutable AI replay records.

**Spec:** `docs/superpowers/specs/2026-10-04-judge-proof-conversations-design.md`

## Global Constraints

- Work in `/Users/nityajain/Documents/Resolve Razorpay/adaptive-deals-build/adaptive-deals/.worktrees/persona-p0` on `codex/persona-p0`.
- Read `AGENTS.md` and the relevant Next.js 16.3.8 guides under `node_modules/next/dist/docs/` before route or navigation work.
- Keep every path in `docs/superpowers/plans/frozen-assets.txt` byte-for-byte unchanged.
- Do not edit `ai/`, the old run-record schema, frozen or development evaluation data, historical results, existing committed live runs or `data/demo-run.json`.
- Keep structure enumeration, checks, economics, GST/date normalisation, agreement hashing, collections, amendments and the primary metric unchanged.
- All commercial figures come from the engine; a branch stores answers and provenance, not copied calculation results.
- Unknown and mixed answers remain unresolved. Never infer a supported value from “not sure”.
- Use one active store. Starting another case explicitly resets the current demo and does not claim to preserve its progress.
- No external model call occurs until the user explicitly approves the capped call phase.
- Preserve the two user-owned screenshots `artifacts/ui-review/desktop-5-change-requested.png` and `artifacts/ui-review/desktop-7-other-outcomes.png`.
- Use test-first changes and one focused commit per task.

## Review Focus

1. A branch constructed from a changed answer must remain renderable after process reload and must never acquire the parent run's AI attribution — covered in Tasks 1–3.
2. A partially constructed branch or an unknown case must leave the previous store intact — covered in Tasks 2 and 7.
3. “Different GST bases”, “not sure” and custom text without valid evidence must remain unresolved without creating an agreement, payment or ledger change — covered in Task 4.
4. Selecting and resetting cases must never mix messages, buyer identity, run IDs or outcomes — covered in Tasks 6–8.
5. A provider miss in a final recorded case must be retained and shown through correction or code fallback rather than silently rerun — covered in Task 9.

---

### Task 1: Pure decision-branch derivation

**Files:**
- Create: `lib/decision-branch.ts`
- Create: `tests/lib/decision-branch.test.ts`

**Interfaces:**
- Consumes: `RunOutcome`, `RunRecord`, `RecordedAnswer`, `DealContext`, `evaluateDeal`, `applyClarificationAnswer`, `interpretExplanation` and the existing engine input.
- Produces:
  - `DecisionBranch` with schema `adaptive-deals.decision-branch.v1`, `branchId`, `parentRunId`, `createdAt`, `answers`, `reason` and `explanationSource`.
  - `canonicalAnswers(answers: RecordedAnswer[]): string`.
  - `answersMatchRecorded(source: RunRecord, answers: RecordedAnswer[]): boolean`.
  - `deriveBranchOutcome(args: { initial: RunOutcome; branch: DecisionBranch; deal: DealContext }): RunOutcome`.

- [ ] **Step 1: Write failing tests for answer comparison and branch derivation**

Test that canonical comparison ignores array order but includes question ID, supported value, answer text, evidence channel and answer time. Test GST `yes`/`no` and approval `per_contract`/`per_payment`, a code fallback explanation, engine-derived figures and rejection of an unsupported answer value.

- [ ] **Step 2: Run the focused test and confirm the new module is missing**

Run: `npm test -- tests/lib/decision-branch.test.ts`  
Expected: FAIL because `lib/decision-branch.ts` does not exist.

- [ ] **Step 3: Implement the pure branch functions**

Rebuild the profile by applying each answer to the corresponding existing clarification question, evaluate all templates with the unchanged engine, and call the existing explanation interpreter with no model output to obtain its documented code fallback. Keep `initial.record` as parent evidence; never mutate it or claim a new AI step.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- tests/lib/decision-branch.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/decision-branch.ts tests/lib/decision-branch.test.ts
git commit -m "feat: derive replay-safe decision branches"
```

---

### Task 2: Persist and reload changed-answer branches

**Files:**
- Modify: `lib/service.ts`
- Modify: `lib/migrate.ts`
- Modify: `tests/lib/migrate.test.ts`
- Create: `tests/lib/decision-branch-service.test.ts`

**Interfaces:**
- Consumes: Task 1's `DecisionBranch`, `answersMatchRecorded` and `deriveBranchOutcome`.
- Produces:
  - `DemoState.decisionBranch: DecisionBranch | null`.
  - `decisionAnswers(state: DemoState): RecordedAnswer[]`.
  - `initialOutcomeForBranch(state: DemoState): Promise<RunOutcome>`.
  - branch-aware `currentOutcome(state)`.
  - unchanged public `recordAnswers(inputs)` behavior for the original recorded combination.

- [ ] **Step 1: Write failing service tests for the four answer combinations**

For each GST/approval combination, reset, send and answer both questions, adopt the replies, read the resulting state through a fresh module/process boundary, call `currentOutcome`, and assert a complete renderable evaluation. Assert only Includes GST + Per contract uses the recorded continuation; the other combinations carry distinct branch IDs and `code_fallback` attribution.

Add failure tests proving a branch is not saved when derivation throws and an incomplete migrated branch sets `reviewRequired`.

- [ ] **Step 2: Run the focused service and migration tests**

Run: `npm test -- tests/lib/decision-branch-service.test.ts tests/lib/migrate.test.ts`  
Expected: FAIL because `DemoState` has no branch support.

- [ ] **Step 3: Add the stored field and migration**

Increment `STORE_SCHEMA_VERSION`; default older stores to `decisionBranch: null`. Validate the branch schema during migration. A malformed branch enters migration review and cannot approve or send.

- [ ] **Step 4: Make continuation selection atomic**

Resolve the complete source run that owns the replayed steps. `initialOutcomeForBranch` runs `runConstruct` with that source's replay steps, the same run ID and no clarification answers, producing the evidence-backed ambiguous profile without requesting an explanation. If answers match the source's recorded continuation, keep the current path. Otherwise pass this initial outcome to `deriveBranchOutcome`, finish the full result before mutating state, then store the branch and transition status from its engine state. Do not call the replay provider for an unseen explanation.

- [ ] **Step 5: Make every decision read branch-aware**

`currentOutcome`, option selection, draft validity, offer rendering and all later agreement actions consume the same branch-derived outcome. `decisionAnswers` becomes the single read path for confirmed answers instead of reading `run.record.inputs.answers` directly.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- tests/lib/decision-branch-service.test.ts tests/lib/migrate.test.ts tests/lib/service-journey.test.ts tests/lib/delivery-flow.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/service.ts lib/migrate.ts tests/lib/migrate.test.ts tests/lib/decision-branch-service.test.ts
git commit -m "fix: persist alternate clarification decisions safely"
```

---

### Task 3: Branch attribution in merchant and audit views

**Files:**
- Modify: `lib/audit.ts`
- Modify: `lib/views.ts`
- Modify: `app/deals/[dealId]/understand/page.tsx`
- Modify: `components/offer/recommendation.tsx`
- Modify: `components/audit/sections.tsx`
- Modify: `components/audit/audit-drawer.tsx`
- Modify: `tests/lib/audit.test.ts`
- Modify: `tests/lib/views.test.ts`

**Interfaces:**
- Consumes: `DemoState.decisionBranch`, `decisionAnswers` and the branch-aware `RunOutcome`.
- Produces:
  - branch audit section containing parent ID, branch ID, changed evidence, engine fingerprint and explanation source.
  - attribution copy for recorded AI ranking, engine recalculation, code explanation and merchant interpretation.

- [ ] **Step 1: Write failing attribution tests**

Assert that an unchanged recorded path retains its current AI/code attribution. Assert that a branch says the parent model did not process the changed answers, credits the engine for evaluation and code for ordering/explanation, and never contains “AI ranked” or “AI explained”.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- tests/lib/audit.test.ts tests/lib/views.test.ts`  
Expected: FAIL because audit and view derivations do not know about branches.

- [ ] **Step 3: Add branch-aware view derivations and audit rows**

Keep technical IDs inside the audit drawer. The merchant recommendation shows a quiet sentence: `Recalculated by the engine after the buyer's answer · explanation written by code.` The original path keeps its truthful existing attribution.

- [ ] **Step 4: Replace direct `run.record.inputs.answers` reads**

Use `decisionAnswers` in Understand summaries and evidence cards so branch replies appear after reload without altering the parent record.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- tests/lib/audit.test.ts tests/lib/views.test.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/audit.ts lib/views.ts 'app/deals/[dealId]/understand/page.tsx' components/offer/recommendation.tsx components/audit/sections.tsx components/audit/audit-drawer.tsx tests/lib/audit.test.ts tests/lib/views.test.ts
git commit -m "feat: disclose decision branch provenance"
```

---

### Task 4: Complete clarification directions and uncertainty

**Files:**
- Modify: `data/synthetic/hero.ts`
- Modify: `lib/service.ts`
- Modify: `lib/demo-steps.ts`
- Modify: `lib/progress.ts`
- Modify: `app/api/actions/route.ts`
- Modify: `app/deals/[dealId]/understand/page.tsx`
- Modify: `components/client.tsx`
- Modify: `tests/lib/interpretation.test.ts`
- Modify: `tests/lib/demo-steps.test.ts`
- Create: `tests/lib/clarification-directions.test.ts`

**Interfaces:**
- Consumes: existing conversation drafts, scripted buyer replies, merchant interpretation and branch-aware adoption.
- Produces:
  - scripts `clar-gst-yes`, `clar-gst-no`, `clar-gst-unclear`, `clar-approval-contract`, `clar-approval-payment`, `clar-approval-unclear`.
  - `askClarificationAgain(messageId: string): Promise<DemoState>`.
  - API action `{ action: "ask_clarification_again"; messageId: string }`.

- [ ] **Step 1: Write failing tests for reply directions**

Assert that scripted Yes/No and contract/payment replies store their explicit values. Assert that mixed GST and “not sure” have no `answerValue`, cannot be adopted, and create no agreement, attempt, payment link or ledger movement.

Assert that **Ask buyer again** is an explicit merchant action, sends one code-written follow-up for the same question, records an event, and moves the deal to waiting on the buyer. A second reply to the latest follow-up can then be adopted.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- tests/lib/clarification-directions.test.ts tests/lib/interpretation.test.ts tests/lib/demo-steps.test.ts`  
Expected: FAIL because the alternate scripts and follow-up action do not exist.

- [ ] **Step 3: Add the scripted replies and latest-question selection**

Question-specific scripts carry a supported `answerValue` only when the reply is unambiguous. Update Understand and `adoptRepliesAsAnswers` to use the latest sent clarification for each question so a superseded uncertain reply cannot block a later clear answer.

- [ ] **Step 4: Implement the unresolved follow-up action**

Validate that the message is an inbound reply to a clarification and has no supported value. In the same merchant-authorised action, record the unresolved result and send a code-written follow-up for the same question. No quote or normalised value is stored.

- [ ] **Step 5: Update the merchant interpretation UI**

Keep the supported radio choices and evidence quote. Add a separate **Not clear yet · ask buyer again** action that does not require a quote. Keep mixed GST unresolved because the current profile cannot represent different bases per amount.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm test -- tests/lib/clarification-directions.test.ts tests/lib/interpretation.test.ts tests/lib/demo-steps.test.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add data/synthetic/hero.ts lib/service.ts lib/demo-steps.ts lib/progress.ts app/api/actions/route.ts 'app/deals/[dealId]/understand/page.tsx' components/client.tsx tests/lib/interpretation.test.ts tests/lib/demo-steps.test.ts tests/lib/clarification-directions.test.ts
git commit -m "feat: support every clarification direction"
```

---

### Task 5: P0 browser matrix and chronological conversation

**Files:**
- Modify: `components/conversation-thread.tsx`
- Modify: `e2e/journey.spec.ts`
- Create: `tests/lib/conversation-order.test.ts`

**Interfaces:**
- Consumes: branch-safe decisions and complete scripted reply choices.
- Produces: timestamp-ordered opening conversation and browser proof for every supported combination.

- [ ] **Step 1: Write failing conversation-order and browser tests**

Assert the merchant proposal and buyer constraint appear in timestamp order in the collapsed Understand thread. Add a browser matrix that drives every GST/approval combination, checks a material recommendation or approval difference, reloads Offer, opens audit attribution and confirms no error page.

Add browser coverage for mixed/unsure replies: no Offer route, one follow-up, no financial state mutation.

- [ ] **Step 2: Run the unit test and the new browser cases**

Run: `npm test -- tests/lib/conversation-order.test.ts`  
Expected: FAIL because opening messages are partitioned by author.

- [ ] **Step 3: Render opening messages chronologically**

Keep the existing compact/full behavior, but never move an earlier merchant message beneath later buyer messages. Scope and accessibility behavior remain unchanged.

- [ ] **Step 4: Run the P0 verification**

Run: `npm test && npm run typecheck && npm run lint && npm run test:e2e`  
Expected: all checks PASS using the default Next.js build.

- [ ] **Step 5: Verify protected paths before the P0 gate**

Run: `git diff --exit-code ab35c37 -- ai evaluation data/live-runs data/demo-run.json domain/engine.ts domain/checks.ts domain/economics.ts domain/replies.ts`  
Expected: no diff.

- [ ] **Step 6: Commit**

```bash
git add components/conversation-thread.tsx e2e/journey.spec.ts tests/lib/conversation-order.test.ts
git commit -m "test: prove clarification branches end to end"
```

**Gate:** Stop and report the four branch outcomes, uncertainty behavior, test totals and protected-path check before starting the case picker.

---

### Task 6: Case catalog and credible conversations

**Files:**
- Create: `data/synthetic/cases.ts`
- Create: `data/synthetic/case-ai-outputs.ts`
- Create: `data/synthetic/replay/reduced-scope-synthetic-run.json`
- Create: `data/synthetic/replay/preserve-scope-synthetic-run.json`
- Create: `data/synthetic/replay/no-fit-synthetic-run.json`
- Modify: `scripts/build-synthetic-replay.ts`
- Create: `tests/data/cases.test.ts`
- Modify: `FIXTURE_RATIONALE.md`

**Interfaces:**
- Consumes: existing merchant policy, packages, templates, current prompts and `runConstruct` with authored development outputs.
- Produces:
  - `CaseId = "reduced-scope" | "preserve-scope" | "no-fit"`.
  - `DemoCase` containing buyer, title, proposal summary, barrier, proof point, `DealContext`, expected extraction and bundled run path.
  - `DEFAULT_CASE_ID = "reduced-scope"`.
  - `demoCase(id: string): DemoCase | null` and `allDemoCases(): DemoCase[]`.

- [ ] **Step 1: Author the three human-readable conversations and gold expectations**

Write the expected fields, evidence IDs, required/optional package classifications, ambiguities and engine states before generating any run. The reduced-scope case must explicitly support website/search now and defer social; preserve-scope must require the approved full scope with flexible timing; no-fit must bind at least one buyer check across every approved structure.

- [ ] **Step 2: Write failing fixture tests**

Assert chronological message IDs, verbatim evidence, package names that match the catalog, identical merchant policy/templates across cases, distinct outcomes, no unsupported claimed business result and no mutation of historical hero fixtures.

- [ ] **Step 3: Run the focused test**

Run: `npm test -- tests/data/cases.test.ts`  
Expected: FAIL because the case catalog does not exist.

- [ ] **Step 4: Implement catalog and authored development outputs**

Keep business-goal prose as conversation context; only fields supported by `extract.v2` enter the structured extraction. Generate additive synthetic replay JSON files without editing the old replay or live-run artifacts.

- [ ] **Step 5: Document fixture rationale**

Explain each fictional constraint and expected decision. State that these are designed scenarios, not merchant evidence or model performance results.

- [ ] **Step 6: Run focused tests and replay integrity tests**

Run: `npm test -- tests/data/cases.test.ts tests/ai/replay.test.ts tests/domain/engine.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add data/synthetic/cases.ts data/synthetic/case-ai-outputs.ts data/synthetic/replay/reduced-scope-synthetic-run.json data/synthetic/replay/preserve-scope-synthetic-run.json data/synthetic/replay/no-fit-synthetic-run.json scripts/build-synthetic-replay.ts tests/data/cases.test.ts FIXTURE_RATIONALE.md
git commit -m "feat: add three commercial decision cases"
```

---

### Task 7: Scenario-aware single store

**Files:**
- Modify: `lib/service.ts`
- Modify: `lib/migrate.ts`
- Modify: `lib/deal-page.ts`
- Modify: `lib/demo-steps.ts`
- Modify: `app/api/actions/route.ts`
- Modify: `tests/lib/migrate.test.ts`
- Create: `tests/lib/case-store.test.ts`

**Interfaces:**
- Consumes: Task 6's `CaseId`, `demoCase` and bundled runs.
- Produces:
  - `DemoState.caseId: CaseId`.
  - `seedState(record?, viewing?, caseId?)`, defaulting to `DEFAULT_CASE_ID` for compatibility.
  - `startCase(caseId: string): Promise<DemoState>` with atomic replacement.
  - `demoCaseRunRecord(caseId: CaseId): RunRecord`, reading a valid mapped live run from additive `data/case-runs.json` when present and otherwise using the bundled synthetic case run.
  - API action `{ action: "start_case"; caseId: CaseId }`.
  - `activeCase(state)` as the only buyer/conversation/deal-context lookup in service actions.

- [ ] **Step 1: Write failing store-isolation tests**

Assert migration defaults old stores to reduced scope, selecting each case seeds its own buyer/messages/run and clock, reset preserves the selected case, unknown IDs leave the current store byte-for-byte unchanged, and switching clears agreements, payments and outcomes from the prior case.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- tests/lib/case-store.test.ts tests/lib/migrate.test.ts`  
Expected: FAIL because `caseId` and `startCase` do not exist.

- [ ] **Step 3: Parameterise seed and decision reads**

Replace hard-coded hero buyer/messages/deal context in service decision and agreement creation with `activeCase(state)`. Merchant policy, packages and templates remain shared. Keep `/deals/hero` as the one active workspace route.

- [ ] **Step 4: Implement atomic case start and selected-case reset**

Construct and validate the complete new seed before writing `store.json`. Unknown or invalid cases return an error without touching the prior file. Presenter failure scenarios remain in the existing separate `scenario` field and do not become demo cases.

- [ ] **Step 5: Update migration and API validation**

Increment the schema version and add an exhaustive Zod enum from the three case IDs. Direct arbitrary strings are rejected.

- [ ] **Step 6: Run focused and regression tests**

Run: `npm test -- tests/lib/case-store.test.ts tests/lib/migrate.test.ts tests/lib/service-journey.test.ts tests/lib/connected-journey.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/service.ts lib/migrate.ts lib/deal-page.ts lib/demo-steps.ts app/api/actions/route.ts tests/lib/migrate.test.ts tests/lib/case-store.test.ts
git commit -m "feat: seed one active commercial case"
```

---

### Task 8: Native case picker and case journeys

**Files:**
- Create: `app/deals/page.tsx`
- Create: `components/deal/case-picker.tsx`
- Modify: `components/merchant-header.tsx`
- Modify: `components/conversation-thread.tsx`
- Modify: `e2e/journey.spec.ts`
- Create: `tests/lib/case-picker-copy.test.ts`

**Interfaces:**
- Consumes: `allDemoCases`, `DemoState.caseId` and API `start_case`.
- Produces: `/deals`, explicit reset confirmation, **Start this case**, case provenance labels and redirect to `/deals/hero/understand`.

- [ ] **Step 1: Read the project-owned Next.js docs**

Read:

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`

- [ ] **Step 2: Write failing copy and browser tests**

Assert the three cards show buyer, proposal, barrier, proof point and honest Recorded/Synthetic provenance. Browser tests must start each case, verify the reset warning, inspect its chronological conversation and reach its expected engine state. Switching cases must remove the previous buyer, run ID and outcomes.

- [ ] **Step 3: Run the focused unit test**

Run: `npm test -- tests/lib/case-picker-copy.test.ts`  
Expected: FAIL because the picker does not exist.

- [ ] **Step 4: Build the route and client confirmation component**

Use the existing Razorpay-style cards and action infrastructure. The confirmation states plainly that unfinished demo progress will be reset. Do not show conversion probability, recovered revenue or model confidence.

- [ ] **Step 5: Add merchant navigation and dynamic buyer labels**

Expose **Deals** in the merchant frame. Conversation headers use the selected case's buyer name instead of the hard-coded Kestrel label.

- [ ] **Step 6: Run focused tests, full browser suite and default build**

Run: `npm test -- tests/lib/case-picker-copy.test.ts tests/lib/case-store.test.ts && npm run typecheck && npm run lint && npm run test:e2e`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/deals/page.tsx components/deal/case-picker.tsx components/merchant-header.tsx components/conversation-thread.tsx e2e/journey.spec.ts tests/lib/case-picker-copy.test.ts
git commit -m "feat: add native commercial case picker"
```

**Gate:** Stop and report the three case outcomes, isolation evidence, browser count and remaining time. Decide separately whether to design **Revise the offer**.

---

### Task 9: Capped model probes and final case runs — externally gated

**Files:**
- Create: `scripts/probe-demo-cases.ts`
- Create: `scripts/record-demo-cases.ts`
- Create: `data/case-runs.json`
- Modify: `package.json`
- Modify: `AI_BUILD_LOG.md`
- Add after execution: new files under `data/live-runs/` with new run IDs only.
- Modify: `tests/ai/live-audit.test.ts`

**Interfaces:**
- Consumes: Task 6's cases and gold expectations, existing live provider and immutable prompts.
- Produces:
  - `npm run cases:probe -- --case <id>` writing only to git-ignored `.data/probes/`.
  - `npm run cases:record` writing new immutable run files and `data/case-runs.json`.
  - exact call log and per-case recorded-run mapping.

- [ ] **Step 1: Write tests for call caps and output locations**

Mock the provider. Assert at most one extraction probe per case plus one optional hero continuation, provider failures may retry without counting as content reruns, probes never write committed evidence, final mode refuses a second technically valid run for a case, and no historical file can be overwritten.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- tests/ai/live-audit.test.ts`  
Expected: FAIL until the case scripts and mapping exist.

- [ ] **Step 3: Implement probe and record scripts**

Both scripts load `.env.local`, print prompt/input hashes and redact credentials. Final recording validates evidence and engine replay before writing. A model miss remains in the record; the script never loops for a prettier result.

- [ ] **Step 4: Run mocked tests only**

Run: `npm test -- tests/ai/live-audit.test.ts && npm run typecheck`  
Expected: PASS with zero network calls.

- [ ] **Step 5: Stop for explicit external-call approval**

Report the exact planned calls. Do not invoke Groq until the user explicitly authorises this gate.

- [ ] **Step 6: After approval, run capped development probes**

Run one extraction probe per case and at most one optional full reduced-scope continuation. Log purpose, prompt version, input hash, result and any human-readable ambiguity. Change conversation wording only if a human reader also finds it unclear.

- [ ] **Step 7: Freeze product copy and record one final run per case**

Keep the first technically valid result. If it misses a supported fact, show merchant correction rather than rerunning. Save new IDs and verify replay integrity.

- [ ] **Step 8: Commit additive evidence and log**

```bash
git add scripts/probe-demo-cases.ts scripts/record-demo-cases.ts data/case-runs.json data/live-runs package.json AI_BUILD_LOG.md tests/ai/live-audit.test.ts
git commit -m "test: record commercial case model runs"
```

---

### Task 10: Submission copy and final verification

**Files:**
- Modify: `README.md`
- Modify: `DEMO_SCRIPT.md`
- Modify: `ONE_PAGE_PRODUCT_NOTE.md`
- Modify: `AI_BUILD_LOG.md`
- Modify: `scripts/check-release.ts`
- Modify: `tests/scripts/check-release.test.ts`

**Interfaces:**
- Consumes: verified branch outcomes, case runs and exact final attribution.
- Produces: updated factual submission material and release checks. Applicant-owned `[APPLICANT]` reflections remain untouched.

- [ ] **Step 1: Write failing release-copy tests**

Assert the factual documents describe application branches, one active case, genuine versus synthetic provenance and the upstream pre-agreement positioning. Ban claims that every Razorpay agent acts only after failure, that synthetic cases prove recovery, or that several deals retain progress simultaneously.

- [ ] **Step 2: Run focused release tests**

Run: `npm test -- tests/scripts/check-release.test.ts`  
Expected: FAIL until factual copy and banned-claim checks are updated.

- [ ] **Step 3: Update factual documents**

Keep the one-page note concise enough for actual page layout. Preserve applicant reflection placeholders. Give most demo time to conversation → cited constraints → changed recommendation; keep preventive restructuring as optional depth.

- [ ] **Step 4: Run the complete verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
npm run check:release -- --build
git diff --exit-code ab35c37 -- ai evaluation data/demo-run.json domain/engine.ts domain/checks.ts domain/economics.ts domain/replies.ts
git diff --exit-code ab35c37 -- data/live-runs/run-live-e1ddc008.json data/live-runs/run-live-a727c9c8.json data/live-runs/run-live-3f518779.json
```

Expected: all commands PASS. Existing historical files under `data/live-runs/` remain unchanged; only new approved run IDs may be added.

- [ ] **Step 5: Inspect the final product manually**

Reset to `reduced-scope` at Understand. Verify desktop and 390px views, keyboard navigation, case reset warning, all four clarification combinations, uncertainty, audit attribution and the three case outcomes. Restore only screenshots generated by this run; leave the two user-owned screenshots untouched.

- [ ] **Step 6: Commit**

```bash
git add README.md DEMO_SCRIPT.md ONE_PAGE_PRODUCT_NOTE.md AI_BUILD_LOG.md scripts/check-release.ts tests/scripts/check-release.test.ts
git commit -m "docs: align submission with conversation cases"
```

- [ ] **Step 7: Request final whole-branch review**

Review the full diff from `ab35c37`, prioritising replay integrity, provenance, case isolation, merchant control, buyer-data leakage and frozen-asset preservation. Fix only evidenced defects, rerun the affected checks, then repeat the full release gate once.
