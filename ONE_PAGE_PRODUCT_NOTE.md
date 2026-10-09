# Adaptive Deals by Razorpay — one-page product note

> Sections marked **[APPLICANT]** require the applicant's own judgement and voice. Replace every bracketed prompt before submission.

## Problem and opportunity

Small service sellers, such as agencies selling modular packages, often hear that a buyer has limited budget now, more budget later, or an internal approval threshold. The seller then discounts, gives informal credit or manually reshapes scope and timing—without a reliable view of delivery exposure, contribution or whether the payment plan can be executed.

Public evidence supports the broader prevalence of buyer cash constraints and demand for payment flexibility. The frequency of this specific pre-signing problem among Indian agencies, and how often the negotiation occurs over WhatsApp, remain assumptions to validate. The prototype uses synthetic data and claims no market result.

**[APPLICANT]** Why this problem, and why Razorpay is well placed to solve it: [your reasoning and cited sources].

## Product

Adaptive Deals is a commercial-structuring layer between a buyer conversation and Razorpay's payment rails.

1. **Understand the buyer.** AI extracts candidate constraints with verbatim evidence. Code normalises the values and identifies only the missing facts that can change the decision; AI drafts the question wording.
2. **Review the offer.** Code enumerates every merchant-approved template and checks buyer timing, approval conditions, contribution, funding and payment fit. Code ranks the eligible structures by the merchant's chosen priority and writes the explanation; the model's own ordering, where one was recorded, is kept only as history. The merchant previews the exact buyer proposal and outbound message before approval.
3. **Track the deal.** The product shows the active version, agreed scope, collected amount, amount still to collect and one next action. Buyer changes become versioned amendments; accepted terms and scheduled collections change only after the required approvals.

The buyer receives a mobile proposal built from canonical terms. Merchant and buyer acceptance are tied to the same terms hash. A preventive path handles “Cash is tight till the 20th” before the scheduled debit, while unsupported payment-change language goes to the merchant. The engine can return **No feasible deal** after evaluating the full approved template space.

## Product judgement and trust boundaries

- **AI interprets the buyer's conversation and drafts the questions. Code reads the merchant's documents, calculates, checks and ranks. The merchant decides.** Every displayed commercial figure comes from the deterministic engine.
- **Approval thresholds are conditions, not bans.** An annual option can remain feasible while clearly requiring the buyer's MD-approval attestation.
- **Seller economics stay explicit.** Funding requirement and unpaid service value are separate concepts.
- **Payment-change replies use narrow code rules.** An interpretation error can move money, so broader language is escalated rather than guessed. A broader AI reader would be a separate task with its own evaluation.
- **Learning is governed.** Outcomes can propose versioned improvements to recommendations or templates. Changes are evaluated before release; merchant rules never adapt automatically, and commercial-policy changes require merchant approval.

**[APPLICANT]** Which judgement call you would defend first, and which AI suggestions you accepted, rejected or changed: [write in your own voice and mirror the decision in `AI_BUILD_LOG.md`].

## Evaluation and evidence

The merchant's own prices, delivery costs and limits (their "Prices & costs") come from versioned records the merchant confirms, optionally drafted from an uploaded rate card or cost sheet by code (no model reads the document). Every recommendation is worked out from those records and the buyer's confirmed constraints, so the same buyer gets a different answer under different economics.

The frozen model evaluation was run once on 20 labelled cases against `extract.v2`, `clarify.v1` and `explain.v3`:

- Correctly extracted fields: **42 of 47 expected**.
- Unsupported extracted fields: **2 across 20 cases**.
- Required clarifications asked: **4 of 6**; missed: **2 of 6**.
- Unnecessary clarifications asked: **0 across 20 cases**.
- Failure states correctly identified: **14 of 16**.
- Failing options presented as approvable: **0 of 120**.

The evaluation ran when the model also proposed an order for the eligible offers. The product now ranks them in code, so the last figure no longer measures anything the model controls; it is kept unchanged as the frozen result.

The 20 cases were written by OpenAI Codex at Nitya Jain's direction, so this is agent-authored evidence and not independent validation. The connected buyer journey was added without changing the frozen prompts, schemas, validators or results. Five later persona reviews were also agent-conducted role inspections, not interviews; they informed usability and integrity changes but do not establish demand.

## Metric

**Primary:** realised contribution within 90 days per eligible stalled deal = cash received within the window excluding GST, minus refunds, payment fees and direct delivery costs incurred or irrevocably committed because of the deal, divided by all eligible stalled deals in the group.

The prototype displays a clearly labelled provisional figure because refund data, actual payment fees and committed future costs are unavailable. It separately tracks the accepted contract, verified payments, amount owed after day 90 and remaining delivery obligations. No outcome result is claimed.

## Assumptions and limitations

- Hero prices, costs, the 35% contribution floor, ₹10,000 cash-at-risk limit, 2% fee and 18% GST rate are synthetic merchant configuration.
- WhatsApp, mandates, recurring debits, retries and notices are simulated; a mandate does not guarantee payment.
- The buyer proposal has no authentication. Buyer MD approval is an attestation, not identity verification.
- Planned service dates are contractual inputs; actual delivery completion is not tracked.
- Refunds, external payments and accounting reconciliation are not modelled.
- Supported payment-change language is deliberately narrow. Hinglish such as “20 tak” and relative phrases such as “till next week” require merchant attention.

**[APPLICANT]** The assumption you consider riskiest, and why: [write in your own voice].

## Next validation

**[APPLICANT]** Define the next evidence step in your own words: [merchant segment and recruitment, what counts as an eligible stalled deal, the pilot comparison, and a kill or pivot threshold].
