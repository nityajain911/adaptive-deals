# Adaptive Deals by Razorpay — one-page product note

> **Draft structure prepared by Claude Code.** Sections marked **[APPLICANT]** need your own judgement and voice. The agent has not written first-person reflections or claimed decisions on your behalf. Replace every bracketed prompt.

## Problem

Small service sellers, such as agencies selling modular packages, often hear "we only have ₹50K this quarter" and respond by discounting, extending informal credit, or reshaping scope and timing by hand. Those choices can create hidden delivery exposure and thin contribution.

**Evidence posture:** public evidence supports the broader need for payment flexibility and the prevalence of buyer cash constraints. How often this specific pre-signing problem occurs among Indian agencies is an **assumption to validate**. Everything in the prototype is synthetic.

**[APPLICANT]** Why this problem, and why Razorpay is well placed to solve it: [your reasoning and any sources you will cite].

## Product

An AI commercial-structuring layer, shown as one connected journey from buyer message to executable agreement and later restructuring:
1. **Simulated WhatsApp conversation.** The AI reads the buyer's opening messages and cites exact evidence; code normalises every value.
2. **Clarification.** Code picks only the questions that change the decision. The AI drafts their wording, the merchant sends each one, and the buyer's replies become the confirmed answers.
3. **Recommended-first decision.** Code evaluates every merchant-approved structure (split payment, phased scope, deferred start, shorter commitment) against the buyer's constraints and the seller's economics. One recommendation leads, with projected contribution, peak funding requirement and approval status. The AI ranks and explains only what passed, and the screen states accurately who wrote the explanation.
4. **Standalone buyer proposal.** A mobile-first page built only from the canonical terms. The merchant and the buyer approve the same terms hash before any payment setup. The buyer can accept, request a change or decline.
5. **Preventive restructuring.** After an advance notice, the buyer writes "Cash is tight till the 20th." Code reads that supported phrase, drafts an amendment and rechecks buyer constraints, seller economics and mandate fit. Both parties approve the new version before the collection moves.
6. The engine can say **No feasible deal**, and other outcomes get one bounded next action.

## Key judgement calls in the build

- **AI/code boundary:** AI extracts, flags, words and ranks; code computes, decides and gates payments.
- **Approval limits:** treated as an approval requirement, never as a prohibition or a loophole.
- **Seller economics:** funding requirement and unpaid service value are kept separate.
- **Payment-change replies are read by code, not AI.** In my words:

  > We deliberately kept AI out of reading payment-change replies. The phrases are narrow and an error moves money, so code handles them and everything else goes to the merchant. A broader reply reader would be a separate AI task with its own evaluation.

  *(Agent note: this paragraph states the judgement as specified in the build addendum. Edit it into your own voice before submission.)*

**[APPLICANT]** Which of these you would defend first to a merchant or a judge, and which AI suggestions you accepted, rejected or changed (also log them in `AI_BUILD_LOG.md`).

## Assumptions

- **Synthetic hero values** (prices, costs, a 35% contribution floor, a ₹10,000 cash-at-risk limit, a 2% fee, an 18% GST rate): see `FIXTURE_RATIONALE.md`.
- **Timing:** a next budget without an amount is checked on timing only. Payment due dates fall on the first of the month. Costs land at the start of each delivery month; value is delivered at the end of it.
- **Recurring payments** are simulated. A mandate does not guarantee payment.

## Limitations, stated plainly

- WhatsApp is simulated. The buyer's replies are selected by the demo operator.
- The buyer proposal page is a demonstration with no authentication.
- Recurring payments remain simulated.
- The earlier frozen evaluation covers its recorded prompts (`extract.v2`, `clarify.v1`, `explain.v3`), not the complete new journey.
- How often commercial negotiation happens over WhatsApp is an assumption to validate.
- Supported payment-change language is deliberately narrow. Hinglish ("20 tak") and imprecise relative dates ("till next week", "till salary comes") need merchant attention.

**[APPLICANT]** The assumption you consider riskiest, and why.

## Metric

**Primary:** realised contribution within 90 days per eligible stalled deal, including deals that never sign. Guardrails: amount owed after day 90, remaining delivery obligations, and contribution-floor breaches (target zero). No results are claimed.

## Validation plan

**[APPLICANT]** Complete in your own words. A suggested structure:
1. **Problem frequency:** [how many agencies, how recruited, what counts as a stalled deal].
2. **Extraction quality:** freeze the prompts; have [a classmate] label 15–20 unseen conversations; run `npm run eval:frozen`; report counts only.
3. **Merchant value:** [a pilot design comparing realised contribution per stalled deal against business as usual].
4. **Kill criteria:** [what result would make you stop or pivot].
