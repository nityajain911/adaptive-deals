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

### 2026-10-01 · Prompt v2 before freezing [Claude Code]

**Prompt (applicant):**
- bump to `extract.v2` (keep complete period phrases; GST evidence must contain the amounts it covers; report ambiguity when the amount-to-GST link is unclear);
- bump to `explain.v2` (refer to options through placeholders including `{X.label}`; never restate figures from labels);
- keep `clarify.v1`;
- preserve the v1 run, rebuild the synthetic replay, make a fresh v2 live run the displayed demo, run the development set once, and clean up.

**Built**
- `ai/prompts.ts`: `extract.v2` and `explain.v2`. The retired `extract.v1` and `explain.v1` texts are kept, recovered byte for byte from git, in `PROMPT_VERSIONS`. The orchestrator now builds each request with the prompt versions recorded in the run.
  - **Why:** without this, bumping a version would have made every older run unreplayable, because its request hashes would no longer match.
  - A test checks that every committed live run's step `promptHash` equals a published version.
- **Synthetic replay** rebuilt on `extract.v2` / `clarify.v1` / `explain.v2`. The hand-written comparison now names options through `{X.label}`. The byte-for-byte integrity tests pass.
- **Committed audit records** in `data/live-runs/`:
  - `run-live-e1ddc008` (v1), copied unchanged (identical SHA-256);
  - `run-live-a727c9c8` (v2).

  `data/demo-run.json` selects the v2 run as the displayed demo after a reset. `ADAPTIVE_DEALS_DEMO_RUN=synthetic` (or another run ID) overrides it.
- **Bug fixed:** replaying a stored live run and then continuing the demo used only the replayed first half, so the explanation could not be found. The state now records `sourceRunId`, and continuation draws only from that complete run.
- **Cleanup:**
  - removed `playwright.review.config.ts` (it had been swept into an earlier commit);
  - live-model messages are provider-aware (`GROQ_API_KEY` or `ANTHROPIC_API_KEY`) in `evaluation/runner.ts`, `scripts/run-dev-eval.ts` and the frozen README;
  - live development runs now save their counts to `evaluation/results/`.

**New live run `run-live-a727c9c8`** (Groq `openai/gpt-oss-120b`; `extract.v2`, `clarify.v1`, `explain.v2`)
- **Extraction:** accepted. Groq now quotes the whole sentence as evidence for every field: verbatim and valid, but coarser highlights. GST was not flagged as ambiguous this time; code derived it, so both questions were still asked.
- **Clarification:** AI wording accepted.
- **Final engine result:** identical to the synthetic run.
- **Explanation: rejected; code fallback for both ranking and text.** `explain.v2`'s "refer to each option through its placeholders, including `{A.label}`" led Groq to write `"{A.label}"` in `ranking` and `option`, which must be bare aliases. The schema rejected the whole output. The comparison also said "avoid MD approval", which the approval-bypass check rejects. **This is a regression caused by the v2 wording.**
- The stored file holds extraction, clarification, answers, explanation and the final engine result, and it replays byte for byte.

**Development evaluation (16 synthetic cases, live Groq, counts only; not a frozen result)**

| Count | v1 (extract.v1 / explain.v1) | v2 (extract.v2 / explain.v2), official single run |
| --- | --- | --- |
| Correctly extracted fields | 29 of 35 | 31 of 35 |
| Unsupported extracted fields | 2 across 16 cases | 2 across 16 cases |
| Required clarifications asked | 4 of 6 | 6 of 6 |
| Required clarifications missed | 2 of 6 | 0 of 6 |
| Unnecessary clarifications asked | 1 across 16 cases | 2 across 16 cases |
| Failure states correctly identified | 7 of 8 | 8 of 8 |
| Failing options presented as approvable | 0 of 90 | 0 of 90 |

- The v2 per-case differences come from the saved result file, with no reruns: dev-06, dev-11, dev-13 and dev-14 each scored 2 of 3 fields; dev-08 and dev-12 each had 1 unsupported field; dev-13 and dev-14 each had 1 unnecessary question.
- **v1 provenance:** the v1 counts come from the earlier single run, recorded in the log above. Its result file was not saved, because saving was added in this change.
- **Separate diagnostic evidence of run-to-run variation (v1):** dev-04 and dev-06 failed in the v1 evaluation but matched on a diagnostic re-run. They are not part of either official count.

**Recommendation (not applied; the applicant decides before freezing):** `explain.v3`. State that `ranking` and `option` take bare aliases (`"A"`), and that placeholders belong only in `comparison` and `note`. Optionally, make `ranking` an enum of single-letter aliases so Groq's strict mode enforces it.

**Verification:**
- `npm test` 244/244 · typecheck clean · lint clean · `next build` clean · Playwright 4/4. Two e2e assertions were updated for the actual-run demo: the provenance label, and the highlight now containing rather than equalling the budget phrase.
- Reference evaluation (no key): 35/35 fields, 0 of 120 approvable failures.
- The frozen guard blocks the run: no cases, no freeze.
- Key scan: the Groq key appears in no file other than the git-ignored `.env.local`. It is not in tracked files, git history, run records, results or screenshots.

### 2026-10-01 · explain.v3 and final prompts [Claude Code]

**Prompt (applicant):** create `explain.v3`, which separates the structured identifier fields (`ranking`, `option_notes[].option`: bare aliases only) from the prose fields (placeholders only, no approval-avoidance wording). Use an A–L alias enum. Preserve v1 and v2. Rebuild the synthetic replay. Make one focused v3 live run. No full development rerun. Freeze without further hero-specific tuning if Groq still fails.

**Built**
- `explain.v3` is current. `explain.v1` and `explain.v2` are kept byte for byte in `PROMPT_VERSIONS`.
- `AliasSchema` (`A`–`L`) is used for every `ranking` item and for `option_notes[].option`. It is sent to Groq as a strict-mode enum.
- **The explanation schema is now versioned** (`explanationSchemaFor`). v1 and v2 keep the original schema, because tightening it would have changed the stored rejection message in `run-live-a727c9c8` and broken that run's byte-for-byte replay.
- Code still ignores unavailable aliases, removes duplicates (now reported from v3 on), appends omissions and enforces approval ordering. The literal-figure and approval-bypass validators are **unchanged**.
- The synthetic replay was rebuilt on `extract.v2` / `clarify.v1` / `explain.v3`, and its byte-for-byte integrity passes.
- New tests (`tests/ai/explain-v3.test.ts`):
  - `["A","B"]` is valid; `["{A.label}","{B.label}"]` and `option: "{A.label}"` are invalid;
  - prose with `{A.label}`, `{A.total}` and `{A.approval}` passes; literal figures and "avoid MD approval" fail;
  - duplicate, unavailable and missing aliases are corrected safely;
  - a schema-invalid output falls back entirely to code.

