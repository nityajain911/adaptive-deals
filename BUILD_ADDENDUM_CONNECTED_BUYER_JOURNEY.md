# Build Addendum — Connected Buyer Journey

**Date:** 2 October 2026

**Status:** Approved scope for the next build round

**Applies to:** Adaptive Deals by Razorpay

**Relationship to the frozen specification:** This addendum extends the product after the 1 October freeze. It does not rewrite the frozen specification, prompt versions, frozen cases, or recorded evaluation.

## 1. Product decision

The next build round turns the existing engine into one connected buyer-to-payment-to-restructure journey:

> A buyer expresses a commercial constraint in a simulated WhatsApp conversation. Adaptive Deals extracts and verifies the deal constraints, asks for missing facts, constructs an executable deal, obtains exact-version approval from both parties, prepares collection, and safely restructures the agreement when the buyer reports a new timing constraint.

WhatsApp is an interaction layer around Adaptive Deals. It is not the product's differentiator and is not evidence that commercial negotiation commonly happens there. Negotiation frequency in WhatsApp remains a merchant-interview assumption.

The preventive change is framed as **commercial restructuring**, not payment recovery. The product asks whether the agreement can still work for both parties under a changed buyer constraint.

## 2. Goals

1. Show one coherent journey from buyer message to executable agreement and later restructuring.
2. Make the merchant's recommended decision understandable within one screen.
3. Give the buyer a clean, mobile-first proposal and change-request experience.
4. Make every AI, engine, merchant, buyer, simulated, and payment-system action visibly attributable.
5. Preserve the current safety boundaries: AI cannot approve terms, trigger payment, change the ledger, or silently amend an agreement.

## 3. Explicit non-goals

- Real Meta or WhatsApp Business Platform integration.
- Autonomous negotiation or autonomous outbound sending.
- A deal inbox.
- Editable merchant policies.
- Deferred-demand follow-up.
- New commercial templates or scope-change pricing.
- A new AI prompt for payment-reply interpretation in this round.
- Any tuning against the completed frozen evaluation.
- Any claim that the recorded AI evaluation validates the new journey as a whole.

## 4. Reply-interpretation decision

### Decision: bounded deterministic interpretation for this prototype

Do not reuse `extract.v2` to interpret payment-notice replies. Its `next_budget_date` field describes the next budget for deal construction; it does not cleanly represent a temporary payment unavailability period. Reusing it would overload the meaning of a frozen field.

Do not introduce a new AI prompt in this round. For the deterministic demo:

- The buyer chooses a pre-scripted simulated reply.
- The reply is stored as buyer-authored, with its own timestamp and `inReplyTo` reference to a sent notice.
- Code recognises the narrowly supported unavailability expression, preserves the exact phrase, and normalises it from the reply's own timestamp.
- `till`, `until`, `up to`, or `upto` a stated day means unavailable through that day; the earliest proposed debit is the following day.
- If no safe supported date can be read, the system asks for the date and creates no amendment.

Other reply types are handled conservatively:

| Reply | Product behaviour |
| --- | --- |
| “Cash is tight till the 20th” | Record **Change requested** and allow code to propose a date after rechecking the deal |
| “I paid” | Record **Payment claimed — verification required**; do not update payment status or the ledger |
| “Okay” | Record acknowledgement only; do not accept terms or authorise collection |
| Question or unsupported reply | Mark **Merchant attention needed**; do not infer a commercial change |

A future free-form reply interpreter must be a new versioned task such as `interpret_payment_reply.v1`, with its own schema, prompt, development set, injection tests, and recorded results. It must not alter or be presented as part of the earlier frozen evaluation.

## 5. P0 — Connected simulated buyer conversation

Create a buyer-conversation surface in the merchant workspace. The channel is labelled:

> **WhatsApp simulated · buyer replies selected by the demo operator**

### Message states

- **Suggested by AI:** a draft clarification produced by the existing clarification step.
- **Approved and sent by merchant:** the merchant explicitly sends the draft.
- **Received from buyer:** a simulated buyer reply with timestamp and reply-to reference.

Proposal, notice, payment, and amendment messages are code-authored from verified application state. They must not be labelled as AI wording.

### Required behaviour

- No outbound message is sent automatically.
- A clarification question appears as sent only after merchant approval.
- A proposal link appears only after the merchant approves the exact agreement version.
- Internal contribution, costs, margins, cash-at-risk limits, and rejection logic never enter buyer-facing message payloads.
- Buyer replies retain source, timestamp, and the message or notice they answer.
- “Okay” never accepts an agreement.
- “I paid” never changes an attempt, payment-link status, collected amount, or ledger value.
- A **Pause suggested replies** control stops new AI-authored outbound drafts while continuing to record inbound messages. Resuming suggestions is explicit.
- Every simulated action is labelled in the event log.

## 6. P0 — Dedicated buyer proposal

The buyer proposal uses a standalone mobile-first route and buyer layout. Merchant navigation, run controls, reset controls, evaluation provenance, and internal deal status do not appear inside the buyer product frame.

A thin demo bar may sit outside the product frame to move between merchant and buyer views. It must be visibly labelled as a demo control.

### Information order

1. Merchant and buyer names.
2. Included scope.
3. Excluded scope.
4. Total including GST.
5. Payment amounts and dates.
6. Recurring authorisation, where applicable.
7. What happens after acceptance.
8. Actions: **Accept proposal**, **Request a change**, **Decline**.
9. Collapsed **Agreement details** containing version, terms hash, and audit facts.

Every amount and date is rendered from the agreement terms. No figure is copied into page text as a constant.

