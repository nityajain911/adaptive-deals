# Five-persona synthesis — prioritised change list

4 October 2026 · baseline HEAD `f03d90e`; product code last changed at `d525ce1`.

## Decision

The next build should concentrate on **decision integrity, truthful current state and a compact current-agreement view**. It should not expand Adaptive Deals into messaging, accounting or project management.

Five immediate workstreams are recommended:

1. Make unresolved buyer activity own the current action.
2. Stop a prepared commercial decision when newer relevant evidence arrives.
3. Preserve conditions and disclose every material term change through acceptance.
4. Separate proposed, contracted, collected and 90-day figures.
5. Give each party one compact, state-aware view of the current agreement and next action.

Three presentation improvements follow only after those five are correct: simplify manual handling, focus revisions and alternatives, and repair mobile comparison layouts.

## Evidence boundary

This synthesis combines five **agent-conducted role inspections** of the same prototype:

| Lens | Primary job inspected |
|---|---|
| Agency founder | Choose a profitable structure and approve commercial commitments |
| Buyer business manager | Understand, secure internal approval, accept or request a change |
| Agency account manager | Interpret buyer messages and hand decisions to an authorised merchant |
| Agency finance operator | Track accepted obligations, collections and exceptions |
| Agency delivery manager | Understand the work commitment and effect of payment changes |

These are not five research participants, so “3 of 5 personas” below means **cross-role relevance**, not user frequency or independent validation. Confidence is high when the behaviour was reproduced in the current build or confirmed in stored records; it does not establish market demand. Priorities combine consequence, number of roles affected, strategic fit and implementation scope.

Source reviews:

- [Agency founder](2026-10-03-agency-founder-review.md)
- [Buyer business manager](2026-10-03-buyer-business-manager-review.md)
- [Agency account manager](2026-10-03-agency-account-manager-review.md)
- [Agency finance operator](2026-10-03-agency-finance-review.md)
- [Agency delivery manager](2026-10-04-agency-delivery-manager-review.md)

## Prioritised backlog

| Rank | Merged change | Roles affected | Consequence if unfixed | Recommendation |
|---:|---|---:|---|---|
| 1 | Unresolved buyer activity becomes the current action | 5/5 | Both parties can wait for each other; unresolved risk can look finished | **P0 — build first** |
| 2 | Newer relevant evidence invalidates a prepared decision | 2/5 directly; commercial safety affects all | Merchant can send terms that contradict the buyer's latest message | **P0 — build first** |
| 3 | Conditions and term differences survive selection, preview and acceptance | 4/5 | Buyer may accept under the wrong authority or misunderstand what changed | **P0 — build first** |
| 4 | Financial figures reflect contract state and time horizon | 2/5 directly; founder/finance critical | Proposal appears collectible; valid 90-day metric appears arithmetically inconsistent | **P0 — build first** |
| 5 | Compact current-agreement and next-action summary | 4/5 | Users reconstruct the deal from proposal, Track and Audit; information dump persists | **P0 — build after 1–4** |
| 6 | Buyer status page and revision response become state-aware | 3/5 | Buyer cannot tell whether to pay, wait, authorise or review a revision | **P1 — include if P0 is stable** |
| 7 | Manual interpretation and exception handling become focused and honest | 3/5 | Operator loses context or mistakes acknowledged work for resolved work | **P1 — include if time** |
| 8 | Alternatives and revisions become scannable on mobile | 2/5 | Valid choices are hard to compare and response controls require excessive scrolling | **P1 — presentation pass** |

## P0.1 — Unresolved buyer activity must own the current action

### Merged evidence

- A proposal change request is recorded while the merchant still sees **Waiting for the buyer**.
- A counter-request on an amendment has the same ownership error.
- A requested date that fails the engine checks returns the merchant to **Up to date**, although the original debit remains and the buyer still cannot pay it.
- Marking an unsupported message handled hides the task even when the note says a founder still needs to decide.
- The buyer page keeps forward-looking setup instructions after decline, acceptance or supersession.
- A service-pause/access message correctly requests attention, but suggests asking for one exact date.

