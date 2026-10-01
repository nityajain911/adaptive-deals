# AI build log — Adaptive Deals by Razorpay

This log records how AI was used to build the prototype. Entries marked **[Claude Code]** were written by the coding agent. Sections marked **[APPLICANT]** must be written by the applicant in their own words. Do not treat agent entries as the applicant's decisions.

## Model usage

| Where | Model | Notes |
| --- | --- | --- |
| Building the codebase | Claude Opus 5.5 (`claude-opus-5-5`) via Claude Code desktop | Agent wrote code, tests and draft docs from `CLAUDE_CODE_PROMPT.md` + `FREEZE_PACK.md` |
| Product runtime (constraint extraction, clarification wording, explanation) | Configurable via `ADAPTIVE_DEALS_MODEL` | Phase 2. Default run uses a **synthetic replay**, not a model |

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
1. *GST answer scope.* The freeze pack models "whether amounts include GST" as one profile-wide field. The clarification asks about ₹50,000, and the recorded answer is applied to every amount in the message, including the ₹60,000 approval limit. The approval check therefore compares GST-inclusive contract totals with ₹60,000.
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

### [APPLICANT] Decisions on AI suggestions

> Add your own entries: which agent suggestions you accepted, rejected or changed, and why. The agent must not write this section.
