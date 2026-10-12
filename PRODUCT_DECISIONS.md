# Product decisions

Draft maintained by the coding agent. Each decision states its rule and where code enforces it. Sections on AI/code boundaries, trust controls, metric definitions, scope exclusions and the per-view acceptance checklists are added in later phases.

## AI and code boundaries

| Responsibility | Owner | Where enforced |
| --- | --- | --- |
| Read the conversation; return raw text, exact evidence quote and message ID per field | AI (call 1) | `ai/schemas.ts` (strict, no numeric fields) |
| Flag ambiguities, missing facts, unsupported requests, suspected instructions | AI flags | same |
| Verify every quote is verbatim in its cited message; reject fields that fail | Code | `domain/constraints.ts` |
| Normalise amounts, periods and relative dates from each message's own timestamp | Code | `domain/amounts.ts`, `domain/dates.ts` |
| Confirm whether a flagged request is representable by the four templates | Code | `REPRESENTABLE_REQUEST_KINDS` |
| Compare every reading of each ambiguity and decide which change the decision | Code | `analyseAmbiguities` |
| Word one question per decision-relevant fact | AI (call 2) | `ai/clarify.ts` validates: only listed facts; only figures from the message; GST question names every stated amount; otherwise code wording |
| "Why it matters" text | Code | `explainAmbiguity` |
| Enumerate every template, compute GST, schedules, contribution, funding, checks, verdicts | Code | `domain/engine.ts` and friends |
| Rank and explain feasible structures | AI (call 3) | `ai/explain.ts`: aliases only; placeholders only; no literal figures, dates or percentages; no approval-bypass or guarantee wording; unknown aliases ignored, omitted options appended, approval ordering enforced |
| Fill every displayed figure | Code | `fillPlaceholders` |
| Approval, acceptance, hashes, payments, collections | Code + people | `domain/agreement.ts` etc.; the AI layer imports none of these and the model is given no tools |

**Degrading safely:** an unavailable, refused, truncated, schema-breaking or invalid extraction produces an empty profile and run status `needs_review`. No commercial terms are created from it. Clarification and explanation failures fall back to code wording and code ranking, labelled as such.

**Provider:** chosen by the applicant: **Groq with `openai/gpt-oss-120b`** (official `groq-sdk`).
- Requests use `response_format` `json_schema` with `strict: true`, `temperature: 0`, and no tools.
- The Zod schemas are converted to strict-mode JSON Schema: every object closed and fully required, basic keywords only (`ai/strict-schema.ts`). Length limits removed from the request are still enforced by Zod on the response, followed by code's evidence and normalisation checks.

The Anthropic SDK provider remains available (`ADAPTIVE_DEALS_PROVIDER=anthropic`). Configuration:
- the provider comes from `ADAPTIVE_DEALS_PROVIDER` and the model from `ADAPTIVE_DEALS_MODEL`;
- the key comes from `GROQ_API_KEY` or `ANTHROPIC_API_KEY` and is passed explicitly to the client, never logged.

Without the selected provider's key, "Run live" is unavailable and says why. The bundled synthetic replay is never presented as a live run.

**Prompt versions:** a published prompt version is never edited; changes create a new version, and retired versions stay in `PROMPT_VERSIONS`. Every run records the versions and hashes it used, and replays rebuild requests with those versions. Current and final for the frozen evaluation: `extract.v2`, `clarify.v1`, `explain.v3`. The explanation schema is versioned with its prompt (`explanationSchemaFor`). From `explain.v3` on, `ranking` and `option_notes[].option` accept only the bare aliases `A`–`L`.

**Displayed demo run:** after a reset the demo shows the committed actual Groq run named in `data/demo-run.json` (`run-live-3f518779`, final prompts), labelled "Replay of an actual run". `data/live-runs/` keeps every committed live run as an audit record, including the original v1 run `run-live-e1ddc008` and the v2 run `run-live-a727c9c8`. Without a committed live run, the bundled synthetic replay is used and labelled as such.

**Run records and replay:** every run stores the run ID, kind, provider, model, prompt versions and prompt hashes, inputs (messages, policy, recorded answers), each step's exact request hash and raw output, the engine snapshot and what was displayed. A replay uses only the stored run's own outputs, keyed by exact request hash, and must reproduce the stored engine and display output byte for byte; otherwise it is refused. Labels:

- `Synthetic replay · run ID …` for the bundled hand-written run;
- `Replay of an actual run · run ID …` only for a stored `live` run.

## Corrections across messages

For a single-valued field, a value in a later message supersedes an earlier one, treating it as an explicit correction. The card notes the superseded value and the message it came from. Two different values for the same field in the same message are a conflict: the field is rejected rather than guessed.

## Money and GST

**Rule:** money is integer paise, in INR. GST is computed **per invoice line** at the merchant's configured rate (18% in the hero fixture) as `round_half_up(pre_GST × rate_bps / 10000)`, rounded to the nearest paise. A line total is pre-GST plus GST. No floating-point arithmetic touches amounts.

**GST-inclusive buyer amounts:** the pre-GST amount is the largest pre-GST paise value whose total (pre-GST + per-line GST) does not exceed the stated amount. Any residual is shown as the reconciliation difference. For the hero, ₹50,000 incl. GST gives ₹42,372.88 + ₹7,627.12 = ₹50,000.00, so the residual is ₹0.00. For ₹50,014 the residual would be ₹0.01.

Enforced in `domain/money.ts` (`gstForLine`, `derivePreGstFromInclusive`).

## GST basis must be confirmed for every stated amount

The constraint profile keeps **one profile-wide GST basis** (`amountsIncludeGst`: yes / no / unknown), as the freeze-pack data model specifies. That single value is used for an amount only when the amount's GST basis was **confirmed explicitly**:

- **From a message:** a GST phrase counts only for the amounts named inside its evidence quote. If the buyer writes "₹50K incl GST … anything above ₹60K needs MD approval", the basis stays ambiguous, with the note "not confirmed for ₹60K".
- **From a clarification:** the recorded answer must list every stated amount it covers (`coversAmounts`). An answer naming only ₹50,000 is refused, and the question stays open.
- **In the checks:** the budget check and the approval check each require the basis to cover their own amount. Otherwise they return `BUDGET_BASIS_UNKNOWN` / `APPROVAL_BASIS_UNKNOWN`. Every budget and approval result records where the basis came from (`gstBasisSource`, e.g. `clarification:clar-gst`).

**Hero:** the first clarification is therefore "Do both ₹50,000 and ₹60,000 include GST?", and the pinned answer is "Yes, both amounts include GST." The pre-GST values derived under the rounding rule are:

- ₹50,000 → ₹42,372.88, reconciliation ₹0.00;
- ₹60,000 → ₹50,847.46, reconciliation ₹0.00.

Enforced in `domain/constraints.ts` (`buildConstraintProfile`, `applyClarificationAnswer`) and `domain/checks.ts`. Tested in `tests/domain/gst-basis.test.ts`.

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

**Hero (preventive path):** Adaptive Deals sends its advance notice on 28 Nov 2026 for the 1 Dec debit. The buyer replies the same afternoon (28 Nov, 12:30 IST), before any debit is attempted: "Cash is tight till the 20th." Normalised from the reply's own timestamp, that is 20 Dec 2026, so the revised debit is **21 Dec 2026, not 20 Dec**. (The failed-debit path, where the buyer replies on 1 Dec after a failed debit, reaches the same dates and remains a tested secondary path.) Debiting on the 20th would land on the last day the buyer said cash is tight. The inclusive reading is the conservative one: it can delay a debit by a day but never pulls one into the period the buyer excluded.

The proposed date is not automatically accepted. It is re-checked against:

- the buyer's constraints: 21 Dec is still inside the current-quarter budget;
- seller policy;
- the existing mandate: within the ₹23,010 per-debit limit and before the 31 Jan 2027 end date.

It then needs merchant approval and buyer acceptance of the new version's hash.

Enforced in `domain/amendment.ts` (`earliestDebitAfterUnavailableUntil`, `CASH_UNAVAILABLE_UNTIL_RULE`).

## Payment-change replies are read by code (`reply-rules.v1`)

**Owner: code, not AI.** Replies to advance notices are classified by `domain/replies.ts`. No model is called, in replay or after **Run live**, and pre-scripted and typed simulated replies take the same path. The phrases are narrow and an error moves money, so code handles the supported phrase and everything else goes to the merchant. A broader reply reader would be a separate, versioned AI task (for example `interpret_payment_reply.v1`) with its own schema, prompt, development set, injection tests and recorded results. The earlier frozen evaluation does not cover it.

**Supported phrase:** `till`, `until`, `up to` or `upto`, followed by an ordinal day of month (`the 20th`, `20th`), with no month named.

