# Cerebras Primary Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cerebras the server-selected default for every new live AI task while preserving the existing Groq recordings, deterministic safeguards and credential-free demo.

**Architecture:** Extend the central provider configuration, add a fetch-based Cerebras structured-output adapter, and route both the original three AI tasks and the newer assist/RAG tasks through provider-neutral interfaces. The browser never selects a provider; Presenter and Audit only disclose the configured provider and the provider actually recorded on each output. Exact recordings keep their original attribution, and failures use deterministic code rather than cross-provider failover.

**Tech Stack:** TypeScript 5, Next.js 16.3.8, React 19, Zod 4, Vitest 5, Playwright 1.63, Cerebras OpenAI-compatible Chat Completions API.

**Spec:** `docs/superpowers/specs/2026-10-08-cerebras-primary-provider-design.md`

## Global Constraints

- Read the relevant Next.js 16.3.8 guides under `node_modules/next/dist/docs/` before changing a page, route or server-environment boundary.
- Default live provider: `cerebras`; default Cerebras model: `gpt-oss-120b`; credential: `CEREBRAS_API_KEY`.
- Supported server values are exactly `cerebras`, `groq` and `anthropic`; unknown non-empty values fail configuration.
- No merchant-, buyer- or judge-facing provider selector. A provider change requires server configuration and restart.
- Never expose, store, print or commit a provider key. Never return a raw provider error body to the browser.
- No automatic cross-provider retry. A failed Cerebras call uses the existing deterministic fallback.
- Keep existing prompts, task schemas, task validators, frozen evaluation assets and recorded Groq outputs unchanged.
- A saved answer is eligible only on exact task, prompt version, schema version and canonical-input hash match; it keeps its original provider label.
- No model tools. Code owns figures, feasibility, ranking, contracts, approvals, retrieval eligibility and money actions.
- Do not make a real Cerebras, Groq or Anthropic call while implementing Tasks 1–7.
- Do not add an SDK dependency for Cerebras; use an injected fetch-compatible transport.
- Each task starts with a failing test, ends with focused verification and receives its own commit.

## Review Focus

1. An invalid `ADAPTIVE_DEALS_PROVIDER` must stop configuration instead of silently selecting Cerebras or Groq; Task 1 tests whitespace, casing and unknown values.
2. A provider may return HTTP 200 with an empty, truncated or non-JSON choice; Task 2 tests every shape and requires a safe typed failure.
3. A live Cerebras failure must never make an exact Groq recording look like a Cerebras fallback; Tasks 5 and 6 test task-level provenance and the browser labels.
4. A customisation with one changed character must not reuse a nearby saved response; Task 5 keeps the exact-hash mismatch test alongside provider attribution.
5. Commercial Memory may receive an apparently valid order with duplicate or missing chunk IDs; Task 4 proves the validator keeps lexical order and reports code attribution.

---

## File Structure

### New files

- `ai/cerebras-http.ts` — pure request builder, injected HTTP transport, safe response/error parser shared by core and assist tasks.
- `ai/cerebras-provider.ts` — `ModelProvider` adapter for extract, clarify and explain.
- `assist/provider.ts` — provider-neutral assist interfaces and result metadata.
- `assist/cerebras.ts` — assist adapter over the shared Cerebras HTTP client.
- `assist/anthropic.ts` — Anthropic implementation of the same assist contract.
- `assist/live.ts` — server-side factory for the configured assist provider.
- `tests/ai/cerebras-provider.test.ts` — payload, success and failure contract.
- `tests/assist/provider-selection.test.ts` — neutral assist interface and live factory.
- `e2e/cerebras-fixture-server.mjs` — local fake Cerebras endpoint plus a production Next server for browser proof; no external calls.
- `e2e/cerebras.spec.ts` — provider disclosure, live output, deterministic fallback and RAG attribution.
- `evaluation-cerebras/PLAN.md` — preregistered call budget, stop rules and reporting contract.
- `evaluation-cerebras/cases.json` — small labelled, agent-authored provider-compatibility set.
- `evaluation-cerebras/FREEZE.json` — case and prompt hashes written before any live call.
- `scripts/run-cerebras-eval.ts` — dry-run-by-default, budgeted evaluation runner.