These are one theme: the product has durable records, but no single precedence model for **unresolved work, actor and next action** across merchant and buyer views.

### Build

Extend the existing progress derivation rather than adding page-specific banners:

1. A current proposal or revision change request becomes `waiting_on_merchant` and appears above outcome measurement.
2. A failed restructuring remains `action_required`: show the failed check, the still-active payment and the next human step together.
3. Separate `acknowledged` from `resolved`. A handling note is visible in the conversation and audit; a pending decision remains actionable.
4. Derive buyer next steps from agreement, delivery and payment state. Declined and superseded versions have no future operational instructions.
5. Use reason-specific fallback copy. Unsupported content says **Review the buyer's request and agree the next step**; exact-date guidance appears only for a date ambiguity.
6. Permit a bounded disposition such as **Keep current terms / handle outside Adaptive Deals**, recorded with its consequence. Do not create a general counter-proposal editor.

### Acceptance checks

- A buyer request on the current proposal or revision makes the merchant the actor and names the request.
- Accepting unchanged terms after a request requires an explicit disposition; the request does not silently disappear.
- A rejected revised date leaves the original debit and unresolved follow-up together on screen.
- A handling note remains visible, and “handled” cannot produce **Up to date** when a decision is still pending.
- Declined, accepted and superseded buyer pages each have state-appropriate next steps.
- No unresolved message or request sits below the outcome card while the headline says no action is needed.

### Do not add

A new inbox, CRM queue, automatic follow-ups, arbitrary contract editing or AI classification of every buyer message.

## P0.2 — Newer evidence must stop an older commercial decision

### Merged evidence

- After a ₹46,020 offer was prepared, a buyer reply said the available budget was now ₹20,000 and instructed the merchant not to send. The message was stored, but the old offer remained approvable and was sent in simulation.
- When the buyer first requested the 20th and then corrected it to the 24th, the app safely retained both messages but kept **Draft revised terms** for the earlier date as the primary action.

The fingerprint currently protects canonical terms against silent technical mutation. It does not prove that all newer commercial evidence has been reviewed.

### Build

Add an evidence-review boundary to prepared decisions:

1. Record which buyer messages/clarifications were reviewed when an option or amendment draft was prepared.
2. A later message linked to those facts or the same payment line marks the draft **Review required** and blocks approval, send or amendment preparation.
3. Present old confirmed facts and the newer message together.
4. Allow an authorised merchant to apply a supported correction and recompute, or record that the message does not change terms.
5. Preserve accepted contracts until the existing amendment process completes. This mechanism reviews decisions; it never silently rewrites an active agreement.
6. Conflicting replies are resolved before advancing either one. Preserve both in history.

### Acceptance checks

- “Budget is now ₹20,000; do not send” blocks the ₹46,020 send path.
- A second date correction blocks drafting from the first date until the conflict is disposed.
- An irrelevant acknowledgement does not invalidate a draft.
- Accepted agreement terms remain unchanged until a versioned amendment is approved and accepted.
- AI cannot decide whether a conflicting commercial statement should replace a confirmed fact.

## P0.3 — Preserve approval conditions and disclose complete term differences

### Merged evidence

- Selecting the annual alternative leaves the main card labelled **Recommended offer** and retains explanation written for another option.
- The merchant sees **Needs buyer's MD approval**, but the buyer can accept without recording that approval.
- A payment amendment moves both the debit date and planned invoice date, while buyer wording says everything else stays unchanged.
- Delivery scope and service months correctly remain unchanged during the payment amendment, but this is not stated where the delivery team needs it.

### Build

1. Keep **Recommended** only on the engine's recommended option. A merchant-selected alternative says **Selected by you**.
2. Generate the visible explanation and conditions from the selected engine result.
3. Put material conditions into canonical, versioned terms. The annual proposal must require an explicit buyer attestation that the needed approval was obtained. Describe it as an attestation, not verified MD identity.
4. Build a structured amendment difference summary from canonical terms:
   - payment date: 1 December → 21 December;
   - planned invoice date: 1 December → 21 December;
   - amount: unchanged;
   - agreed scope and service months: unchanged;
   - mandate: existing authorisation remains within its limit/end date, when true.