| Rule | Behaviour |
| --- | --- |
| **Reference date** | The reply's own timestamp, in the merchant time zone (Asia/Kolkata). Never "today" and never the notice date. |
| **Month rollover** | The named day resolves to its next occurrence strictly after the reply date, bounded to two months: (1) later this month, if the month has that day; (2) otherwise the immediately following calendar month, if it has that day; (3) otherwise merchant attention. Code never skips another month. Examples: 28 Nov + "till the 20th" → 20 Dec; 10 Feb 2027 + "till the 30th" → 30 Mar; 29 Apr 2027 + "till the 31st" → 31 May; 31 Jan 2027 + "till the 30th" → merchant attention (February has no 30th). |
| **Same day** | A reply sent on the named day itself ("till the 20th" sent on the 20th) is ambiguous between today and next month. It needs merchant attention and creates no amendment. |
| **Inclusive "till"** | Cash is unavailable *through* the named day; the earliest proposed debit is the following day (20 Dec → 21 Dec). |
| **Amount versus date** | "up to ₹10K", "up to 10k" and other amounts are not dates. They need merchant attention. |
| **Unsupported language** | Hinglish ("20 tak"), relative dates ("till next week", "till salary comes"), dates with a month name, more than one day, mixed intent ("I paid half, rest till the 20th") and questions all need merchant attention. No amendment is drafted. |
| **"I paid"** | Recorded as **Payment claimed — verification required**. Payment status, attempts and the ledger change only from a verified payment event. |
| **"Okay"** | Acknowledgement only. It never accepts an agreement or an amendment and never authorises collection. |

**Selecting the payment.** A reply selects its collection line only through its own reference: reply → advance notice → `notice.attemptId` → `attempt.scheduleLineId`. A reply to anything other than a sent notice selects nothing. A submitted attempt with an unknown outcome blocks rescheduling; a succeeded line can never be rescheduled or charged again.

**One open change request per payment.** At most one unresolved request (change requested or draft amendment) may exist for the same notice, attempt or schedule line under an agreement version. A further qualifying reply is kept in the conversation, creates no second request, never replaces the first requested date, and shows **Merchant attention needed: a change request is already open**.

**Stale requests.** A request left unresolved from an earlier agreement version is never shown as open or actionable and is not counted in pending actions. Drafting acts only on a request under the active version. Where it appears in history it reads **Superseded by agreement version ‹active version›**. No new domain state was added: this is derived for display (`lib/views.ts`).

**State sequence.** Change requested → Draft amendment (rechecks buyer constraints, projected contribution, funding requirement and mandate fit) → merchant approval of the new hash → buyer acceptance of the same hash → collection updated → **Payment rescheduled**. The original scheduled attempt is kept until both approvals exist. A failed recheck ends in **Not restructured** with nothing changed. The amendment summary is written by code from verified state; `explain.v3` is not used.

## Buyer-facing content

Buyer-facing messages and the buyer proposal are written by code from canonical terms and notices. They never contain contribution, cost, margin, cash-at-risk, funding, policy or rejection wording (`assertBuyerSafe`). The buyer proposal (`/proposal/agr-hero/v‹n›`) has its own layout, with no merchant navigation, guided demo, run/reset controls, evaluation provenance or deal status. A thin, labelled **Demo control** bar sits outside the buyer frame. The page is a demonstration with no authentication.

## Merchant policy values are configuration, not engine logic

Limits such as the cash-at-risk limit, contribution floor and smallest instalment are merchant settings. The engine enforces whatever the merchant configures. The hero values and their reasons are in `FIXTURE_RATIONALE.md`.

## Commercial evidence, agreement state and financial scope

**New buyer messages can block a decision without becoming contract terms.** A buyer message received after an option was selected is review work. Approval, sending and amendment actions stay blocked until the merchant explicitly chooses **Keep current terms**, **Handle outside Adaptive Deals**, or **Follow-up still pending**. Only a resolving merchant disposition clears the blocker. The message and decision remain append-only evidence; neither is inserted into canonical terms or their hash.

**One current agreement summary owns the Track page.** An active agreement remains current while a revision awaits approval or acceptance. A draft or sent revision cannot replace it. Superseded versions stay historical. The summary derives scope, exclusions and planned service months from canonical terms and separates acceptance, payment-link state, mandate state and verified collections from this boundary: **Delivery readiness is not tracked here.** Payment completion never means service delivery is complete.

**Approval above the buyer's limit is attested, not verified.** If an engine-feasible structure needs buyer approval, the condition is part of canonical terms and the buyer must attest that the required internal approval was obtained. Adaptive Deals does not identify or authenticate the approver.

**Operational contract money and the outcome window answer different questions.** Contract total, verified collections, remaining amount and next payment belong to the current accepted agreement. The outcome card counts receipts only through the earlier of the simulated current time and 90 days after eligibility. Planned service dates are used for modelled costs; actual delivery completion is outside Adaptive Deals.

**Buyer proposal state is version-specific.** A sent version asks the buyer to review and respond and labels setup as proposed. A change request says the merchant is reviewing it. Accepted versions show recorded payment-link, mandate, debit, retry or paid state. Declined and superseded versions are history and never repeat forward-looking setup instructions from an old version.

**Every binding step rechecks unresolved buyer intent.** Drafting, amendment approval, initial acceptance and amendment acceptance all stop when a current-version buyer request or conflicting payment reply is unresolved. Hiding a UI button is not the control boundary; the service refuses the action as well. A superseded buyer link points through the full version chain to the latest buyer-accessible replacement.

**Labels follow legal state.** Before acceptance the compact summary is a **Proposed offer** with **Proposed scope**. After buyer decline it is a **Declined offer** with **Offered scope**. Only accepted terms are a **Current agreement** with **Agreed scope**.

## View acceptance checklists

Each item names where it is implemented. The Playwright journey (`e2e/journey.spec.ts`) asserts them at 1440 px and 390 px.

### 1. Workspace · conversation (`/workspace`)
- [x] Simulated WhatsApp thread labelled **WhatsApp simulated · buyer replies selected by the demo operator** (`conversation`)
- [x] States: **Suggested by AI**, **Approved and sent by merchant**, **Received from buyer**; code-authored messages are labelled **Sent by Adaptive Deals · Written by code from verified state**
- [x] Each item shows source, timestamp, reply-to reference, author and scripted or typed provenance
- [x] Every clarification draft needs a merchant **Send to buyer**; nothing is sent automatically
- [x] **Pause suggested replies**: inbound replies are still recorded and no new AI drafts are created; resuming is explicit
- [x] Pre-scripted replies and a typed simulated reply, both read by code
- [x] **Use replies as confirmed answers** (typed answers are not interpreted and must be recorded on Clarification)
- [x] Evidence highlights, constraint cards and the derived budget gap
- [x] **Other outcomes** with one bounded next action each (`other-outcomes`, `next-action`)

### 2. Clarification (`/clarification`)
- [x] Questions labelled AI wording or code wording, with the engine's "why it matters"
- [x] Recorded answers with confirmer, channel and time; a manual form for call, email or typed answers

### 3. Decision (`/decision`)
- [x] One leading **Recommended** card: scope, exclusions, schedule, **Projected contribution** with the floor result, **Peak funding requirement** with the cash-at-risk result, buyer approval, **Why this structure is recommended**, and **Approve and send** (`recommendation`)
- [x] Attribution follows the actual source: "Explanation written by AI · all figures calculated by the engine" only when the text is AI; otherwise it names code (`attribution`)
- [x] Compact alternatives, each with **View details** (`alternative-*`)
- [x] One buyer-side and one seller-side rejection; seller-side failures link to their rule
- [x] Full checks, calculations, every rejected structure and needs-information structures behind **View details** (`view-details`); none can be approved
- [x] **Applied merchant rules** drawer with values from configuration (`rules-drawer`)

### 4. Agreement (`/agreement`) and buyer proposal (`/proposal/agr-hero/v‹n›`)
- [x] Merchant view: versions, hash checks, the proposal link (only after merchant approval), payment link and mandate
- [x] Buyer page, in this order: merchant and buyer, included scope, exclusions, GST-inclusive total, payments, recurring authorisation, what happens next; actions **Accept proposal**, **Request a change**, **Decline**; collapsed **Agreement details** with version, hash and audit facts
- [x] Every figure comes from canonical terms (`lib/views.ts` `proposalView`, `tests/lib/views.test.ts`)
- [x] Request a change creates a linked conversation item and leaves the terms untouched; Decline records buyer rejection and creates no payment setup
- [x] A revision shows the moved payment and revision-specific next steps; declining a revision is not offered (request a change instead)

### 5. Deal timeline (`/timeline`)
- [x] Conversation after acceptance: payment, notice and amendment messages, with buyer replies and their code classification
- [x] **Buyer-triggered restructuring**: progress (Change requested → Draft amendment → Merchant approved → Buyer accepted → Payment rescheduled), the buyer quote, **Read by code · reply-rules.v1 · not AI**, rechecked checks, projected contribution, funding requirement, mandate fit, original and new attempt status, and change-request history (`restructuring`)
- [x] Secondary path: restructure after a failed debit
- [x] Ledger, the three schedules, version history and the labelled event log
- [x] Close: realised-contribution definition, approval boundary, no-feasible example

## Trust controls