### Existing files that change

- `ai/provider.ts`, `ai/config.ts`, `ai/live.ts` — add Cerebras types, defaults and factory selection.
- `assist/groq.ts`, `assist/narrative/run.ts`, `assist/message/run.ts`, `assist/profile/run.ts` — depend on the neutral assist contract.
- `evaluation-assist/runner/execute.ts`, `evaluation-assist/generators/narrative.ts` — select the configured assist provider without changing historical result files.
- `commercial-memory/reranker-provider.ts`, `app/api/commercial-memory/actions/route.ts` — use the configured assist provider.
- `lib/model-provenance.ts`, `lib/walkthrough.ts`, `app/presenter/page.tsx`, `lib/page-data.ts` — provider-aware disclosure without a selector.
- `playwright.config.ts` — clear the Cerebras key in ordinary projects and add the local Cerebras project.
- `.env.example`, `README.md`, `PRODUCT_DECISIONS.md`, `AI_BUILD_LOG.md`, `scripts/check-release.ts`, `package.json` — setup, decisions, evidence, secret checks and evaluation command.
- Focused tests under `tests/ai`, `tests/assist`, `tests/commercial-memory`, `tests/lib` and `tests/scripts`.

---

### Task 1: Central configuration and provider identity

**Files:**
- Modify: `ai/provider.ts`
- Modify: `ai/config.ts`
- Modify: `ai/live.ts`
- Modify: `tests/ai/schemas-and-boundaries.test.ts`
- Modify: `tests/ai/live-audit.test.ts`

**Interfaces:**
- Produces: `LiveProviderName = "cerebras" | "groq" | "anthropic"`.
- Produces: `DEFAULT_MODELS.cerebras === "gpt-oss-120b"` and `KEY_VARS.cerebras === "CEREBRAS_API_KEY"`.
- Produces: `readAiConfig(env): AiConfig`, throwing `ConfigurationError` for an unknown non-empty provider.
- Extends: `ProviderName` with `"cerebras"` while retaining both replay names.

- [ ] **Step 1: Write failing configuration tests**

Add assertions that an empty environment selects unavailable Cerebras with `gpt-oss-120b`; a Cerebras key enables it; explicit Groq and Anthropic still select their existing defaults; surrounding whitespace is trimmed; and `ADAPTIVE_DEALS_PROVIDER=other` throws a message naming the invalid value and the three allowed values. Update live-audit fixtures only where their configured live provider expectation changes; do not change stored Groq-run assertions.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npx vitest run tests/ai/schemas-and-boundaries.test.ts tests/ai/live-audit.test.ts`

Expected: FAIL because Cerebras is not a provider and the empty environment still selects Groq.

- [ ] **Step 3: Implement the configuration contract**

Add the exact union, maps and strict parser to `ai/config.ts`; add Cerebras to `ProviderName`; leave `createLiveProvider` temporarily returning `null` for configured Cerebras so Task 2 owns adapter construction. Its missing-key reason must name `CEREBRAS_API_KEY` and describe the bundled replay without claiming it is Cerebras output.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run tests/ai/schemas-and-boundaries.test.ts tests/ai/live-audit.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ai/provider.ts ai/config.ts ai/live.ts tests/ai/schemas-and-boundaries.test.ts tests/ai/live-audit.test.ts
git commit -m "feat: make Cerebras the default provider configuration"
```

### Task 2: Safe Cerebras structured-output adapter

**Files:**
- Create: `ai/cerebras-http.ts`
- Create: `ai/cerebras-provider.ts`
- Create: `tests/ai/cerebras-provider.test.ts`
- Modify: `ai/live.ts`
- Modify: `tests/ai/schemas-and-boundaries.test.ts`

