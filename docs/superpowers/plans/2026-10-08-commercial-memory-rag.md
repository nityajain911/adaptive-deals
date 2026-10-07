# Commercial Memory RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local, cited commercial-memory pipeline that can draft Business economics and ground deal recommendations without giving AI authority over money or policy.

**Architecture:** Bundled fictional sources are validated, deterministically chunked and filtered before lexical retrieval. An additive reranker may reorder eligible candidates, but code validates citations and the merchant must confirm every proposed economics field through the existing versioned review. The existing engine remains the only source of commercial calculations and offer ranking.

**Tech Stack:** TypeScript, Next.js 16.3.8 App Router, React 19, Zod 4, Vitest, Playwright, local JSON stores.

**Spec:** `docs/superpowers/specs/2026-10-08-commercial-memory-rag-mcp-design.md`

## Global Constraints

- Do not modify files listed in `docs/superpowers/plans/frozen-assets.txt`.
- Do not change existing prompts, recordings, frozen evaluations or engine calculations.
- Every citation must validate its exact source substring, offsets and source hash.
- Eligibility by merchant, buyer, access, status and date runs before scoring and cannot be overridden by AI.
- Retrieved values remain proposals until the merchant confirms them through the existing Business economics review.
- Buyer-facing pages must never receive merchant costs, guardrails or commercial source text.
- New mutations use the existing validated `/api/actions` boundary.

## Review Focus

1. A second merchant's higher-scoring chunk must never appear in Pinecone results.
2. Superseded or withdrawn sources must never support a current value.
3. Conflicting active values must create a review state instead of silently choosing one.
4. Instruction-like source text must be excluded from evidence and disclosed.
5. A source edit after indexing must invalidate its citations rather than showing stale evidence.

---

### Task 1: Freeze the fictional corpus and source contracts

**Files:**
- Create: `commercial-memory/types.ts`
- Create: `commercial-memory/source-schema.ts`
- Create: `data/commercial-memory/manifest.json`
- Create: `data/commercial-memory/*.json`
- Test: `tests/commercial-memory/source-schema.test.ts`

**Interfaces:**
- Produces: `KnowledgeSource`, `KnowledgeChunk`, `KnowledgeAccess`, `parseKnowledgeSource()` and at least eight fictional sources across five source kinds.

- [ ] Write tests for valid sources, invalid dates/hashes/access, corpus size/type coverage and the second-merchant fixture; run them and observe failure.
- [ ] Implement the Zod schema, canonical content hashing and corpus fixtures; rerun the focused tests.
- [ ] Verify the protected-file list has no diff and commit `feat: add commercial memory source contracts and corpus`.

### Task 2: Deterministic chunking and instruction detection

**Files:**
- Create: `commercial-memory/chunker.ts`
- Create: `commercial-memory/normalise.ts`
- Test: `tests/commercial-memory/chunker.test.ts`

**Interfaces:**
- Consumes: `KnowledgeSource`.
- Produces: `chunkSource(source): KnowledgeChunk[]`, exact offsets, tokens, entities, amounts and suspicious instruction spans.

- [ ] Write tests for paragraph/heading chunks, CSV rows, Indian amount forms, overlap boundaries, stable IDs and suspicious spans; observe failure.
- [ ] Implement the smallest deterministic chunker and normaliser that satisfies them.
- [ ] Rerun focused tests and commit `feat: index commercial memory sources deterministically`.

### Task 3: Eligibility, lexical retrieval and abstention

**Files:**
- Create: `commercial-memory/retrieval.ts`
- Create: `commercial-memory/citations.ts`
- Test: `tests/commercial-memory/retrieval.test.ts`

**Interfaces:**
- Produces: `retrieveCommercialEvidence(query, context, index)` and `validateCitation(source, chunk, quote)`.

- [ ] Write tests for merchant/buyer/access/status/date filtering, exact phrase/entity/amount boosts, service aliases, abstention, source-hash mismatch and citation offsets; observe failure.
- [ ] Implement filtering before scoring, a deterministic bounded ranking and exact citation validation.
- [ ] Rerun focused tests and commit `feat: retrieve eligible commercial evidence with citations`.

### Task 4: Conflicts and runtime retrieval records

**Files:**
- Create: `commercial-memory/conflicts.ts`
- Create: `commercial-memory/store.ts`
- Test: `tests/commercial-memory/conflicts.test.ts`
- Test: `tests/commercial-memory/store.test.ts`

**Interfaces:**
- Produces: conflict groups, retrieval-run records under `ADAPTIVE_DEALS_DATA_DIR/retrieval`, and merchant confirmation records.