| Risk | Control |
| --- | --- |
| Buyer text tries to instruct the AI | Messages are delimited as untrusted data, and delimiter-like text is neutralised. The system prompt never contains buyer text. Suspected instructions are recorded and displayed but have no effect. Policy comes only from merchant configuration (`tests/ai/injection.test.ts`). |
| AI invents or paraphrases evidence | Every field needs a verbatim quote at verified character offsets in the cited message; otherwise the field is rejected and the rejection is shown. |
| AI supplies numbers | The schemas have no numeric fields. Explanations may use placeholders only; any literal figure, date or percentage rejects the text. |
| AI hides or forces options | Code enumerates every template before checks. The recommended order is code's, set by the merchant's strategy. A recorded model order (which only ever ranked aliases of engine-feasible structures) is kept as history and does not decide. |
| Approval limit used as a loophole | A limit is an approval requirement, not a prohibition. A Phase 1 must have independent value, requires the buyer's authority confirmation at acceptance, and is never described as a way around approval; bypass wording is rejected. |
| Unsafe deal disguised as an option | Anything failing a check is shown only in the Rejected or Needs information sections, is never approvable, and an agreement cannot be created from it. |
| Terms change after approval | A canonical SHA-256 terms hash is used. Activation requires the merchant-approval hash and the buyer-acceptance hash to equal the recomputed hash, and any contractual change creates a new version. |
| AI or UI triggers a payment | The model has no tools. The AI layer imports no payment code. Payment adapters are reachable only through the service after `assertPaymentsUnlocked`. |
| Duplicate or overlapping collection | Idempotency keys are unique per attempt. A submitted attempt blocks others; a paid line or a fully paid agreement cannot be charged; internal retries are removed only after an accepted revision. |
| Live credentials | Only `rzp_test_` keys are accepted; live and unrecognised keys are refused before a client can exist. The model key is never logged or returned. |
| Misleading provenance | Synthetic, simulated, replayed and test-mode elements are labelled. "Replay of an actual run" appears only for a stored `live` run; replays must reproduce the stored run exactly. |
| Chat reply treated as consent | "Okay" is acknowledgement only. Acceptance happens only on the proposal page, against the exact terms hash. "I paid" never changes payment status or the ledger. |
| Payment reply misread | Code reads one narrow phrase from the reply's own timestamp; everything else goes to the merchant. AI does not read payment replies. |
| Internal economics leak to the buyer | Buyer-facing text is built from canonical terms only and checked by `assertBuyerSafe`; the buyer page has its own layout with no merchant data. |
| Duplicate or stale restructuring | One open change request per payment per version; stale earlier-version requests are shown as superseded and are never actionable. |
| Clock manipulation | Domain code never reads the system clock (enforced by a test). Demo time moves only forwards, through explicit, recorded and labelled advances. |

## Metric definitions

**Primary: realised contribution within 90 days per eligible stalled deal**

`(cash received within 90 days excl. GST − refunds − payment fees − direct delivery costs incurred or irrevocably committed because of the deal) ÷ all eligible stalled deals in the group`

The denominator includes deals that never sign. No results are claimed. The prototype has no real deals.

**Guardrails**
- Amount still owed after day 90.
- Remaining delivery obligations.
- Contribution-floor breaches (target zero).

**Supporting**
- Accepted agreements per eligible stalled deal.
- Cash collected excl. GST as a share of the amount scheduled excl. GST within 90 days.
- Buyer rejection and cancellation.
- Median time from stalled to accepted.
- Amended deals completing on the revised schedule above the contribution floor.

Discount from list price and written-off contractual amounts are tracked separately and never subtracted twice.

**Evaluation counts (FP §16):** reported as "X of Y" by `npm run eval`. Development results guide prompt changes only. Frozen results require 15–20 unseen cases labelled by another person, a recorded prompt freeze, and a live model.

## Scope exclusions

These are not built and do not appear as navigation:
- scope-change pricing;
- Smart Collect;
- lending, underwriting or buyer credit scoring;
- goods sellers;
- autonomous AI negotiation with the buyer;
- AI-triggered payments;
- claims that a mandate guarantees payment;
- claims of proven demand or collection uplift.
## Submission polish: focus the offer and preserve the evidence boundary

- The two eligible Phase 1 structures must be distinguishable in their headline: **two monthly payments** and **paid upfront**.
- The recommended split structure explains its practical advantage: it lowers the largest payment while remaining inside the buyer's confirmed limit and every merchant rule.
- Contribution for an annual structure that needs buyer approval is always conditional: **If the buyer secures MD approval**.
- Primary merchant screens use plain decision language. Exact model-validation failures, run provenance, rejected checks and hashes remain available in Audit or collapsed Agreement details.
- The merchant preview includes the exact code-generated simulated WhatsApp message. It is derived from canonical terms and appears before approval and delivery.
- Track calls the operational balance **Amount still to collect before GST**. The 90-day outcome measure remains separately labelled and keeps its existing definition.
- The submission note reports the completed frozen evaluation and its agent-authored provenance. The role-based persona reviews are usability inspections, not interviews or independent demand evidence.

## Model attribution follows the stored step, not the feature

**A hand-written sample is never presented as AI output.** Attribution is derived from the stored run kind and the provider recorded on each step. Sample cases read **Sample output written by hand · no model ran** on the case card, question badges, conversation thread, Offer card, audit and walkthrough. A recorded run reads **Recorded Groq output**. A run with mixed sources is credited step by step.

**The Offer card attributes the text it shows.** If a recorded model ranked the options but the visible reason is code-written, the card says **Groq ranked · code explained**. *(Superseded for the Offer card: see "Code ranks the offers by the merchant's strategy" below.)*

**Case recordings are separate from historical runs.** They live in `data/case-recorded-runs/` and are mapped by `data/case-runs.json`. A recording is used only when it is a complete model run of exactly that case's conversation; otherwise the product falls back to the labelled sample. `data/live-runs/` holds the earlier historical runs and is never read for cases.

**A changed clarification answer remains a code-computed branch,** whether the parent is a sample or a recording.

## A verified package field can name several packages

A buyer or the model may name several packages in one sentence. Every known package named in a verified field is kept, each with the same evidence quote, and duplicates are removed. The field is rejected only when it names no known package. This corrected a normaliser defect found by the case probes on 6 October 2026; the frozen evaluation predates it and was not rerun.

## Validated per-offer reasons are shown with field-level attribution

The model's explanation has two parts that code validates separately: a full comparison and a short reason per offer. A reason that passes validation is shown on its offer card even when the full comparison fails. The card then reads **Groq ranked and wrote this reason · recorded Groq output · figures calculated by the engine. Full comparison written by code.** The product never says the model wrote a comparison that code wrote, and a changed-answer branch never shows its parent run's reason. *(Superseded for the Offer card: the recorded reason now sits behind an information control as history.)*

## The merchant confirms required services the extraction could not map

**A required scope that names no package is not silently dropped.** When the model returns a required-service phrase that code verifies against the buyer's words but cannot map to any package in the deal (for example "complete annual package"), the deal stays at **Understand the buyer** and no offer can be selected, previewed or approved. The merchant sees the phrase, the buyer's exact words, and the deal's services as choices, and confirms which services the buyer requires.

**The recorded run is never edited.** The confirmation is product state after the run: a merchant correction linked to the rejected phrase, its verbatim evidence and the extraction step it came from. The engine recalculates every structure from it. A confirmation can only be given once, before a proposal is sent.

**Who did what is stated plainly.** Groq extracted the phrase · merchant confirmed the services · engine recalculated the options. The recorded model explanation described the unconfirmed profile, so after a confirmation the explanation is written by code and the Offer card says so. The confirmation is a decision branch, like a changed clarification answer.

**An uncaptured fact that changes nothing is disclosed, not asked about.** If the conversation did not state a fact (for example the GST basis) and the engine finds every structure has the same verdict and approval status under either reading, Understand says the fact was not captured and that the outcome is the same either way. The statement comes from the engine's own ambiguity analysis.


## The conversation reads as a chat, and marks what was understood

**The conversation looks like a chat, with no third-party branding.** Buyer messages sit on the left, the merchant's on the right, and one persistent "Simulated conversation" label replaces the per-message "simulated" tags. Unsent clarification drafts appear in a composer area under the thread, marked "Draft · not sent", never as sent messages.

**Highlights come from stored evidence, never from new model calls.** A phrase is marked only when its stored offsets still reproduce the stored quote. Clicking it shows what the code understood and how it normalised it. A phrase the code could not map to a service (for example "complete annual package") is marked amber and says so, until the merchant confirms the services. The same code shows the buyer's own budget words beside the offer.

## Less text on working screens: summaries by code, detail behind an "i"

**Alternatives are visible.** The other offers the merchant could send are compact rows under the recommendation, each with its own "Select this offer" button. They are no longer behind a disclosure, because choosing a different offer is a real merchant decision.

**Secondary explanation sits behind a click-to-open "i".** The success-measure caveat, why a clarification question matters, and the delivery details are short notes opened by click or keypress (not hover, so touch works; Esc closes). Honest attribution lines ("Groq ranked and wrote this reason · …") stay visible, because they say who did what.

**A settled Understand stage shows one summary line built by code from stated or confirmed facts only.** A GST basis or approval scope the buyer did not confirm, and required services the merchant has not yet confirmed, are left out rather than guessed.

**Track leads with the merchant's next step.** The step card no longer repeats the status headline; when nothing is needed it says so. Agreement detail, outcome and learning, and the conversation are collapsed while an action is pending.

## The buyer's page says what is being accepted, in the buyer's terms

**A glance line comes first.** The total including GST, the number of payments and what is included, built by code from the canonical terms. The merchant preview shows the same content, with a line saying the merchant is seeing what the buyer will see.

**The attestation names what is being accepted.** The checkbox reads "I confirm the required internal approval for this ₹1,41,600 agreement has been obtained" (or "…authorised to buy this standalone ₹46,020 package"). The disclosure that Adaptive Deals does not verify the approver stays as a separate note: approval is attested, not verified.

**Recurring-payment wording does not imply the buyer can move a debit.** It says the buyer authorises collection of the scheduled payments, each up to a stated limit until a stated date, with a reminder before each, and that a payment date changes only if both sides accept a revised proposal.