**Interfaces:**
- Produces: `type CerebrasFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>`.
- Produces: `buildCerebrasBody(args: { model: string; system: string; user: string; schemaName: string; schema: z.ZodType; maxTokens: number }): object`.
- Produces: `requestCerebrasStructured(args, options): Promise<CerebrasStructuredResult>` with safe metadata and existing provider-failure categories.
- Produces: `class CerebrasProvider implements ModelProvider` with constructor `(model: string, transport?: CerebrasFetch, apiKey?: string, baseUrl?: string)`.
- Produces: `cerebrasBaseUrl(env): string`, fixed to Cerebras except under the explicit `ADAPTIVE_DEALS_E2E=1` test boundary.
- Consumes: strict schema conversion from `toStrictJsonSchema` and configuration from Task 1.

- [ ] **Step 1: Write failing adapter tests**

In `tests/ai/cerebras-provider.test.ts`, assert that the request uses `POST`, bearer authentication, `gpt-oss-120b`, system then user messages, `temperature: 0`, a 16,000-token ceiling, strict JSON schema and no `tools` or `tool_choice`. Test success metadata and these failures: 401/403 → `not_configured`; 429 and fetch rejection/abort → `unavailable`; 400 → `schema_invalid`; 5xx → `api_error`; `finish_reason=length` → `truncated`; absent choice, empty content and non-JSON content → safe failure. Assert that neither a fake key nor a raw response body appears in any returned message or serialised result.

- [ ] **Step 2: Run the test and verify failure**

Run: `npx vitest run tests/ai/cerebras-provider.test.ts`

Expected: FAIL because both new modules are absent.

- [ ] **Step 3: Implement the shared HTTP client and core adapter**

Use `https://api.cerebras.ai/v1/chat/completions` by default. Accept an injected base URL in unit tests; in the live factory, honor `CEREBRAS_API_BASE_URL` only when the server also has `ADAPTIVE_DEALS_E2E=1`. Parse OpenAI-compatible `choices[0].message.content`, model, finish reason and usage. Use a bounded abort timeout and return safe fixed messages for HTTP failures.

- [ ] **Step 4: Complete the live factory**

Update `createLiveProvider(env)` so Cerebras constructs `CerebrasProvider`, Groq and Anthropic retain their current adapters, and the selected key is passed explicitly. Extend the configuration test to assert all three returned provider names and models.

- [ ] **Step 5: Run focused AI tests**

Run: `npx vitest run tests/ai/cerebras-provider.test.ts tests/ai/schemas-and-boundaries.test.ts tests/ai/failures.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ai/cerebras-http.ts ai/cerebras-provider.ts ai/live.ts tests/ai/cerebras-provider.test.ts tests/ai/schemas-and-boundaries.test.ts
git commit -m "feat: add safe Cerebras structured output adapter"
```

### Task 3: Provider-neutral assist tasks

**Files:**
- Create: `assist/provider.ts`
- Create: `assist/cerebras.ts`
- Create: `assist/anthropic.ts`
- Create: `assist/live.ts`
- Modify: `assist/groq.ts`
- Modify: `assist/narrative/run.ts`
- Modify: `assist/message/run.ts`
- Modify: `assist/profile/run.ts`
- Create: `tests/assist/provider-selection.test.ts`
- Modify: `tests/assist/narrative-run.test.ts`
- Modify: `tests/assist/message.test.ts`
- Modify: `tests/assist/profile-run.test.ts`
- Modify: `evaluation-assist/runner/execute.ts`
- Modify: `evaluation-assist/generators/narrative.ts`
- Modify: `tests/assist/budget.test.ts`

**Interfaces:**
- Produces: `interface AssistProvider { readonly name: LiveProviderName; readonly model: string; generate(args: AssistRequest): Promise<AssistResult> }`.
- Produces: `AssistRequest = { system: string; user: string; name: string; schema: z.ZodType }`.
- Produces: provider-neutral `AssistMeta`, `AssistFailure` and `AssistResult` whose metadata provider is a `LiveProviderName`.
- Produces: `createLiveAssistProvider(env, options?): AssistProvider | null`, selecting the same provider, model and key as `readAiConfig`.
- Consumes: `requestCerebrasStructured` from Task 2.

- [ ] **Step 1: Write failing neutral-interface tests**

