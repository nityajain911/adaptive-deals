# Merchant decision redesign — design spec

**Date:** 2 October 2026
**Status:** design approved in sections by the applicant; awaiting review of this written spec. No product code may change until this spec is approved and an implementation plan exists.
**Baseline:** commit `e2d2642` (connected buyer journey, UI phase plus conversation fixes).
**Origin:** Track 2 judge-style review. The engine is credible, but the experience gives evidence, calculations, evaluation metadata, demo controls and the merchant's next action almost equal weight.

---

## 1. Purpose and success

### 1.1 The decision the product is built around

> "This client cannot accept my standard quote. Help me send an alternative I can profitably deliver."

The product chain: **buyer constraints → commercially feasible offer → accepted terms → collection schedule that can be amended with approval.** Every merchant screen must move that chain forward.

### 1.2 Success before recording

An unfamiliar user, with the demo controls hidden and without narration, can answer:

1. What is blocking the deal?
2. What offer is recommended?
3. What does the merchant gain and give up?
4. What should the merchant do next?
5. What is the current deal state?
6. What outcome will the product measure and learn from?

### 1.3 Priority

| Priority | Item | Must be complete before recording |
|---|---|---|
| P0-1 | Truthful, unambiguous current-state messaging | Yes |
| P0-2 | Offer-centred decision with one primary action | Yes |
| P0-3 | Three merchant stages: Understand the buyer → Review the offer → Track the deal | Yes |
| P0-4 | Audit evidence, technical metadata and demo controls moved out of the merchant's working view | Yes |
| P1 | Minimal outcome capture, an outcome summary, and the learning-policy explanation | Visual treatment may be reduced if time is short. The learning-policy explanation may not be omitted from the product or the submission. |

### 1.4 Non-goals

- A cross-deal inbox, analytics dashboards, live WhatsApp or Meta integration, or additional agents.
- Automatic model retraining, automatic prompt, template or policy changes, or a new learning engine.
- "What would need to change?" threshold search.
- A deal-completion transition. No `completed` transition is added; see §6.2.
- Withdrawing or cancelling a proposal after it has been sent (§5.7).

### 1.5 Protected boundary (must not change)

- Option generation and enumeration, commercial checks, economics.
- Agreement hashing and canonical-term rules.
- Reply parsing (`reply-rules.v1`), preventive restructuring, amendment logic, collection logic.
- AI prompts, schemas, validators, run-record format, orchestrator (`ai/`).
- Development and frozen evaluation cases, `FREEZE.json`, recorded results, committed live runs, `data/demo-run.json`.

If implementation shows that any protected rule must change, stop and bring that specific conflict back for review.

### 1.6 Allowed change

Additive changes to `lib/service.ts`, the deal-status transitions in `domain/state.ts`, and new pure derivations or modules with tests. Existing statuses and records are reused wherever they already mean the right thing. A new state is added only where the current model cannot tell the truth.

---

## 2. Information architecture

### 2.1 Routes

| Route | Purpose |
|---|---|
| `/deals/[dealId]/understand` | Stage 1: Understand the buyer |
| `/deals/[dealId]/offer` | Stage 2: Review the offer |
| `/deals/[dealId]/offer/preview` | Merchant preview of the exact buyer proposal (unsent draft) |
| `/deals/[dealId]/track` | Stage 3: Track the deal |
| `/deals/[dealId]` | Redirects to the stage holding the current required action (§3.4) |
| `/proposal/[agreementId]/v[n]` | Buyer proposal (unchanged route; content is shared, §5.6) |
| `/presenter` | Presenter page (§8.2), not part of the merchant product |

- Only `hero` exists as a deal ID. Any other ID returns "not found".
- `/`, `/workspace`, `/clarification`, `/decision`, `/agreement` and `/timeline` redirect through `/deals/hero`, which resolves the current stage through `dealProgress`. A legacy bookmark therefore never opens an inappropriate stage. The redirects stay after the old page implementations are removed.
- Direct stage routes stay available, so someone can deliberately inspect a settled earlier stage.

### 2.2 Merchant frame (shared by all three stages)

- The dark Razorpay-style header, and the deal title with the buyer's name.
- **Status banner**, one line from `dealProgress`:
  - an actor tag: *Action required · Waiting on buyer · Waiting on system · Up to date · Closed / Completed*;
  - a sentence, for example "Confirm two details before we can recommend an offer."
  - When you're viewing a non-current stage, the banner adds **Go to current stage →**. The banner never repeats the primary action.
- **Stage tracker:** Understand the buyer → Review the offer → Track the deal. Each stage is marked *Done*, *Current*, *Upcoming*, or *Closed* / *Completed*.
- **Audit details:** a quiet link that opens the read-only deal audit drawer (§8.3).
- **Footer:** "Synthetic data · fictional merchant and buyer".
- **Removed from the frame:** provenance and run-ID pills, simulated date, Run live, Reset, the guided-demo strip, the pending-count badge, and the five-tab navigation.

### 2.3 Stage display rules

- **Current stage:** full working content, with at most one primary action.
- **Completed stage:** a concise settled summary tied to its version. It shows the result, the completion time, the version, a link to the current stage, and a read-only details section. It must never show stale calls to action such as "Ambiguous — clarification needed", and it must not look editable unless the domain supports reopening.
- **Upcoming stage:** one line only, for example "Available after the buyer constraints are confirmed." or "Available after you send an offer." No partial cards, empty ledgers or future controls.
- Post-agreement payment changes stay in Track and never reopen Understand. A settled summary describes a particular version; it doesn't declare the facts permanently true.

