# Realistic Case Conversations and Pre-call Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three demo cases with realistic, multi-message buyer conversations, prove that every extracted fact still traces to the correct message and commercial outcome, and freeze the exact inputs before any Cerebras recording.

**Architecture:** Keep the product engine, prompts, schemas, validators and historical Groq recordings unchanged. Treat `data/synthetic/cases.ts` as the source for the current fictional cases, `data/synthetic/case-ai-outputs.ts` as the clearly labelled hand-authored development output, and rebuild the bundled replay only through `scripts/build-synthetic-replay.ts`. Pin the final message text, prompt hashes, provider/model and call budget in a pre-call record; stop before any network or model call.

**Tech Stack:** TypeScript 5, Next.js 16.3.8, React 19, Zod 4, Vitest 5, Playwright 1.63, SHA-256 canonical JSON hashes.

**Spec:** `docs/superpowers/specs/2026-10-04-judge-proof-conversations-design.md`; exact conversation copy and freeze decisions are fixed in this plan from the user's 9 October 2026 approval.

## Global Constraints

- No Cerebras, Groq, Anthropic, Razorpay or other network call in this plan.
- Do not modify prompt text, prompt versions, schemas, validators, the commercial engine or `evaluation/` assets.
- Do not modify `data/synthetic/hero.ts`, `data/synthetic/recorded-conversations.ts`, `data/case-recorded-runs/` or their historical Groq evidence.
- The three current product cases remain fictional and labelled **Synthetic scenario** until a later, separately authorised recording is mapped to an exact case-text hash.
- Seed only the opening commercial conversation. Case 1's two clarification questions and answers remain live product actions and must not appear in the seeded thread.
- Every extracted field must cite a verbatim substring of one message, using that message's ID; its stored offset must reproduce the same quote.
- Generated replay JSON is never edited by hand. Change sources, run `npm run replay:build`, then review the generated diff.
- If the Preserve Scope or No Fit decision changes after the approved copy is entered, stop and report the deterministic reason. Do not tune a number to force the previous result after seeing any model output.
- The executor must read the relevant Next.js 16.3.8 guide under `node_modules/next/dist/docs/` before changing any Next route or component. This plan is expected to require test-copy changes only, not a Next API change.
- Leave the existing untracked `.data-view/` directory untouched.

## Approved Conversation Copy

### Case 1 — Reduced scope · Kestrel Lane Clinics

Merchant:

> Hi, good speaking on Monday. Sharing the annual plan we discussed — website fixes, search marketing, social media and monthly reporting. It comes to ₹1,20,000 plus GST for the year.

Buyer, four separate messages:

1. “Thanks. The broken booking page is costing us patient enquiries, so fixing that is urgent.”
2. “For now, we need the website fixes and search marketing. Social media can wait.”
3. “I only have ₹50,000 left in this quarter. Our fresh budget opens in April.”
4. “Anything above ₹60,000 has to go to our MD. If a smaller website-and-search phase fits within the limit, I can move it ahead.”

The seeded thread ends there. The product's existing Understand step later asks its two merchant-approved questions about the GST basis and whether ₹60,000 applies per payment or per contract. Keep the current question IDs, reply scripts, normalized values and buyer-answer copy unchanged; this conversation rewrite must not alter the historical hero fixture or clarification rules.

### Case 2 — Preserve scope · Northstar Learning Centres

Merchant:

> Hi, sharing the annual admissions plan again. It is ₹1,20,000 plus GST for the full year.

Buyer, four separate messages:

1. “Thanks. We need the complete annual package for the admissions season, so please don’t remove anything.”
2. “This quarter is tight. I can release only ₹10,000 right now.”
3. “Our next campaign budget opens on 1 May. Starting then is fine as long as the full plan stays intact.”
4. “Finance lets me approve up to ₹15,000 per payment without escalating it. Both the ₹10,000 and ₹15,000 figures are before GST.”

### Case 3 — No fit · Blue Harbor Foods

Merchant:

> Hi, sharing the launch proposal. It is ₹1,20,000 plus GST for website fixes, search marketing, social media and monthly reporting. We currently have delivery starting in November.

Buyer, four separate messages:

1. “The issue is timing. We need your team to start no later than 15 October.”
2. “We need the full scope: website fixes, search, social and monthly reporting.”
3. “Budget isn’t the issue. We have ₹2,00,000 available this quarter, including GST.”
4. “We can’t move the date or reduce the scope. If you can’t start by then, please tell us clearly.”