Add tests that `runNarrative`, `runMessage` and `runProfile` accept a minimal fake `AssistProvider`; Groq still emits `provider: "groq"`; Cerebras emits `provider: "cerebras"`; the factory returns null without the selected key; and explicit Groq/Anthropic selection never consumes `CEREBRAS_API_KEY`.

- [ ] **Step 2: Run the focused assist tests and verify failure**

Run: `npx vitest run tests/assist/provider-selection.test.ts tests/assist/narrative-run.test.ts tests/assist/message.test.ts tests/assist/profile-run.test.ts`

Expected: FAIL because the run functions require `AssistGroq` and there is no neutral factory.

- [ ] **Step 3: Extract the neutral types without changing task behavior**

Move only shared types into `assist/provider.ts`. Keep `AssistGroq` as an implementation and compatibility export. Change the three run signatures from `AssistGroq` to `AssistProvider`; preserve their existing status values, schema checks and code fallbacks.

- [ ] **Step 4: Add Cerebras assist and the server-side factory**

Implement `AssistCerebras` over `requestCerebrasStructured` with the existing 2,000-token assist ceiling. Implement `AssistAnthropic` with Anthropic's parsed structured-output API and the same neutral result contract. Select among all three in `createLiveAssistProvider`; do not claim Anthropic support while returning Groq.

- [ ] **Step 5: Make the assist evaluation runner provider-neutral**

Replace its direct `AssistGroq` construction and `GROQ_API_KEY` check with `createLiveAssistProvider` and the central configured-key rule. Keep its existing ledger, budget, holdout and result files unchanged. Add `CEREBRAS_API_KEY` to the generator's environment scrub list. Extend the budget test to prove dry-run mode makes no call under every provider selection.

- [ ] **Step 6: Run all assist tests**

Run: `npx vitest run tests/assist`

Expected: PASS with no network calls.

- [ ] **Step 7: Commit**

```bash
git add assist evaluation-assist/runner/execute.ts evaluation-assist/generators/narrative.ts tests/assist
git commit -m "refactor: make assist generation provider neutral"
```

### Task 4: Use the configured provider for Commercial Memory

**Files:**
- Modify: `commercial-memory/reranker-provider.ts`
- Modify: `app/api/commercial-memory/actions/route.ts`
- Modify: `tests/commercial-memory/reranker.test.ts`
- Modify: `tests/commercial-memory/economics-actions.test.ts`

**Interfaces:**
- Produces: `class LiveCommercialRerankProvider implements CommercialRerankProvider` constructed with any `AssistProvider`.
- Produces: `createLiveCommercialRerankProvider(env): CommercialRerankProvider | undefined` using `createLiveAssistProvider`.
- Preserves: deterministic lexical retrieval and `rerankCommercialCandidates` validation.

- [ ] **Step 1: Write failing reranker-selection tests**

Assert Cerebras produces the label `Reranked live by Cerebras`; Groq remains selectable; no selected-provider key means no model call and code attribution; and a valid-looking response with duplicate, missing or invented chunk IDs is rejected with lexical order intact. In the route test, set Cerebras as configured and prove `liveAi: true` no longer checks only `GROQ_API_KEY`.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/commercial-memory/reranker.test.ts tests/commercial-memory/economics-actions.test.ts`

Expected: FAIL because the implementation constructs `GroqCommercialRerankProvider` directly.

- [ ] **Step 3: Implement provider-neutral reranking**

Rename the concrete provider, inject `AssistProvider`, set its display name from a single provider-label helper, and let the route request the configured live reranker. Do not change candidate eligibility, chunk content, reciprocal-rank fusion or validation.

- [ ] **Step 4: Run Commercial Memory tests**

Run: `npx vitest run tests/commercial-memory`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add commercial-memory/reranker-provider.ts app/api/commercial-memory/actions/route.ts tests/commercial-memory
git commit -m "feat: rerank Commercial Memory with the configured provider"
```

### Task 5: Truthful provider provenance and Presenter disclosure