---

## 3. State model and `dealProgress`

### 3.1 Reused statuses

| Situation | Deal status | Agreement status |
|---|---|---|
| Option selected, draft prepared | `options_ready` | `draft` |
| Merchant approved; send pending or failed | `approved` | `merchant_approved` |
| Sent successfully | `sent` | `sent` |
| Merchant chose Don't proceed, or closed a no-feasible or outside-template result | `merchant_rejected` | unchanged or none |
| Buyer declined | `buyer_rejected` | `buyer_rejected` |

**Transition additions.** `approved → merchant_rejected` already exists. Add `no_feasible_structure → merchant_rejected` and `outside_templates → merchant_rejected`, so those Offer-stage results can be closed honestly. No other transitions change.

### 3.2 Additive stored state (deal-scoped, with a schema/migration version)

- **`eligibleAt`** (ISO timestamp): when the stalled deal entered Adaptive Deals. It opens the 90-day metric window. For the hero deal: 1 Oct 2026, 09:00 IST. Imported earlier messages never move it backwards.
- **`selectedOption`**: references only, never a copy of the engine result.
  - The selected structure ID.
  - A source decision fingerprint: a deterministic hash of the replayed engine result's eligible-option set and the selected structure's canonical terms. Serialisation uses canonical JSON and the option IDs are sorted, so a change in display order alone never invalidates a draft.
  - The selection time from the injected clock.
  - The draft version ID once one is prepared.
- **Draft validity:** the draft keeps the canonical terms and their hash, as today. It is *stale* when the current decision fingerprint differs from its source, or when the selected structure is no longer eligible for preparation.
- **`deliveries`**, one entry per proposal version:
  - one stable delivery idempotency key per version;
  - attempt records, each with a unique attempt ID, time, status (`sent` or `failed`) and failure reason;
  - the successful delivery reference, if sent.
  - Once any attempt succeeds, later sends return that success and never deliver twice.
- **`outcomes`**: append-only records. Fields:
  - type, and a stable reason code (codes are stored separately from their display labels);
  - an optional merchant-facing note;
  - actor, and time from the injected clock;
  - deal ID and offer or agreement version;
  - a source action or message ID, where applicable.
  - Outcome records link to existing events or messages instead of duplicating them. They never alter terms, payment records or evaluation data.
- **`handledMessages`**: message ID, handled time, merchant actor, optional note.
- **`interpretations`** (merchant interpretation of an unsupported clarification reply): message ID, verbatim quote, supported value, merchant actor, time. Stored in service state only. The AI run record and orchestrator are unchanged.

**Presenter-only state** lives in a separate store file (`presenter.json`), never in the deal state:
- the one-shot **Fail next send** flag;
- the **Pause AI suggestions** flag's presenter view.

Presenter flags never appear in deal exports or in the merchant audit.

### 3.3 New service actions (the old atomic approve-and-send is split)

1. `selectOption(structureId)` accepts only an option the unchanged engine marks eligible for preparation. It cannot override failed checks or needs-information results.
   - An option that needs the buyer's approval may be selected, but its requirement stays visible.
   - Changing the selection invalidates any draft built from the previous option.
2. `prepareDraft()` stores canonical terms as an unsent draft. It is idempotent for an unchanged selection and fingerprint.
3. `approveDraft(version, termsHash)` rejects the call if the hash differs from the stored draft or the draft is stale. It records merchant approval of that hash and sets the deal to `approved` and the agreement to `merchant_approved`.
4. `sendProposal(version)` attempts delivery (simulated channel) using the version's stable idempotency key.
   - On success: the agreement becomes `sent`, the deal becomes `sent`, the proposal message and link are recorded, and buyer access opens.
   - On failure: an attempt record with its reason is added; approval and hash are kept; nothing advances; the buyer route stays unavailable.
   - A retry is the same action.
   - **Preconditions, checked on every send and retry before any delivery attempt:**
     - the deal is still open for sending (status `approved`, not `merchant_rejected` or later);
     - the version is still the selected, valid version (not stale, superseded or invalidated by a new selection);
     - its merchant approval hash equals the hash of its current canonical terms.
   - If any precondition fails, nothing is delivered and the service returns an explanatory error. An old retry can never send a proposal the merchant has since replaced or closed.
   - A request for a version that has already been delivered successfully returns the recorded success without another attempt.
5. `closeByMerchant(reasonCode, note?)`, allowed while in Offer: options ready, draft prepared, approved-but-unsent, no feasible structure, or outside templates.
   - Closing an approved-but-unsent deal revokes the pending delivery path but keeps the draft, the approval, the hash and the failed-attempt history.
   - It is not available after a successful send.
6. `markMessageHandled(messageId, note?)` changes no payment, mandate, collection, agreement or ledger data, and claims no reply was sent.
7. `interpretClarificationReply(messageId, value, quote)` rejects the call unless `quote` is a verbatim substring of that buyer message and `value` is one of the supported normalised values for that question. The record is labelled as merchant judgement.
8. Buyer decline and request-change accept an optional buyer reason code. For a change request, the buyer's message is already the source evidence: the outcome record links to that message instead of storing a second free-text reason.

The preview's single **Approve and send to buyer** click runs `approveDraft` and then `sendProposal`. If sending fails after approval, the approval is never rolled back and the proposal is never reported as sent.

### 3.4 `dealProgress(state, now)`: one pure derivation

**Returns:**
- `stage` (`understand`, `offer` or `track`) and `stageStatus` for all three stages;
- `kind` (`action_required`, `waiting_on_buyer`, `waiting_on_system`, `informational` or `terminal`);
- `actor`, `headline`, `primaryAction` (null unless `action_required`), `blockingReason`, and the applicable version.

