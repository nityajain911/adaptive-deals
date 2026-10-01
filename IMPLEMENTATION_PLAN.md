# Implementation plan — Adaptive Deals by Razorpay

Source of truth: `../FREEZE_PACK.md` (FP). Section numbers below refer to it.

| Phase | Scope | FP sections | Gate |
| --- | --- | --- | --- |
| 1. Domain and tests | `domain/` (clock, money/GST, amount and date normalisation, constraint profile with evidence verification, budget gap, template enumeration, buyer and seller checks, seller economics, clarification analysis, agreement hashing, mandate fit, collections, ledger, amendment, state machines) and the single hero fixture in `data/synthetic/` | 7, 8, 9 (engine), 10, 11, 12, 13 | Unit tests + typecheck pass. **Stop and report hero-fixture result.** |
| 2. AI layer | `ai/`: Zod schemas, versioned prompt registry, provider interface (Anthropic SDK + synthetic replay adapter), constraint extraction, clarification wording, explanation with placeholders filled by code, run records, saved synthetic replay, prompt-injection inertness | 9, 15, 18 | Tests + typecheck |
| 3. Five views | JSON-file store in `.data/` (atomic writes) + `reset:seed`, API routes, Razorpay-dashboard-style shell, the five views, role switch to Demo buyer view, guided demo mode, Run live | 14, 19, 20 | Tests + typecheck + lint + build |
| 4. Payments and simulation | `integrations/razorpay/`: key guard (`rzp_test_` only), payment link + recurring interfaces, simulated adapter, Simulate failed debit, simulated clock advance, amendment scene | 12 | Tests + typecheck |
| 5. Evaluation and docs | `evaluation/` dev runner + frozen-set schema/importer/runner (no frozen cases authored), docs, Playwright smoke + screenshots at 1440×900 and 390×844 | 16, 17 | All checks |

## Phase 1 design notes

- Money is integer paise (`number`, guarded with `Number.isSafeInteger`). GST per invoice line = `round_half_up(pre × rate_bps / 10000)`.
- GST-inclusive buyer amounts → the largest pre-GST paise `P` with `P + GST(P) ≤ inclusive`; the residual is shown as the reconciliation difference.
- Dates are calendar values with explicit precision (`day` / `month`), derived in the merchant timezone from each message's own timestamp. Domain code receives time only from an injected `Clock`.
- Every template × parameter combination is generated and evaluated; nothing is filtered before checks. Structure verdict: any `fail` → rejected; else any `needs_information` → needs information; else feasible. Approval is a label (`within_limit` / `requires_approval`), never a failure.
- Outcome labels, reasons and figures come from the engine only; the fixture holds inputs only.