**Change requests start from a date or a scope, never an amount.** An amount change is a commercial renegotiation and goes back through the merchant's own offer choices, not a buyer-side shortcut.

**The simulated buyer's reply is a set of choices.** Each scripted reply is a button, including the ones where the buyer is not sure; those leave the fact unresolved, exactly as before.

## Plain terms, rounded forecasts, readable text

**Merchant-facing words are plain.** "Structure" is now "offer" and "template" is now "approved offer type" on the screens a merchant reads (offer, understand, presenter, audit, guide). Engine states and code identifiers keep their names; they are not shown as working copy.

**A forecast is rounded; an exact figure is kept where it is checked.** The projected contribution on the offer card, the alternatives and the full-contract forecast read "about ₹19,330". The economics detail and the audit keep the exact paise figure, so the number a merchant approves against can still be reproduced. A forecast is never presented as a result.

**Secondary text is larger and darker.** The muted colour is darker, nothing is smaller than 12px, and secondary lines on the offer, understand and track screens are 13px.

**A phone shows a pointer to the one real action, never the action itself.** When exactly one primary action is on the page and it is off-screen, a bar names it; tapping scrolls to the real button and focuses it. It does not perform the action, because approving and sending to a buyer must be a deliberate tap on the button that says so.

## The merchant can answer a buyer's request for a lower amount, with a recorded override

**Before this, a buyer's request for a different amount had no merchant answer.** After a proposal was sent, the only choices were to keep the current terms, handle it outside the product, or mark a follow-up. The merchant could not issue a new version at an amount of their own.

**The merchant types a new total including GST.** The same scope, dates and payment methods are kept. Payment lines are scaled in proportion, GST is recomputed per line by the engine's own rule, and the total lands exactly on what was typed whenever per-line rounding allows. The discount against list price is recorded and direct costs are unchanged, so the engine sees the real contribution.

**The engine rechecks it and says what fails.** The buyer's budget and approval limit, the discount policy, the contribution floor and funding are all checked by the unchanged engine. A pass says so. A failure lists each rule not met (for example "Discount 13.08% is above the 0% limit").

**A failed rule can be overridden, and the override is the merchant's.** Sending a failing amount needs an explicit tick, and is stored with who did it, when, and which rules. The merchant must acknowledge exactly the rules that were shown for that amount; if the rules differ when it is submitted, the request is refused. The offer card says "You set this amount · the engine rechecked it and found rules not met · you chose to override them", and lists the overridden rules. The engine's result is stored exactly as it returned it (`approvable` stays false, the verdict stays rejected); the recorded override is a separate permission that lets only that one counter become a draft.

**The buyer's request is answered only when the counter reaches the buyer.** Preparing a counter does not mark the request resolved. It is recorded as answered when the counter version is delivered; if the merchant delivers a different offer instead, the request is recorded as answered with that offer (so it does not silently disappear); if the merchant closes the deal instead, the request stays as it was.

**Only a price request can be answered this way.** A change request carries its topic (a different date, a different scope, a lower price, or something else). Only a request marked as being about the price is offered the different-total answer. A date, a scope, "something else", or an older request with no topic is not, and the service refuses it; those are answered with the existing decisions (keep current terms, handle outside, follow up). A buyer who types without choosing a starter is recorded as "something else". This reverses my earlier choice not to let a buyer ask about price: the counter-offer is the merchant's answer to exactly that, and the topic keeps it from being applied to anything else.

**It becomes a new version through the usual path.** The sent version is withdrawn, the counter is selected, and the merchant previews, approves and sends it like any proposal. The buyer's old link shows "replaced" and the new link works once it is sent. Acceptance, payment link, mandate and collections then follow the countered amounts.

**Scope limits.** This applies only while the buyer has not accepted. It does not change an amount after acceptance, does not answer a notice reply such as "up to ₹10K this month" (that is a partial payment of one debit and needs its own rules), and a counter must be lower than the current offer. The hero merchant allows no discount, so every price cut currently needs the override; a merchant whose policy allows the discount would see it pass without one.

## A deal keeps the prices it was quoted at

**Quoted prices are a deal snapshot.** Changing an account's standard service prices applies to new quotes only. An existing deal always evaluates its original service prices, scope and GST rate, including after it adopts newer costs, delivery rules or guardrails.

**New business economics are adopted explicitly.** Before a proposal is live, the merchant can preview the exact input changes, offers that become feasible or infeasible, and whether the recommendation changes. The preview changes nothing. An incompatible version is blocked with the specific missing service or dependency, and a version that changes only standard prices is not offered as a meaningful re-evaluation.

**Sent terms keep their economics.** Once a proposal is approved or sent, the deal cannot adopt a different account version. Drafts and later agreement versions keep the exact economics version and effective input hash used to produce them; economics provenance never enters the buyer's contractual terms.

## Business economics are the merchant's, versioned and reviewed before they apply

**One page holds the merchant's economics.** Services (standard price, direct delivery cost, cost timing, removable, deferrable, valuable on its own, dependencies) and commercial guardrails (minimum contribution, maximum discount and the approved discount ladder, maximum cash exposure, minimum payment, maximum payment duration, expected payment fee). GST is shown but not editable: it is set by law, not by the merchant.

**Nothing applies until it is reviewed and activated.** Editing creates a draft. "Review changes" shows each service's contribution and margin, any validation problem, a floor that no offer could ever meet, and the effect on the open demo deal. Activation creates a new numbered, timestamped version. A review with nothing changed says so and offers no activation, because a version identical to the active one would be a record of nothing.

**An open deal is told, not changed.** When a newer version would change a deal's engine inputs, the deal shows a banner and keeps its pinned economics. The review names each changed input in the merchant's words ("Website fixes · direct delivery cost: ₹12,000 → ₹15,000"), says what happens to the available offers, the recommendation and any unsent draft, and states that service prices are unchanged for this deal. Only an explicit confirmation moves the deal to the new version. A version that changes standard prices alone raises no banner at all.

**Only an input the product can name is described.** An engine input that has no plain-language label is shown as its raw field name rather than guessed at.

## Code ranks the offers by the merchant's strategy

**A strategy is a financial instruction, so code owns it.** The merchant chooses Protect contribution (the default), Preserve scope, Minimise cash exposure or Lower buyer commitment. Each is a fixed, tested ordering of the offers the engine already approved. A strategy never adds an offer and never relaxes a check.

**The recorded Groq order is history, not a decision.** The recorded run's order and per-offer reason stay available behind an information control, labelled "Historical evidence from the recorded Groq run. It does not drive the current recommendation." They are shown only while the deal still has the economics the run was recorded under, because they describe those inputs and no others. A hand-written sample is labelled as a sample.

**On the recorded hero case this changes the first recommendation.** Groq's recorded order put the single upfront payment first; code, under Protect contribution, puts the two-payment offer first. Both offers keep the same amount, so the merchant keeps the same contribution either way. The demo's old moment, "the merchant overrides Groq", is replaced by the merchant changing strategy.

**An offer that needs the buyer's approval may lead.** Preserve scope and Minimise cash exposure can lead with the annual offer, which needs the buyer's MD approval. The card says so on the offer itself and shows beside it the best offer the buyer can approve without it. Protect contribution and Lower buyer commitment still put approval first.

**The merchant's own choice survives a strategy change; a recommendation does not.** An offer the merchant selected, and its draft, stay selected when the strategy changes, and the screen says what the strategy would now recommend. An offer that only followed the recommendation, and its unsent draft, simply follow the new leader. A sent version keeps the strategy it was sent under.

**Who did what is stated plainly.** "Default strategy · offers ranked by code · explained by code · figures calculated by the engine", "Strategy selected by you · …", or "You selected this offer · …". No model is named on the card, because none ranked or explained what it shows.

## What the merchant changes, and what the engine decided, are kept apart

**Two different things, two different records.** An *input override* changes an assumption for one deal before the engine runs: a service's direct cost, the minimum contribution, the maximum cash exposure or the maximum discount. A *failed-rule exception* is the merchant sending an amount the engine had already reported as failing a rule. They are never merged. The audit lists them under separate headings, each with who, when, why and which version of the business economics applied.

**An input override needs a reason, and says which way it moves your rule.** The reason is required, at least five characters. The product records whether the override tightens or loosens the account rule (a higher cost or a lower cash limit tightens; a higher cash limit or discount limit loosens) and shows it in amber when it loosens. It changes this deal only: the account's business economics are not changed, and a quoted price cannot be overridden. It changes the deal's effective hash, so an unsent draft is set aside and the engine runs again. Once a proposal is live it can neither be added nor removed, because the sent version keeps the economics it was made with. Replacing or removing an override keeps the earlier one in the history.

**A failed-rule exception needs a reason, an acknowledgement of exactly the rules shown, and a confirmation.** The engine's result is stored as it came (it still says the rule failed), and the exception is a separate record beside it.

**An amount below direct costs also needs the exact phrase SELL AT A LOSS.** This is its own condition, not a consequence of a failed rule: a merchant whose economics have no contribution floor could otherwise send a loss that fails no rule at all. The phrase is case-sensitive, because a deliberate confirmation should not be satisfiable by autocomplete.

**An answer the buyer gave still applies.** If an override makes a question the buyer already answered irrelevant to the decision, the recorded answer is still applied. The buyer said it; the merchant's change does not unsay it.