- [ ] Write tests for conflicting active values, superseded history, atomic runtime writes, reset isolation and suspicious-span exclusion; observe failure.
- [ ] Implement conflict detection and additive JSON stores using the existing atomic store helpers.
- [ ] Rerun focused tests and commit `feat: record commercial memory conflicts and retrieval runs`.

### Task 5: Draft Business economics from supported evidence

**Files:**
- Create: `commercial-memory/economics-draft.ts`
- Modify: `lib/economics-store.ts`
- Modify: `app/api/actions/route.ts`
- Test: `tests/commercial-memory/economics-draft.test.ts`
- Test: `tests/lib/economics-actions.test.ts`

**Interfaces:**
- Produces: evidence-backed field proposals and actions to prepare, confirm/reject and save a draft through the existing activation review.

- [ ] Write tests proving unsupported/conflicting/instruction-contaminated values cannot enter a draft and confirmed values retain citations; observe failure.
- [ ] Implement deterministic proposal mapping for the bundled corpus and confirmation records. Do not call or modify `profile_extract.v1` in this task.
- [ ] Extend the action schema with server-side re-reads and validation; rerun tests.
- [ ] Commit `feat: draft business economics from confirmed evidence`.

### Task 6: Business economics Commercial Memory UI

**Files:**
- Create: `components/commercial-memory/source-list.tsx`
- Create: `components/commercial-memory/economics-proposals.tsx`
- Modify: `app/economics/page.tsx`
- Modify: `components/economics/economics-editor.tsx`
- Test: `tests/browser/commercial-memory.spec.ts`

**Interfaces:**
- Consumes: source summaries and evidence proposals.
- Produces: the Commercial Memory section, citation drawer, conflicts and confirmation flow.

- [ ] Add browser tests for source visibility, drafting, citation inspection, confirmation, conflict refusal and ordinary economics activation; observe failure.
- [ ] Build the UI with one primary action and readable attribution labels.
- [ ] Run focused browser tests, unit tests, typecheck and lint; commit `feat: add Commercial Memory to Business economics`.

### Task 7: Evidence on Understand, Offer and Audit

**Files:**
- Create: `lib/commercial-memory-view.ts`
- Modify: `app/deals/[dealId]/understand/page.tsx`
- Modify: `app/deals/[dealId]/offer/page.tsx`
- Modify: existing audit components/view builders as located during execution
- Test: `tests/lib/commercial-memory-view.test.ts`
- Test: `tests/browser/commercial-memory.spec.ts`

**Interfaces:**
- Produces: merchant-only evidence summaries without passing restricted fields into buyer proposal props.

- [ ] Write tests for historical tense/date labels, buyer-specific filtering, three evidence groups and zero buyer-page leakage; observe failure.
- [ ] Implement compact merchant evidence cards and audit trace.
- [ ] Run focused and regression tests; commit `feat: ground deal recommendations in commercial evidence`.

### Task 8: Constrained reranker and evaluation gate

**Files:**
- Create: `commercial-memory/reranker.ts`
- Create: `commercial-memory/reranker-provider.ts`
- Create: `commercial-memory/recorded-reranks/`
- Create: `evaluation/commercial-memory/`
- Create: `scripts/run-commercial-memory-eval.ts`
- Test: `tests/commercial-memory/reranker.test.ts`
- Test: `tests/commercial-memory/evaluation.test.ts`

**Interfaces:**
- Produces: validated candidate-ID ordering, exact-input recorded replay and deterministic fallback.

- [ ] Commit evaluation cases, success counts, call budget and stopping rules before adding a provider call.
- [ ] Write tests for unknown/duplicate IDs, candidate-hash mismatch, provider failure and attribution; observe failure.
- [ ] Implement the separately versioned reranker without importing or modifying frozen AI modules.
- [ ] Run development evaluation once authorised; store only valid, exact-input recordings with honest provenance.
- [ ] Commit `feat: add evaluated commercial retrieval reranking`.

### Task 9: Presenter unseen-query proof and release gate

**Files:**
- Modify: `app/presenter/page.tsx`
- Modify: `README.md`
- Modify: `DEMO_SCRIPT.md`
- Modify: `AI_BUILD_LOG.md`
- Test: `tests/browser/commercial-memory.spec.ts`

**Interfaces:**
- Produces: unseen retrieval, abstention and conflict demonstrations.

- [ ] Add browser tests for unseen retrieval, unsupported-query abstention and code fallback; observe failure.
- [ ] Implement presenter proof and documentation.
- [ ] Run the full unit, browser, typecheck, lint, build, release, secret and protected-file checks.
- [ ] Commit `feat: complete Commercial Memory RAG proof`.