**Files:**
- Modify: `lib/model-provenance.ts`
- Modify: `lib/walkthrough.ts`
- Modify: `app/presenter/page.tsx`
- Modify: `lib/page-data.ts`
- Modify: `tests/lib/model-provenance.test.ts`
- Modify: `tests/lib/walkthrough.test.ts`
- Modify: `tests/lib/presenter.test.ts`
- Modify: `tests/lib/case-runs.test.ts`

**Interfaces:**
- Produces: `providerDisplayName(provider: LiveProviderName): "Cerebras" | "Groq" | "Anthropic"`.
- Preserves: provenance is derived from the provider stored on each step, not current configuration.
- Presenter displays configured provider/model and available/unavailable state; it does not mutate them.

- [ ] **Step 1: Write failing attribution tests**

Create a test-only live record with Cerebras steps and assert `Live Cerebras output`/`Recorded Cerebras output`. Assert the committed Groq record still reads `Recorded Groq output` when Cerebras is currently configured. Assert an exact saved Groq response keeps Groq attribution, while a one-character input-hash mismatch is ineligible and does not acquire Cerebras attribution. Assert Presenter contains configured provider and model as text and contains no form control or action capable of changing them.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/lib/model-provenance.test.ts tests/lib/case-runs.test.ts tests/lib/walkthrough.test.ts tests/lib/presenter.test.ts`

Expected: FAIL because Cerebras is not a recognised model provider and Presenter does not state the configured provider.

- [ ] **Step 3: Implement provider-aware labels**

Add Cerebras to the central display map. Replace generic live-Groq walkthrough enum names with provider-neutral live/recorded names where they describe arbitrary new runs; keep the explicit `saved_groq_exact_match` label for the historical exact recording. Presenter gets a read-only line such as `Configured live provider: Cerebras · gpt-oss-120b · credential available/unavailable`.

- [ ] **Step 4: Run focused provenance tests**

Run: `npx vitest run tests/lib/model-provenance.test.ts tests/lib/case-runs.test.ts tests/lib/walkthrough.test.ts tests/lib/presenter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/model-provenance.ts lib/walkthrough.ts app/presenter/page.tsx lib/page-data.ts tests/lib/model-provenance.test.ts tests/lib/case-runs.test.ts tests/lib/walkthrough.test.ts tests/lib/presenter.test.ts
git commit -m "feat: disclose AI provider without exposing a selector"
```

### Task 6: Browser proof with a local Cerebras fixture

**Files:**
- Create: `e2e/cerebras-fixture-server.mjs`
- Create: `e2e/cerebras.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `tests/ai/schemas-and-boundaries.test.ts`

**Interfaces:**
- The fixture server listens only on localhost, serves OpenAI-compatible JSON for known test schema names, and launches `next start` on port 3202 with a temporary data directory.
- `cerebrasBaseUrl(env)` returns the fixed Cerebras endpoint unless `ADAPTIVE_DEALS_E2E=1`; only in that explicit test mode may it read `CEREBRAS_API_BASE_URL`. Neither value is exposed to the browser.

- [ ] **Step 1: Read the Next.js guides used by this task**

Read the Next.js 16.3.8 documentation for environment variables, server-only modules and production server testing under `node_modules/next/dist/docs/`. Record any applicable constraint as a comment beside the fixture hook.

- [ ] **Step 2: Write the failing browser journey**

The Cerebras project must verify: no provider selector exists on merchant and buyer pages; Presenter reports Cerebras; Run live creates a new record with Cerebras task steps; a fixture 429 produces deterministic fallback and never says Groq ran; and a Commercial Memory live rerank says `Reranked live by Cerebras`, while a malformed duplicate-ID response says code kept lexical order.

- [ ] **Step 3: Run only the Cerebras project and verify failure**

Run: `npx playwright test --project=cerebras`

Expected: FAIL because the project and fixture server do not exist.

- [ ] **Step 4: Implement the isolated fixture project**

Add `CEREBRAS_API_KEY` to `NO_KEYS`. Add a third project and web server without changing the two existing projects' ports or demo-run rules. Its Next process receives `ADAPTIVE_DEALS_E2E=1`, `CEREBRAS_API_BASE_URL=http://127.0.0.1:<fixture-port>/v1/chat/completions`, a fake key and an isolated data directory. The fixture must derive valid task responses from committed synthetic fixtures or request candidate IDs; it must never call the internet and must support explicit 429 and malformed-rerank test modes.