It is derived only from domain facts, never from routes or visited pages. The status banner, the stage tracker, the deal-home redirect and every Now card read from it.

**Stage precedence**, first match wins:

1. A proposal was ever delivered successfully → **Track**. This includes buyer decline and later terminal outcomes.
2. The merchant closed before any successful send → **Offer**, terminal.
3. A recommendation, an approved-but-unsent draft, a no-feasible result or an outside-template result exists → **Offer**.
4. Otherwise (unresolved constraints, clarifications or missing information) → **Understand**.

Historical unresolved fields can never pull a sent deal back to Understand.

**Understand states:**

| Situation | Kind | Headline | Primary |
|---|---|---|---|
| Clarification drafts not yet sent | action_required | Confirm two details before we can recommend an offer. | **Send 2 questions to buyer** (or **Send question to buyer** when only one remains) |
| Questions sent, replies outstanding | waiting_on_buyer | Waiting for the buyer to answer. | none |
| Replies received, all supported | action_required | The buyer answered. Use these answers to build an offer. | **Use these answers** |
| A reply cannot be applied automatically | action_required | One answer needs your interpretation. | **Interpret buyer's reply** |
| Required fact missing | action_required | We need the buyer's budget before we can recommend an offer. | **Send question to buyer** (code-worded) |

**Offer states:**

| Situation | Kind | Headline | Primary |
|---|---|---|---|
| Recommendation, no draft or stale draft | action_required | Review this offer before sending it. / The offer changed since you reviewed it. | **Review buyer proposal** / **Review updated proposal** |
| Draft prepared, not approved | action_required | Review this offer before sending it. | **Review buyer proposal** |
| Approved, not sent (no attempt yet, or the last attempt failed) | action_required | Approved · not yet sent to the buyer. (reason) | **Retry sending** |
| No feasible structure | action_required | No offer fits both the buyer's confirmed limits and your current rules. | **Close in Adaptive Deals** |
| Outside templates | action_required | This request needs a custom arrangement. | **Mark as handled outside Adaptive Deals** |
| Closed by merchant | terminal | Closed in Adaptive Deals · (reason) | none |

**Migration review state** (a safeguard, not a normal workflow). This check runs before the stage precedence:

| Situation | Stage | Kind | Headline | Permitted action |
|---|---|---|---|---|
| Saved history is inconsistent or ambiguous, so the selected option or a delivery can't be inferred (§9) | The last stage the evidence supports: Offer if a draft or approval exists without a provable delivery, otherwise Understand | action_required | Saved deal records need review before this deal can continue. ‹Which records disagree.› | **Inspect records** (opens the read-only audit drawer at the conflicting records); **Reset demo** remains available from the demo bar |

- While in this state, approval, sending, retrying and buyer acceptance that depend on the missing evidence are refused by the service, not only hidden in the UI.
- The product never guesses that a proposal was delivered.

**Track precedence** (exhaustive; first match wins; tested):

| # | Situation | Kind | Example headline | Primary |
|---|---|---|---|---|
| 1 | Terminal: buyer declined, or deal status `completed` | terminal | Buyer declined offer version 1. | none |
| 2 | Amendment awaiting merchant review | action_required | The buyer asked to move the 1 Dec payment. Review the revised terms. | **Review revised terms** |
| 3 | Amendment awaiting buyer acceptance | waiting_on_buyer | Waiting for the buyer to accept the revised terms. | none |
| 4 | Valid change request under the active version, awaiting a draft | action_required | The buyer can't pay until after 20 Dec. Draft revised terms. | **Draft revised terms** |
| 5 | Unsupported or refused buyer message(s) not yet handled | action_required | Review buyer message / Review 2 buyer messages | **Review buyer message** |
| 6 | Sent proposal awaiting buyer response | waiting_on_buyer | Waiting for the buyer to review offer version 1. | none |
| 7 | Accepted; upfront payment unpaid and/or mandate pending | waiting_on_buyer | Buyer accepted. Waiting for the buyer to pay the upfront link and authorise recurring payments. (One combined message.) | none |
| 8 | Debit submitted with unknown outcome, or failed with an internal retry scheduled | waiting_on_system | Awaiting payment outcome. / Debit failed · retry scheduled for 4 Dec. | none |
| 9 | Next payment scheduled, nothing required | informational | Up to date · next payment ₹23,010 on 21 Dec 2026. | none |
| 10 | The current agreement version's ledger is `fullyPaid` (existing ledger rule: verified successful collections cover the contract total), status not `completed` | informational | All scheduled payments collected. | none |

**Notes on the table:**
- **Rows 2 and 3 never coexist.** The amendment model allows one amendment in progress at a time, moving through consecutive states. Merchant review always comes before buyer acceptance.
- **Rows 2 and 4:** an open request whose draft amendment exists is row 2.
- **Stale requests:** requests from earlier versions are excluded everywhere.
- **No "overdue" state.** The collection model has no overdue concept, so none is invented.
- **Row 10 never says the deal is "completed".** It is based on the current agreement's obligations and verified collections, never on "every attempt succeeded". Failed and removed attempts stay in history permanently and must not block it.
- **Row 5 counts as a merchant action within this deal only.** It is not a cross-deal inbox.

**Invariants (tested):**
- At most one stage is current. A closed or completed deal marks its final applicable stage Closed or Completed.
- At most one primary action is shown.
- A successful delivery is recorded at most once per version.
- Buyer access is impossible before successful delivery.
- Merchant approval always references the stored draft hash.
- Historical records are never deleted when a deal closes.
- Informational and waiting states never increase the merchant action count.
- Every reachable state produces a defined result; no generic fallback says "No pending actions".

