# Adaptive Deals by Razorpay — one-page product note

> **Draft structure prepared by Claude Code.** Sections marked **[APPLICANT]** need your own judgement and voice. The agent has not written first-person reflections or claimed decisions on your behalf. Replace every bracketed prompt.

## Problem

Small service sellers, such as agencies selling modular packages, often hear "we only have ₹50K this quarter" and respond by discounting, extending informal credit, or reshaping scope and timing by hand. Those choices can create hidden delivery exposure and thin contribution.

**Evidence posture:** public evidence supports the broader need for payment flexibility and the prevalence of buyer cash constraints. How often this specific pre-signing problem occurs among Indian agencies is an **assumption to validate**. Everything in the prototype is synthetic.

**[APPLICANT]** Why this problem, and why Razorpay is well placed to solve it: [your reasoning and any sources you will cite].

## Product

An AI commercial-structuring layer:
1. The AI reads the buyer conversation and cites exact evidence.
2. Code normalises every value and asks only the clarification that changes the decision.
3. Code evaluates every merchant-approved structure (split payment, phased scope, deferred start, shorter commitment) against the buyer's constraints and the seller's economics.
4. The AI ranks and explains only what passed.
5. The merchant and the buyer approve the same terms hash before any payment setup.
6. The engine can say **No feasible deal**.

## Key judgement calls in the build

- **AI/code boundary:** AI extracts, flags, words and ranks; code computes, decides and gates payments.
- **Approval limits:** treated as an approval requirement, never as a prohibition or a loophole.
- **Seller economics:** funding requirement and unpaid service value are kept separate.

**[APPLICANT]** Which of these you would defend first to a merchant or a judge, and which AI suggestions you accepted, rejected or changed (also log them in `AI_BUILD_LOG.md`).

## Assumptions

- **Synthetic hero values** (prices, costs, a 35% contribution floor, a ₹10,000 cash-at-risk limit, a 2% fee, an 18% GST rate): see `FIXTURE_RATIONALE.md`.
- **Timing:** a next budget without an amount is checked on timing only. Payment due dates fall on the first of the month. Costs land at the start of each delivery month; value is delivered at the end of it.
- **Recurring payments** are simulated. A mandate does not guarantee payment.

**[APPLICANT]** The assumption you consider riskiest, and why.

## Metric

**Primary:** realised contribution within 90 days per eligible stalled deal, including deals that never sign. Guardrails: amount owed after day 90, remaining delivery obligations, and contribution-floor breaches (target zero). No results are claimed.

## Validation plan

**[APPLICANT]** Complete in your own words. A suggested structure:
1. **Problem frequency:** [how many agencies, how recruited, what counts as a stalled deal].
2. **Extraction quality:** freeze the prompts; have [a classmate] label 15–20 unseen conversations; run `npm run eval:frozen`; report counts only.
3. **Merchant value:** [a pilot design comparing realised contribution per stalled deal against business as usual].
4. **Kill criteria:** [what result would make you stop or pivot].