- [ ] **Step 5: Run browser proof**

Run: `ADAPTIVE_E2E_NO_SHOTS=1 npx playwright test --project=cerebras`

Expected: PASS.

- [ ] **Step 6: Run existing browser projects**

Run: `ADAPTIVE_E2E_NO_SHOTS=1 npx playwright test --project=sample --project=recorded`

Expected: PASS with historical Groq attribution unchanged.

- [ ] **Step 7: Commit**

```bash
git add e2e/cerebras-fixture-server.mjs e2e/cerebras.spec.ts playwright.config.ts tests/ai/schemas-and-boundaries.test.ts
git commit -m "test: prove Cerebras runtime and fallback in the browser"
```

### Task 7: Environment, security and product documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `PRODUCT_DECISIONS.md`
- Modify: `AI_BUILD_LOG.md`
- Modify: `scripts/check-release.ts`
- Modify: `tests/scripts/check-release.test.ts` if present, otherwise create it.

**Interfaces:**
- Documents: backend-only selection and restart requirement.
- Documents: Cerebras default, exact Groq recording distinction, no cross-provider failover and exact-hash saved-response rule.
- Extends: release secret scan to reject Cerebras key patterns in tracked product artifacts.

- [ ] **Step 1: Write failing release-check tests**

Assert a temporary tracked-content fixture containing `CEREBRAS_API_KEY` with a non-empty value or a Cerebras key-like token fails, while the variable name with an empty example value passes. Keep existing applicant-placeholder behavior unchanged.

- [ ] **Step 2: Run the release-check test and verify failure**

Run: `npx vitest run tests/scripts/check-release.test.ts`

Expected: FAIL because the check does not scan Cerebras secrets.

- [ ] **Step 3: Update setup and decisions**

Make `.env.example` default to Cerebras and show Groq/Anthropic as backend alternatives. README must say the canonical cases remain recorded Groq evidence, identify Cerebras as the default for new live runs, and state that users never choose the provider. Add the approved policy to `PRODUCT_DECISIONS.md`; log implementation evidence in `AI_BUILD_LOG.md` without claiming any real Cerebras result.

- [ ] **Step 4: Implement the secret release check**

Scan tracked configuration and stored-run surfaces for non-placeholder Cerebras secrets without printing the matching secret. Report only file and line number with redacted text.

- [ ] **Step 5: Run documentation and release checks**

Run: `npx vitest run tests/scripts/check-release.test.ts && npm run check:release -- --build`

Expected: PASS; applicant-owned submission placeholders may still be reported under the existing build-mode rule.

- [ ] **Step 6: Commit**

```bash
git add .env.example README.md PRODUCT_DECISIONS.md AI_BUILD_LOG.md scripts/check-release.ts tests/scripts/check-release.test.ts
git commit -m "docs: configure Cerebras as the primary live provider"
```

### Task 8: Credential-free review gate

**Files:**
- No product files unless verification exposes a defect.

**Interfaces:**
- Produces: a review report with exact counts and no provider calls.

- [ ] **Step 1: Run unit and integration tests**

Run: `npm test`

Expected: all tests pass; report exact count.

- [ ] **Step 2: Run static checks**

Run: `npm run typecheck && npm run lint`

Expected: both pass.

- [ ] **Step 3: Run production build and release gate**

Run: `npm run build && npm run check:release -- --build`

Expected: both pass. If the environment blocks Turbopack rather than the product failing, record that evidence and use the repository's documented webpack fallback for verification only.

- [ ] **Step 4: Run all browser projects**

Run: `ADAPTIVE_E2E_NO_SHOTS=1 npm run test:e2e`

Expected: sample, recorded and local Cerebras fixture projects all pass.

- [ ] **Step 5: Verify immutable evidence and secrets**

Compare hashes for `data/case-recorded-runs`, `data/live-runs`, `evaluation/datasets/frozen`, `evaluation/results` and existing assist holdout manifests against the pre-implementation commit. Confirm no tracked file contains a Cerebras, Groq, Anthropic or Razorpay key.