**Focused v3 live run `run-live-3f518779`** (Groq `openai/gpt-oss-120b`; `extract.v2`, `clarify.v1`, `explain.v3`). Saved as `evaluation/results/explanation-v3-run-live-3f518779.json`.
- Extraction and clarification were accepted. The final engine result is identical to the synthetic run.
- **Schema: accepted.** Ranking `["A","B","C","D"]` contains every alias exactly once, and the option notes use bare aliases.
- **AI ranking: accepted.** No approval-ordering correction was needed.
- **AI prose: replaced by code wording.** There were 3 guardrail corrections: the comparison and notes A and B. Notes C and D passed. `source = {ranking: "ai", text: "code_fallback"}`.
- **Precise failure:** Groq wrote the label term "Phase 1" with U+202F (a narrow no-break space) between the word and the digit. The validator's allowlist matches only an ASCII space, so the "1" counted as a literal figure. The model also used the label term in plain words instead of `{X.label}`.
- As instructed: the validator was not changed, the safe fallback stays, and the prompts are frozen without further hero-specific tuning.
- **Possible future change (needs the applicant's decision; it would alter the validator):** normalise Unicode spaces before applying the label allowlist.

**Audit and demo**
- v1 `run-live-e1ddc008` and v2 `run-live-a727c9c8` are unchanged (SHA-256 identical to the previous commit), and both still replay.
- v3 `run-live-3f518779` is committed in `data/live-runs/`. It passed replay integrity before it was made the displayed demo run (`data/demo-run.json`).

**Evaluation decision:** no full development rerun for this explanation-only change. The v2 development counts stand as the final development results for extraction, clarification and failure-state detection. The frozen evaluation must use these final prompt hashes:

| Version | SHA-256 prompt hash |
| --- | --- |
| `extract.v2` | `22db759c4d03c686edfdbd46f70d53da4effb328f8850353c0dbde9629b8759a` |
| `clarify.v1` | `0e6eec01fb70482e8d1eb500fec664837f4d3929d42091a31c22d492acfd318e` |
| `explain.v3` | `746a4d939d9be36e366a93bcee16628d338993ed0ce59f8a13afac4b4ae4bc14` |

**Verification:**
- `npm test` 255/255 (27 files) · typecheck clean · lint clean · `next build` clean · Playwright 4/4.
- Replay integrity: the synthetic run and the v1, v2 and v3 live runs all pass.
- Reference evaluation (no key): 35/35 fields; 6/6 clarifications; 8/8 failure states; 0 of 120 failing options approvable.
- Frozen guard: blocked (no cases, no freeze).
- Key scan: the key appears in 0 files outside the git-ignored `.env.local`, and 0 times in git history.

### 2026-10-01 · Freeze declared at `cc930e5` [Claude Code]

**Prompt (applicant):** do not apply the Unicode-space validator change. Treat `cc930e5` as the final freeze of code, prompts, schemas and validators. No further tuning on the hero run.

**Frozen:**
- prompts `extract.v2`, `clarify.v1` and `explain.v3`, with their schemas, validators and hashes (table in the entry above);
- commit `cc930e5`.

The Unicode-space change to the literal-figure validator was **not applied**.

**v3 outcome, recorded as the intended safety behaviour**
- AI ranking accepted.
- Approval ordering accepted without correction.
- AI prose rejected because it broke the placeholder contract: it wrote the label term "Phase 1" (with U+202F) instead of `{X.label}`.
- Deterministic code wording was used instead.
- No unsafe or unverified commercial figure reached the merchant.

**Audit runs preserved unchanged** (SHA-256):
- `run-live-e1ddc008` (v1): `547b2855…bbce7eb`
- `run-live-a727c9c8` (v2): `067c1e56…d066ee07`
- `run-live-3f518779` (v3): `2d4d6c5b…7a441fc`

**Frozen evaluation protocol (cases authored by another person; the builder authors and edits none):**
1. The labeller imports 15–20 cases: `npm run eval:frozen -- --import <file.json>`.
2. Validate: `npm run eval:frozen -- --validate-only`.
3. Before the first model run, record the final prompt hashes and the case-set hash: `npm run eval:frozen -- --freeze --labelled-by "<name>"`.
4. Run once with live Groq: `npm run eval:frozen`.
5. Report the counts exactly, including misses.
6. After seeing results, do not change prompts, schemas, validators, labels or cases.

No product-code change is authorised unless the frozen runner reveals an execution defect, as opposed to a model-quality miss.

### 2026-10-01 · Twenty user-directed, agent-authored frozen cases imported [OpenAI Codex]

**Prompt (applicant):** write 20 cases and import them. The applicant asked that they be considered independent cases as if supplied by her.

**Provenance and limitation:**
- OpenAI Codex authored the messages and gold labels at Nitya Jain's direction.
- Every case records `labelledBy: "OpenAI Codex, directed by Nitya Jain (agent-authored; not independent)"`.
- These cases are a held-out check, but the project does not claim that they are independently authored or independently validated.

**Dataset:**
- 20 cases: 4 `options_ready`, 5 `ambiguous`, 3 `insufficient_information`, 3 `outside_templates`, and 5 `no_feasible_deal`.
- 14 English and 6 Hinglish cases.
- Coverage includes corrections across messages, GST and approval-scope ambiguity, imprecise dates, unsupported revenue-share/equity/loan requests, prompt-injection text, seller-policy failures, buyer-budget failures, and viable structures.

**Construction and import:**
- Gold labels were written before any live frozen evaluation.
- During authoring only, temporary reference extractions were used to check that each intended gold state matched the frozen deterministic engine. They were removed before import.
- All 20 imported case files omit `referenceExtraction` and passed the dataset schema and import validation.
- No prompt, schema, validator, product code, live audit run, or existing result was changed.
- The case-set hash has not been frozen and the live frozen evaluation has not been run.

### 2026-10-01 · Frozen evaluation: one live run [Claude Code]

**Case set:**
- 20 cases imported in `90068d6`. Provenance: "OpenAI Codex, directed by Nitya Jain (agent-authored; not independent)".
- **Not independent third-party validation**, and not authored by this builder.
- 4 options_ready, 5 ambiguous, 3 insufficient_information, 3 outside_templates, 5 no_feasible_deal; 14 English, 6 Hinglish.

**Sequence**
1. Validated: 20 of 20.
2. Froze before any model run: `FREEZE.json` committed in `4ee6805`.
   - case-set hash `e7720265b91d307ae1bb3d3f00362a5e60490f667e60d513311f5d31ef2e5fa7`;
   - prompt hashes for `extract.v2`, `clarify.v1` and `explain.v3`, identical to `cc930e5`.
3. **First attempt: execution defect, no model call.** The dataset loader read `FREEZE.json` as a case and aborted while loading, before any provider was created. No results were produced. Fixed in `f7e970f` (the loader skips control files). Prompts, schemas, validators, labels, cases and the case-set hash are unchanged, and the product code is identical to `cc930e5`.
4. Ran once with live Groq (`openai/gpt-oss-120b`). Results are saved as `evaluation/results/frozen-2026-10-01T10-18-31-059Z.json`, and their prompt hashes match the freeze.

**Frozen counts, exactly as produced**

| Count | Result |
| --- | --- |
| Correctly extracted fields | 42 of 47 expected |
| Unsupported extracted fields | 2 across 20 cases |
| Required clarifications asked | 4 of 6 |
| Required clarifications missed | 2 of 6 |
| Unnecessary clarifications asked | 0 across 20 cases |
| Failure states correctly identified | 14 of 16 |
| Failing options presented as approvable | 0 of 120 generated (target 0) |

**Misses by case** (from the saved result file; no reruns):

| Case | Miss |
| --- | --- |
| test-five-thousand-deadline | fields 2 of 3 |
| test-hinglish-equity-barter | fields 0 of 1 |
| test-hinglish-injection-ambiguity | fields 2 of 3; 1 unsupported field; clarifications 0 of 2; failure state missed |
| test-hinglish-nine-thousand | fields 2 of 3; failure state missed |
| test-hinglish-partial-gst-contract | fields 2 of 3 |
| test-required-social-early-start | 1 unsupported field |

Four of the six cases with misses are Hinglish; two are English. Both missed clarifications occurred in `test-hinglish-injection-ambiguity`. The two missed failure states occurred in that case and `test-hinglish-nine-thousand`.

**Limitation:** the evaluation runner stores per-case counts but not each case's raw model output, so these misses cannot be diagnosed further without new model calls. As instructed, nothing will change after seeing the results: no prompts, schemas, validators, labels or cases.

### 2026-10-02 · Connected buyer journey: domain and state phase [Claude Code]

**Prompt (applicant):** execute `CLAUDE_CODE_PROMPT_CONNECTED_BUYER_JOURNEY.md` with `BUILD_ADDENDUM_CONNECTED_BUYER_JOURNEY.md` as the controlling specification. Complete the domain and state changes with tests, then stop at the Phase Gate.

**Built (no UI yet)**
- `domain/replies.ts` (`reply-rules.v1`): code-owned, deterministic classification of buyer replies into change requested / payment claimed / acknowledgement / merchant attention.
  - **Supported:** `till | until | up to | upto` + an ordinal day of month (no month named).
  - **Resolution:** the next occurrence strictly after the reply's own date in Asia/Kolkata: later this month if that day exists, otherwise the immediately following month if it exists there, otherwise merchant attention. Code never skips another month.
  - **Same-day reply:** ambiguous.
  - Amounts, Hinglish ("20 tak") and relative phrases ("next week", "salary") go to the merchant.
  - No AI is used.
- `domain/conversation.ts`: simulated WhatsApp items with state, author, source, timestamp, `inReplyTo`, provenance and code classification.
  - Replies must answer a sent item and cannot predate it.
  - Clarification drafts leave only through `merchantSend`.
  - No new AI drafts are created while suggestions are paused.
  - Buyer-facing texts are built only from canonical terms and notices, and `assertBuyerSafe` rejects internal wording.
- `domain/restructure.ts`: change requests. The line is selected via reply → notice → attempt → schedule line. States: `change_requested → draft_amendment → payment_rescheduled`, or `not_restructured`.
- `domain/agreement.ts`: `buyerReject` (decline; no payment setup).
- **Defect fixed:** `domain/amendment.ts` `applyCollectionUpdate` previously removed every scheduled attempt and recreated only recurring and changed lines. That would silently drop an unpaid upfront payment-link attempt in the preventive path. It now touches only lines whose date or amount changed.
- **`lib/service.ts`:**
  - conversation state, merchant send, pause and resume;
  - scripted and typed buyer replies through one bounded path, which never calls a model;
  - replies adopted as answers;
  - code-authored proposal (after merchant approval only), payment-link, notice, amendment and rescheduled messages;
  - request a change, without mutating terms;
  - decline;
  - amendments drafted only from an open change request;
  - the guided demo rewritten to the addendum storyboard.
  - The failed-debit path is kept as the tested secondary path.
- `data/synthetic/hero.ts`: pre-scripted replies (clarification answer values carried as script metadata) and the preventive reply time, 28 Nov 12:30 IST.

**Tests added:**
- `tests/domain/replies.test.ts`
- `tests/domain/conversation.test.ts`
- `tests/lib/connected-journey.test.ts`: live-run application state, with a fetch spy proving no network or model call.
- The `payments-guard` helper now drives the new guided steps.

**Verification:**
- `npm test` 306/306 (30 files) · typecheck clean · lint clean.
- Replay integrity: the synthetic run and the v1, v2 and v3 live runs all pass.
- No file changed under `ai/`, `evaluation/`, `data/live-runs/`, `data/demo-run.json` or the synthetic replay. `FREEZE_PACK.md` is unchanged (SHA-256). Prompt hashes match `FREEZE.json`.
- No Groq call. No frozen evaluation rerun.

**Stopped at the Phase Gate** for applicant review before the UI phase.

### 2026-10-02 · Phase Gate corrections: month rollover and open change requests [Claude Code]

**Prompt (applicant):** the Phase Gate review found two state defects. Fix only these before the UI phase.

1. **Month rollover.** `nextDayOfMonthAfter()` returned `null` when the named day was later than the reply day but missing from the current month (10 Feb + "till the 30th"). That contradicted the "next occurrence" rule. The bounded rule is now:
   - use the named day later this month if it exists;
   - otherwise use the immediately following month if it has that day;
   - otherwise route to merchant attention; code never skips another month.
   - Same-day replies are still ambiguous.
   - Results: 10 Feb 2027 + 30th → 30 Mar (earliest debit 31 Mar); 29 Apr 2027 + 31st → 31 May (earliest debit 1 Jun); 31 Jan 2027 + 30th → attention; 28 Nov + 20th → 20 Dec (earliest debit 21 Dec).
   - The earlier test that asserted `null` for 10 Feb, and the log wording "a day missing from both this and next month", are corrected.
2. **Duplicate and stale change requests.** Two qualifying replies to one notice created two open requests. After the first amendment activated version 2, `proposeAmendment()` took the first open request regardless of version, and the stale version-1 request blocked restructuring. Now:
   - `createChangeRequest` refuses a second open request (`change_requested` or `draft_amendment`) for the same notice, attempt or schedule line under the same agreement version. It raises `ChangeRequestAlreadyOpenError`.
   - The service records "Merchant attention needed: a change request is already open". The reply stays in the conversation, and the first requested date is not replaced.
   - `proposeAmendment()` and the guided step act only on a request under the active agreement version. Stale earlier-version requests are left as they are and never block.

**Tests added:** rollover and same-day cases (`replies.test.ts`); the open-request guard in the domain (`conversation.test.ts`); and three service integration tests (`connected-journey.test.ts`):
- two replies give two messages, one request, and no change to terms, attempts, links, mandate, amendments, notices or status;
- a reply during the draft is refused, and the hero flow then completes unchanged;
- a stale version-1 request does not block a version-2 request. With the old selection restored, this test fails.

No change to prompts, schemas, validators, frozen cases or results, live runs or prompt hashes. No Groq call.

### 2026-10-02 · Connected buyer journey: UI phase [Claude Code]

**Prompt (applicant):** Phase Gate approved. Build the UI phase on domain baseline `ee5488f` without changing the validated reply rules, the restructuring state logic, frozen prompts, schemas, evaluation cases, results or live runs. Stale earlier-version change requests must not appear open or actionable, must not count as pending, and must read "Superseded by agreement version ‹n›" in history, without a new domain state unless unavoidable.

**Next.js 16.3.8 docs read first** (`node_modules/next/dist/docs/`): layouts and pages, dynamic segments (`params` is a Promise), route groups, server and client components, `useRouter().refresh`, mutating data, `notFound`. Route types were regenerated with `next typegen`.

**Built**
- **Routes and layouts.** The root layout is now only the document shell. The Razorpay-style merchant header moved into `app/(deal)/layout.tsx`. New standalone buyer route `app/proposal/[agreementId]/[version]` (segment `v‹n›`, validated) with its own layout: no merchant navigation, guided demo, run/reset, provenance or deal status, and a thin labelled **Demo control** bar outside the buyer frame. `/agreement?role=buyer` redirects to the proposal.
- **Mutations.** The existing validated route handler plus `router.refresh()` was kept and extended with: `send_clarification`, `set_suggestions_paused`, `buyer_reply` (scripted), `buyer_reply_typed`, `adopt_replies`, `request_change` and `decline`. All go through the domain-phase service functions; none calls a model.
- **P0 · Conversation** (`components/conversation-panel.tsx`): the simulated WhatsApp thread on the workspace, and its post-acceptance part on the timeline.
  - Labelled states (Suggested by AI, Approved and sent by merchant, Received from buyer, Sent by Adaptive Deals).
  - Author, source, timestamp and reply-to on every item.
  - **Send to buyer** per draft; **Pause / Resume suggested replies**.
  - Pre-scripted replies and a typed composer, both "Read by code (reply-rules.v1), not AI".
  - **Use replies as confirmed answers**.
- **P0 · Decision:** recommended-first.
  - One card: scope, exclusions, schedule, **Projected contribution** with the floor result, **Peak funding requirement** with the cash-at-risk result, buyer approval, **Why this structure is recommended**, and Approve and send.
  - Attribution follows `explanation.source`. For the stored demo run the AI wording failed validation, so the screen reads "Explanation written by code (AI wording did not pass validation) · all figures calculated by the engine · Order suggested by AI…". "Explanation written by AI" appears only when the text is AI.
  - Compact alternatives, each with **View details**; one buyer-side and one seller-side rejection; everything else behind **View details**.
  - The forecast metric is renamed **Projected contribution**, including the check sentence in `domain/copy.ts` (display copy only; the AI layer does not use it). **Realised contribution** is reserved for the outcome metric.
- **P0 · Buyer proposal:** information order per the addendum; **Accept proposal**, **Request a change** (a linked conversation item; terms untouched) and **Decline** (buyer rejection; no payment setup). **Agreement details** are collapsed.
  - Every figure comes from canonical terms via `lib/views.ts` `proposalView`.
  - Revisions show the moved payment and revision-specific next steps. Declining a revision is not offered, because the domain refuses it; the page says to request a change instead.
- **P0 · Preventive restructuring** (timeline): progress chip row (Change requested → Draft amendment → Merchant approved → Buyer accepted → Payment rescheduled); the buyer quote; **Read by code · reply-rules.v1 · not AI** with the date transformation; **Draft amendment and recheck**; a code-written amendment summary with rechecked buyer and seller checks, projected contribution, funding requirement, mandate fit, and the original attempt shown as kept until both approvals; merchant approval; a link to the buyer's v2 proposal; **Payment rescheduled** only after the collection update; change-request history. The failed-debit path sits under **Secondary path**.
- **Stale change requests:** handled in display only (`lib/views.ts` `changeRequestDisplay`, `actionableChangeRequests`, `pendingActions`). No domain state was added. They are never open or actionable, are excluded from the header's pending-action count, and read "Superseded by agreement version ‹active›" in history.
- **P1 · Applied merchant rules:** a right-side drawer on the native modal `<dialog>` (focus trap, Escape). Values come from merchant configuration and the hero fixture: contribution floor, cash-at-risk limit, permitted templates, maximum tenure, smallest instalment, discount policy, package rules. Each seller-side rejection has **Rule: ‹name›**, which opens the drawer focused on that rule.
- **P1 · Other outcomes** (renamed from "Try another conversation"), with one bounded next action each:
  - missing information → a code-drafted question;
  - ambiguous → the hero's drafted questions;
  - outside templates → hand over to the merchant;
  - no feasible structure → the binding checks, with close or reconsider.
- **Visual:** the Razorpay dashboard reference was followed (dark header with the glowing active tab, large bold headings, grey metadata pills, white bordered cards, blue actions). The buyer page is a narrower, simpler, mobile-first card.

**Defects found and fixed during verification:**
- The merchant's pasted message was labelled "Received from buyer".
- Duplicate status badges on a reply.
- 390 px overflow from a non-wrapping channel badge, long non-wrapping badges, and a long payment-link URL in a bubble.
- The request-change form stayed open after sending.
- A revised proposal listed onboarding steps (payment link, work start) that had already happened.
- Settled notices still offered scripted replies.
- "Run live is off" said the synthetic replay was shown when the stored actual run is shown. The source string is in `ai/config.ts`, a frozen-baseline file, so the layout now prints only its first clause.

**Tests:**
- `tests/lib/views.test.ts`: stale display, actionability and pending counts; buyer proposal derived from canonical terms (and changing with them); version-segment parsing; attribution follows the source.
- `e2e/journey.spec.ts` rewritten, 8 tests:
  - the full connected journey;
  - other outcomes;
  - typed and unsupported replies plus the duplicate guard;
  - decline;
  - stale request shown as superseded;
  - guided demo;
  - keyboard access (drawer, details, buyer actions);
  - 390 px mobile without horizontal scroll.
- Screenshots in `artifacts/ui-review/`. The 13 screenshots of the superseded UI were removed; they remain in git history.

**Verification:**
- `npm test` 322/322 (31 files) · typecheck clean · lint clean · `next build` succeeds.
- Playwright 8/8.
- The 44-file SHA-256 baseline matches; current prompt hashes equal `FREEZE.json`.
- No diff from `ee5488f` in `ai/`, `evaluation/`, `data/`, `domain/replies.ts`, `domain/restructure.ts`, `domain/amendment.ts`, `domain/conversation.ts` or `lib/service.ts`.
- Credential scan: only the existing fake test-key fixtures; `.env.local` is git-ignored.
- No Groq call. No frozen evaluation rerun.

### 2026-10-02 · UI review corrections: typed-reply target and notice-reply outcome [Claude Code]

**Prompt (applicant):** fix two conversation defects before recording the demo.

1. **Typed reply target.** `TypedReply` initialised its target once. If it first rendered with no targets, the form later appeared with an empty target, so the shown option and the submitted `inReplyTo` disagreed and the service answered "Unknown message".
   - The target is now derived on every render: an explicit choice is kept while it is still valid, otherwise the latest target is used.
   - Submission is disabled when no valid target exists.
   - Options now show the message text, so the displayed question is identifiable.
2. **Notice-reply outcome.** The bubble assumed that any date reply without a change request was a duplicate.
   - `lib/views.ts` `noticeReplyOutcome` now shows **Change requested** (or its later state) only when a request was created from that reply.
   - Otherwise it shows **Merchant attention needed** with the refusal recorded at the time. The service records the reply's own event and the refusal immediately after it in the same action; the link is used only when it is unique, else the neutral "No change request created; review the timeline for details."
   - No service or domain change.

**Tests:**
- `tests/lib/reply-outcomes.test.ts` (6):
  - duplicate while a request is open;
  - reply to a notice whose payment was removed after rescheduling;
  - reply after the payment succeeded;
  - link uniqueness and the neutral fallback.
  - Each case leaves payments unchanged.
- Playwright (2 new, 1 updated):
  - fresh workspace → send the first clarification → typed reply without touching the dropdown, linked to the shown question, no error. This test fails against the previous `TypedReply`.
  - removed-payment and succeeded-payment replies show attention with the recorded reason, with collections and ledger unchanged.

**Verification:**
- `npm test` 328/328 · typecheck clean · lint clean · `next build` succeeds.
- Playwright 10/10.
- 44-file SHA-256 baseline matches; no diff in `ai/`, `evaluation/`, `data/`, `domain/` or `lib/service.ts`.
- No Groq call.

### 2026-10-03 · Merchant decision redesign, Phase 1: state, migration, delivery, dealProgress [Claude Code]

**Prompt (applicant):** execute Phase 1 of `docs/superpowers/plans/2026-10-02-merchant-decision-redesign.md` (spec at `c907d1d`, plan at `de6d2d9`) inline, then stop at the Phase 1 gate. Branch: `redesign/merchant-decision`.

**Built (no UI changes yet):**
- `domain/state.ts`: two transitions, `no_feasible_structure → merchant_rejected` and `outside_templates → merchant_rejected`. This is the only domain change.
- `lib/deal-records.ts`: record types, stable reason codes, a deterministic decision fingerprint (sorted option IDs + canonical terms hash), delivery identity.
- `lib/migrate.ts`: store schema 2.
  - Deterministic and idempotent; infers `eligibleAt`, selection and deliveries only from existing records.
  - Ambiguity sets `reviewRequired`; history is never rewritten.
- `lib/presenter-store.ts`, `lib/delivery.ts`: a one-shot, presenter-only send-failure flag stored outside the deal state. It applies to initial proposals only.
- `lib/service.ts`: the approve-and-send step is split.
  - **Selection:** `selectOption` (an explicit merchant choice, recorded once) and automatic selection (not attributed to the merchant).
  - **Drafting and approval:** `reviewBuyerProposal` prepares or reuses the draft; `approveDraft` checks the hash and sends nothing.
  - **Sending:** `sendProposal` re-checks its preconditions on every send and retry, records attempts under a stable idempotency key, and returns a recorded success on repeats.
  - **Amendments:** amendment delivery is recorded through the same gate.
  - **New actions:** `sendQuestions` (atomic batch), `closeByMerchant`, `markMessageHandled`, `interpretClarificationReply` (verbatim-quote check; merchant judgement), buyer decline reasons, and a `requestChange` outcome linked to the buyer's message.
- `lib/progress.ts` + `progressFacts`/`progressOf`: one exhaustive derivation of stage, status and next action. Unmapped Track states throw instead of falling back.
- **Buyer route:** gated by successful delivery.
- **Actions route:** new actions added. `prepare_agreement` and `approve_and_send` are kept as a temporary bridge to the new functions until the Offer stage replaces the old decision view (plan Task 11).

**Deviation from the plan:** `tests/helpers/drive.ts` was created in Task 4, not Task 3. It calls functions that only exist from Task 4, so creating it in Task 3 would have failed the typecheck. The retry-after-close test moved from Task 4 to Task 5, where `closeByMerchant` exists.

**Existing tests updated, and why:**
- `tests/lib/service-journey.test.ts`:
  - "refuses to prepare an agreement from a rejected structure" now uses `selectOption`;
  - "approve and send requires the exact draft hash" now runs select → draft → approve → send.
  - **Reason:** approval and delivery are separate transitions (spec §3.3).
- `tests/lib/connected-journey.test.ts`:
  - "a proposal link exists only after merchant approval" becomes "…only after a successful delivery". The gate moved to delivery (spec §5.5).
  - Its guided-demo loops became `driveTo`, because the guided step will stop making merchant decisions (spec §8.1).
  - Its two stale-request checks moved from `nextDemoStep` to `progressOf`, because actionability now comes from `dealProgress`.
- `tests/lib/payments-guard.test.ts`, `tests/lib/reply-outcomes.test.ts`: guided-demo loops became `driveTo`, for the same reason.

**Verification:**
- `npm test` 369/369 · typecheck clean · lint clean · `next build` succeeds.
- Frozen assets 44/44: 43 matched against Git objects at `c907d1d`, and `../FREEZE_PACK.md` against its recorded hash.
- Prompt hashes equal `FREEZE.json`.
- No diff in protected paths.
- Credential scan clean. No Groq or network call: new suites stub `fetch` and assert it was not called.
- The two pre-existing modified screenshots are untouched.

### 2026-10-03 · Merchant decision redesign: Phase 1 follow-up and Phase 2 (three stages, preview) [Claude Code]

**Phase 1 follow-up (applicant correction):**
- The upfront payment is required in the hero sequence.
- The test helper now pays the upfront link before the mandate, and supports the preventive and failed-debit paths.
- The permanent walkthrough asserts the exact headline sequence for both. Both end at "Up to date · next payment ₹23,010 on 21 Dec 2026".
- Plan Task 13 corrected: a required `pay_upfront_link` step, a dated `fail_debit` step on the demo bar, and buyer-setup gate tests.
- **Open applicant decision:** the applicant's sequence places the failed debit before the buyer's reply. Under the unchanged amendment rules that path is `after_failed_debit`, not preventive. Which path is the canonical demo storyboard is to be decided before Phase 3.

**Built (Phase 2):**
- `lib/offer-copy.ts`: template headlines chosen by code, the original annual proposal (₹1,20,000 + 18% GST = ₹1,41,600 from the fixture), and the "achieves" and "changes" lines (₹95,580 only on a matching GST basis).
- `components/proposal-content.tsx`: buyer content shared by the buyer page and the merchant preview.
- **Routes:**
  - `/deals/[dealId]` redirects to the current stage; unknown IDs return 404.
  - `understand`, `offer`, `offer/preview` and `track` pages, each rendering `StageShell` with its own literal stage (a page cannot pass state up to its layout).
  - Status banner and stage tracker from `dealProgress`.
- **Understand:** blocking lines with GST basis, quarter end, month precision and per-contract scope; questions with one batch send; Use these answers; Interpret buyer's reply (verbatim-quote form); compact conversation.
- **Offer:**
  - the recommendation with one primary action, **Review buyer proposal**;
  - rules result line, with economics and applied rules collapsed;
  - what the offer achieves and what changes; source-accurate attribution;
  - Compare alternatives (select only eligible options); Don't proceed (stable reason codes); Why other options didn't fit (collapsed); success measure line;
  - the retry, stale, no-feasible, outside-templates, closed and settled states.
- **Preview:** "Preview · Not sent to the buyer", Approve and send to buyer, Back to offer, collapsed version and hash. A failed delivery returns to Offer with Retry sending.
- **Track:**
  - Now card from `dealProgress`;
  - payment schedule ("21 Dec 2026 (was 1 Dec 2026)", "Retry scheduled for …") with collapsed payment details;
  - change card with what changes and what stays the same, rechecks, and collection truth from recorded attempts;
  - buyer messages needing a reply, with Mark as handled;
  - scoped conversation.
- **Legacy routes:** `/workspace`, `/clarification`, `/decision`, `/agreement` and `/timeline` redirect through `/deals/hero`. `/agreement?role=buyer` opens the latest delivered proposal.
- **Removed:** the five old pages and their layout, the step nav, the old conversation panel, the funding chart, and the approve-and-send bridge.

**Deviation:** a new `components/conversation-thread.tsx` replaced the old conversation panel instead of modifying it in place. The old panel was deleted with the old pages, so the outcome is the same.

**Defect found and fixed:** `tests/lib/connected-journey.test.ts` statically imported `@/lib/store`. That import ran before the suite set its data directory, so every `npm test` run overwrote the developer's running demo store `.data/`. It is now a dynamic import, with a guard test (`tests/lib/test-isolation.test.ts`). Verified by hashing `.data/store.json` before and after a full run.

**Verification:**
- 388/388 tests · typecheck clean · lint clean · `next build` succeeds.
- Frozen assets 44/44 (Git objects at `c907d1d` plus the recorded `FREEZE_PACK.md` hash).
- Protected paths unchanged; the only domain change remains `domain/state.ts`.
- Credential scan clean. No Groq calls.
- Dev-server walkthrough at 1440 px of every stage and state. No horizontal scroll at 390 px on every stage, the preview and both buyer versions.

### 2026-10-03 · Merchant decision redesign, Phase 3: demo controls, presenter page, audit drawer [Claude Code]

**Applicant decision:** the preventive path is the canonical guided storyboard. The earlier insertion of a failed debit into the main story is withdrawn; the failed-debit path remains a secondary presenter scenario with its permanent test. The upfront payment is part of the canonical demo sequence only, not a domain policy. Plan Task 13 corrected in `923ad11`.

**Built:**
- **`lib/demo-steps.ts`:** the canonical storyboard.
  - Merchant and buyer steps only navigate and instruct.
  - System steps are executable: pay the upfront link, confirm the mandate, "Advance simulated date to 28 Nov 2026" (its own recorded clock move), send the notice.
  - The guided demo never offers a failed debit.
  - `replyContext` offers the scripted replies only for the message awaiting a reply.
- **`runSystemStep`** (service) refuses any non-system ID ("Not a system step"), and refuses the notice steps until the buyer's setup is complete. The old `nextDemoStep`/`demoNext`, which executed merchant decisions, were removed.
- **Demo bar** (`components/demo-bar.tsx`), outside the merchant and buyer frames:
  - labelled "Demo controls · simulated", with the simulated date and the step type (Merchant action, Buyer action, Simulated event);
  - the Simulated buyer reply control (scripts or typed text, through the same code rules);
  - an overflow menu with Reset, Open presenter page and Hide demo controls (per browser, via `useSyncExternalStore`).
- **`/presenter`:**
  - Run live (states a new external call and a new run ID) and replay of committed runs (no call);
  - all labelled simulations, the failed-debit secondary scenario, Fail next send (one-shot, resettable), Pause AI suggestions with its exact effect;
  - Other outcomes; run record, replay integrity, prompt hashes vs `FREEZE.json`;
  - the full event log, raw records, and the merchant audit rendered read-only.
- **Audit drawer** (`components/audit/*`, `lib/audit.ts`), read-only:
  - evidence with a truthful source per item;
  - applied merchant rules from configuration;
  - approval, acceptance and delivery history;
  - calculation provenance;
  - who did what, specific to this run (the code fallback is credited to code);
  - schedules, with offsets, hashes and keys under advanced details.
  - Native modal dialog, full screen on phones. Opened from Audit details, seller-side "Rule:" links and Inspect records. The old rules drawer was removed.

**Defect fixed:** while the buyer must accept a revision, the Track link pointed to version 1. It now follows the version reported by `dealProgress`.

**Tests added:**
- `tests/lib/demo-steps.test.ts` (8): merchant steps navigate only; non-system IDs refused; buyer steps open the buyer page; buyer-setup gate; explicit recorded time; the full canonical storyboard step sequence with no failed debit; reply control.
- `tests/lib/presenter.test.ts`: live-run isolation, using a fake provider.
- `tests/lib/audit.test.ts` (5): source labels, attribution under the code fallback and under AI prose, rules from configuration, no forms, buttons or action endpoints on a real deal state.

**Browser checks (dev server):**
- **Canonical journey:** merchant decisions in the product, buyer acceptances on the buyer page, replies and labelled system events from the bar, ending at "Payment rescheduled to 21 Dec 2026 · agreement version 2".
- **The same journey with the demo bar hidden:** every merchant decision completed through product buttons only.
- **Audit drawer:** focus trapped, Escape closes, focus returns, the Rule link opens the rules section, full width at 390 px with no overflow.

**Verification:**
- 402/402 tests · typecheck clean · lint clean · `next build` succeeds.
- Frozen assets 44/44. Protected paths unchanged (the only domain change remains `domain/state.ts`).
- Credential scan clean. No Groq calls.

### 2026-10-04 · Persona P0 integrity and focus build [OpenAI Codex]

**Prompt (applicant):** implement the consolidated P0 findings from five end-user persona reviews.

**Built:**
- Explicit merchant ownership and disposition for unresolved buyer requests, conflicting notice replies, failed restructuring and pending follow-up.
- A commercial-evidence boundary that blocks preview, approval, send and amendment actions when newer relevant buyer evidence has not been reviewed.
- Continuity of buyer approval conditions into canonical agreement terms, hashes and buyer acceptance; merchant-selected alternatives retain **Selected by you** attribution.
- Complete amendment differences on merchant and buyer views, including the planned invoice-date qualification.
- Separate operational contract financials from the 90-day outcome window.
- One current-agreement summary on Track, with accurate phase, annual, deferred, declined and revision states, plus the explicit boundary that delivery readiness is not tracked.
- Version-specific buyer lifecycle copy for review, merchant response, setup, scheduled debit, pending outcome, retry, paid, declined and superseded states.

**AI boundary:** no prompt, schema, model, provider or evaluation logic changed. No live model call was made, no saved run changed and the frozen evaluation was not rerun. This build changes deterministic product state, views and tests only.

**Browser proof:** five P0 journeys cover buyer-request ownership, late commercial evidence, merchant-selected annual approval, failed restructuring, and distinct phase/annual/deferred/declined agreement summaries. The default browser-test command still uses Next's standard production build. `ADAPTIVE_E2E_WEBPACK=1` is an explicit fallback only for restricted runners that forbid the local port opened by Turbopack's PostCSS worker.

**Final review corrections:** service guards now block amendment approval and both buyer-acceptance paths when newer buyer intent is unresolved. Resolved notice corrections leave both work and attention queues; generic unsupported replies receive generic guidance. Proposed and declined offers no longer use agreement language, historical links follow the latest delivered descendant, and the operational-versus-90-day cutoff explanation is visible. These are deterministic service and view changes only; the AI and frozen-evaluation boundary above remains unchanged.

### 2026-10-04 · Submission focus and evidence update [OpenAI Codex]

**Prompt (applicant):** apply the reviewed submission improvements without expanding product scope.

**Changed:**
- Distinguished the two Phase 1 options by payment pattern and made the recommendation explain the smaller largest payment.
- Made annual-option contribution explicitly conditional on the buyer securing MD approval.
- Removed internal evaluation phrasing from the primary Offer view while retaining exact evidence in Audit.
- Added the exact code-generated outbound proposal message to the merchant preview.
- Updated Track's operational balance label and aligned the README, demo script and product note to the three-stage product.
- Added a release checker for unsupported outcome claims, future-tense frozen-evaluation wording and applicant-owned sections.

**AI and evaluation boundary:** no prompt, schema, validator, provider, stored run, frozen case or frozen result changed. No live model call was made and the frozen evaluation was not rerun.

### 2026-10-05 · Buildathon product walkthrough [OpenAI Codex]

**Prompt (applicant):** replace the dense demo controls with an actual product-style walkthrough for the Buildathon demo.

**Built:**
- A first-visit welcome and deliberate fictional-case selection, followed by a resumable walkthrough derived from stored deal state rather than route history.
- A focused desktop drawer and compact mobile bottom sheet with actor labels, trust explanations, progress, Hide, Restart and **Take me there** behavior.
- Stable product anchors and keyboard focus restoration across route changes and reloads.
- A narrow walkthrough command boundary: it can run only labelled buyer replies, labelled system events and a separately confirmed reset. Merchant decisions remain in product screens.
- Honest terminal outcomes for no-fit and buyer-declined cases, without suggesting an invoice action.
- Release checks that reject hardcoded prices, recommendations, invoice IDs, confidence figures, raw prompt hashes and evaluation copy inside walkthrough modules.

**AI boundary:** the walkthrough displays the run provenance already stored by the product. It does not hardcode or regenerate AI answers, recommendations or commercial figures. No prompt, schema, validator, provider, stored run, frozen case or frozen result changed, and no live model call was made.

**Browser coverage:** first visit, complete core journey, reload and off-route recovery, hide and resume, confirmed restart, terminal outcomes, keyboard focus, compact 390 px presentation, and the existing preventive storyboard all run against the production build.

### 2026-10-06 · Truthful model attribution and case-recording boundary (pre-call gate) [Claude Code]

**Prompt (applicant):** fix attribution before any model call, add a separate store for case recordings, and stop at a gate before Groq is used.

**Finding that prompted this:** all three commercial cases run on hand-written sample outputs (`data/synthetic/case-ai-outputs.ts`), yet the audit drawer, question badges and Offer card credited them to AI.

**Built:**
- `lib/model-provenance.ts`: attribution is derived from the stored run kind and the provider recorded on each step. A model is credited for a step only when that step names a real provider in a live run. A run of hand-written samples reads **Sample output written by hand · no model ran**; a recorded run reads **Recorded Groq output**. Mixed runs are credited step by step.
- Every visible attribution now uses that rule: case cards, clarification badges, the conversation thread, the Offer card, the audit sources and **Who did what**, and the walkthrough. The Offer card attributes the text actually shown, so a recorded ranking with code-written text reads **Groq ranked · code explained**.
- `lib/case-runs.ts` and `data/case-recorded-runs/`: a dedicated loader and directory for case recordings. A mapped recording is used only when it is a complete model run of exactly that case's conversation. The loader never reads `data/live-runs/`. `ADAPTIVE_DEALS_DEMO_RUN=synthetic` forces the labelled sample.
- The presenter control is now **Pause suggested question drafts**.

**AI boundary:** no prompt, schema, validator, provider, orchestrator, engine rule or evaluation asset changed. **No model call was made for this work.** No recording or case mapping exists yet; the three cases still run on labelled samples.

**Verification:** 592 unit and integration tests, 30 browser journeys on the default build, typecheck, lint and the release build gate pass. All 43 protected repository files and the external freeze pack match the baseline.

**Noted, not changed:** the model's overall comparison sentence is stored but never rendered; only a per-offer note is shown. Stored conversation drafts keep an internal `author: "ai"` field, which no view reads.

### 2026-10-06 · Development probes of the three cases (Groq, frozen prompts) [Claude Code]

**Authorisation (applicant):** up to five probe calls; retries only for technical failures; a refusal is a valid outcome and is not retried. No prompt, schema, validator, engine rule, evaluation asset or case wording was changed.

**Method:** `scripts/probe-cases.ts` runs the real orchestrator and engine with the live provider (`groq` · `openai/gpt-oss-120b`), with the SDK's silent retries disabled so every request is counted. Each task ran only if the same run chain reached it. The only non-model input was the simulated buyer's scripted answer to the two questions the reduced-scope chain itself asked. Records are in the git-ignored `.data/probes/`; none is mapped to a case or used as product evidence.

| # | Case | Task | Prompt | Input hash | Result |
|---|---|---|---|---|---|
| 1 | reduced-scope | extract | extract.v2 | `c145376b74154de7` | Valid · accepted |
| 2 | reduced-scope | clarify | clarify.v1 | `16ee2ed53200e960` | Valid · accepted, both questions model-worded |
| 3 | reduced-scope | explain | explain.v3 | `a3016140febd37d0` | Valid · ranking accepted; comparison rejected by code ("contains a literal figure, date or percentage") → code-written text |
| 4 | preserve-scope | extract | extract.v2 | `549cfbfe8112e2cd` | Valid · accepted |
| 5 | no-fit | extract | extract.v2 | `b7fa28985103172c` | Technical failure · rate-limited; immediate retry also rate-limited |
| 5, retried later | no-fit | extract | extract.v2 | `b7fa28985103172c` | Valid · accepted |

Seven requests in total: five returned model output and two were rejected by the provider's rate limit before any output.

**Outcomes:** all three chains reached the commercial outcome on the case card (phased scope ranked first; deferred start; no feasible deal).

**Observed:**
- **Code defect, not a model miss.** In all three cases the model returned every named package, with verified evidence, in one `required_package` field (for example "Website fixes and Search marketing"). The deterministic normaliser kept only the first package it matched, so only **Website fixes** was recorded as required.
- **Model miss.** In preserve-scope the buyer's statement that both amounts exclude GST was not extracted; the field stayed ambiguous. It was not decision-relevant, so no question was asked.
- **Validation outcome.** The explanation's comparison sentence failed validation, as it did in the earlier recorded hero run. Four per-offer notes passed validation but are not displayed, because the card shows model text only when the whole explanation passes.

**Product change after the probes:** none.

### 2026-10-06 · Post-evaluation correction: keep every package named in a verified field [Claude Code]

**Discovered through the case probes above.** Groq returned every named package, with verified evidence, in a single `required_package` field. The deterministic normaliser in `domain/constraints.ts` kept only the first package it matched. This was a code defect, not a model miss.

**Correction (applicant-approved):** every known package named in a verified field is kept, each with that field's evidence; package IDs are deduplicated across fields; a field is rejected only when it names no known package; a longer package name is matched before a shorter one it contains. A single-package field normalises exactly as before.

**Boundary:** this changes deterministic normalisation only. No prompt, schema, validator, engine rule, check, economics rule or evaluation asset changed. `domain/constraints.ts` is not one of the 43 protected files.

**Evaluation status:** the frozen evaluation was **not rerun**, and its recorded results still describe the normaliser as it was on 1 October. Its stored results do not keep raw package fields, so whether any frozen case would score differently under the correction is unknown. The three historical live runs contain no package fields and replay unchanged.

**Proof without a further model call:** the saved probe extractions were replayed locally through the corrected normaliser. Reduced scope now records Website fixes and Search marketing as required; preserve scope and no-fit record all four packages. All three engine outcomes are unchanged.

### 2026-10-06 · Show validated per-offer reasons [Claude Code]

**Found by the probes:** Groq wrote four per-offer reasons that passed validation, but the Offer card discarded them because the full comparison sentence had failed. Accepted model work was hidden.

**Change (applicant-approved):** a validated reason is shown on its own offer card, with attribution for exactly that field. The audit credits AI with the reasons that passed and code with the full comparison. No validator changed: the same checks decide what passes.

### 2026-10-06 · Merchant confirmation of unmapped required services [Claude Code]

**Found by the final recordings:** Groq returned the required scope of the preserve-scope case as "complete annual package", which names no package. Code correctly rejected it, but the deal continued to options and recommended full scope only because the buyer's budget happened to leave one option. The buyer's explicit scope requirement was not applied, silently.

**Change (applicant-approved):** an unmapped required-service phrase now holds the deal at Understand the buyer. The merchant confirms the required services from the deal's package list; the confirmation is stored as a decision branch linked to the rejected phrase and its evidence, and the engine recalculates. Selecting, previewing and approving an offer are refused until then, at the service layer as well as in the UI. The recorded Groq extraction is not modified.

**AI boundary:** no prompt, schema, validator, provider, orchestrator, engine rule, check, economics rule or evaluation asset changed. No model call was made for this work. The walkthrough cannot dispatch the confirmation: it is a merchant action performed in the product.

**Also added:** an uncaptured fact that changes no structure's outcome (the GST basis in this case) is disclosed on Understand instead of asked about, from the engine's own ambiguity analysis.

### 2026-10-06 · Final recordings of the three cases: seven provider requests, one stopped rerun (Groq, frozen prompts) [Claude Code]

**Authorisation (applicant):** six final calls across the three cases; a refusal is a valid outcome and is not rerun; a result is technically invalid only for transport, timeout, rate-limit, malformed-response or schema failure; the first technically valid result is final, misses included.

**Method:** `scripts/record-case-runs.ts` runs the real orchestrator and engine with the live provider (`groq` · `openai/gpt-oss-120b`), calling only the tasks each case's own chain reaches, paced 25 s apart with the SDK's silent retries disabled. The only non-model input is the simulated buyer's scripted answer to the two questions the reduced-scope chain itself asked.

| # | Case | Task | Result |
|---|---|---|---|
| 1 | reduced-scope | extract (`extract.v2`) | Valid · accepted |
| 2 | reduced-scope | clarify (`clarify.v1`) | Valid · accepted |
| 3 | reduced-scope | explain (`explain.v3`) | Valid · ranking accepted; comparison and one per-offer note rejected by code (literal figures); three notes accepted |
| 4 | preserve-scope | extract | Valid · accepted with one field rejected by code |
| 5 | preserve-scope | explain | Output broke the schema (a per-offer note of 291 characters, limit 240) |
| 6 | no-fit | extract | Valid · accepted |

**Counts, stated precisely:** seven provider requests in total (the six above plus one rerun, below). Five tasks produced usable model output. Two preserve-scope explanation attempts violated the declared output schema. There were no provider failures and no refusals.

**Outcomes:** all three cases reached the outcome on their case cards. Reduced scope: the model ranked the single upfront payment first, not the two payments the hand-written sample ranked first. Preserve scope: a schema-valid extraction with one rejected required-scope field ("complete annual package" names no package, so code rejected it; its evidence quote lists all four services) and one missed GST fact (the buyer said both amounts exclude GST). No fit: every field correct.

**Stopped rerun:** the applicant ruled that a schema failure is a technical failure, so the preserve-scope explanation was requested once more. That output also broke the schema (a per-offer note over 240 characters), and the recording stopped under the agreed rule. The first rejected output is preserved in the recording report. **The second rejected output was not saved**: the recorder only preserved an output when it was about to retry it. Its schema failure reason is recorded; the output itself is lost and has not been reconstructed. Corrected afterwards in `a52cccf`: every schema-invalid output is now preserved, including when a step stops, with a test.

**Applicant decision:** the single authorised retry is exhausted. `run-case-preserve-scope-fe3de4cf` is accepted as the mapped record for that case, with the merchant's confirmation of the required services and a code-written explanation. The three records and `recording-report.json` are committed in `data/case-recorded-runs/` and mapped by `data/case-runs.json`.

**Product changes the recordings prompted (applicant-approved):** the merchant now confirms required services the extraction could not map (`6e5f8e7`); a selected alternative's attribution credits the merchant for the choice and the model only for the reason it wrote.

**Secrets:** none stored; the key was checked against every file written.

### 2026-10-06 · Experience pass: demo guide, chat, fewer words, buyer page [Claude Code]

**What changed:** The demo guide now names the product's own button and points at it instead of offering a "complete" button; the conversation reads as a chat with the buyer's own words marked; secondary notes sit behind click-to-open "i" buttons; the buyer page opens with a glance line and wording built from the accepted terms; merchant-facing terms are plain ("offer", "approved offer type"); forecasts are rounded for the decision. Commits `c8ddbe7`, `e860da7`, `1f15c45`, `6ce8894`, `82a26cb`.

**AI boundary:** No prompt, schema, frozen case, recording, evaluation or engine rule changed, and no model call was made. Highlights come from stored evidence only, shown when the stored offsets still reproduce the stored quote. The Understand summary, the guide's ending summary and the buyer's glance line are written by code from confirmed state. The simulated buyer's "not sure" replies still leave a fact unresolved.

**Human decisions:** The applicant chose the four directions (chat look, a guide that does not mislead, less text, a clearer walkthrough) and approved the order. Two choices were mine and are open to change: the phone bar points at the primary action and never performs it, and change-request starters offer a date or a scope but not an amount.

**Evidence:** Screenshots under `artifacts/ui-review/ux-2026-10-06-*` are new; earlier files were not overwritten. The `desktop-*` and `mobile-*` sample screenshots are from the labelled hand-written sample run; the two `recorded-*` screenshots are from recorded Groq runs.

### 2026-10-07 · Counter-offer on a buyer's request for a lower amount [Claude Code]

**What changed:** After a proposal is sent, a buyer's request for a lower total can be answered with a counter-offer: the merchant types a total, the unchanged engine rechecks it, a failed rule needs an explicit override recorded as the merchant's decision (the merchant must acknowledge exactly the rules shown), and the result goes through the usual preview, approval and send as a new version.

**AI boundary:** No prompt, schema, recording, evaluation or engine rule changed, and no model call was made. The engine is only called to evaluate a structure it did not enumerate; its result is stored exactly as it came (including `approvable: false`) and never rewritten; an independent code review found that an earlier version of this change had set `approvable: true` on a copy, and it was corrected so that only the recorded override lets that one counter become a draft. The override is attributed to the merchant in the offer card, the event log and the stored record.

**Human decision:** The applicant chose that the engine's result is shown and an override is allowed, and that this applies to a buyer's change request. Not covered, by design: amount changes after acceptance, and the notice reply "up to ₹10K this month".

### 2026-10-07 · Versioned business economics and immutable deal prices [Codex]

**What changed:** Merchant costs, delivery flags, guardrails and discount levels now live in a versioned account store. Every deal snapshots the service prices, scope and GST rate it was originally quoted with, pins the account version used by its decision, and can preview and explicitly adopt a compatible newer version before a proposal is live. Drafts, agreements, amendments and counter-offers record the effective economics hash outside the contractual terms.

**AI boundary:** No prompt, schema, validator, recorded run, frozen evaluation asset or model output changed, and no model call was made. A stored recording replays only when the deal's effective engine inputs match the inputs it was recorded against. If economics change, code recomputes the decision and states that code ranked and explained it.

**Price boundary:** A later standard-price edit applies to new quotes only. Re-evaluation of an existing deal continues to use its immutable quoted prices and can adopt only the newer costs, operational flags, guardrails and discount ladder that are compatible with the original deal.

### 2026-10-08 · Strategy-led Offer screen: code ranks, the recorded order becomes history [Claude Code]

**What changed:** The Offer screen now leads with the merchant's strategy. Code ranks the feasible offers, writes the reason, and shows what each strategy would recommend; the recorded Groq order and reason sit behind an information control as historical evidence. The audit and the guide describe the recorded order as "not used for the recommendation".

**AI boundary:** No prompt, schema, recording, evaluation or engine file changed, and no model call was made. The frozen `explain.v3` outputs are read exactly as before; they are no longer used to decide the recommended offer. The card names no model, because none ranked or explained what it shows. A hand-written sample is never labelled as a recorded model.

**Human decisions:** The applicant decided that deterministic ranking is authoritative, that an offer needing the buyer's approval may lead, and that Groq's recorded order stays visible only as history. I found that an earlier phase had left the service side of strategies unbuilt (setting a strategy, the explicit-selection flag and the action), and built it here.

**Effect on the demo:** On the recorded hero case the first recommendation changes from the single upfront payment to the two-payment offer. The browser journey and the demo script were rewritten as a strategy demonstration. Assertions about the old ranking wording were changed deliberately; the rule that a sample never reads as AI output was not.

### 2026-10-08 · Deal overrides and failed-rule exceptions [Claude Code]

**What changed:** The merchant can override one assumption for one deal (a service's direct cost, the contribution floor, the cash exposure limit, the discount limit), with a required reason and a recorded direction (tightens or loosens). A counter-offer that fails a rule now also needs a reason, and an amount below direct costs needs the exact typed phrase. The audit has a section listing both kinds, separately.

**AI boundary:** No prompt, schema, recording, evaluation or engine file changed, and no model call was made. No model can add or remove an override, change a strategy, or make a counter-offer: the demo guide's allowed actions are a fixed short list, and a test confirms none of these is on it.

**Bugs found by the new tests:** (1) a derived decision crashed when an override made an already-answered buyer question irrelevant; the answer now still applies. (2) Recording the buyer's answers on a deal started under non-default economics produced a decision record labelled "changed answers" that failed validation and marked the deal "needs review"; the cause is now recorded as the economics. Both came from an earlier phase.

**Human decision:** The applicant's design required reasons, a separate record for each kind of exception, and a typed confirmation for a loss. I made the loss rule independent of failed rules, because an economics with no floor would otherwise let a loss through unchallenged.

### 2026-10-08 · Negotiation corridor and illustrative economics preset [Claude Code]

**What changed:** A buyer's price request on a sent proposal now opens a corridor on Track: the lowest compliant total (found by search over the engine's own checks), the approved discount ladder with what the merchant keeps and the buyer's approval status, scope and timing alternatives, and the amount check, which now requires choosing whether the buyer's amount includes GST and lists every rule, passed or failed. A demo preset loads a 10% maximum discount with 0%, 5%, 10% approved into the economics draft; the merchant still reviews and activates it. The walkthrough has a new optional step for the negotiation.

**AI boundary:** No prompt, schema, recording, evaluation or engine file changed and no model call was made. The corridor, the search and the preset are deterministic code. The walkthrough's allowed actions are unchanged: it cannot activate economics, send an offer or choose a counter for the merchant.

**Changed assertions:** The walkthrough test that listed shipped capabilities now includes negotiation, and the list of optional steps includes the new one, because the corridor now exists. Existing counter-offer browser tests choose a GST basis before checking, because the form requires it.

**Human decision:** The applicant's design required the corridor to be computed by code, to show only what the merchant's own rules allow, and never to reach the buyer.

### [APPLICANT] Decisions on AI suggestions

> Add your own entries: which agent suggestions you accepted, rejected or changed, and why. The agent must not write this section.