5. Show full terms under expandable details and retain same-hash approval/acceptance.

### Acceptance checks

- Every alternative has the correct label, rationale, approval condition and figures.
- The annual proposal cannot be accepted without the recorded approval attestation.
- Initial proposal and amendment preview show the same canonical conditions the buyer accepts.
- No amendment says “everything else unchanged” when its planned invoice date also changes.
- A delivery reader can tell that the payment-date amendment did not move service months.

### Defer

Named corporate approver routing, identity verification, multiple approval levels, issued-invoice correction and arbitrary counter-proposals.

## P0.4 — Separate proposed, contracted, collected and measured money

### Merged evidence

- Before acceptance and after decline, proposed amounts appear as operational balance/GST-to-collect tiles.
- Annual collections can show ₹1,41,600 in the ledger and ₹42,480 on the outcome card because the latter stops at the 90-day cutoff. The label omits that boundary.
- A deferred deal can have ₹11,800 collected operationally and ₹0 in the measurement window.
- Remaining amount including GST is less prominent than provisional contribution, although it is the operator's immediate answer.
- “Unpaid service value” and delivered-value calculations follow planned dates, not verified work completion.

### Build

Use explicit concepts and never reuse one label across them:

| State / figure | Required label and behaviour |
|---|---|
| Before acceptance | **Proposed total / proposed payment schedule**; no balance-to-collect tiles |
| Declined | **No accepted contract recorded in Adaptive Deals**; proposal remains history |
| Accepted contract | Current contract value, collected (verified), remaining contract payments incl. GST and next payment/exception |
| Outcome metric | **Payments recorded within the 90-day window**, with cutoff beside the figure |
| Forecast | **Full-contract forecast** |
| Interim result | **Provisional through [date]**, with missing inputs |
| Delivery/economics model | **Modelled from planned service dates; actual delivery is not recorded** |

Keep the frozen metric definition unchanged. Do not alter correct calculations merely to make displayed numbers match.

### Acceptance checks

- An unaccepted or declined offer never looks like an amount currently owed.
- The annual and deferred examples explain why operational collections and 90-day receipts differ.
- Track leads with remaining amount including GST and the next payment/exception once a contract is active.
- Provisional and forecast contribution are never presented as a performance delta across different time horizons.
- Planned service value is never described as verified delivery completion.

## P0.5 — Add one compact current-agreement and action summary

This is the direct answer to the user's observation that the product feels like a dump of information. It should be built after state and money concepts are correct, because a concise summary of incorrect state is worse than a detailed one.

### Build

At the top of the current Track stage, below the single state banner, show a compact summary sourced from the current accepted version:

- **Current agreement:** package/structure name and version.
- **Agreed work:** included packages, exclusions, planned service period and “no later phase agreed” where applicable.
- **Payment state:** collected, remaining incl. GST, next payment/exception.
- **Setup/authorisation:** only when pending or relevant to the current action.
- **Next action and actor:** one line from the shared progress derivation.

Examples:

- “Standalone three-month package · version 2” rather than “Annual digital marketing.”
- “Website fixes once; search marketing and reporting Nov–Jan; social media excluded.”
- “₹23,010 collected · ₹23,010 remaining incl. GST · next debit 21 Dec.”
- “Planned service through Jan 2027 · delivery completion is not tracked here.”

Detailed economics, model provenance, raw schedules, hashes and event history stay in their existing expandable/audit locations. The summary should replace duplicated cards or headings; it should not be another large section.

### Acceptance checks

- Founder, finance and delivery readers can answer “What is agreed, what is left, and who acts next?” without opening Audit.
- A three-month accepted phase is never titled as an accepted annual contract.
- The summary updates to the active version; superseded versions remain historical.
- Before acceptance, the same location says **Proposed offer** and does not imply a contract.
- Payment completion does not imply project completion.
- Buyer-facing content never exposes internal cost, margin or funding limits.

## P1 — Experience improvements after correctness

### P1.1 Buyer status and revision focus