**No model can make any of these changes.** The demo guide's actions are a short fixed list, and none of these is on it.


## The negotiation corridor shows what the merchant's own rules allow

**When a buyer asks for a lower price, the merchant sees the answer space before choosing.** The corridor shows the lowest total that meets every rule for the current scope (found by code, by search over the engine's own checks, never an estimate), the discounts the merchant approved with what they keep and whether the buyer needs MD approval, and non-price alternatives (a smaller scope, different timing). Everything is computed by code; no model is involved.

**"Offer this" prepares a standard offer, not a counter-offer.** Choosing a listed offer records it as an answer with a different offer, not as the merchant's own amount, so no override is recorded because none is needed.

**A typed amount must say whether it includes GST.** The merchant picks a basis explicitly; there is no default, because a wrong guess changes the figure by 18% and the engine cannot tell which was meant. The corridor shows the converted total it checked.

**If the lowest limit cannot be found, the product says so.** A search that hits its evaluation limit shows "We couldn’t calculate a safe lower limit automatically. Review the amount manually." It never shows a guess.

**The buyer sees none of it.** Limits, contribution and the corridor stay with the merchant; the buyer receives only the offer that was approved and sent.

**The illustrative example is a demo preset, not a recommendation.** It fills the draft with a 10% maximum discount and 0%, 5%, 10% approved. The merchant still reviews and activates it; the version is labelled Illustrative in the economics page and in each deal's audit that was started under it. The walkthrough lists the negotiation as an optional step and never activates economics or sends an offer for the merchant.

## Written for a merchant, not an auditor (8 October 2026)

**The merchant's screens use the merchant's words.** The test was a generic small-business owner who has never seen the product: every label should be understood without explanation. "Business economics" became **Prices & costs**; "contribution floor" became *the lowest profit I'll accept*; "cash exposure" became *the most I'll spend before I'm paid*; "MD approval above a per-contract limit" became *their MD must approve anything above ₹60,000*. URLs and test IDs were left unchanged on purpose.

**Two tabs, one decision per stage.** The separate Deals and Adaptive Deals tabs became one **Deals** tab. Each stage shows the decision and the one action; everything else (how a figure was worked out, other ways to do the deal, offers the engine ruled out, the strategy comparison) sits in closed sections.

**Reviewer material lives in a menu, not in the merchant's way.** The walkthrough, **Audit trail for this deal**, the presenter page and the fictional-data note are under **For reviewers**. The Razorpay MCP card appears on Track only when a Razorpay test connection exists or has been used; with none, nothing happened with Razorpay, so nothing is shown (the audit trail still says so). Who produced an output (a hand-written sample or a model) is stated in the audit trail, not on the merchant's screens.

**Demo controls are labelled as demo tools.** "Try an example that allows discounts" and "Put the demo prices back" sit under **Demo tools** on Prices & costs.

**The three cases now read like real chats.** The buyers write in WhatsApp style, with the details a real buyer gives and the vagueness a real buyer leaves (for example, "the complete annual package" without naming services). The preserve-scope sample deliberately includes that unnamed package so the *Which services do they need?* step is exercised.

**The earlier Groq recordings are kept as history, not shown.** Rewriting the conversations means the three recorded runs no longer match any case, and the product does not load a recording for a conversation it was not made on. They stay unchanged in `data/case-recorded-runs/`, their exact messages are in `data/synthetic/recorded-conversations.ts`, and `tests/data/case-recordings.test.ts` still verifies them. Every case now shows a hand-written sample until someone records new runs (a separate, approved step that needs a provider key). Claims in the pitch must say so.

**Wording that feeds the model was not changed.** `explainAmbiguity`, `outcomeWord` and `READING_LABEL` keep their original text because they are part of the clarification prompt input; changing them would alter recorded input hashes and invalidate replays.

## Cerebras is the primary live provider (9 October 2026)

**New live work defaults to Cerebras.** Constraint extraction, clarification wording, the frozen explanation task, assist tasks and Commercial Memory reranking use one centrally configured provider. The default is Cerebras with `gpt-oss-120b`; Groq and Anthropic remain backend alternatives.

**The merchant and buyer never choose a provider.** Selection is an operating decision made through server environment variables and takes effect after restart. Presenter shows the configured provider, model and credential availability, but it has no selector.

**There is no silent cross-provider failover.** If Cerebras is selected and unavailable, the task uses its defined code fallback or honest failure state. The same action never calls Groq or Anthropic, because that would obscure cost and provenance.

**Saved output keeps its original provider.** Historical Groq recordings stay labelled Groq. A saved response is eligible only for its exact input hash; a mismatch acquires neither saved-output nor Cerebras attribution. New live Cerebras runs store Cerebras on each task step.

**Credentials remain server-only.** Keys live in the git-ignored `.env.local`, are never returned to the browser or stored in run records, and the release gate rejects non-empty Cerebras credentials in tracked configuration or stored-run JSON.

## Learning evidence and the freeze before recording (9 October 2026)

**The outcome card records what a deal taught, and proposes nothing.** It lists, from stored state only, whether the suggested offer was followed, any pricing exception, the buyer's decision, change requests, payment-date changes and money collected. It then says: *No policy change proposed. One deal is not enough evidence, so this is recorded for evaluation and does not change your prices, limits or future offers.* It also shows the path a change would take (outcome recorded, evidence builds across deals, a possible change is tested, you approve it, it starts as a new version). **There is no suggestion engine and no sample-size threshold in the product.** A suggestion built from a handful of fictional deals would be exactly the kind of weak evidence this product's own rules reject; the claim made in the submission is the governed path, not a working self-improvement loop.

**Decision figures never animate.** The count-up on "You'd keep" showed intermediate values for 0.7 s, so a screenshot or a video frame could show ₹3,688 beside a breakdown of ₹19,330. A figure a merchant decides on is shown exactly, at once. The split bar still fills in.

**The case conversations are frozen at this checkpoint.** `tests/data/case-text-freeze.test.ts` pins a hash of each case's messages. A recording replays only against its exact words, so editing a message means re-recording that case and updating the hash in the same commit.

**Demonstrating that the answer is specific to the business.** With only website-fix delivery cost changed, the hero deal gives: ₹10,000 → you keep ₹21,330; ₹12,000 → ₹19,330; ₹14,000 → ₹17,330; ₹16,000 → ₹15,330, the same offer in every case. At ₹18,000 the three-month package fails the 35% profit limit and only the annual deal (needing the buyer's MD) remains; at ₹25,000 no offer remains. The demo uses ₹16,000 and says "the offer economics changed", not "the recommendation changed".

## The buyer page, Phase 1 (12 October 2026)

**No checkbox; the attestation sits beside the button.** Where the agreement truly requires the buyer to attest (an offer above their approval limit, or a standalone phase package), one sentence above **Accept proposal** says what accepting confirms ("By accepting, you confirm …"), and pressing Accept records the confirmation. The domain rule, the terms hash and the audit record are unchanged: acceptance is still refused without the confirmation, which is now supplied by the visible sentence and the click. It is a weaker deliberate-act signal than a tick, and that trade-off was chosen for conversion.

**Accept, then pay, on the same page, without a reload.** Acceptance (the contract) and payment (the money) stay two recorded events. After accepting, the page becomes the payment step in place: one button, **Pay ₹23,010 and set up auto-pay**, which records the upfront payment and the automatic-payment authorisation as two simulated events, in order, once. There are no card or UPI fields; the footer still says no real payment is taken. When a real Razorpay test link exists, the page links to it instead of simulating. The presenter's two system steps remain as an API fallback.

**Change requests are guided and structured.** A lower price asks for a target total and whether it includes GST (it must be lower once GST is counted); a change to what's included asks for the services; a payment date asks for which payment and a future date; anything else is free text. The merchant's message is built from the structured request, so the amount, services or date always match what was asked, and the structured request is stored beside the message. The merchant's amount form starts with what the buyer asked for.

**The wording does not promise a Version 2.** After sending: "Sent. Pinecone Media Works will review your request. This current offer remains valid until a new one is agreed upon." Before sending: "This sends your request to Pinecone Media Works. They may reply with an updated version. Nothing changes unless you both agree."

**Decline is a quiet link at the very bottom** ("I'm no longer interested"), with a confirmation and the existing optional reasons.

## Merchant deal management, Phase 2 (12 October 2026)

**No auto-redirect after sending.** Sending a contract is high-stakes, so the merchant stays on Track and sees "Sent to {buyer} at {time}", with a **Return to deals** button. The Deals page shows the open deal as one status row (who it is with, where it stands, what happens next).

**One compact status line.** The tall three-stage list is a single horizontal line (Issue understood → Offer sent → Waiting on buyer). Each label comes from the deal's recorded state, each step is a dot plus words (never colour alone), and phones also read "Step n of 3".

**Three ways to answer a price request.** Hold firm, Suggested counter-offer, Choose your own amount. "Suggested", not "AI": the rules engine works out the money; the model only extracts and words. The override reason appears only when an amount breaks a rule. Handle-outside and leave-open sit under More options.

**Honest when nothing fits.** If the engine has no approved offer below the current one, the suggestion says so and names the lowest ("Nothing lower than ₹46,020 is within your rules, so ₹40,000 cannot be offered"). No new offer type was added; a "drop a service" version is a deliberate non-goal for now.

**The chat leads the deal screen.** The buyer's message is at the top of Track with the answers directly beneath it.

**Analytics have their own tab.** "Outcome and learning" moved to **Performance**. Track keeps a one-line deal outcome that links to it, and never prints a ₹0 figure.

## Prices & costs, Phase 3 (12 October 2026)

**The AI proposes, code verifies, the merchant approves.** A rate card or cost sheet is read by two readers: the built-in line reader and an AI reader (Cerebras `gpt-oss-120b`, `read_document.v1`). The model's schema holds words and a quote, never a number. Code accepts a value only when the quote is found verbatim in the document, exactly one amount can be read out of it, that amount matches the one the model wrote, and the quote names no second service and holds no instruction. Where the readers disagree, the line reader wins and the difference is listed. A service matched under another name ("SEO retainer") is marked for the merchant to confirm.

**Upload goes straight to review.** After an upload, the manual forms step aside and **Review what we found** asks "Do these prices look correct?", with the exact quote and the reader beside each value. Values already matching the saved ones sit in a closed group.

**The AI path replays a recording.** The demo's clean sample rate card (CSV) replays a recorded Cerebras reading, labelled "Recorded Cerebras output". No live call happens unless `ADAPTIVE_DEALS_DOCUMENT_AI=live` and a key are set. A document with no recording is read by the line reader alone and says so.

**Dependencies are never inferred.** "Needs another service first" and the other offer-shaping options sit behind a closed **Advanced rules** toggle, with a one-line summary. Nothing is guessed for the merchant.

**One compact services table** (charge, cost, what you keep, a plain status) and a **what-if panel** beside the limits that follows typing, uses the same profit and fee arithmetic as the engine, and saves nothing.

**A bug found on the way:** the instruction detector skipped any line in the middle of a document that did not end in punctuation, so an instruction there went unflagged. It now scans every line.

**Evaluation (four documents, one request each):** see `docs/DOCUMENT_READING_EVAL.md`. In these runs the model made no mistake the checks had to catch, so five mistakes were injected into a recorded answer; the checks dropped all five. Four documents show the design working; they do not measure accuracy.

**The designed PDF is recorded too.** Its first scoring showed the check rejecting four correct values: the model joined wrapped lines, so its quote differed only in whitespace. The check now allows whitespace to differ (all other characters in order) and quotes the document's own text, and a service leading its entry may name another in its description. Both the sample CSV and PDF replay a recorded Cerebras reading.

## The presentation layer, Phase 4 (12 October 2026)

**Reviewer tools sit in a presenter frame, not in the merchant's navigation.** A floating **Presenter** button holds the guide launcher, the audit trail, the presenter page and **Reset this deal to step 1**. It closes on Escape, on a click elsewhere and after an action, so it never covers the product. The long "this is a prototype" note lives in the footer and the presenter frame; the green **SIMULATED** pill stays on every screen (it was hidden on phones and no longer is).

**The guide is a dark, separate pane with one big Next step button.** The button says what it will do ("Take me there", "Simulate: …"). It performs only simulated buyer and system events. On a merchant step it points at the product's own button ("Show me where to click") and never clicks it: the presenter makes every merchant decision. Hide and Restart are quiet text links. **Under the hood** (formerly "How this step is sourced") says plainly what produced the step.

**Honest architecture wording.** Retrieval is lexical code; an AI re-ranker only reorders the same quotes; every answer cites its source line. The app does not use a vector database, and "Pinecone" in this project is the fictional merchant's name.

**The presenter page degrades politely.** With no live model key it says "Using recorded runs" and never prints a key name; missing saved files no longer break it; a page error shows a plain message. Simulations are three large colour-coded scenario cards (each also named in words), and the engine outcomes are colour-banded cards.

**Ask the rate card · judge Q&A** returns exact retrieved quotes with their source line and a "Code retrieval" label, or "Insufficient evidence". It never writes an answer.

## Audit trails and evidence, Phase 5 (12 October 2026)

**Evidence is a two-column table.** Extracted value on the left, its verbatim quote on the right, the source named once above it. Character offsets and message ids move to "Advanced details" and are never printed beside a quote.

**Identifiers sit behind copy buttons.** Run ids, branch ids, terms hashes, idempotency keys and Commercial Memory chunk ids are not printed. A quiet copy button holds each one (the first characters are in its tooltip), and says "Copied" when used. The audit is still read-only: the only buttons in it copy to the clipboard.

**One System execution pipeline** replaces "AI run" and "Who did what". Steps are in the order the work happens, in three lanes: the AI (or a hand-written sample) on the left, the rules engine (margins, schedules, checks) on the right, and the merchant's and the buyer's decisions across the full width. The model is named once, in the header, **derived from the run's stored steps**: a single provider is named once, a mixed run says so, a hand-written sample says "no model ran". When the other cases are re-recorded on Cerebras, their headers change without any edit.

**Reproduced, not "Verified".** A green badge shows only when the stored run replays to exactly the same engine result and displayed text with no model call. If it does not, it is red and gives the reason.

**Commercial Memory is grouped by service**, each with its exact quotes and sources, retrieved by code; nothing is written by a model.

**Raw records are dark JSON blocks** with a Copy JSON button, coloured by a small in-house tokenizer (no new dependency; the text copied is exactly the JSON).

**Not changed:** the Razorpay MCP section of the audit. It still says the capability is unavailable and no tool was called; a capability map is a separate piece of work.

## Second recording batch (12 October 2026)

**The applicant authorised recording the other two cases on Cerebras.** One request each, frozen prompts, first valid output kept. **No fit** recorded cleanly and is now mapped, so the audit shows "Recorded Cerebras output" for it. **Preserve scope** recorded, but the model's first extraction missed (an evidence phrase failed its check and no required services were found), so the engine stopped at "insufficient information" and could not show the offer this case demonstrates. We did not re-run it or loosen a check to make it work; the recording is kept as evidence and the case stays on its labelled sample until the applicant decides otherwise.

## The Razorpay MCP map (12 October 2026)

**The audit says what Razorpay offers for each part of a deal, and what this prototype does.** Built from the saved read-only discovery (42 tools advertised on 9 October 2026), and a test checks every tool name against that file. Upfront collection: implemented in test mode, with merchant approval. Auto-pay mandate and later debits: simulated. Reporting: only a Payment Link's status is read. The Subscriptions API is not among the advertised tools, so it is not claimed.

**A pre-flight note, and a read-only status check.** Razorpay's test account refused links of ₹20,000 and above, so the review card warns when a link is at or above that, and the hero's ₹23,010 payment stays simulated. Once a test link exists, **Check payment status** reads it by reference with the advertised read tool; it can create or change nothing.

**Not built:** real mandate registration (the registration-link tool's parameters have not been inspected, and a recurring-enabled test account is needed). It is shown as a planned next step, not as a feature.

**Preserve scope was run a second time, at the applicant's instruction (12 October 2026).** The rule was written before the call: the second output is final whatever it is, both attempts are kept, and the case is mapped only if it reaches its expected engine state. It missed in the same way (the budget period's quoted words did not contain the phrase, and no required services were found), which is what a model at temperature 0 on an identical request would be expected to do. So the case stays on its labelled sample and both recordings remain as evidence. Changing the outcome would need a change to the frozen prompt or the case text, which is a separate decision.

**A third Cerebras attempt, again at the applicant's instruction, missed identically.** The rule was written first (`CASE_RECORDING_FREEZE_BATCH4.json`: this output is final; if it misses, exactly one Groq attempt follows). The same model on the same request gave the same answer: three attempts, one result. The Groq attempt is prepared (`CASE_RECORDING_FREEZE_BATCH5.json`) but cannot run until a Groq key is configured.

**Preserve scope: fixed at the root, then recorded once.** Three Cerebras attempts missed identically, which showed the model was not the variable. The cause was one capitalised phrase: "This quarter is tight" at the start of a sentence, which the model returned in lowercase and the exact quote check (rightly) rejected. Only that message was reworded, so "this quarter" sits mid-sentence; nothing else in the case, the hero or no-fit changed, and the hand-written sample and freeze records were updated to match. The rule for the new attempt was written first (one attempt, final whatever it is, mapped only if it reaches the expected offer). It did, so the case now replays Recorded Cerebras output. The model's remaining misses are kept in the recording.

**What this does and does not show.** It shows the product's checks working (a mismatch is rejected, never patched) and that the recorded case text can be tuned. It is also a case where the text was reworded after the model missed, and we say so. All three cases now run on recorded Cerebras output.

## Deal settings and Active deals (12 October 2026)

**The two tabs are now named for what they hold.** **Deal settings** (formerly Prices & costs) holds prices, costs and limits; **Active deals** (formerly Deals) is the workspace. The settings page no longer carries a "start a deal" prompt or any deal result.

**Three deals are held at once.** The deal being worked on stays in the one store file the whole app reads; opening or starting another saves it first and loads the other, so each deal keeps its own progress. Active deals lists all three stories with their own saved status ("Your move", "Waiting on buyer", "Not started"), and a deal that was never started says so. Opening or starting one sets the current one aside; nothing is cleared. A full reset forgets all of them, and "Reset this deal" resets only the open one. Storage stays in local files; a database would add credentials and a network dependency for no gain here.

**Source and upload.** The page shows where the numbers came from in one strip ("Using the 7 demo documents" or "Synced with …"), with **Upload your rate card** or **Update source** opening a dialog. The dialog opens on request, never by itself, so it cannot block a recording. An upload still goes through Review what we found, and nothing changes until the merchant checks and saves.

**Services are a three-column table.** Service, You charge, Your cost, plus a gear per row that opens that service's rules (needs at least one of these first; can be left out; can start later; useful on its own) in a side panel, with "You keep" and its status. A service is flagged under its name only when it needs attention.

**Limits are in two groups with sliders.** Margin guardrails: lowest profit (slider 10–50%), biggest discount (slider 0–25%), smallest payment. Cashflow guardrails: most spent before being paid, longest wait. Each percentage keeps a number box that accepts any valid value; the slider only keeps to its range.

## One next step on Deal settings (12 October 2026)

**The page ends in a way forward, and the way forward is always in view.** A sticky bar at the bottom of the screen holds the single next step for whatever state the page is in: **Check my changes** when there are unsaved edits; **Save only** and **Save & start a deal** once the changes have been checked (the second saves and goes straight to Active deals); and **Go to Active deals** when nothing is pending. It replaces the inline check button and the save button inside the review, so there is one obvious primary action instead of several. When the values in the documents are the ones already saved, the page says there is nothing to check and offers the way on, rather than a "check" that would only say "nothing changed".

**Competing directions are down to one.** The top-of-page "Start a deal" and the result card were removed earlier; the tabs, the bar and the guide's "Continue" all lead to the same place. The sticky bar steps above the guide's bottom sheet on a phone, and the Presenter button steps above the bar.

## Active deals as an inbox (12 October 2026)

**The deals are a list on the left and the selected deal on the right.** The list holds who is waiting and each deal's own status. The panel opens on what is in the way: a few scannable facts (Budget, Timeline, Scope, Approval), each with the buyer's own words under it, then the conversation as written, and the **Start deal** / **Open deal** button inside the panel next to the thing it acts on. The "Jump to" tiles are gone; the two tabs already do that job.

**The facts are not model output at click time.** Each comes from the verified profile of the run: a value only appears if its quote was found in the buyer's messages, and the verdicts are plain code ("Short of your quote" is the available amount against the quote; "Needs a fast start" is a start date within a month of the demo date). What the buyer did not say shows as "Not stated" or "No start date stated". The brief's example (Kestrel "needs an immediate start") would have been inferred from tone, so it is not claimed: the product shows what was stated. The panel says which kind of run it was read from.

**Several deals at once**, with no "clears the current one" warning, was already in place; the panel says only that the deal you leave keeps its progress. A deal that is on screen but was never started counts as not started until you press Start.

## Understand the buyer, conversation first (12 October 2026)

**The proof table is off this screen.** "How this decision is grounded" (source, understood-as, used-to, for every fact) no longer sits on Understand. Each fact in "What's in the way" shows where it came from on hover, focus or tap: the buyer's own words, and a **Show in chat** link that takes the eye to that message (which already has the words highlighted). The full evidence stays in the audit trail. We do not show an "AI confidence" figure: there is no calibrated score, a value is either found in the buyer's words or not shown, and a number would be invented.

**The unknowns are on the facts they affect.** "Confirm if GST is included" sits on the budget, "Confirm: per payment or whole deal" on the approval limit, "Confirm which services" on the scope. Each leads to the draft or the question that settles it; after sending it reads "Waiting for the buyer", then "Buyer replied", then "Confirmed by the buyer" once the merchant uses the answer.

**The questions are drafts in the chat, and the send button is in it.** They appear under the buyer's last message as "Suggested questions · not sent", with the wording label ("Suggested by AI", "Drafted by code" or a hand-written sample). Each can be reworded in place. A reworded question still answers the same question and must still be safe for the buyer (no internal wording, 5 to 300 characters); it is sent as the merchant's own words, shown as "Edited by you", and recorded in the audit ("Reworded N of them before sending"). After sending, **Use these answers** (or the reading of an unclear reply) is in the chat too.


## Waiting for the buyer (12 October 2026)

**Unknowns are empty slots that fill.** Under a fact the buyer has not settled, a dashed slot shows what is missing; after sending it shows "waiting for the reply", and when the buyer answers it turns into a green check with the answer ("Includes GST", "Whole deal"). The fact's own row text is updated only after **Use these answers**, so the screen never states something the merchant has not accepted.

**The chat is not painted.** No permanent highlights. The matching sentence lights up only while you hover, focus or tap a fact (or its slot); a click pins it, Escape or a click elsewhere clears it.

**The page refreshes by itself every 3 seconds while the buyer has not replied** (only while the tab is visible). The banner says just "Questions sent."

**Not built, by decision:** a "Next deal" button and re-ordering the inbox while waiting. The prototype's replies are instant, so the merchant stays on the same deal. In real use the merchant would move to another deal; that is a deployment concern, not shown here. The buyer's reply is read by fixed rules (yes/no, per contract/per payment), not by AI.

## When the buyer's answers arrive (12 October 2026)

**Clear answers are applied without a click.** When every question has a reply the code can read, the answers are recorded as they arrive. What was read shows as a small chip under each reply ("Includes GST", "Whole deal"), and the facts on the left update. The merchant still approves the offer itself: the button under the last bubble is **Review offer**. "Use these answers" is gone.

**Change, until an offer is chosen.** The chip's **Change** swaps it for the other answer (the buyer's words stay as they were) and the offer is worked out again; the change is recorded in the audit. After an offer is chosen or sent it cannot be changed this way.

**Unclear replies are not guessed.** The reply is read by fixed rules, not by AI, so there is no confidence figure: it matches exactly one answer or it does not. An unclear one keeps the existing form under the chat, which needs the buyer's exact words as support and records the choice as the merchant's judgement. Once every question is answered, the rest applies by itself.

## Review the offer, bottom line first (12 October 2026)

**The quote and the offer are one list.** The two cards ("Original quote", "Adaptive offer") are replaced by the price (the old one struck through) over one row per service: what stayed is shown once, what changed shows the old value struck through, a dropped service is marked as removed. The reason shown is the buyer's own ("They said it can wait"), not an invented one such as "to fit the budget".

**The margin is a bar.** What the buyer pays is one stacked bar: what you keep, delivery costs, payment fees, GST. GST is grey because it passes to the government and is not a cost to the merchant.

**One closed explanation.** "How this was worked out" holds why this offer, the figures, the profit limit and the evidence table (it was a separate section). The audit trail keeps everything.

**Alternatives beside the offer, at most two.** "Use this instead" swaps one in. "Offers we ruled out" is no longer on this screen; it is in the audit trail ("Offers ruled out"), because it is the proof that the engine checked every option against the merchant's limits.

## Changing a number for one deal, in place (12 October 2026)

**The levers sit on the numbers.** A pencil on "Delivery costs" in the profit breakdown opens one field per service, each showing the account's usual figure. "Edit limits" opens the three limits for this deal (lowest profit, the most you'd spend before being paid, the discount allowed). The separate accordion at the bottom of the screen is gone. A short reason is still required: it is what makes an exception readable later, and the audit keeps it.

