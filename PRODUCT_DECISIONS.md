# Product decisions

Draft maintained by the coding agent. Each decision states its rule and where code enforces it. Sections on AI/code boundaries, trust controls, metric definitions, scope exclusions and the per-view acceptance checklists are added in later phases.

## Money and GST

**Rule:** money is integer paise, in INR. GST is computed **per invoice line** at the merchant's configured rate (18% in the hero fixture) as `round_half_up(pre_GST × rate_bps / 10000)`, rounded to the nearest paise. A line total is pre-GST plus GST. No floating-point arithmetic touches amounts.

**GST-inclusive buyer amounts:** the pre-GST amount is the largest pre-GST paise value whose total (pre-GST + per-line GST) does not exceed the stated amount. Any residual is shown as the reconciliation difference. For the hero, ₹50,000 incl. GST gives ₹42,372.88 + ₹7,627.12 = ₹50,000.00, so the residual is ₹0.00. For ₹50,014 the residual would be ₹0.01.

Enforced in `domain/money.ts` (`gstForLine`, `derivePreGstFromInclusive`).

## Featured rejections on the Decision view

The Decision view highlights rejected structures chosen **by rule from engine results, never by structure ID**. The full rejected list is always shown as well.

| Featured slot | Candidates | Order |
| --- | --- | --- |
| Buyer-side ("attractive, but the buyer cannot carry it out") | Rejected, full annual scope, every failed check is a buyer check | 1. fewest failed checks → 2. highest buyer appeal = smallest largest payment (incl. GST) → 3. earliest delivery start → 4. structure ID (stable final tie-break only) |
| Seller-side ("the buyer could pay this, the seller cannot afford it") | Rejected, every failed check is a seller check | same order |

Enforced in `domain/engine.ts` (`featuredRejections`). Tests check that the result does not depend on enumeration order, satisfies the rule against every candidate, and changes when the fixture changes.

## Advance notice before each recurring debit

Adaptive Deals sends its own notice `advanceNoticeDays` before each recurring debit (3 days in the hero fixture). The notice is never sent on or after the debit date. In the prototype every notice is **simulated and labelled**; no message reaches a real buyer. A buyer message that answers a notice is stored with `inReplyTo = <notice id>` and keeps its own timestamp. It cannot be recorded against a notice that was not sent, or dated before it.

Enforced in `domain/notices.ts`.

## Revised debit date after "cash tight till ‹date›"

**Rule:** "cash tight till ‹date›", "until ‹date›" and similar phrases mean the buyer's cash is unavailable **through** that date, inclusive. The earliest revised debit is:

- **day precision:** the next day;
- **month precision:** the first day of the next month.

Code computes this. The AI never chooses the date.

**Hero:** the buyer replies on 1 Dec 2026 to the 28 Nov advance notice. "Till the 20th" is normalised from the reply's own timestamp to 20 Dec 2026, so the revised debit is **21 Dec 2026, not 20 Dec**. Debiting on the 20th would land on the last day the buyer said cash is tight. The inclusive reading is the conservative one: it can delay a debit by a day but never pulls one into the period the buyer excluded.

The proposed date is not automatically accepted. It is re-checked against:

- the buyer's constraints: 21 Dec is still inside the current-quarter budget;
- seller policy;
- the existing mandate: within the ₹23,010 per-debit limit and before the 31 Jan 2027 end date.

It then needs merchant approval and buyer acceptance of the new version's hash.

Enforced in `domain/amendment.ts` (`earliestDebitAfterUnavailableUntil`, `CASH_UNAVAILABLE_UNTIL_RULE`).

## Merchant policy values are configuration, not engine logic

Limits such as the cash-at-risk limit, contribution floor and smallest instalment are merchant settings. The engine enforces whatever the merchant configures. The hero values and their reasons are in `FIXTURE_RATIONALE.md`.
