# Razorpay MCP Action Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an accepted Adaptive Deals agreement into one merchant-approved Razorpay test-mode collection action through a capability-discovered MCP boundary.

**Architecture:** An injected MCP transport lists tools; deterministic code binds only a compatible test Payment Link capability. The service prepares a canonical intent, invalidates stale approval, executes once under an idempotency key and stores a reduced receipt. Unsupported capability stays visibly unavailable and simulation is a separate merchant action.

**Tech Stack:** TypeScript, Next.js 16.3.8, Zod 4, local JSON stores, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-commercial-memory-rag-mcp-design.md`

## Global Constraints

- No model chooses a tool or arguments.
- Runtime discovery must precede binding; never guess a Razorpay tool name.
- Only test mode is accepted and every write needs approval of exact canonical arguments.
- Idempotency and reconcile-before-retry are service guarantees.
- MCP failure never silently becomes simulation.
- No credentials or unrestricted provider output are stored, displayed or committed.
- Protected frozen files remain unchanged.

## Review Focus

1. Double clicks and retries must return the existing receipt.
2. Agreement, arguments or catalog changes must make approval stale.
3. A timeout must become unknown and reconcile before another write.
4. A malformed response must not create a product Payment Link.
5. Live credentials or a non-test catalog must be refused.

---

### Task 1: Capability and transport contracts

**Files:** Create `mcp/types.ts`, `mcp/transport.ts`, `mcp/capabilities.ts`; test `tests/mcp/capabilities.test.ts`.

- [ ] Write failing tests for compatible, unsupported, malformed and non-test catalogs.
- [ ] Implement injected transport contracts, catalog hashing and schema-based capability binding.
- [ ] Record the Phase 0 probe result; if no connected server is configured, keep capability unavailable.
- [ ] Commit `feat: discover safe Razorpay MCP capabilities`.

### Task 2: Intent, approval and receipt stores

**Files:** Create `mcp/intents.ts`, `mcp/store.ts`; test `tests/mcp/intents.test.ts`.

- [ ] Write failing tests for canonical hashes, test mode, staleness, atomic persistence and secret reduction.
- [ ] Implement intent/receipt schemas and stores under `ADAPTIVE_DEALS_DATA_DIR/mcp`.
- [ ] Commit `feat: persist approved MCP action intents`.

### Task 3: Idempotent execution and reconciliation

**Files:** Create `mcp/executor.ts`; test `tests/mcp/executor.test.ts`.

- [ ] Write failing tests for approval, success, duplicate execution, timeout/unknown, reconciliation, malformed result and transient failure.
- [ ] Implement execute-once and reconcile-before-retry with injected fake transports.
- [ ] Commit `feat: execute MCP collection actions once`.

### Task 4: Product service and action boundary

**Files:** Modify `lib/service.ts`, `app/api/actions/route.ts`; test `tests/lib/mcp-actions.test.ts`.

- [ ] Write failing tests for accepted-agreement-only preparation, exact action review, stale terms and closed deals.
- [ ] Add validated server actions that re-read trusted deal and catalog state.
- [ ] Commit `feat: connect accepted agreements to MCP intents`.

### Task 5: Track and Audit UI

**Files:** Add MCP components; modify Track and audit views; test `tests/browser/mcp-actions.spec.ts`.

- [ ] Write browser tests for unavailable, approval, success, failed and recorded-result labels.
- [ ] Build the collection-action card and reduced audit receipt.
- [ ] Keep simulation as a separate, explicitly selected action.
- [ ] Commit `feat: add approved Razorpay MCP collection flow`.

### Task 6: MCP verification and release

**Files:** Create `evaluation/mcp/`; modify `README.md`, `DEMO_SCRIPT.md`, `AI_BUILD_LOG.md`.

- [ ] Commit verification cases and report exact counts.
- [ ] If a compatible test connection exists, execute one approved test action and record the reduced receipt; otherwise document the unavailable gate without inventing support.
- [ ] Run full regression, build, release, secret and protected-file checks.
- [ ] Commit `docs: record MCP action verification`.