**The profit limit is a slider that stops where an offer would work.** The stops are the offers ruled out for being under the profit limit and nothing else, at each one's real profit; dragging shows which of them become available and what they keep. It is not a free-drag preview. When a deal is blocked entirely on profit, the slider is on the "No offer fits" screen, where the merchant needs it.

**Changed values are tagged.** "Customized" sits beside each changed limit and on delivery costs, and a strip over the breakdown says how many changes the deal carries, with Undo all and Remove on each. The buyer never sees any of this: the buyer proposal carries only the terms.

## Sending the offer (12 October 2026)

**The send screen is the merchant's, not the buyer's.** It opens with four facts (included, buyer pays, you keep, approval), then the drafted WhatsApp message as a not-yet-sent draft with a small proposal card and **Send offer** beside it, like a chat. The buyer's page is in a sheet behind **Preview buyer view**: the same component the buyer sees, one click away, closed with Escape. The margin is shown as the engine measures it (about 50% of the price before GST), not against the GST-inclusive total.

**The buyer's disclosure stays.** "How automatic payments work", the approval confirmation and "After you accept" were taken out of the merchant's path but not out of the product: they are the buyer's consent for the auto-pay authorisation and remain on the buyer's page and in the preview sheet. The message is not editable, because it carries the link to the exact terms being approved; sending is still the approval, bound to the same terms hash.

