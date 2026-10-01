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

### [APPLICANT] Decisions on AI suggestions

> Add your own entries: which agent suggestions you accepted, rejected or changed, and why. The agent must not write this section.
