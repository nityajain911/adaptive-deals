# Cerebras as the Primary Live AI Provider

**Date:** 8 October 2026  
**Status:** Proposed for review  
**Branch:** `codex/merchant-profit-strategy`  
**Baseline:** commit `1430944`  
**Implementation authority:** none. Approval of this document permits an implementation plan, not product code or provider calls.

## 1. Decision

Adaptive Deals will use **Cerebras as its default live AI provider**. Groq and Anthropic remain supported alternatives selected by the build team through server configuration.

The merchant, buyer and buildathon judge will not choose an AI provider inside the product. Provider choice is an implementation and operating decision, not part of the commercial decision workflow.

The configured values are:

```text
ADAPTIVE_DEALS_PROVIDER=cerebras
ADAPTIVE_DEALS_MODEL=gpt-oss-120b
CEREBRAS_API_KEY=<local secret>
```

To use Groq instead, the build team changes `ADAPTIVE_DEALS_PROVIDER` to `groq`, supplies `GROQ_API_KEY`, and restarts the server. Anthropic works in the same way. Keys stay in `.env.local`; they are never pasted into the product, committed, returned to the browser, or included in logs.

## 2. Why provider choice stays out of the user interface

The product promise is that Adaptive Deals converts buyer constraints and merchant economics into a safe, executable offer. A model picker would make the merchant decide an infrastructure question that does not help them close the deal.

The product will therefore:

- show one coherent AI experience to merchants and buyers;
- disclose which provider produced an output in Presenter and Audit views;
- keep provider selection on the server;
- require a server restart after the provider configuration changes; and
- never let a browser request override the configured provider or model.

## 3. Scope

### 3.1 Included

Cerebras becomes selectable through the shared live-provider configuration and becomes the default for every new live AI surface:

1. buyer-constraint extraction;
2. clarification-question wording;
3. offer explanation;
4. strategy narrative;
5. buyer negotiation-message drafting;
6. Business economics document/profile extraction; and
7. Commercial Memory reranking.

The same existing prompts, schemas, validators, deterministic engine and approval boundaries remain in force.

### 3.1.1 Relationship to the Commercial Memory specification

This design narrowly supersedes the earlier Commercial Memory specification's rule that the original `ai/` provider boundary remains byte-for-byte unchanged. Provider types, adapters, factories and provenance code may change to add Cerebras and make provider selection consistent. Existing prompt text, prompt versions, task schemas, task validators, frozen evaluation assets and recorded outputs remain protected.

### 3.2 Not included

- No merchant- or buyer-facing provider selector.
- No automatic failover from Cerebras to Groq or Anthropic.
- No prompt, schema or frozen-evaluation changes merely to improve Cerebras scores.
- No model-written commercial figures, payment schedules, feasibility verdicts or ledger changes.
- No tool calling by the model.
- No change to MCP approval, idempotency or payment-execution rules.
- No change to the historical Groq recordings or their attribution.
- No new Cerebras recording during the adapter implementation.
- No approximate saved answer for a custom input.

## 4. Two truths that must remain separate

### 4.1 Default live provider

When the user deliberately starts a new live AI run, the server calls Cerebras by default if `CEREBRAS_API_KEY` is available.

### 4.2 Default canonical demo evidence

The three bundled buildathon cases continue to open with their existing recorded Groq runs. These are immutable evidence of real historical runs and stay labelled **Recorded Groq output**. Changing the live provider does not rewrite their history or relabel them as Cerebras.

If the merchant changes an answer or business-economics input, the existing branch rules still determine whether the result can be derived by code or needs a new live run. A derived branch never inherits an earlier model's prose.

## 5. Provider configuration

`LiveProviderName` will support exactly:

```text
cerebras | groq | anthropic
```

The defaults and credential variables are:

| Provider | Default model | Credential variable |
| --- | --- | --- |
| Cerebras | `gpt-oss-120b` | `CEREBRAS_API_KEY` |
| Groq | `openai/gpt-oss-120b` | `GROQ_API_KEY` |
| Anthropic | existing configured default | `ANTHROPIC_API_KEY` |

Rules:

- Missing `ADAPTIVE_DEALS_PROVIDER` selects Cerebras.
- An unknown provider value is a configuration error. It must not silently select another provider.
- A missing key makes live AI unavailable and names the missing variable without exposing any secret.
- `ADAPTIVE_DEALS_MODEL` may override the provider's default model.
- The active provider and model are read on the server only.

## 6. Cerebras adapter

### 6.1 Transport

The adapter will call the Cerebras OpenAI-compatible chat-completions endpoint with a small injected HTTP transport rather than adding a second OpenAI-compatible SDK. This keeps the dependency surface narrow and makes request and error tests deterministic.

The adapter sends:

- the existing system and user messages;
- the configured model;
- deterministic sampling where the selected model supports it;
- the existing task's JSON Schema response format;
- a bounded output-token limit; and
- no tools or external actions.

Every returned object still passes through the existing Zod schema and task validator. A transport success is not an accepted AI result until those checks pass.

### 6.2 Fail-closed errors

The provider maps failures into the existing safe categories, including:

- invalid or missing credentials;
- rate limit or quota exhaustion;
- timeout or connection failure;
- provider 5xx response;
- unsupported structured-output request;
- truncated output;
- invalid JSON; and
- schema-valid JSON that fails the product validator.

Raw provider bodies are not shown to merchants and are not allowed to leak credentials. Run records retain only safe metadata, failure kind, provider, model, usage when supplied, and the accepted or rejected outcome.

### 6.3 Structured-output compatibility probe

Before the first real product run, one bounded probe will verify that `gpt-oss-120b` accepts the exact strict JSON-schema pattern used by the app. If Cerebras rejects that request, the adapter must fail visibly and remain unavailable until its request shape is corrected and tested. It must not weaken validation or silently request unstructured prose.

## 7. Provider-neutral assistant layer

The current strategy narrative, negotiation message and Business economics extraction paths depend directly on `AssistGroq`. They will use a provider-neutral structured-generation interface.

The interface returns:

- accepted raw structured output;
- provider and model;
- stop reason;
- token usage when supplied; or
- a typed safe failure.

Groq keeps its current implementation behind this interface. Cerebras receives an equivalent implementation. The task-specific schemas and validators remain the authority; neither provider adapter decides commercial meaning.

The migration must preserve existing imports long enough to keep historical evaluation and recording utilities stable, or deliberately update each caller with tests. It must not alter the saved Groq artifacts.

## 8. Commercial Memory and RAG

Commercial Memory always performs deterministic eligibility filtering and lexical retrieval first. When the user requests live AI reranking and the configured provider is available, the shared provider reranks only the closed candidate list.

The reranker:

- receives untrusted excerpts as data;
- returns each supplied chunk ID exactly once;
- cannot add evidence, figures, instructions or actions;
- is validated before its order is used; and
- falls back to the deterministic lexical order on any failure.

Attribution becomes provider-aware, for example **Reranked live by Cerebras**, **Reranked live by Groq**, or **Ranked by code**. The API must check the centrally configured provider and key rather than checking only `GROQ_API_KEY`.

## 9. Failure, fallback and saved-response policy

### 9.1 No silent cross-provider failover

If Cerebras is selected and fails, the same action will not silently call Groq or Anthropic. Doing so would obscure cost, provenance and evaluation results.

### 9.2 Deterministic product fallback

Existing safe behaviour stays in place:

- the engine continues to calculate figures and feasibility;
- code may write the approved fallback explanation;
- lexical retrieval remains available without a model; and
- money-moving or contract-changing actions still need their existing human approvals.

The interface states when AI was unavailable or its output was rejected. It never labels code output as AI output.

### 9.3 Exact saved responses only

A saved model answer may be reused only when all of these match:

- task and prompt version;
- schema version;
- canonical input hash; and
- any product context included in that input.

The saved artifact retains the provider and model that originally produced it. A saved Groq response remains labelled Groq even while Cerebras is the configured live provider.

An arbitrary customisation, including a different optional note, normally changes the input hash. If no exact recording exists, the app uses the deterministic fallback after a failed live call; it never substitutes a similar or hand-written answer and calls it AI.

## 10. Provenance and user experience

No provider selector appears in merchant or buyer screens.

The Presenter view shows:

- configured live provider and model;
- whether the needed credential is available;
- the provider used by each completed run; and
- whether visible text came from a live model, exact recorded model output, or code.

The Audit drawer shows provider and model per accepted task. Historical walkthrough labels that currently assume Groq become provider-neutral where they describe live output, while explicit labels for the historical Groq recordings remain unchanged.

## 11. Evaluation before release

A small Cerebras evaluation is preregistered before the first scored calls. It is separate from the frozen Groq evaluation and does not modify its cases, hashes or results.

The Cerebras set covers:

- constraint extraction in English and Hinglish;
- required clarification detection;
- offer explanation and invalid-figure rejection;
- strategy-fact attribution;
- negotiation-message safety, including pressure and prompt injection;
- Business economics extraction with quoted evidence; and
- Commercial Memory reranking with untrusted document instructions.

Results are reported as counts. The first technically valid output is kept, including misses. A retry is allowed only for a documented technical failure. Before execution, the run record states the case-set hash, prompt hashes, provider, model and maximum call budget.

A suggested ceiling is one compatibility probe plus no more than twelve scored provider requests, with technical retries recorded separately.

## 12. Verification

Implementation is complete only when the following pass:

### 12.1 Unit and integration tests

- Cerebras is the default provider.
- Cerebras, Groq and Anthropic each select the correct model and key variable.
- Unknown provider values fail configuration.
- The Cerebras request includes the existing schema and includes no tools.
- Credentials and raw provider error bodies never enter safe logs or run records.
- Authentication, rate-limit, timeout, server, truncation, JSON and validation failures map correctly.
- Every assistant task uses the selected provider through the neutral interface.
- Commercial Memory uses the selected provider and falls back to lexical ranking.
- Provider-aware attribution is correct.
- Exact recorded responses require an exact hash match and retain original attribution.
- Existing recorded Groq runs remain byte-for-byte unchanged.

### 12.2 Browser journeys

- The credential-free canonical demo still loads the recorded Groq cases with correct labels.
- Presenter reports Cerebras as the configured live default when its key is supplied through a test transport.
- A simulated Cerebras success appears as live Cerebras output.
- A simulated Cerebras failure shows deterministic fallback and never claims that Groq ran.
- Merchant and buyer pages contain no provider selector.
- Commercial Memory shows Cerebras attribution on a successful live rerank and code attribution on failure.

### 12.3 Release checks

- Type checking, lint, production build and the existing release check pass.
- Existing unit, integration and browser suites continue to pass.
- The secret scan includes `CEREBRAS_API_KEY` patterns.
- `.env.example` and README explain server-side selection and local secret setup.

## 13. Documentation changes

The implementation updates:

- `.env.example` with Cerebras as the default and examples for Groq and Anthropic;
- README setup, provider table and Presenter explanation;
- `PRODUCT_DECISIONS.md` with the backend-only provider decision and fallback rule; and
- `AI_BUILD_LOG.md` with implementation evidence and, later, the authorised Cerebras evaluation.

Historical documents that describe completed Groq runs remain historical records and are not rewritten as Cerebras work.

## 14. Build order

1. Add configuration tests and provider types.
2. Add the Cerebras core structured provider with a fake transport.
3. Refactor the assistant generator behind a provider-neutral interface.
4. Route the three assistant tasks through the configured provider.
5. Make Commercial Memory reranking provider-neutral.
6. Make Presenter, Audit and walkthrough attribution provider-aware.
7. Update environment and product documentation.
8. Run the complete credential-free verification suite.
9. Freeze the Cerebras evaluation plan and call budget.
10. After the user adds `CEREBRAS_API_KEY` locally, run the compatibility probe and authorised evaluation.
11. Record genuine Cerebras artifacts only in a separate, explicitly approved recording step.

## 15. Acceptance criteria

The design is successful when:

1. Cerebras is the default for every new live AI task.
2. Groq and Anthropic can be selected only through server configuration.
3. No end user can choose or spoof a provider from the browser.
4. All three providers use the same task contracts and safety validators.
5. Historical Groq evidence keeps truthful attribution.
6. Provider failures never change money, contract terms or evidence without existing deterministic checks and human approvals.
7. Saved output is used only for an exact input match.
8. The product remains fully demonstrable without a live key.