---

## 4. Stage 1: Understand the buyer

**While current:**

1. **"What's blocking this deal"** (written by code from the confirmed profile):
   - **Original annual proposal: ₹1,41,600 including GST.** Source in evidence details: ₹1,20,000 pre-GST annual scope at the fixture's list price, plus 18% GST, giving the ₹1,41,600 customer-facing total. This figure is context only; it isn't an engine alternative and isn't counted as value.
   - **Current-quarter budget: ₹50,000 including GST.** "Until 31 December 2026" may be shown only because it follows deterministically from the normalised calendar-quarter constraint.
   - **Next budget: April 2027 · exact day not provided.** Never implies 1 April.
   - **Contracts above ₹60,000 including GST require MD approval** (per contract).
   - Unconfirmed facts are marked inline ("GST basis not confirmed"). There is no separate ambiguity panel.
   - **See evidence** shows the quotes, each with its truthful source (§8.3).
2. **"Confirm N details"**: the full text of every question to be sent, each marked "Suggested by AI", with one engine-derived sentence on why it matters.
   - **Primary: Send 2 questions to buyer** (dynamic count). In the simulated channel the batch is atomic: both are recorded as sent, or neither.
   - Each question keeps its own message ID, AI-suggested status, merchant approval, sent time and delivery result.
   - After sending, the action is replaced by "Waiting for the buyer".
   - **Use these answers** applies only answers that pass the existing evidence and normalisation rules: scripted replies carry their answer value as metadata, as today.
   - **Interpret buyer's reply** (for unsupported replies) opens the form linked to that message. It shows the original quote, offers only supported values, requires a verbatim supporting quote, and records the merchant as interpreter. Code verifies that the quote exists; whether it supports the value is the merchant's recorded judgement, and the UI says so.