## Review Focus

1. **Evidence moved across messages:** an extracted quote must point to the one new message that contains it, with exact offsets; Task 1 adds per-field message and offset assertions.
2. **Case 1 ambiguity accidentally disappears:** the opening chat must still require both GST-basis and approval-scope clarification, and no seeded answer may resolve either; Task 2 asserts the initial state and the live question flow.
3. **Case 2 GST capture changes the decision:** both amounts are explicitly before GST, while “complete annual package” still needs merchant service confirmation; Task 3 pins the extracted basis, confirmation gate and final deferred-start result.
4. **Case 3 deadline normalises incorrectly:** “15 October” is resolved from the buyer message timestamp to `2026-10-15`, and every approved structure remains infeasible; Task 4 tests the normalized date and rejection outcome.
5. **Replay, hash or historical evidence drifts:** regenerated current samples must exactly match the approved cases while historical Groq records remain byte-for-byte unchanged; Tasks 5 and 7 compare inputs, hashes and protected paths.

---

### Task 1: Make evidence provenance a first-class case invariant

**Files:**
- Modify: `tests/data/cases.test.ts`

**Interfaces:**
- Consumes: `allDemoCases(): DemoCase[]`, `ExtractionOutput.fields`, and canonical message text from `data/synthetic/cases.ts`.
- Produces: a shared invariant that every evidence quote, message ID and offset is correct before the individual transcripts change.

- [ ] **Step 1: Strengthen evidence provenance assertions**

For every extraction field, assert:

```ts
const start = message.text.indexOf(field.evidence_quote);
expect(start).toBeGreaterThanOrEqual(0);
expect(message.text.slice(start, start + field.evidence_quote.length)).toBe(field.evidence_quote);
expect(field.evidence_quote).toContain(field.raw_text);
```