## After the offer is sent (12 October 2026)

**Sending returns the merchant to Active deals.** One line says "Offer sent to …" (and goes on the next click); the deal's row reads "Waiting for buyer". The deal's tracking page opens only when the merchant opens that deal. Retrying a failed send behaves the same.

**A sent offer the buyer has not accepted is a quiet page**: the status, the timeline, the sent message, a compact offer card and one prominent **Back to active deals**. The "Next step" card ("Nothing for you to do right now"), the Agreement-and-payments timeline and the "Deal outcome · nothing collected yet" row are shown only once there is something to act on or collect. Performance stays on its own tab. A "next pending buyer" shortcut was not built: the prototype has three deals and one is open, so there is no queue to point at.

## One tap for the buyer (12 October 2026)

**"Accept and pay ₹23,010" accepts, pays and sets up auto-pay in one tap**, on the same page. Above the button, in plain sentences, sit the two things the tap authorises: that the buyer can approve this package on its own (recorded as before) and that they allow automatic payments of up to the stated amount until the stated date, with the reminder. There is still no checkbox and no card or UPI field; the payment is simulated and the page footer says so.

**Where it does not apply.** A revision keeps its own "Accept" (there is no new payment), and when a real Razorpay test link is configured the tap accepts and the buyer then opens that link, because that payment happens on Razorpay's page. The auto-pay authorisation is kept in the sentence above the button rather than dropped: it is a separate financial consent from accepting the terms.