3. **Conversation:** compact by default (the buyer's messages and this exchange), with **Show full conversation**.
   - Evidence highlights appear only when **See evidence** is on.
   - No scripted reply chips, typed composer or pause toggle.
   - Post-offer notices, payment replies and amendments never appear here; they belong to Track.

**Settled:** "Buyer constraints confirmed for offer version 1 · 1 Oct 2026, 09:22" (real time), with "Buyer constraints confirmed from the conversation". Read-only details list the constraints, the questions and answers, and evidence labelled "Source: simulated WhatsApp conversation". The UI never says "confirmed via WhatsApp" or implies a live connection.

**Pause AI suggestions** is removed from the merchant experience. Its effect is real but has no visible consequence in the hero deal, because the drafts exist at seed. It moves to the presenter page with its exact effect stated (§8.2). This supersedes the connected-journey addendum's visible pause control.

---

## 5. Stage 2: Review the offer

### 5.1 Recommendation page (current, recommendation exists)

1. **Headline**, chosen by code from the engine template type and never generated or modified by AI:
   - phased scope: "Start with a standalone three-month package" (month count from the structure);
   - split payment: "Keep the annual scope and split the payments";
   - deferred start: "Start when the buyer's next budget opens";
   - shorter commitment: "Offer a shorter commitment".
2. **Context:** "Original annual proposal: ₹1,41,600 including GST. The buyer has ₹50,000 including GST this quarter. Contracts above ₹60,000 including GST require MD approval." "Per contract" also appears in the details.
3. **Offer:** proposed customer total **₹46,020 including GST**; payments of **₹23,010** on 1 Nov 2026 and 1 Dec 2026; included and excluded scope; **projected contribution ₹19,329.60**.
   - One result line: "Passes your configured contribution and funding rules."
   - **See economics and applied rules** (collapsed; opens the audit drawer's economics and rules section): pre-GST value, GST, the contribution calculation, the contribution floor, peak funding requirement, the cash-at-risk limit, and payment and delivery assumptions.
4. **What this offer achieves:**
   - A proposed sale of ₹46,020 including GST.
   - Projected contribution of ₹19,329.60, based on configured costs and fees.
   - A standalone three-month package the buyer can approve within the confirmed limit.
5. **What changes from the original proposal:**
   - Social media and months 4–12 are not included.
   - The customer-facing proposal value is ₹95,580 lower than the original annual proposal (₹1,41,600 − ₹46,020). This line appears only when both totals share the same GST basis. It is never called lost or recovered revenue, or the value of specific excluded items.
   - No work outside the three-month package is committed.
6. **Why this offer**, at most two lines, followed by the existing source-accurate attribution line.
7. **Primary: Review buyer proposal.**
8. **Secondary:**
   - **Compare alternatives** (collapsed). Each eligible row has a quiet **Select this offer**, which reselects and recalculates the page; it never sends, approves or creates buyer access. Failed and needs-information options cannot be selected. Options needing buyer approval show that requirement.
   - **Don't proceed** opens the reason sheet (§5.7).
9. **Why other options didn't fit**, fully collapsed. Expanding it shows the featured buyer-side and seller-side rejections with links to the matching rules; the full list needs a further click. No rejection card appears in the initial viewport.
10. **Success measure** (quiet line): "Success measure: realised contribution from this deal within 90 days." Its tooltip explains that projected contribution is a forecast, and that realised contribution depends on verified cash, refunds, payment fees and delivery costs. There is no analytics panel on this stage.

**Language rule (whole product):** *proposed sale* and *projected contribution* before acceptance and payment. Never *revenue recovered*, *cash recovered*, *realised contribution* (except as the named target metric) or *guaranteed contribution*.

### 5.2 Other Offer results

See the Offer states table in §3.4. A no-feasible result explains the binding checks in plain words and never creates a Track stage.

### 5.3 Preview (`/deals/[dealId]/offer/preview`)

- **Review buyer proposal** selects the option if needed, prepares (or reuses) the draft, and opens the preview.
- **Merchant framing,** outside the proposal content: **Preview · Not sent to the buyer**.
- **Content:** the shared proposal component (§5.6), rendered from the draft's canonical terms. It shows scope, exclusions, the total including GST, payment amounts and dates, collection and mandate requirements, what happens after acceptance, and any buyer approval requirement. It never shows merchant economics, margin, internal limits, rejection logic or recommendation metadata.
- **Bottom of the preview:**
  - Primary: **Approve and send to buyer**.
  - Secondary: **Back to offer**.
  - Collapsed: **Agreement details** (version and hash).
- **Stale draft:** if the draft is stale or the hash shown differs from the stored draft, sending stops and the page asks the merchant to review the refreshed proposal.
- **Abandoning the preview** sends nothing, activates nothing, records no rejection, and creates no buyer-visible proposal.
- **Outcomes of the send:** success opens Track; failure returns to Offer in the approved-but-not-sent state with **Retry sending**.

### 5.4 Offer settled summary

- **After a successful send:** "Offer version 1 sent · ‹actual delivery timestamp›" (from the successful delivery record), with the title, total and payment dates, read-only details, and a link to the current stage.
- **After an amendment:** "Terms accepted from offer version 1 were amended by agreement version 2 · payment date changed." The historical offer is never rewritten.
- **If the merchant closed before sending:** "Closed in Adaptive Deals · ‹reason›", plus the compact outcome summary (§7.3).

### 5.5 Amendment versions and the delivery gate

- **One access gate for every version.** Buyer access depends on a successful delivery record for that specific version, whether it is the initial offer or an amendment.
- **Amendment rules stay unchanged.** The existing `approveAmendment` path keeps doing what it does today: merchant approval, marking the version sent, and sending the code-written amendment message.
- **Additive step:** when that simulated amendment message is sent, the same transition records a successful delivery for the new version in `deliveries`, with a stable idempotency key and one attempt. The version-2 buyer page therefore opens exactly when the amendment message has been sent.
- **Fail next send applies only to the initial proposal** (`sendProposal`) in this build. Amendment delivery always succeeds in the simulated channel, so no amendment-delivery recovery workflow is added.
- **Migration** infers amendment-version deliveries from the existing amendment message and sent status (§9).

### 5.6 Shared proposal content

The buyer page and the merchant preview render one component from canonical terms: scope, exclusions, customer total, dates, payment and mandate requirements, and acceptance consequences. Merchant framing and buyer actions sit outside it. The buyer route returns "not found" until a successful delivery for that version.

### 5.7 Don't proceed

Stable reason codes and display labels:

| Code | Label |
|---|---|
| `contribution_too_low` | Margin or contribution too low |
| `scope_not_worth_delivering` | Scope not worth delivering |
| `buyer_unlikely` | Buyer unlikely to proceed |
| `handled_elsewhere` | Will handle outside Adaptive Deals |
| `other` | Other |

There is also an optional note. **Close in Adaptive Deals** (no feasible structure) and **Mark as handled outside Adaptive Deals** (outside templates) use the same sheet: the first defaults to ending the opportunity, the second to `handled_elsewhere`. None of these is available after a successful send.

---

## 6. Stage 3: Track the deal

### 6.1 Layout, while current

1. **Now card**, from `dealProgress`: the headline, plus the primary action only when `action_required`. Secondary actions for waiting states: open the buyer proposal, copy the proposal link, and see the delivery status ("Sent · ‹time› · simulated channel").
2. **Payment schedule** (compact): date, amount including GST, method, and current status.
   - A rescheduled line reads "21 Dec 2026 (was 1 Dec)". A failed line with an active retry reads "Retry scheduled for 4 Dec", with the earlier failure in its details.
   - **Payment details** (collapsed) holds balance, GST, collected, unpaid service value and funding requirement.
   - Delivery and invoice schedules move to the audit drawer.
3. **Change and amendment card**, shown only when a request or amendment exists for the active version, or as a one-line settled result afterwards:
   - The buyer's quote. "Read by code, not AI: unavailable through 20 Dec → earliest debit 21 Dec."
   - **What changes:** the second payment moves from 1 Dec 2026 to 21 Dec 2026.
   - **What stays the same:** the amount (₹23,010), the scope, the total (₹46,020 including GST), the other payment date, and the existing mandate (it fits).
   - "Rechecked: passes the buyer's limits and your rules." The full rechecks sit behind **See rechecks**.
   - "No revised payment date becomes active until both you and the buyer approve."
   - **Current collection truth,** derived from state:
     - original debit still scheduled;
     - original debit failed;
     - internal retry scheduled;
     - retry removed, only when the existing domain transition has removed it;
     - revised date pending approval.
     - Drafting is never implied to have stopped a retry.
   - **Review revised terms** opens this card. **Approve revised terms** appears only after the exact change, the unchanged terms, the rechecks and the contractual version are visible.
   - Settled result: "Payment rescheduled to 21 Dec 2026 · agreement version 2", with version 1 shown as superseded history.
4. **Buyer messages needing a reply** (Track row 5): **Review buyer message** opens the exact message, why the system didn't act, the safe next step, **Mark as handled**, and an optional note.
   - For "I paid": "Payment is not confirmed. Verify it against the payment record before taking action."
   - **Mark as handled** means only that the merchant dealt with it outside the prototype.
5. **Conversation after the offer,** collapsed to the last two messages: proposal, payment, notice and amendment messages, and buyer replies with truthful outcome tags.
6. **Outcome and learning card** (§7).

**Moving out of Track:** the version-history table, the full event log, hashes, idempotency keys, delivery and invoice schedules, the old "Close" card, and the no-feasible example. These go to the audit drawer or the presenter page.

### 6.2 Terminal Track states

- **Buyer declined:** "Buyer declined offer version 1 · ‹reason if given›", plus the outcome card.
- **`completed`** is shown only if the deal status really is `completed`. This redesign adds no completion transition.

---

## 7. P1: Outcome capture and learning

### 7.1 Recorded signals

- **Merchant decisions:** Don't proceed, Close in Adaptive Deals, Mark as handled outside, each with a reason code and note; and selecting an alternative.
- **Buyer decisions:** decline (optional reason code), request change (linked to the message), acceptance.
- **Existing domain facts, unchanged:** verified payment, failed debit, amendment approval, rescheduling.
- Handled messages and merchant interpretations, each labelled as merchant judgement.

A change request is a learning signal, not a failed outcome.

### 7.2 Outcome and learning card (Track)

- **Headline: Provisional contribution from modelled inputs.**
  - Beneath it: "This is not a final realised-contribution result because refund data, actual payment fees and committed future costs are unavailable in the prototype."
  - The card names the intended business metric: realised contribution within 90 days per eligible stalled deal.
- **Metric status** reports two facts together in one compact label, for example "Window in progress · incomplete inputs":
  - **Window:** *in progress* until `eligibleAt` + 90 days, then *ended*.
  - **Data:** *incomplete* while any required input is unavailable, which is always the case in this prototype. Data becomes complete only when every input exists; time passing never makes it complete.
- **Rows,** each stating its GST basis:
  - Proposed value: the sent offer, including GST.
  - Accepted contract value: the accepted terms, including GST, or "Not accepted".
  - Verified cash collected: succeeded payments only, including and excluding GST. This never implies that all contractual value was collected.
  - Provisional contribution: cash received excluding GST, minus estimated payment fees at the configured rate on those verified collections, minus modelled direct delivery costs incurred.
    - **One measurement cutoff for every input:** the earlier of the injected current time and the end of the 90-day window (`eligibleAt` + 90 days). Cash, fees and costs all use this cutoff; activity after it falls outside the reported period.
    - It may be negative before cash arrives.
    - It is not shown as "Not started" merely because no cash has arrived.
- **Disclosures,** in the collapsed calculation:
  - "Refund data is not modelled in this prototype. No refund amount has been assumed." It is never shown as ₹0.
  - "Estimated payment fees at configured rate (2%) — not an actual settled Razorpay fee record."
  - "Includes modelled costs incurred up to the measurement cutoff. Irrevocably committed future costs are not modelled."
- **Recorded signals:** only records that exist.
- **Learning policy,** verbatim: "Outcomes across eligible stalled deals are reviewed to propose versioned improvements to recommendations and templates. Changes are evaluated before release. Merchant rules and policies never change automatically. If a proposed template or policy change affects a merchant's permitted commercial structures, it requires merchant approval before use."
- **Never claimed:** that this deal changes the model, continuous or automatic learning, automatic prompt, template or policy changes, or that recorded value equals recovered cash.
- **Group level:** the frozen denominator rule holds. All eligible stalled deals count, including those with no accepted offer and no cash.

### 7.3 Closed in Offer (no send)

There is no artificial Track stage. The settled Offer summary shows:
- proposed value, if one existed;
- accepted value: not accepted;
- "Payments recorded in Adaptive Deals: ₹0." This does not establish that the merchant received no money elsewhere, particularly when the reason is "Will handle outside Adaptive Deals";
- the merchant's closure reason;
- measurement status: included, because the denominator includes deals that never sign.

### 7.4 Offer hint

"Success measure: realised contribution from this deal within 90 days." (See §5.1.)

---

## 8. Demo controls, presenter page and audit drawer

### 8.1 Demo controls bar (outside the merchant frame; also used on the buyer page)

- **Label:** "Demo controls · simulated", plus the current simulated date once time has been advanced.
- **Next demo step,** state-dependent, with three step types:
  - **Merchant decisions** (send questions, use answers, select an offer, review buyer proposal, approve and send, draft revised terms, approve revised terms, mark a message handled): the bar only navigates and instructs, for example "Next: review the buyer proposal · Go to offer". It never performs the action.
  - **Buyer decisions:** clarification and notice replies go through **Simulated buyer reply**. Accepting or declining a proposal or a revision happens on the buyer page through the real buyer action; the bar only opens that page.
  - **System and external events** (advance the clock, send a scheduled notice, confirm the mandate, mark the upfront payment paid, submit a debit, return a debit outcome, run a scheduled retry): may be simulated from the bar.
- **Storyboard derivation (demo scaffolding in the service):** today's `nextDemoStep` and `demoNext` perform merchant actions themselves (approve and send, draft and approve amendments). Both are rewritten.
  - Each step carries its type: merchant, buyer or system.
  - The executing endpoint performs only system and external events, plus simulated clarification and notice replies.
  - For merchant and buyer steps it returns only a destination and an instruction.
  - A test asserts that no merchant or buyer decision can be executed through the demo endpoint.
- **Explicit time:** advancing the clock is its own labelled step, for example "Advance simulated date to 28 Nov", recorded in the clock advances. A compound control is allowed only if its label says both things ("Advance to 28 Nov and send scheduled notice") and it records two separate events. Buyer replies keep normalising from their own timestamps.
- **Simulated buyer reply:** appears only when a reply is expected. It offers the pre-scripted replies for that message plus "Type a reply…", both through the same code path. Resulting messages are labelled "Simulated buyer reply".
- **Overflow menu:** Reset demo, Open presenter page, Hide demo controls (persists per browser; a small "Show demo controls" tab restores it).
- **Separation:** the bar is not part of the merchant information architecture, and the merchant journey must work fully with it hidden.

### 8.2 Presenter page (`/presenter`)

- **Label:** "Presenter · not part of the merchant product". It has no merchant frame, and no merchant navigation links to it.
- **Contents:**
  - Run live: states that it makes a new external model call, and always uses a new run ID.
  - Replay a stored run: no model call.
  - Every scenario (Other outcomes), and every simulation, including the failed-debit secondary path and upfront link paid.
  - **Fail next send:** deterministic, one-shot, scoped to the demo deal, resettable.
  - **Pause AI suggestions:** states that existing drafts remain unchanged and no new AI-worded drafts are created while paused.
  - The run record and model details, the full event log, the raw outcome records with provenance and calculation inputs.
  - Integrity: replay-integrity result, plus prompt hashes against `FREEZE.json`, read-only.
- **Safeguard (existing behaviour, to be tested):** a live run is written only to the git-ignored data directory under a new `run-live-‹id›`. It can never overwrite `data/live-runs/`, `data/demo-run.json`, frozen cases or recorded results.
- It may reuse the audit component read-only. Its controls are never reachable from the merchant audit drawer.

### 8.3 Merchant audit drawer (read-only, deal-scoped)

**Opened from** Audit details and from See economics and applied rules. It can open directly at a subsection.

**Behaviour:**
- focus is trapped while open;
- Escape closes it;
- focus returns to the control that opened it;
- full-screen at 390 px;
- no mutation controls, hidden or reused.

**Sections:**

1. **Evidence**, each item labelled with its true source:
   - buyer constraints: "Simulated WhatsApp conversation" or the relevant clarification message;
   - original annual proposal and merchant costs: "Synthetic deal fixture";
   - payment state: "Simulated payment record";
   - merchant interpretations: "Merchant interpretation of buyer message", with message ID and verbatim quote;
   - engine results: "Deterministic calculation from configured inputs";
   - AI output: its actual run ID and prompt version.
   - Character offsets are under advanced details.
2. **Applied merchant rules:** today's rules content.
3. **Approval and acceptance history:** versions, actors, timestamps, delivery attempts. Hashes and idempotency keys are under advanced details.
4. **Calculation provenance:** total, GST, projected contribution, funding requirement, provisional contribution, and their configured inputs.
5. **Who did what**, specific to this run:
   - **AI:** extracted the opening constraints, drafted the clarification questions, prioritised eligible options.
   - **Code:** normalised supported values, evaluated every permitted structure, calculated every figure, enforced approval ordering, validated AI prose, interpreted only the narrow supported payment-date reply.
   - **Merchant:** approved messages and terms, selected alternatives, handled unsupported messages.
   - **Buyer:** supplied replies and accepted or declined terms through simulated buyer actions.
   - If AI prose failed validation and code wording was shown, the drawer says so. It never credits AI with replaced text.
6. **Schedules:** delivery, invoice and collection attempts.

---

## 9. Migration

- The store gains a schema and migration version. A deterministic migration runs once and is tested.
- **What the migration infers**, only where unambiguous:
  - `eligibleAt`: the first recorded deal time, as the accepted historical fallback;
  - the selected structure: from the existing agreement or draft;
  - successful delivery: from the existing sent agreement, proposal message and approval event;
  - buyer acceptance or rejection: from agreement state;
  - amendment-version deliveries, from the existing amendment message and sent status (§5.5);
  - the current agreement version, and amendment and payment history (kept as-is).
- **If the selected structure or delivery can't be inferred unambiguously:**
  - leave the new field unset;
  - keep every historical record;
  - show the migration review state defined in §3.4;
  - never invent a delivery, acceptance or option.
- **Historical events are never rewritten.** An existing sent-and-accepted hero state resolves to Track after migration.

---

## 10. Verification

### 10.1 Unit and service tests

- **Section 1:**
  - selected-option persistence and invalidation;
  - preview and approval using the same canonical hash;
  - approved-but-unsent;
  - send failure with idempotent retry;
  - no duplicate delivery;
  - buyer route unavailable before a successful send;
  - merchant and buyer closures;
  - outcome provenance and immutability;
  - pending mandate as `waiting_on_buyer`;
  - exactly one current stage;
  - every invariant in §3.4.
- **Understand:**
  - the batch sends exactly the unresolved questions, each with separate approval and delivery evidence;
  - the primary action disappears after sending;
  - unsupported replies are never normalised silently, and the interpretation quote must be verbatim;
  - settled Understand never shows unresolved historical messaging;
  - post-offer messages are excluded;
  - there is no live-WhatsApp wording.
- **Offer:**
  - each template's headline;
  - the ₹95,580 line only on matching GST bases;
  - failing or unresolved options cannot be selected;
  - reselection invalidates the draft;
  - delivery time drives the settled summary;
  - a failed send keeps the approval and opens no buyer route;
  - projected, accepted, collected and provisional values are never interchanged;
  - interpretations are labelled merchant judgement and leave the frozen AI record untouched.
- **Track:**
  - the exhaustive precedence table;
  - two buyer setup tasks give one combined waiting message;
  - unsupported messages are `action_required`;
  - Mark as handled changes no payment, mandate, collection, agreement or ledger data;
  - a merchant close before sending never resolves to Track;
  - amendment copy reflects whether the original debit was scheduled, failed, retried or removed.
- **Completion and delivery:**
  - "All scheduled payments collected" after a preventive amendment, and after a failed debit followed by a successful retry, despite failed and removed attempts in history;
  - the version-2 buyer page opens exactly when the amendment message is sent;
  - Fail next send never affects amendment delivery;
  - a retry after the merchant reselects or closes delivers nothing;
  - a repeated send for a delivered version returns the recorded success;
  - the migration review state refuses approval, sending, retry and buyer acceptance.
- **Metric:**
  - `eligibleAt` sets the window, and imported earlier messages can't move it;
  - refunds are disclosed, not zeroed;
  - fees are labelled estimated;
  - incurred costs can make the provisional value negative;
  - the result stays incomplete after day 90 while inputs are missing;
  - after day 90, costs and cash after the cutoff are both excluded;
  - the label reports window and data status together;
  - the fingerprint is unchanged by reordering the options.
- **Migration:**
  - sent and accepted hero state resolves to Track;
  - ambiguous history fails safely;
  - the migration runs once.

**Changed legacy tests:** any test asserting the old atomic approve-and-send, or the five-view routes, may be updated. Each change is listed in the build log with the reason the expectation became obsolete.

### 10.2 Browser tests (Playwright)

- **The full journey:**
  - the 90-second storyboard (§11), driven by the demo bar;
  - the same merchant decisions with the bar hidden (buyer steps on the buyer page);
  - Next demo step never performs a merchant approval;
  - explicit time advancement is recorded.
- **Navigation and recovery:**
  - legacy routes redirect to the current stage;
  - stale preview;
  - failed send and retry;
  - buyer actions are unavailable before successful delivery.
- **Audit and presenter:**
  - audit source labels match the actual source;
  - attribution reflects the validation fallback;
  - presenter controls can't be reached from merchant navigation or the audit drawer.
- **Data integrity:**
  - a live run can't overwrite frozen or pinned data (tested with a fake provider; no external call);
  - migrated sent and accepted state stays in Track;
  - ambiguous history fails safely.
- **Layout and accessibility:**
  - no horizontal scroll at 1440 px and 390 px;
  - keyboard: tracker, drawers (focus trap, Escape, focus return) and disclosures;
  - an initial Offer viewport without rejection or rule detail.

### 10.3 Boundary checks

- The immutable-asset SHA-256 comparison (44 files).
- Prompt hashes equal `FREEZE.json`.
- No diff in the protected paths of §1.5.
- Credential scan.
- No Groq calls.

### 10.4 Unfamiliar-user check (run by the applicant)

- **Setup:** demo controls hidden, no narration. Open the product at the current stage, then after each storyboard beat.
- **Questions:** the six in §1.2.
- **Recording:** counts (for example, "4 of 5 answered question 3 correctly") and verbatim comments. No percentages. The agent does not write or invent these results.

---

## 11. Documentation and submission (after the built flow is approved)

**90-second storyboard:**

| Time | Show |
|---|---|
| 0–12 s | The annual proposal stalled by the buyer's budget and approval constraints. |
| 12–25 s | The system identifies the constraints and asks the necessary clarification. |
| 25–50 s | One feasible recommendation, its economics and the scope given up. |
| 50–68 s | The merchant reviews; the buyer accepts; collection setup is shown accurately. |
| 68–82 s | A later buyer request produces a reviewed amendment, with both approvals. |
| 82–90 s | The business metric, and what remains to be validated. |

**Document updates:**
- **Demo script and pitch:** rewritten to the storyboard above, describing only actions visible in the built flow.
- **Product note:**
  - replace the outdated "obtain and run the frozen test set" plan with the completed frozen evaluation and its agent-authored, non-independent provenance;
  - distinguish the prototype's provisional contribution from the intended complete metric.
- **Placeholders:** the agent replaces factual placeholders only. First-person judgement prompts stay marked for the applicant. **Release check:** the submission fails if any `[APPLICANT]` placeholder remains, so the applicant must complete them before submitting.
- **Product decisions and README:** updated to the new architecture.
- **AI build log:** appended, never rewritten.

---

## 12. Inventory

**Kept:**
- the engine;
- the reply rules;
- restructuring;
- the buyer proposal (content shared with the preview);
- the conversation thread (scoped per stage);
- the rules content (moved into the audit drawer);
- source-accurate attribution;
- every safety boundary.

**Moved:**

| What | Where |
|---|---|
| Guided demo, simulated replies, typed composer, system simulations | Demo bar |
| Run live, scenarios / Other outcomes, pause, fail next send, run record, full event log, integrity | Presenter page |
| Version history, hashes, idempotency keys, delivery and invoice schedules, evidence offsets | Audit drawer |

**Removed from the merchant product:**
- the five-tab navigation;
- the guided-demo strip;
- the pending-count badge, replaced by the `dealProgress` banner;
- scripted reply chips in message bubbles;
- the old Close card;
- equal-weight funding and cash-at-risk tiles.

**Risks:**
- **Splitting approve-and-send touches tested service code.** Mitigation: an additive API, updated tests listed with reasons, the boundary checks in §10.3.
- **Migration of saved demo state.** Mitigation: a versioned, fail-safe migration; reset is always available.
- **Scope.** P1's visual treatment may shrink; P0 and the learning-policy explanation may not.