- Add a compact state-driven payment section using existing records: upfront pending/paid, authorisation pending/confirmed, next debit, failed/retry and all scheduled payments collected.
- When execution is simulated, state that plainly; do not add a fake Pay button.
- On revisions, lead with what changed, what stayed the same and what happens if the buyer does nothing. Put response controls next, then expandable full terms.
- Show **Change requested — waiting for Pinecone Media Works** above Accept/Decline when applicable.

### P1.2 Focus manual interpretation and exception handling

- Show the correct number of answers needing interpretation and handle one at a time.
- Reuse visible source text while requiring explicit value confirmation and retaining evidence.
- Offer **Not clear yet** rather than forcing a binary interpretation.
- Show handling note, time, author and disposition beside the message.
- Preview the exact generated outbound message before send. Do not add an implied live WhatsApp composer.

### P1.3 Repair mobile comparisons

- Stack alternative name, payment pattern, approval condition, figures and action vertically.
- Keep the option's commercial meaning readable before its contribution details.
- On mobile revisions, show the difference and action before repeated full terms.

## Implementation sequence

| Batch | Scope | Why this order | Review gate |
|---|---|---|---|
| 1 | P0.1 progress/ownership plus P0.2 evidence-review boundary | Prevents incorrect actions before presentation work | Re-run request, failed-restructure, handled-message, late-correction and conflicting-date journeys |
| 2 | P0.3 option/condition continuity and structured amendment diff | Makes the agreement and approval boundary truthful | Review recommended vs selected, annual attestation and both amendment dates |
| 3 | P0.4 financial concepts | Prevents incorrect summaries and outcome interpretation | Reconcile phase, annual, deferred, unaccepted and declined fixtures |
| 4 | P0.5 compact current agreement | Now safe to simplify around correct derived facts | Five role-based walkthroughs focused on comprehension |
| 5 | P1 buyer/manual/mobile polish | Improves pace without reopening domain concepts | Desktop and 390 px browser journeys; copy review |

Each batch should preserve the engine enumeration, economics, agreement hashing, reply parser, frozen AI prompts/schemas/evaluation assets and existing collection guards unless a separately reviewed defect requires a bounded change. No frozen evaluation rerun is needed for UI/domain work that does not change the frozen AI tasks.

## Explicitly out of this build

- Real WhatsApp delivery, inbox or general chat composer.
- CRM pipeline, multi-deal dashboard or automatic follow-up system.
- Task boards, resource allocation, timesheets or delivery certification.
- Full accounting: bank reconciliation, issued GST invoices, refunds, partial/external payments, write-offs and settlement matching.
- Team authentication, named assignments and multi-level approval routing.
- General scope/cancellation amendment engine or buyer-built counter-proposals.
- Merchant rule/package editor and AI-generated contractual deliverables.

These can be valid productisation directions. They do not solve the current prototype's central problem: knowing the current truth, the responsible actor and the safe next action.

## Research questions that remain open

Before turning deferred items into a roadmap, validate with actual merchants and buyers:

1. Who prepares an offer, who can approve it and when is founder approval required?
2. How often do buyers correct constraints after a draft is prepared?
3. Where are personal WhatsApp/phone outcomes recorded today, and is an in-product handoff enough?
4. Which package details and client responsibilities must be contractual?
5. What tells delivery to begin, pause or complete work?
6. Which identifier finance uses to match payment, invoice, buyer and bank settlement?
7. Does the buyer personally complete payment setup, or delegate it to finance/procurement?

The current inspections demonstrate reproducible product gaps. Actual interviews must establish frequency, preferred workflows and willingness to adopt the broader capabilities.

## Final release test for this change round

A fresh reviewer should be able to answer these seven questions on every current state without Audit:

1. Is this a proposal, accepted agreement, amendment or historical version?
2. What is the current agreed commercial structure?
3. What changed from the prior version?
4. What has been collected and what remains under the accepted contract?
5. What work is planned, and what operational facts are not tracked?
6. Who must act next, and why?
7. Which figures are operational, forecast or limited to the 90-day outcome window?

If any answer conflicts across merchant, buyer and historical views, the build is not ready for the final product note or demo recording.
