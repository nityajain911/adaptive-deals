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
| AI hides or forces options | Code enumerates every template before checks. The AI ranks aliases of engine-feasible structures only; unknown aliases are ignored, omitted options are appended, and the approval ordering is enforced. |
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

**The Offer card attributes the text it shows.** If a recorded model ranked the options but the visible reason is code-written, the card says **Groq ranked · code explained**.

**Case recordings are separate from historical runs.** They live in `data/case-recorded-runs/` and are mapped by `data/case-runs.json`. A recording is used only when it is a complete model run of exactly that case's conversation; otherwise the product falls back to the labelled sample. `data/live-runs/` holds the earlier historical runs and is never read for cases.

**A changed clarification answer remains a code-computed branch,** whether the parent is a sample or a recording.

## A verified package field can name several packages

A buyer or the model may name several packages in one sentence. Every known package named in a verified field is kept, each with the same evidence quote, and duplicates are removed. The field is rejected only when it names no known package. This corrected a normaliser defect found by the case probes on 6 October 2026; the frozen evaluation predates it and was not rerun.

## Validated per-offer reasons are shown with field-level attribution

The model's explanation has two parts that code validates separately: a full comparison and a short reason per offer. A reason that passes validation is shown on its offer card even when the full comparison fails. The card then reads **Groq ranked and wrote this reason · recorded Groq output · figures calculated by the engine. Full comparison written by code.** The product never says the model wrote a comparison that code wrote, and a changed-answer branch never shows its parent run's reason.

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