- [ ] **Step 6: Stop for review**

Report commits, exact test counts, browser counts, build result, protected-file hashes, and the fact that no external model call was made. Do not start Task 9 until the user approves this gate and has placed the key in `.env.local` themselves.

### Task 9: Preregister the Cerebras evaluation without running it

**Files:**
- Create: `evaluation-cerebras/PLAN.md`
- Create: `evaluation-cerebras/cases.json`
- Create: `evaluation-cerebras/FREEZE.json`
- Create: `scripts/run-cerebras-eval.ts`
- Modify: `package.json`
- Create: `tests/scripts/cerebras-eval.test.ts`

**Interfaces:**
- Produces: `npm run eval:cerebras`, dry-run by default.
- Requires for execution: `--execute`, `--run-name`, a matching freeze hash, configured Cerebras, and `CEREBRAS_API_KEY`.
- Enforces: one compatibility probe plus at most twelve scored calls; retries only for recorded technical failures.

- [ ] **Step 1: Write failing runner-policy tests**

Assert no flag means zero fetches; `--execute` without a run name, key, Cerebras selection or matching freeze refuses before a call; the 13th scored call is impossible; case and prompt hashes appear in output; and result records redact the key and retain misses.

- [ ] **Step 2: Run the policy test and verify failure**

Run: `npx vitest run tests/scripts/cerebras-eval.test.ts`

Expected: FAIL because the runner and freeze do not exist.

- [ ] **Step 3: Author and freeze the compatibility set**

Include labelled cases for English and Hinglish extraction, missing clarification, invalid commercial figures, unsupported ordinal claims, pressure/prompt injection in negotiation copy, quoted Business economics evidence, and RAG candidate-list injection. Mark provenance as agent-authored at Nitya Jain's direction and not independent validation. Hash cases and unchanged prompts before any provider call.

- [ ] **Step 4: Implement the budgeted runner**

Use the real application adapters and validators. Default to a printed dry-run plan. Count a call before sending it, retain the first technically valid result including misses, and allow a retry only for a typed transport/auth/rate-limit failure recorded in the ledger.

- [ ] **Step 5: Run dry-run verification only**

Run: `npm run eval:cerebras`

Expected: prints provider, model, hashes, case count and maximum call count; states that no call was made.

- [ ] **Step 6: Commit**

```bash
git add evaluation-cerebras scripts/run-cerebras-eval.ts package.json tests/scripts/cerebras-eval.test.ts
git commit -m "test: preregister the Cerebras provider evaluation"
```

### Task 10: Authorised compatibility probe and evaluation

**Files:**
- Create after execution: `evaluation-cerebras/results/<run-name>.json`
- Modify after execution: `AI_BUILD_LOG.md`

**Interfaces:**
- Consumes: user-provided local `.env.local`; never reads a key into product output.
- Produces: exact counts, request count, latency and safe provider metadata.

- [ ] **Step 1: Confirm the local setup without printing the key**

Verify only that `.env.local` selects Cerebras, selects `gpt-oss-120b`, and contains a non-empty `CEREBRAS_API_KEY`. Do not print or copy its value.

- [ ] **Step 2: Run one structured-output compatibility probe**

Run the runner's probe mode against the exact strict schema. If it fails for a technical compatibility reason, stop and report it. Do not weaken schemas or proceed to scored calls.

- [ ] **Step 3: Run the frozen evaluation once**

Run: `npm run eval:cerebras -- --execute --run-name <approved-name>`

Expected: no more than twelve scored requests; first valid outputs retained, misses included.

- [ ] **Step 4: Verify and report**

Check hashes, count totals, failure categories, secret scan and result provenance. Add a factual build-log entry. Do not create a canonical Cerebras recording unless the user separately authorises a recording step.

- [ ] **Step 5: Commit evidence**

```bash
git add evaluation-cerebras/results/<run-name>.json AI_BUILD_LOG.md
git commit -m "test: record Cerebras compatibility evaluation"
```
