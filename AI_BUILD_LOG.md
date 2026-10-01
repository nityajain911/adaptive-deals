# AI build log — Adaptive Deals by Razorpay

This log records how AI was used to build the prototype. Entries marked **[Claude Code]** were written by the coding agent. Sections marked **[APPLICANT]** must be written by the applicant in their own words. Do not treat agent entries as the applicant's decisions.

## Model usage

| Where | Model | Notes |
| --- | --- | --- |
| Building the codebase | Claude Opus 5.5 (`claude-opus-5-5`) via Claude Code desktop | Agent wrote code, tests and draft docs from `CLAUDE_CODE_PROMPT.md` + `FREEZE_PACK.md` |
| Product runtime (constraint extraction, clarification wording, explanation) | **Groq · `openai/gpt-oss-120b`** (applicant's choice), configurable via `ADAPTIVE_DEALS_PROVIDER` / `ADAPTIVE_DEALS_MODEL` | The default run uses a **synthetic replay**, not a model |

## Data provenance labels

| Label | Meaning |
| --- | --- |
| Synthetic | Invented fixture data (`data/synthetic/`). All merchant, buyer, package, price, cost, policy and date values. |
| Synthetic replay | Bundled AI-shaped output written by hand for credential-free runs. Not a model run. |
| Replay of an actual run | Stored output of a real model-and-engine run (only once one is recorded). |
| Simulated | Payment, mandate, debit and clock-advance events produced locally. |
| Test mode | Razorpay test-mode API calls (`rzp_test_` keys only). |

## Log

### 2026-10-01 · Phase 1 — domain and tests [Claude Code]

**Prompt:** `adaptive-deals-build/CLAUDE_CODE_PROMPT.md`, with `FREEZE_PACK.md` as source of truth and `razorpay-ui-reference.png` as visual reference only.

**Setup**
- New app at `adaptive-deals-build/adaptive-deals/` from `create-next-app@latest` (Next.js 16.3.8, React 19.2.8, Tailwind 4, TypeScript 5.9), own git repo. No files from the earlier Resolve product were read, copied or imported.
- Vitest 5 required `@types/node` ≥ 22; pinned `@types/node@^24` (Node 24 runtime).
- `tsconfig` target raised to ES2022.

**Conflicts between prompt and freeze pack:** none detected. The two documents agree. Interpretations made where both are silent are listed below so the applicant can accept or change them.

**Interpretations and assumptions (need applicant review)**
1. *GST answer scope.* ~~The clarification asks about ₹50,000, and the recorded answer is applied to every amount, including ₹60,000.~~ **Superseded** by the applicant's correction below: the question now names both amounts, and the basis is never extended from one amount to another.
2. *Next-budget amount.* "New budget in April" states a date, not an amount. The engine checks only the timing of payments after April and shows "Next budget amount not stated" on the constraint card. It does not invent an amount. Full-annual options that need large post-April payments are still shown as feasible, labelled **Needs buyer's MD approval**.
3. *Cost and value timing.* Direct costs are committed at the start of each delivery month. Service value counts as delivered at the end of that month. These choices drive funding requirement and unpaid service value.
4. *Payment fees.* Expected fee = 2% of each customer-facing collection, borne by the seller and rounded half-up per payment. This is a synthetic assumption.
5. *Tenure.* Measured in calendar months from delivery start to the later of the last delivery month and the last payment month.
6. *Payment due dates* fall on the delivery start day of the month. So any payment in April 2027 is **undecidable** against a month-precision "April" budget. The engine reports this as needs-information and does not guess.
7. *Featured rejections.* The Decision view highlights two rejections, both chosen by a rule over engine results:
   - **Buyer-side:** the full-scope structure rejected only by buyer checks that has the smallest largest payment, then the earliest start.
   - **Seller-side:** the structure rejected only by seller checks that has the smallest largest payment.
8. *Phase 1.* A phased-scope agreement contracts Phase 1 only and stores the condition `buyer_confirms_authority_for_phase_scope`, which acceptance enforces. No Phase 2 is pre-committed or suggested.
9. *Outside-template confirmation.* The AI flags a request kind. Code confirms it against the four representable kinds.
10. *Required field.* Only "budget now" is required. Without it, the deal is in the insufficient-information state.

**Failures and fixes during phase 1**
- Ambiguity comparison first counted an approval-label change on an already-rejected structure as decision-relevant. It now compares verdicts, and compares the approval label only for feasible structures.
- The featured buyer rejection tie-break picked a January deferred start over the November monthly split. An earliest-start tie-break was added.
- "May" on its own was not parsed as a month because of the guard against the modal verb. A single-token phrase is now always read as the month.
- Two no-feasible-deal tests initially used a ₹5K budget. The engine correctly found the May-2027 deferred start feasible. The tests now add a latest-start constraint, so the result is a genuine no-feasible case.

**Verification:** `npm test` 114/114 passed · `npm run typecheck` clean · `npm run lint` clean.

### 2026-10-01 · Phase 1 follow-up after applicant review [Claude Code]

**Prompt (applicant):** before phase 2, confirm (1) the featured-rejection selection rule, (2) the full phase-1 test, typecheck and lint result and the commit hash, (3) the advance-notice event and why the revised date is 21 Dec, and (4) the cash-at-risk limit and its rationale.

**Gap found:** the advance notice was not modelled. The fixture held its date but nothing used it, and the buyer's reply was not linked to a notice.

**Fixes**
- Added `domain/notices.ts`: notices are planned `advanceNoticeDays` before recurring debits, are simulated, and are sent only before the debit date. Replies carry `inReplyTo`.
- The hero timeline test now runs: notice on 28 Nov → failed debit on 1 Dec → reply linked to the notice → revision.
- Added the rule `earliestDebitAfterUnavailableUntil`: "till ‹date›" is inclusive, so the revised debit is the next day.
- Made "fewest failed checks" the explicit first key of the featured-rejection rule, and added rule tests: order independence, the rule holds against every candidate, and the choice changes when the fixture changes.
- Created `PRODUCT_DECISIONS.md` with the GST, featured-rejection, advance-notice and revised-date rules.
- Rewrote the cash-at-risk rationale. The earlier text justified ₹10,000 only by the demo outcome it produces. It now states a policy principle (no more than one month of this client's average billing), explains why that is reasonable for a small agency, and discloses that the demo outcome depends on the value.

**Verification:** `npm test` 122/122 passed · `npm run typecheck` clean · `npm run lint` clean.

### 2026-10-01 · Phase 1 correction: explicit GST basis for both amounts [Claude Code]

**Prompt (applicant):** change the first hero clarification to "Do both ₹50,000 and ₹60,000 include GST?" and pin "Yes, both amounts include GST."; keep the per-contract question and answer; keep the profile-wide `amountsIncludeGst` model; prove that the approval comparison does not infer the ₹60,000 basis from an answer about ₹50,000. The freeze pack (§13) and build prompt were updated by the applicant beforehand.

**Changes**
- Fixture: new question and answer text; the GST answer records `coversAmounts: ["budgetNow", "approvalLimit"]`; the second answer now reads "₹60,000 is per contract."
- The profile-wide GST value now carries `covers`, the amounts it was explicitly confirmed for.
  - A message GST phrase covers only the amounts named in its evidence quote.
  - A clarification answer that does not name every stated amount is refused (`ClarificationError`).
- The budget and approval checks each require the basis to cover their own amount, and they record `gstBasisSource`.
- Hero report prints both clarifications and the derived pre-GST values of both amounts.
- Four engine tests had "incl GST" quotes that did not name the amount. They still passed, but only because the resulting ambiguity did not change their outcome. Their quotes now name the amount, and each test asserts that the basis is stated.
- New `tests/domain/gst-basis.test.ts` (6 tests).

**Verification:** `npm test` 128/128 passed · `npm run typecheck` clean · `npm run lint` clean · `npm run hero:report` output unchanged except for the new clarification and GST-basis lines.

### 2026-10-01 · Phase 2 — AI layer [Claude Code]

**Prompt (applicant):** build the AI layer per the freeze pack and build prompt: strict schemas, exact evidence, rejection of bad fields, an Anthropic SDK provider, credential-free replay by default, versioned prompts, complete run records, safe degradation, the four states, engine-driven clarification, inert prompt injection, and no AI money, schedules, template removal, feasibility or payments. Keep development examples separate from the frozen set.

**Built**
- `ai/schemas.ts`: strict Zod schemas with no numeric fields, for extraction, clarification wording and explanation.
- `ai/prompts.ts`: versioned prompts `extract.v1`, `clarify.v1`, `explain.v1`, a prompt hash, and delimiter neutralisation.
- `ai/anthropic-provider.ts`: `messages.parse` + `zodOutputFormat`. No tools are attached. Refusal, truncation, schema failure and API errors are mapped to safe failures.
- `ai/replay-provider.ts`, `ai/synthetic-provider.ts`, `ai/live.ts`, `ai/config.ts`.
- `ai/extract.ts`, `ai/clarify.ts`, `ai/explain.ts`: build each request, validate its output, fall back to code.
- `ai/orchestrator.ts`: one continuous run (extract → engine → clarify → recorded answers → engine → explain), plus `replayRun` with integrity checks. `ai/run-record.ts`: record format and provenance labels.
- `data/synthetic/hero-ai-outputs.ts`: hand-written synthetic outputs. `data/synthetic/replay/hero-synthetic-run.json`: the bundled **Synthetic replay**, built by `npm run replay:build`.
- `evaluation/gold.ts`: the case format shared by both sets. `evaluation/datasets/development/`: 16 synthetic development cases. `evaluation/datasets/frozen/`: README only; no cases authored. `evaluation/oracle.ts` checks labels and code with reference extractions; it is never reported as a model result.

**Model choice:** default `claude-opus-5`, configurable through `ADAPTIVE_DEALS_MODEL`. Opus 5 rejects `temperature`, so it is omitted for that model and recorded. Server-side refusal fallbacks were **not** enabled. A fallback would silently change which model produced the output, and a refusal already degrades safely to review.

**Failures and corrections**
- My hand-written explanation exceeded the 700-character schema limit and was rejected, so code fallback text was used. Comparing four options needs more room; I raised the limit to 1,200.
- The figure check then rejected "Phase 1" as a literal figure. It is a product label, so I added it to an explicit allowlist. All other digits remain forbidden.
- Writing development cases exposed three normalisation gaps, now fixed in code: Hinglish "is quarter" / "is mahine"; "exclude/include GST" and Hinglish GST phrases; and corrections across messages (later message supersedes; same-message conflict is rejected).
- **Three of my draft development labels were wrong.** The engine disagreed, and checking by hand showed the engine was right:
  - dev-04: GST does not change any outcome at ₹35K.
  - dev-10: a January budget makes the May deferred start feasible.
  - dev-15: the GST basis, not the approval scope, decides the 6-month single payment against ₹80K.

  The labels were corrected. **Consequence:** development labels for clarifications and state are reconciled with the engine, so they are not independent. They must never be reported as evaluation results. Only the frozen set, labelled by another person, can measure performance.
- Three test bugs were fixed:
  - one regex checked raw text that still contained placeholders;
  - the import-boundary test matched the word "Razorpay" in prompt text, and now checks imports only;
  - a replay of tampered output raised `AnswerError` instead of `ReplayIntegrityError`, so `replayRun` now wraps errors.

**Not verified:** no live model call was made. There is no key in this environment, and spending on the user's account needs their approval. The Anthropic provider is tested against a fake client that returns SDK-shaped responses.

**Verification:** `npm test` 198/198 passed · `npm run typecheck` clean · `npm run lint` clean.

### 2026-10-01 · Phase 3 — five views, store and service [Claude Code]

**Read first:** the bundled Next.js 16.3.8 docs (`node_modules/next/dist/docs`) on layouts and pages, route handlers, the page `params`/`searchParams` Promises, `connection()` and `router.refresh()`.

**Built**
- `lib/store.ts`: a JSON store in `.data/` with atomic temp-file-plus-rename writes and serialised mutations.
- `lib/service.ts`: every deal transition, each one running through domain functions:
  - seed, answers, prepare, approve and send, accept;
  - payments, behind the hash gate;
  - simulated events, payment-link polling, amendment;
  - failure-state scenarios, Run live, stored-run replay;
  - a deterministic guided demo (`nextDemoStep`, `demoNext`).
- `app/api/actions/route.ts`: one Zod-validated mutation endpoint.
- The five views under `app/(deal)/`, with a Razorpay-dashboard visual language: black header, text wordmark, blue active tab, light canvas, white cards.
- `npm run reset:seed`.
- `integrations/razorpay/`: a test-key guard, a real test-mode payment-link client, and simulated payment-link and recurring adapters. These were needed by the Agreement view; Phase 4 adds their tests.

**Seeding:** the seeded run is the bundled synthetic run's first half (extract + clarify). Recording the pinned answers continues that same run from its stored outputs. A service test confirms that the continued run equals the bundled run byte for byte, so it stays one continuous run.

**Failures and fixes**
- The Clarification view needed per-reading counts after answers were recorded, so they were added to the engine snapshot and the bundled replay was rebuilt.
- `preview_start` uses the workspace root's `.claude/launch.json`, which belongs to the old Resolve repo. I added an `adaptive-deals` entry there (using `npm --prefix`) and left its existing entry untouched. **This modifies a tracked file in the parent repo.**
- The production build warned that the parent folder's lockfile confused the Turbopack root, and that the runtime store's file access traced the whole project. Fixed with `turbopack.root` and `turbopackIgnore` on the store paths. The build is now warning-free.

**Verification:** `npm test` 206/206 · typecheck clean · lint clean · `next build` clean · the full 12-step guided storyboard was run through the API, and every view returned 200.

### 2026-10-01 · Phase 4 — payment integration and simulation [Claude Code]

**Checked:** the Razorpay Payment Links API reference (`POST /v1/payment_links`, Basic auth, amount in paise, `reference_id` ≤ 40 chars, statuses created/partially_paid/paid/expired/cancelled) before writing the test-mode client.

**Built and tested**
- **Key guard:** accepts only `rzp_test_` keys. `rzp_live_` and every unrecognised form are refused, and the real client cannot even be constructed with a live key.
- **Adapter selection:**
  - Razorpay test mode is used for payment links only with a valid test key pair **and** `RAZORPAY_MODE=test`; otherwise links are simulated.
  - Recurring is always simulated, with a stated reason (`RECURRING_SIMULATION_NOTE`).
- **Test-mode client:** sends paise, INR, our idempotency key as `reference_id`, and notifications off. It surfaces API errors instead of pretending success. Local status uses polling ("Check status"); nothing relies on a public webhook.
- **Service guards** (tested against the real store):
  - no payment link, mandate or collection attempt exists unless acceptance presents the approved hash;
  - no simulated payment events happen before activation;
  - no double payment of a link;
  - no debit before mandate confirmation;
  - no collection after full payment.
- **Simulated time advances** are now also written into the run record (`record.clockAdvances`), as the prompt requires, and each one is labelled "Simulated date: …" in the event log.

**Not verified:**
- No Razorpay test credentials exist in this environment, so the real test-mode client is exercised only against a fake transport.
- Recurring Payments (e-mandate/UPI Autopay registration, debits, failures) is simulated end to end.

**Verification:** `npm test` 226/226 · typecheck clean · lint clean.

### 2026-10-01 · Phase 5 — evaluation, documentation and UI review [Claude Code]

**Evaluation**
- `evaluation/metrics.ts` produces count-only metrics in freeze-pack wording.
- `evaluation/runner.ts` runs cases in two modes. "Live model" mode is the only one that measures the model. "Reference extraction" mode is labelled as checking labels and code only.
- Frozen-set controls: an importer, validation, a prompt freeze (prompt hashes plus a case hash), and blockers. The frozen runner refuses to run without 15–20 cases supplied by another person, a freeze, and a live model.
- `npm run eval` currently runs the reference-extraction check, because no key is present. **No frozen evaluation was run, and no frozen cases were authored.**

**UI review:** Playwright captured all five views at 1440×900 and 390×844 into `artifacts/ui-review/`, and I inspected the screenshots. I found and fixed:
- **Horizontal overflow at 390px** (up to 114px) on four views. Below the breakpoint the grids had implicit auto columns, so wide tables stretched them. Added `grid-cols-1` as the base.
- **Clipped mandate values on mobile:** a two-column table forced to a 420px minimum. It is now a definition list, and tables with three or fewer columns have no minimum width.
- **Mobile payment tables** cut the GST column. The Method column now hides on small screens, with tighter padding.
- **Cash-at-risk chart** was letterboxed small. It now scales to the card, and a zero-risk series says so.
- **Conversation card** stretched to the column height. It now aligns to its content.
- **Hardcoded display text**, which breaks the no-UI-constants rule:
  - the reply phrase and "20 Dec 2026" in the amendment explanation, a default answer text, and the no-feasible quote, all now derived from data;
  - "2027-01" in the buyer view, now formatted as a month.

**Docs:** README, a draft `DEMO_SCRIPT.md`, `ONE_PAGE_PRODUCT_NOTE.md` (structure only; [APPLICANT] sections are left for the applicant), and `PRODUCT_DECISIONS.md` completed with trust controls, metrics and scope exclusions.

**Verification:** `npm test` 232/232 · typecheck clean · lint clean · `next build` clean · Playwright 4/4 (five-view journey, four failure states, guided demo, mobile layout without horizontal scroll).

### 2026-10-01 · Live provider switched to Groq [Claude Code]

**Prompt (applicant):** "we will use this Groq, model openai/gpt-oss-120b".

**Conflict recorded:** the build prompt specified the official Anthropic SDK. The freeze pack names no provider. The applicant's later instruction takes precedence. The Anthropic provider is kept as an option behind the same interface rather than removed.

**Built**
- `ai/groq-provider.ts`: `chat.completions.create` with `response_format: { type: "json_schema", json_schema: { strict: true, … } }`, `temperature: 0`, and no tools. Truncation, empty or non-JSON output, a 400, an auth failure, a rate limit or a connection failure each map to the existing safe failures.
- `ai/strict-schema.ts`: Zod → strict JSON Schema (closed, fully required objects, basic keywords).
- Provider selection in `ai/config.ts`, defaulting to Groq.

Checked against the Groq structured-outputs documentation: `openai/gpt-oss-120b` supports `strict: true`. Strict mode requires every property to be required and `additionalProperties: false`.

**Failure and fix:** the Groq client read `process.env` at construction, so a test passing an explicit environment failed. Keys are now passed explicitly from the configuration.

**Not verified:** no `GROQ_API_KEY` in this environment, so there has been no real Groq call. Tested against a fake client only.

**Verification:** `npm test` 238/238 · typecheck clean · lint clean.

### 2026-10-01 · First live run on Groq [Claude Code]

**Prompt (applicant):** "go ahead" (one live run plus the development evaluation, using the applicant's Groq key).

**Live run `run-live-e1ddc008`** (Groq, `openai/gpt-oss-120b`, prompts v1)
- **Extraction:** identical to the synthetic replay. All four fields were accepted with verbatim evidence, none were rejected, and both ambiguities were flagged.
- **Clarification:** AI wording passed validation. It names both ₹50,000 and ₹60,000.
- **Engine result:** byte-for-byte identical to the synthetic run.
- **Explanation:** the model ranked B (single payment) before A, which it may do. It wrote "30%" literally, copied from an option label, so code rejected the comparison text and one note and showed code wording instead. The guardrail worked as designed.

**Bug found and fixed:** the stored copy of a live run (`.data/runs/`) was written only after the first half. It is now rewritten when answers are recorded, so "Replay of an actual run" covers the whole run. The existing record was completed from the same run's state. Its replay passes the integrity check and is labelled "Replay of an actual run · run ID run-live-e1ddc008".

**Development evaluation (live model, 16 synthetic cases, counts only)**
- Correctly extracted fields: 29 of 35.
- Unsupported extracted fields: 2 across 16 cases.
- Required clarifications asked: 4 of 6; missed: 2 of 6.
- Unnecessary clarifications asked: 1 across 16 cases.
- Failure states correctly identified: 7 of 8.
- Failing options presented as approvable: 0 of 90.

**Diagnosis**
- dev-04 and dev-06 passed on a re-run: run-to-run variation from a reasoning model, even at temperature 0.
- dev-02: the model returned period "quarter" without "is", so code would not guess and the budget became unstated.
- dev-11 and dev-14: the GST phrase was quoted without its amount, so under the explicit GST-coverage rule the basis stayed unconfirmed.

**Proposed (not applied; awaiting the applicant):**
- `extract.v2`: copy the full period phrase; a GST evidence quote must include the amount(s) it applies to.
- `explain.v2`: refer to plans only through `{X.label}` and never restate label text containing digits.

Eval scripts now load `.env.local` (`--env-file-if-exists`).

### [APPLICANT] Decisions on AI suggestions

> Add your own entries: which agent suggestions you accepted, rejected or changed, and why. The agent must not write this section.