**Request a change** returns the buyer to the simulated conversation with the proposal version referenced. It does not mutate agreement terms. **Decline** records a buyer rejection and creates no payment setup.

## 7. P0 — Recommended-first merchant decision

Replace the current explanation-first hierarchy with one leading recommendation card:

- Recommended structure.
- Included and excluded scope.
- Buyer payment schedule.
- **Projected contribution** and contribution-floor result.
- Peak funding requirement and cash-at-risk result.
- Buyer approval requirement.
- A concise explanation headed **Why this structure is recommended**.
- Quiet attribution: **Explanation written by AI · all figures calculated by the engine.** If code fallback wording is used, label it accurately instead.
- **Approve and send** action for the exact version.

Show alternatives in a compact comparison. Keep detailed schedules, checks, evidence, every rejected structure, and calculations behind **View details**. Rejected and needs-information structures remain impossible to approve.

Use **projected contribution** for option economics. Reserve **realised contribution** for the primary outcome metric.

## 8. P0 — Preventive buyer-triggered restructuring

The hero amendment happens before the scheduled debit fails:

1. Adaptive Deals sends the simulated advance notice.
2. The buyer replies to that notice: “Cash is tight till the 20th.”
3. The buyer conversation shows **Change requested**.
4. Code reads the supported date phrase from the reply's own timestamp and proposes the earliest safe date.
5. The merchant sees a **Draft amendment** with the source quote, date transformation, buyer checks, projected contribution, funding requirement, and mandate fit.
6. Merchant approval creates a new approved version.
7. Buyer acceptance must match the new version's terms hash.
8. Only then may the collection schedule be updated.
9. The UI shows **Payment rescheduled** only after the scheduled attempt is removed or replaced and the new attempt is recorded.

### Required safeguards

- **Change requested**, **Draft amendment**, and **Payment rescheduled** are distinct states.
- The existing scheduled attempt is never removed before both approvals.
- A submitted attempt with an unknown outcome blocks the collection update.
- A succeeded attempt remains in history and cannot be charged again.
- A failed attempt remains in history.
- If the new date is outside buyer constraints, below seller policy, or outside the existing mandate, show the failed check or require fresh authorisation; do not present the revision as active.
- The existing failed-debit amendment path remains supported and tested as a secondary path.

## 9. P1 — Applied merchant rules drawer

Add **Applied merchant rules** to the decision screen rather than creating a new page. Values come from the active fixture or merchant configuration:

- Contribution floor.
- Cash-at-risk limit.
- Permitted structure templates.
- Maximum tenure.
- Smallest instalment.
- Discount policy.
- Package separability and independent-value rules.

Each seller-side rejection links to the rule and value that caused it.

## 10. P1 — Other outcomes and next actions

Rename the current scenario area **Other outcomes**. Keep it subordinate to the hero deal.

| Engine outcome | Next action |
| --- | --- |
| Missing information | Draft the specific missing question |
| Ambiguous | Draft the decision-relevant confirmation |
| Outside supported templates | Hand over to merchant |
| No feasible structure | Explain the binding checks and allow the merchant to close or reconsider inputs |

Do not build “What would need to change?” threshold search in this round.

## 11. Demo storyboard

| Time | Demonstration |
| --- | --- |
| 0–15s | Buyer WhatsApp message beside evidence-backed constraints |
| 15–27s | AI drafts two questions; merchant sends; simulated buyer replies; cards update |
| 27–48s | Recommended structure, projected contribution, funding exposure, approval status, and one rejection |
| 48–62s | Buyer receives proposal, opens standalone mobile page, and accepts the exact version; payment setup appears |
| 62–82s | Advance notice, buyer timing constraint, draft amendment, checks, two approvals, and payment rescheduled |
| 82–90s | No-feasible boundary and the primary metric definition |

The main recording need not show a completed upfront payment. Payment creation and verified status are distinct events.

## 12. Verification and evidence boundaries

### Frozen AI evaluation

- Preserve `extract.v2`, `clarify.v1`, `explain.v3`, their hashes, the frozen cases, `FREEZE.json`, and the recorded result.
- The existing frozen result remains evidence for those prompt versions only.
- Continue to describe `0 of 120` precisely: no engine-non-feasible option was presented as approvable.
- Do not tune against the frozen cases.

### New deterministic tests

- A reply must reference a sent notice and cannot predate it.
- The supported unavailability phrase is normalised from the reply timestamp.
- An ambiguous or unsupported date creates no amendment.
- “Okay” cannot accept an agreement or amendment.
- “I paid” cannot change payment status, collection attempts, or ledger amounts.
- Buyer-facing messages contain no internal economics or policy values.
- A preventive revision rechecks buyer constraints, seller economics, and mandate fit.
- The old collection attempt remains until matching merchant and buyer approvals exist.
- Collection updates are idempotent and do not create overlapping attempts.
- Failed-debit restructuring remains valid as a secondary path.
- The standalone buyer proposal renders every amount and date from canonical terms.
- AI/code attribution follows the actual output source.

### Release checks

- Unit and integration tests.
- Type checking, lint, and production build.
- Playwright journey covering merchant and buyer frames.
- Desktop and mobile screenshots.
- Updated 90-second demo script, one-page product note, product decisions, README, and AI build log.

## 13. Cut line

If time slips, cut in this order:

1. P1 Other outcomes actions.
2. P1 Applied merchant rules drawer.
3. Visual polish beyond the core merchant and buyer journey.

Do not cut the connected conversation, clean buyer proposal, recommendation hierarchy, or preventive restructuring from the agreed P0 story.