## The buyer's "Request a change" (12 October 2026)

The guided inputs (an amount with its GST basis, the services as checkboxes, a payment and a date), the buyer's own chat bubble preview and the quiet "I'm no longer interested" link were already in place. Three small changes: the button reads "Reply to Pinecone Media Works", Cancel is a text link beside it rather than a second button, and the note under the form says "Pinecone Media Works will see this and may send an updated version." It does not promise a "Version 2": the merchant may hold firm, counter with a different amount, or decline.

## Answering a buyer's request for a lower price (12 October 2026)

**The decision sits under the buyer's message, in the chat.** The request is shown once. Beneath it are the answers: Hold firm; a suggested lowest total if the merchant's rules allow a discount; a smaller scope; or the merchant's own amount (the rarer answers stay behind "More options"). The empty "Approved discount stops", the repeated "waiting" lines, the payment timeline and the zero-outcome link are not shown while the request is open.

**A smaller scope, worked out by the rules engine.** For each service in the sent offer the engine builds the offer without it (same dates, payments and discount rate, price lower by that service's agreed value) and checks it on every rule: the buyer's required services, which services may be removed and what depends on what, the buyer's budget and approval limit, and the merchant's profit, cash and discount limits. Only a change that passes everything appears, there is no override path, and the nearest to the buyer's ask is shown with how far it still is from it. It is a custom structure rather than one of the saved offer types, so the card says "Checked against your limits" and the merchant previews and sends it like any offer. It is not an AI suggestion: money stays with the engine. In the hero deal, removing Monthly reporting reaches ₹42,480, still ₹2,480 above a ₹40,000 ask, and the card says so rather than promising to hit the ask.

## Deal settings, a clearer table and an example (12 October 2026)

**Margin on every row.** The services table now reads Service, You charge, Your cost, You keep (amount and percent) and Status, so a merchant can scan every margin at once. The status is shown on every row ("Within your limit", or what is wrong), as before worked out from the row's own price and cost and the lowest-profit limit, before payment fees.

**An example deal beside the limits.** "What these limits mean" opens with a worked example: every service for three months, at the prices and costs on screen, what the merchant keeps after the payment fee, and whether the lowest-profit limit would let it be suggested. It is arithmetic on the merchant's own numbers and moves as they type; it saves nothing.

**What was already there, and what is not done.** The compact table, the per-service rules behind an icon, the live per-service preview, and the folded editor while an uploaded rate card is reviewed (the review table opens by itself) were already built. Service rules (what can be left out, what depends on what) are still set by the merchant and not inferred by a model: they decide which services can be removed from a buyer's offer, so nothing about them is guessed.

## The demo guide as a pitch (12 October 2026)

Each guide step now leads with a one-line point for the person watching ("A sale you can afford to make"), a **Watch** line saying what to look for, and one action line. The step name moves into the small top label. The old note about who produced the step, and a new line on how the step is built (what runs: a recorded Cerebras reading, code that keeps only quoted facts, the rules engine, the shared terms hash), sit under **Under the hood**. The pane was already a dark, separate panel with a single large Next step button and quiet Back, Hide and Restart links.

The pitch lines say what is true: the rules engine, not AI, enforces the margin and works out every figure, and the merchant approves and sends every offer. The guide does not claim "zero-risk" or "without human intervention", and does not name a vector database the product does not use.

## The presenter tools never sit over the product (12 October 2026)

On a desktop the Presenter button is a slim bar along the bottom edge. The page reserves room for it and it stops short of the guide pane, so it never covers a line of the merchant's screens as they scroll. It still opens upward into the same panel (walkthrough, audit trail, presenter page, "Reset this deal to step 1") and closes on Escape or a click outside. On a phone it stays a floating button above the bottom bars. The rest of the reviewer separation (no "For reviewers" in the navigation, the audit trail and outcome figures out of the merchant's screens, the disclaimer in the panel and the footer) was already in place.

## The audit trail, last tidy (12 October 2026)

The audit trail already shows the evidence as one two-column table (extracted value and its quote), hides identifiers behind copy buttons, names the model once and merges "AI run" and "Who did what" into one execution pipeline. Two things were left: services were shown by identifier ("website-fixes") and Commercial Memory was eight separate quote blocks. Services are now named in words, and Commercial Memory opens with a one-line summary ("Prices and delivery costs retrieved for 4 services from 2 documents… each an exact quote, retrieved by code") and then one row per service with its price quote and its cost quote side by side. It is described as retrieval by code over the merchant's documents: the product does not use a vector database, and "Pinecone" in these rows is only the fictional merchant's name in the document titles.

## The presenter page as a control room (12 October 2026)

Already in place: no raw error when no live key is set (the page says it is using recorded runs and greys out "Run live"), the judge Q&A search over the rate card, and colour-coded scenario cards. Added: an "Open a buyer situation" row at the top with three large buttons (Tight budget, Wants everything, No fit), each opening that deal on its recorded Cerebras run, as the one-tap fallback; the three earlier model runs moved into a closed "historical evidence, not the demo" section with plain buttons, since they are not scenarios; and the "Show example" buttons for the other outcomes sized like the scenario buttons. Retrieval is shown as exact quotes with their source, not as a vector-search animation, because that is what it is. The simulated payment events still work in order on the open deal.

## Evidence and integrity, last touches (12 October 2026)

Already in place: the AI and rules-engine lanes side by side in the execution pipeline, a "Reproduced" badge, syntax-highlighted JSON blocks with a copy button, and a Razorpay section that maps each part of a deal to what is implemented (Payment Links in test mode), simulated (the mandate and later debits) or not used. Added: the prompt table shows a green "✓ Matches" badge (or "Differs") against the frozen record instead of a bare "Yes", and the evidence's advanced details name the message but no longer show character offsets. The Razorpay section does not say that the Subscriptions API "is triggered": none of its tools was found among the ones Razorpay advertises, so the page does not claim it.

## Bugs found in a walk through the flows (13 October 2026)

- **A deal always opens on what the buyer said until an offer is chosen.** Opening Blue Harbor Foods from Active deals after it had been read once went straight to the dead end "No offer fits"; now the deal home sends any deal without a chosen offer to Understand, and Understand shows the conversation with one button to the offer (or "See why nothing fits"), however many times it has been read.
- **"I'll follow up later" now shows that it worked.** Before, it recorded the choice but the card looked unchanged. The card now says "Follow-up pending since …", the third button becomes "You'll follow up", and the item explains that nothing was sent to the buyer.
- **A date change that could not be made says which rule stopped it**, in words, instead of "did not pass the confirmed checks", and writes dates as "20 Dec 2026" rather than "2026-12-20".
- **The question drafts are plainly editable.** Each is a bordered field with a pencil, tall enough to show the whole question in any browser, so it no longer depends on a browser feature (`field-sizing`) that Safari lacks.
- **A late start is explained.** When the suggested offer starts later than usual (Northstar, May 2027), the card says why in the buyer's terms: the least any earlier start would ask of them in their current budget, and what they have. It does not invent an earlier offer: every earlier start breaks the buyer's budget.

## Live AI behind the scenes (13 October 2026)

**Two places where a live model adds to what was recorded, both invisible to the merchant as a mechanism.**
1. **A rate card that is not a bundled sample** is read by Cerebras, then Groq if Cerebras fails. The bundled samples still replay their recorded readings. Code accepts a value only if its quote is in the document and its one amount matches; with no model the built-in line reader works alone. Tried on a new price list in different wording ("Site repair work", "Google ads management"), the line reader found nothing and the live reading found all four prices, each accepted by the check.
2. **A buyer's payment reply the rules cannot read** ("20 tak cash tight hai", "20 ke baad pay karunga") gets a suggested reading from the same chain. The model returns words only (the quote, the day as written, the direction); code checks the quote is in the reply, works out the calendar date and refuses anything unclear, far away, or not in the reply. The merchant sees one plain suggestion ("unavailable until 20 Dec 2026, from '20 tak'") with Use this date and Ignore; nothing moves until they use it, and then it follows exactly the path a rule-read reply takes. If neither model answers, the reply is left for the merchant as before.

The merchant's screens never name the provider, say "live", or show a fallback. Which model answered, what was tried first, and when nothing was used are in the presenter page and the event log, so the audit stays truthful. No call cap: the link is shared only with judges.

## The hero case is a pilot-first buyer (13 October 2026)

**Decision.** The default case is Harbour Fresh Foods: a buyer who would rather start small and see results first, has ₹50,000 left this quarter, sends anything above ₹60,000 to their MD, and gets fresh budget in January. The merchant offers a three-month first phase; the rest of the year is for a review. The offer the engine recommends is unchanged in shape (the website plus three months of search and reporting, ₹46,020, two payments), and the full-scope plans appear as alternatives that need the MD.

**What the product does not do.** The conversation includes the merchant's promise to hold today's rates and the buyer's go-ahead test. The product does not price, lock, enforce or track a second phase. That is a deliberate boundary for this round (no UI change), not a hidden feature; the demo script says not to claim it.

**Why this case.** Nobody in it says no. The stall is a limit on what one person can sign, which is the situation the product is for, and it shows scope, time and commitment moving together.