Also assert that every Case 1 ambiguity has no corresponding stated field in the opening extraction.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/data/cases.test.ts`

Expected: PASS because the current two-message cases already satisfy the provenance invariant. This task adds protection before evidence is redistributed across new messages.

- [ ] **Step 3: Commit**

```bash
git add tests/data/cases.test.ts
git commit -m "test: pin case evidence provenance"
```

### Task 2: Rewrite Reduced Scope without pre-answering clarification

**Files:**
- Modify: `data/synthetic/cases.ts`
- Modify: `data/synthetic/case-ai-outputs.ts`
- Modify: `tests/data/cases.test.ts`
- Modify: `tests/lib/progress-journey.test.ts`
- Modify: `tests/components/conversation-chat.test.ts`
- Modify: `e2e/journey.spec.ts`

**Interfaces:**
- Consumes: exact Case 1 copy from this plan; `runConstruct(...)`; existing question IDs `clar-gst` and `clar-approval`.
- Produces: a five-message `DemoCase`, extraction evidence split across buyer messages, and natural simulated answer text with unchanged normalized values.

- [ ] **Step 1: Add the failing ambiguity and journey tests**

Assert that starting Reduced Scope:

- contains exactly the approved five-message opening transcript in merchant/buyer order;
- ends in `clarifying` before merchant action;
- exposes exactly `clar-gst` and `clar-approval`;
- has no buyer clarification answers in `run.record.inputs.messages`;
- after `send_questions`, the questions appear after the opening five messages;
- after the existing `clar-gst-yes` and `clar-approval-contract` replies are adopted, the state is `options_ready` and the leading code-ranked template remains `phased_scope`.

Update the browser assertion to use a stable phrase from the approved conversation, such as `The broken booking page is costing us patient enquiries`.

- [ ] **Step 2: Replace the Reduced Scope messages and extraction evidence**

Use IDs `reduced-1` through `reduced-5`. Keep the existing timestamps' date and assign strictly increasing times. Point each field to the buyer message that states it:

- required/optional scope → `reduced-3`;
- budget and next budget → `reduced-4`;
- approval amount → `reduced-5`;
- GST basis and approval scope remain ambiguities.

Keep the existing `recordedAnswers`, reply-script text and normalized values `yes` and `per_contract` unchanged.

- [ ] **Step 3: Keep authored AI output clearly synthetic**

Update `caseAuthoredOutputs["reduced-scope"]` only as needed to mirror the new extraction. Keep the existing clarification questions unchanged. Do not change prompt code or attribute these words to Cerebras.

- [ ] **Step 4: Run Reduced Scope tests**

Run: `npm test -- tests/data/cases.test.ts tests/lib/progress-journey.test.ts tests/components/conversation-chat.test.ts`

Expected: PASS for Reduced Scope; freeze-hash test remains intentionally red until Task 6.

- [ ] **Step 5: Commit**

```bash
git add data/synthetic/cases.ts data/synthetic/case-ai-outputs.ts tests/data/cases.test.ts tests/lib/progress-journey.test.ts tests/components/conversation-chat.test.ts e2e/journey.spec.ts
git commit -m "feat: make the reduced-scope conversation realistic"
```

### Task 3: Rewrite Preserve Scope and prove the GST change is safe

**Files:**
- Modify: `data/synthetic/cases.ts`
- Modify: `data/synthetic/case-ai-outputs.ts`
- Modify: `tests/data/cases.test.ts`
- Modify: `tests/lib/scope-confirmation.test.ts`
- Modify: `tests/lib/scope-confirmation-service.test.ts`
- Modify: `tests/lib/stage-summary.test.ts`
- Modify: `e2e/journey.spec.ts`
- Modify: `e2e/scope.spec.ts`

**Interfaces:**
- Consumes: exact Case 2 copy; current `confirmRequiredServices` flow; shared four-service catalog.
- Produces: explicit pre-GST evidence for both amounts, an unmapped `complete annual package` phrase, and the same merchant-confirmed deferred-start decision if the deterministic engine supports it.

- [ ] **Step 1: Add the failing Preserve Scope assertions**

Assert that the authored extraction:

- uses exactly the approved five-message opening transcript;
- cites `preserve-2` for `complete annual package`;
- cites separate new messages for budget, next-budget date, approval limit and GST basis;
- stores `amounts_include_gst` as false/excluding GST for both ₹10,000 and ₹15,000;
- still rejects only the unmapped package phrase;
- blocks the Offer stage until the merchant confirms all four services.

After confirmation, assert `options_ready` and a leading template of `deferred_start`.

- [ ] **Step 2: Replace the Preserve Scope messages and extraction**

Use IDs `preserve-1` through `preserve-5`. Preserve the raw unmatched package phrase `complete annual package`. Add the explicit GST field using a quote that contains both named amounts and “before GST”. Use `1 May` as the raw date and let deterministic normalization derive `2027-05-01` from the 2026-10-01 message timestamp.

- [ ] **Step 3: Run the real deterministic outcome before changing any expected result**

Run: `npm test -- tests/data/cases.test.ts tests/lib/scope-confirmation.test.ts tests/lib/scope-confirmation-service.test.ts tests/lib/stage-summary.test.ts`

Expected: PASS with `deferred_start`. If it fails because the explicit GST basis changes feasibility, stop and report the exact failed checks and computed figures. Do not change the conversation amounts in this task without user review.

- [ ] **Step 4: Update browser copy assertions only after the domain result passes**

Use stable phrases from the approved messages and retain the service-confirmation gate. Do not change product behavior.

- [ ] **Step 5: Commit**

```bash
git add data/synthetic/cases.ts data/synthetic/case-ai-outputs.ts tests/data/cases.test.ts tests/lib/scope-confirmation.test.ts tests/lib/scope-confirmation-service.test.ts tests/lib/stage-summary.test.ts e2e/journey.spec.ts e2e/scope.spec.ts
git commit -m "feat: make the preserve-scope conversation realistic"
```

### Task 4: Rewrite No Fit and pin the exact deadline

**Files:**
- Modify: `data/synthetic/cases.ts`
- Modify: `data/synthetic/case-ai-outputs.ts`
- Modify: `tests/data/cases.test.ts`
- Modify: `e2e/journey.spec.ts`
- Modify: `e2e/walkthrough.spec.ts`

**Interfaces:**
- Consumes: exact Case 3 copy; existing relative/explicit date normalizer and engine.
- Produces: one unambiguous `latest_start` field normalized to `2026-10-15`, full required scope, and `no_feasible_deal`.

- [ ] **Step 1: Add the failing date and abstention test**

Assert that:

- the case uses exactly the approved five-message opening transcript;
- `latest_start.raw_text` is `15 October`;
- its evidence quote exists only in `no-fit-2`;
- the normalized profile displays `2026-10-15` or its existing equivalent date representation;
- required scope contains all four package IDs;
- the engine rejects every merchant-approved structure and offers no approvable option.

- [ ] **Step 2: Replace the No Fit messages and extraction evidence**

Use IDs `no-fit-1` through `no-fit-5`. Map required packages from the vocabulary actually supported by the package normalizer; if the buyer-facing shorthand `search`, `social`, and `monthly reporting` needs canonical raw text in the authored extraction, retain the exact buyer quote and let normalization map it. Do not rewrite the buyer message to suit the engine.

- [ ] **Step 3: Run focused tests**

Run: `npm test -- tests/data/cases.test.ts`

Expected: PASS with `no_feasible_deal`. If any structure becomes feasible or the date is ambiguous, stop and report; do not add a special-case normalizer.

- [ ] **Step 4: Update browser assertions and commit**

```bash
git add data/synthetic/cases.ts data/synthetic/case-ai-outputs.ts tests/data/cases.test.ts e2e/journey.spec.ts e2e/walkthrough.spec.ts
git commit -m "feat: make the no-fit conversation realistic"
```

### Task 5: Regenerate and verify the credential-free sample replays

**Files:**
- Modify (generated): `data/synthetic/replay/reduced-scope-synthetic-run.json`
- Modify (generated): `data/synthetic/replay/preserve-scope-synthetic-run.json`
- Modify (generated): `data/synthetic/replay/no-fit-synthetic-run.json`
- Modify: `tests/data/cases.test.ts`
- Modify: `tests/lib/model-provenance.test.ts`
- Test: `tests/ai/replay.test.ts`

**Interfaces:**
- Consumes: final `DemoCase` inputs and `caseAuthoredOutputs` from Tasks 2–4.
- Produces: deterministic `synthetic_replay` records whose `inputs.messages` exactly equal the current cases.

- [ ] **Step 1: Add replay-input equality tests**

For every case, assert that the stored replay:

- has `kind: "synthetic_replay"` and synthetic provider attribution;
- contains `inputs.messages` deeply equal to `demoCase(id)!.deal.messages`;
- reaches the expected state and template;
- never contains `provider: "cerebras"`, `kind: "live"` or a recorded-model label.

- [ ] **Step 2: Run the replay builder**

Run: `npm run replay:build`

Expected: three current case files are rewritten from sources; the historical hero replay may be rewritten only if byte-identical.

- [ ] **Step 3: Inspect the generated diff**

Confirm that changed evidence quotes point to the new message IDs and that no prompt, schema, validator or historical Groq recording changed.

- [ ] **Step 4: Run replay tests**

Run: `npm test -- tests/data/cases.test.ts tests/ai/replay.test.ts tests/lib/model-provenance.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add data/synthetic/replay/reduced-scope-synthetic-run.json data/synthetic/replay/preserve-scope-synthetic-run.json data/synthetic/replay/no-fit-synthetic-run.json tests/data/cases.test.ts tests/lib/model-provenance.test.ts
git commit -m "build: regenerate realistic case replays"
```

### Task 6: Freeze exact case inputs and the later recording contract

**Files:**
- Create: `data/synthetic/CASE_RECORDING_FREEZE.json`
- Modify: `tests/data/case-text-freeze.test.ts`
- Create: `tests/data/case-recording-freeze.test.ts`
- Modify: `AI_BUILD_LOG.md`

**Interfaces:**
- Consumes: canonical case-message hashes; `promptHash(...)`, `promptFor(...)`; `readAiConfig(...)`.
- Produces: an auditable pre-call record with exact inputs and a test that blocks recording after drift.

- [ ] **Step 1: Define the freeze-file contract in a failing test**

The file must contain:

```ts
type CaseRecordingFreeze = {
  schema: "adaptive-deals.case-recording-freeze.v1";
  frozenAt: string;
  authoredBy: "OpenAI Codex, directed by Nitya Jain";
  cases: Record<CaseId, { messagesSha256: string }>;
  prompts: {
    extract: { version: "extract.v2"; sha256: string };
    clarify: { version: "clarify.v1"; sha256: string };
    explain: { version: "explain.v3"; sha256: string };
  };
  provider: "cerebras";
  model: "gpt-oss-120b";
  scope: ["reduced-scope"];
  maximumProviderRequests: 7;
  retryRule: "technical failures only";
  resultRule: "keep the first technically valid output, misses included";
  networkCallsMade: 0;
};
```

The seven-request cap is a ceiling for the later hero-only recording: one extract, one clarify and one explain request, plus documented technical retries within the existing recording policy. It is not permission to call a provider during this plan.

- [ ] **Step 2: Update the frozen conversation hashes**

Replace the three `FROZEN` values with hashes computed from `canonicalJson(item.deal.messages)`. Do this only after Tasks 2–5 are complete. The test must compare both the in-test constant and `CASE_RECORDING_FREEZE.json` to the live case messages.

- [ ] **Step 3: Write the prompt hashes from existing prompt definitions**

Use the current `promptHash(promptFor(task, version))` results. Do not copy old hashes from prose or a historical run without checking them against code.

- [ ] **Step 4: Add drift and provenance tests**

Assert:

- every message hash and prompt hash matches the repository;
- the configured recording scope is hero-only (`reduced-scope`);
- provider/model are Cerebras/`gpt-oss-120b`;
- `networkCallsMade` is zero;
- historical Groq recordings still replay against `RECORDED_CASE_MESSAGES` and remain unmapped from the rewritten current cases.

- [ ] **Step 5: Record the checkpoint factually in `AI_BUILD_LOG.md`**

State that the conversations and synthetic outputs were authored, no model call occurred, the case and prompt hashes were frozen, and the next step needs separate explicit authorisation.

- [ ] **Step 6: Run and commit the freeze tests**

Run: `npm test -- tests/data/case-text-freeze.test.ts tests/data/case-recording-freeze.test.ts tests/data/case-recordings.test.ts`

Expected: PASS.

```bash
git add data/synthetic/CASE_RECORDING_FREEZE.json tests/data/case-text-freeze.test.ts tests/data/case-recording-freeze.test.ts AI_BUILD_LOG.md
git commit -m "docs: freeze case inputs before Cerebras recording"
```

### Task 7: Verify the product surfaces and stop at the pre-call gate

**Files:**
- Modify only if assertions are stale: `e2e/journey.spec.ts`
- Modify only if assertions are stale: `e2e/scope.spec.ts`
- Modify only if assertions are stale: `e2e/walkthrough.spec.ts`
- Modify only if factual copy is stale: `README.md`

**Interfaces:**
- Consumes: all artifacts from Tasks 1–6.
- Produces: a passing pre-call product and an evidence report; no recording.

- [ ] **Step 1: Test the product with the walkthrough hidden**

Run the browser journey that starts each case and assert:

- the correct five-message opening chat is visible;
- Reduced Scope starts on Understand with two unresolved questions;
- Preserve Scope requires merchant service confirmation before Offer;
- No Fit reaches an honest no-offer state;
- switching cases clears buyer, run, agreement and outcome state.

- [ ] **Step 2: Test current attribution and buyer isolation**

Assert all three current cases say **Sample output written by hand · no model ran**. A current case must not inherit **Recorded Groq output** from historical files. Buyer pages must contain no merchant costs, contribution, cash-at-risk limit, prompt hash or internal rule values.

- [ ] **Step 3: Run focused browser tests without regenerating screenshots**

Run: `ADAPTIVE_E2E_NO_SHOTS=1 npx playwright test e2e/journey.spec.ts e2e/scope.spec.ts e2e/walkthrough.spec.ts`

Expected: PASS.

- [ ] **Step 4: Run the complete verification set**

Run:

```bash
npm test
npm run typecheck
npm run lint
ADAPTIVE_E2E_NO_SHOTS=1 npm run test:e2e
npm run build
npm run check:release -- --build
```

Expected: all executable checks pass. The release report may continue to identify applicant-owned prose placeholders; do not fill those with agent-written first-person claims in this plan.

- [ ] **Step 5: Verify protected boundaries**

Confirm:

- no diff under `ai/`, `evaluation/`, `data/case-recorded-runs/`, `data/synthetic/recorded-conversations.ts` or `data/synthetic/hero.ts`;
- no credential appears in tracked files;
- only `.data-view/` remains as the pre-existing untracked directory;
- the application made zero provider calls.

- [ ] **Step 6: Commit any test-copy-only correction**

If no correction was needed, make no empty commit. Otherwise:

```bash
git add e2e/journey.spec.ts e2e/scope.spec.ts e2e/walkthrough.spec.ts README.md
git commit -m "test: verify realistic cases before recording"
```

- [ ] **Step 7: Stop and report the pre-call gate**

Report:

- final commit IDs;
- exact unit, browser, typecheck, lint, build and release results;
- three case hashes and three prompt hashes;
- deterministic outcomes for all three cases;
- confirmation that no model call occurred;
- any remaining applicant-owned submission work.

Do not record the hero case, change a case message, update the walkthrough, or start submission packaging until the user reviews this gate and separately authorises the Cerebras recording.
