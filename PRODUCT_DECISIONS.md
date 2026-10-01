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

**Hero:** the buyer replies on 1 Dec 2026 to the 28 Nov advance notice. "Till the 20th" is normalised from the reply's own timestamp to 20 Dec 2026, so the revised debit is **21 Dec 2026, not 20 Dec**. Debiting on the 20th would land on the last day the buyer said cash is tight. The inclusive reading is the conservative one: it can delay a debit by a day but never pulls one into the period the buyer excluded.

The proposed date is not automatically accepted. It is re-checked against:

- the buyer's constraints: 21 Dec is still inside the current-quarter budget;
- seller policy;
- the existing mandate: within the ₹23,010 per-debit limit and before the 31 Jan 2027 end date.

It then needs merchant approval and buyer acceptance of the new version's hash.

Enforced in `domain/amendment.ts` (`earliestDebitAfterUnavailableUntil`, `CASH_UNAVAILABLE_UNTIL_RULE`).

## Merchant policy values are configuration, not engine logic

Limits such as the cash-at-risk limit, contribution floor and smallest instalment are merchant settings. The engine enforces whatever the merchant configures. The hero values and their reasons are in `FIXTURE_RATIONALE.md`.

## View acceptance checklists

Each item names where it is implemented. The Playwright smoke test (`e2e/journey.spec.ts`) asserts them.

### 1. Deal workspace (`/workspace`)
- [x] Source message, shown verbatim (`message-msg-2`)
- [x] Message timestamp in IST and its source channel
- [x] Evidence highlights: verified quote offsets rendered as `<mark>` in the message, plus a quote on each card
- [x] Extracted constraints as cards with status, value, raw text, code transformation and confidence (`constraint-*`)
- [x] Derived budget gap with both cited statements (`budget-gap`)
- [x] Ambiguity status per field, with whether it changes the decision (`ambiguity-*`)
- [x] The other three failure states are available from "Try another conversation" (`scenario-*`)

### 2. Clarification (`/clarification`)
- [x] Question, labelled AI wording or code wording (`question-clar-*`)
- [x] Engine-derived "why it matters", plus feasible counts per reading (`why-clar-*`)
- [x] Answer, entered by the merchant
- [x] Confirmer and channel (the "Confirmed by buyer via" field is required), with the time (`recorded-clar-*`)
- [x] GST-inclusive amounts derived for both stated amounts, with the reconciliation difference

### 3. Decision (`/decision`)
- [x] At least one computed rejection: one featured buyer-side and one seller-side, plus the full list with reasons (`featured-*-rejection`, `rejected-row`)
- [x] Feasible structures, ranked with within-limit first (`feasible-*`)
- [x] Buyer checks and seller checks with code-generated explanations
- [x] Unpaid service value and funding requirement shown separately, with a cash-at-risk chart and table view
- [x] AI comparison, with every figure filled by code (`ai-comparison`)
- [x] Merchant action: Approve and send, which shows the exact terms hash before approval

### 4. Agreement (`/agreement`, `/agreement?role=buyer`)
- [x] Visible role switch: Merchant / Demo buyer view (`role-*`)
- [x] Exact version and hash status, with a match indicator for approval and acceptance (`version-*`)
- [x] GST-inclusive payment dates and amounts in the buyer proposal, plus "No additional financing charge added by the seller." (`no-financing`)
- [x] Merchant approval and buyer acceptance against the same hash (`buyer-hash`, `accept`)
- [x] Payment-link state (`payment-link`)
- [x] Mandate limit, end date and status (`mandate`)
- [x] Provenance labels: Simulated or Razorpay test mode; Demo buyer view; Synthetic data

### 5. Deal timeline (`/timeline`)
- [x] Three schedules: delivery, invoice and collection (`collections`)
- [x] Ledger amounts kept separate (`ledger`)
- [x] Failed-debit event in the event log and in the collection schedule (`events`)
- [x] Mandate-fit result (`mandate-fit`)
- [x] Both amendment approvals, merchant and buyer, in the amendment history (`amendment`)
- [x] Internal retry removal: "Adaptive Deals retry removed; revised payment scheduled."
- [x] Version history with hash checks (`version-history`)
- [x] Close: metric definition, approval boundary, and the no-feasible example (`close`, `no-feasible-example`)

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
