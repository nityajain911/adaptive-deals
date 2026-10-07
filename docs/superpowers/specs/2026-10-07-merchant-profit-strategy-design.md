# Merchant profit strategy: architectural spec

- **Date:** 7 October 2026
- **Branch:** `codex/merchant-profit-strategy`
- **Fallback:** tag `submission-ready-pre-profit-strategy-2026-10-07` (commit `65e1de6`) is the last submission-ready state.
- **Status:** design for review. No product code and no model call is covered by this document's approval; each phase has its own gate.

## 1. Purpose

Adaptive Deals already calculates every offer from the merchant's own economics, but those numbers are fixed fixture data that the merchant cannot see as theirs, change, or steer. This work makes merchant economics a visible, editable and versioned capability:

1. The merchant sets and activates their **business economics** (services, costs, guardrails, approved discount ladder).
2. Each deal has a visible **strategy** that decides, by deterministic code, which feasible offer is recommended.
3. The merchant can make **deal-specific input overrides** and, separately, **failed-rule exceptions**.
4. A **negotiation corridor** shows what a buyer's requested price does to the merchant's economics.
5. Three optional, separately versioned AI tasks assist with entry, explanation and drafting. None of them can change a figure, a ranking or a rule.

### Not in scope

- An autonomous negotiator, or any model output that sets a price, a rank, a rule or a guardrail.
- A claim that any strategy raises the chance a buyer accepts. There is no acceptance data.
- Editing the approved offer types (payment plans, phase scopes, start dates) beyond the discount ladder.
- Parsing PDFs or spreadsheets. Pasted text and CSV only.
- Changing an amount after the buyer has accepted, and partial payment of one debit.
- Any change to the frozen assets listed in section 3.1.

## 2. Decisions adopted

These were settled before this spec and are binding on it.

| # | Decision |
|---|---|
| 1 | Strategy ranking is deterministic and authoritative. |
| 2 | The recorded Groq ordering stays visible as historical evidence and does not drive the recommendation. |
| 3 | Strategy explanations use code-computed fact IDs. Comparative claims are rendered by code where possible. AI prose is optional and conditionally attributed. |
| 4 | The original quoted price and scope are immutable deal baselines. |
| 5 | Re-evaluation adopts new costs, guardrails and discount ladder, and never new standard prices. |
| 6 | Preserve scope is measured by the retained pre-GST list value from the deal baseline. |
| 7 | The fourth strategy is **Lower buyer commitment**. |
| 8 | An approved discount ladder is separate from the maximum discount ceiling. |
| 9 | Open deals keep their pinned economics until the merchant explicitly re-evaluates. |
| 10 | Input overrides and failed-rule exceptions are separate things. |
| 11 | A failed-rule exception never appears in the ranked recommendation list. |
| 12 | `profile_extract.v1` supports pasted text and CSV only, with verbatim evidence, stored offsets, prompt-injection handling, disclosure before content is sent, and individual merchant confirmation. |
| 13 | Package relationships are manual unless directly supported by quoted evidence. |
| 14 | `strategy_narrative.v1` never blocks the screen and is conditionally attributed. |
| 15 | `negotiation_message.v1` uses code-inserted terms and figures, treats its validator as a filter and not a guarantee, and always needs merchant review and approval. |
| 16 | Evaluation criteria and hold-out cases are pre-registered before any new prompt is written. |
| 17 | Property tests cover economics hashes, guardrail monotonicity, ranking permutations and stable pinning. |
| 18 | A deterministic phase gate follows the negotiation panel. No AI task is implemented before that review. |
| 19 | Every existing test, walkthrough step, audit label and demo-script line affected by replacing Groq ranking is listed (section 12). |

## 3. Facts from the current code that shape this design

Each of these was checked in the repository on `65e1de6`.

### 3.1 Frozen assets

Unchanged since `c907d1d` and must stay so: every file under `ai/` and `evaluation/`, `data/live-runs/`, `data/demo-run.json`, `domain/engine.ts`, `domain/checks.ts`, `domain/economics.ts`, `domain/replies.ts`. The three case recordings in `data/case-recorded-runs/` are never rewritten.

### 3.2 Replay is tied to the economics a run was recorded under

`replayRun` (frozen, `ai/orchestrator.ts`) re-runs the engine and refuses the replay unless the result is byte-identical to the stored one.

- It evaluates with the **recorded** policy (`record.inputs.policy`). An edited guardrail is therefore silently ignored by a replay.
- Service prices and costs are **not** in the record (only `packageIds`). They come from the deal. Editing a price or cost makes the replay throw `ReplayIntegrityError`.

Consequence: a recorded run can only ever be replayed under the economics it was recorded with. Any other economics is a derived decision (section 6).

### 3.3 The discount ladder already exists

`TemplateConfig.discountsBps` is "discount levels the merchant allows templates to use" and `enumerateStructures` generates one set of offers per level. `MerchantPolicy.discountLimitBps` is the ceiling the engine checks. The hero values are `discountsBps: [0]` and `discountLimitBps: 0`. Decision 8 maps directly onto these two existing fields.

### 3.4 A deterministic ranker already exists

`rankFeasible` (frozen, `domain/engine.ts`) orders feasible offers: within the buyer's approval limit first, then higher net contribution, lower peak funding, smaller largest payment, stable id. Every stored evaluation already carries this order as `feasibleOrder`. **Protect contribution is exactly this function**, so it is reused, not reimplemented.

### 3.5 What the four strategies do on the three demo cases

Feasible offers in the recorded **Reduced scope** case:

| Offer | Buyer approval | Net contribution | Peak funding | Largest payment | Total | Scope |
|---|---|---|---|---|---|---|
| A · Full annual scope, 30% at start, 70% in month 7 | Needs MD approval | ₹60,168 | ₹0 | ₹99,120 | ₹1,41,600 | Full |
| B · Phase 1, single payment | Within limit | ₹19,329.60 | ₹0 | ₹46,020 | ₹46,020 | Phase 1 |
| C · Phase 1, two monthly payments | Within limit | ₹19,329.60 | ₹0 | ₹23,010 | ₹46,020 | Phase 1 |
| D · Full annual scope from May 2027, 12 monthly payments | Needs MD approval | ₹60,168 | ₹5,750 | ₹11,800 | ₹1,41,600 | Full |

- Groq's recorded order: **B**, C, A, D.
- Code order today (`feasibleOrder`): **C**, B, A, D.

Top offer per strategy, using the orderings in section 7:

| Strategy | Top offer |
|---|---|
| Protect contribution | C |
| Preserve scope | A (needs MD approval) |
| Minimise cash exposure | A (needs MD approval) |
| Lower buyer commitment | C |

The **Preserve scope** case has one feasible offer and the **No fit** case has none, so the strategy changes nothing there.

### 3.6 Fixture data is read directly in many places

`heroMerchant`, `heroPackages` and `heroTemplates` are imported directly by 12 product files (46 references), including `lib/service.ts`, `lib/offer-copy.ts`, `lib/audit.ts`, the Offer, Track and buyer pages. `originalProposal()` recomputes the original quote from the fixture on every call. All of these must read the deal's own economics and baseline instead.

### 3.7 The frozen provider cannot carry a new task

`StructuredRequest.task` is typed as `AiTask`, which is the key set of the frozen `TASK_SCHEMAS` (`extract`, `clarify`, `explain`). `RunRecord` and `PROMPTS` are also frozen. New tasks cannot be added to them.

### 3.8 The word "profile" is already taken

In the code, "profile" means the **buyer's** constraint profile (`ConstraintProfile`, `out.profile`, `engine.profile`). This work therefore never uses bare "profile". The merchant's settings are **business economics** on screen and `Economics…` in code (`EconomicsProfile` is avoided too: the type is `BusinessEconomics`).

## 4. Data model

All amounts are integer paise. All new records are additive; nothing existing is renamed.

### 4.1 `BusinessEconomics` (account level)

```ts
interface BusinessEconomics {
  schema: "adaptive-deals.business-economics.v1";
  version: number;            // 1, 2, 3 … per activation
  activatedAt: string;
  activatedBy: string;
  services: ServicePackage[]; // existing type: price, direct cost, cost timing, removable, deferrable, independent value, dependencies
  guardrails: {
    contributionFloor: ContributionFloor; // existing type: percentage and/or amount
    discountLimitBps: number;             // maximum discount (ceiling)
    cashAtRiskLimitPaise: number;         // maximum cash exposure
    smallestInstalmentPaise: number;      // minimum payment, pre-GST
    maxTenureMonths: number;              // maximum payment duration
    paymentFeeBps: number;                // expected payment fee
  };
  discountLadderBps: number[];            // approved levels the engine may generate; each ≤ discountLimitBps; always includes 0
  /** Read-only in this work: GST rate, notice days, retry days, mandate buffer, and the approved offer types. */
  fixed: { gstRateBps: number; advanceNoticeDays: number; internalRetryAfterDays: number; mandateEndBufferMonths: number; offerTypes: Omit<TemplateConfig, "discountsBps"> };
  hash: string;                           // sha256 of the canonical JSON of everything above except version, activatedAt, activatedBy, hash
}
```

- **Version 1 is the default demo economics** and is built from the existing hero fixtures without changing them. A test asserts that its engine inputs equal the fixtures and that all three case recordings replay under it. Its hash is the **recording economics hash**.
- A draft (unactivated) copy exists while the merchant edits. Only activation creates a version.
- Stored in a new account store (`.data/economics.json`), separate from the deal store.

### 4.2 `DealBaseline` (per deal, immutable)

Captured when a deal starts and never edited:

```ts
interface DealBaseline {
  quotedScope: ScopeItem[];
  quotedPrePaise: number;
  quotedGstPaise: number;
  quotedTotalPaise: number;
  gstRateBps: number;
  economicsVersionAtStart: number;
}
```

- For the three demo cases the baseline is the quote already stated in each case's own conversation (for example "₹1,20,000 plus GST"). It is not recomputed from the current standard prices.
- `originalProposal()` becomes a read of this baseline.
- **Discount is always measured against the baseline's quoted price for the same scope.**

### 4.3 `DealEconomics` (per deal)

```ts
interface DealEconomics {
  pinned: { version: number; hash: string };   // the account economics this deal is evaluated under
  overrides: InputOverride[];                  // section 8.1
  strategy: StrategyId;                        // section 7
  effectiveHash: string;                       // hash of pinned economics with overrides applied
}
```

- A new deal pins the active account version at start.
- Activating a newer account version does **not** change `pinned`. Only explicit re-evaluation does (section 9).

### 4.4 References on existing records

- `AgreementVersion` gains `economics: { version, effectiveHash, strategy }`. It is **outside** `terms`, so it does not change the terms hash and never reaches the buyer.
- `Amendment` and `CounterOffer` gain the same reference. A recheck (rescheduling, counter-offer) always uses the deal's pinned economics, never the latest account version.
- `decisionFingerprint` includes `effectiveHash`. Changing the pinned economics or an override therefore makes an unsent draft stale through the existing stale-draft rule.
- Sent and accepted versions keep their reference permanently.

## 5. Where engine inputs come from

One function builds the engine's input for a deal, and nothing else reads fixtures:

```
engineInputFor(deal) = { merchant.policy ← pinned guardrails + fixed + input overrides,
                         packages        ← pinned services + cost overrides,
                         templates       ← fixed offer types + discountsBps ← discountLadderBps }
```

The engine files are not modified. They already accept these inputs.

## 6. Recorded runs and derived decisions

- A recorded run is replayed only when the deal's `effectiveHash` equals the recording economics hash. This is today's behaviour and stays byte-identical.
- When they differ, the decision is a **derived decision**, built on the existing `DecisionBranch` mechanism (already used for changed answers and merchant-confirmed services):
  - The recorded extraction stays as evidence. It does not depend on merchant economics.
  - The engine recalculates every offer from the effective economics.
  - The parent run's explanation is never shown as if it described the derived decision.
  - `DecisionBranch` gains `economics?: { version, effectiveHash }` and the reason `economics_changed`. Its schema string moves to `v2`; the migration accepts `v1`.
- Clarification questions are chosen by code from which unknowns change the result. Under different economics that set can differ. The questions are therefore recomputed for a derived decision: a question the recording worded keeps its recorded wording; a new one gets code wording and says so.

## 7. Strategies

A strategy is a deterministic total order over the offers the engine marked feasible. It never adds or removes an offer and never changes a check.

| Strategy | Order (each key breaks ties in the one before) |
|---|---|
| **Protect contribution** (default) | Within buyer approval → higher net contribution → lower peak funding → smaller largest payment → stable id. This is `rankFeasible`. |
| **Preserve scope** | Higher retained pre-GST list value from the baseline → higher net contribution → lower peak funding → smaller largest payment → stable id |
| **Minimise cash exposure** | Lower peak funding → higher net contribution → smaller largest payment → stable id |
| **Lower buyer commitment** | Within buyer approval → smaller largest payment → lower total → earlier start → stable id |

See open decision D1 (section 14): two of these can lead with an offer that needs the buyer's MD approval.

Rules:

- **Fact IDs.** For each offer, code computes a closed set of facts against the feasible set: `highest_contribution`, `lowest_cash_exposure`, `most_scope_retained`, `smallest_largest_payment`, `lowest_total`, `earliest_start`, `within_buyer_approval`, `needs_buyer_approval`, plus `tied_on:<key>`. These are the only comparative claims anything may make.
- **Code explanation.** Code writes the reason for the top offer from its facts and the strategy's keys, and the figures. This is always available and is the default.
- **Explicit selection survives.** If the merchant explicitly selected an offer, a strategy change leaves it selected and shows "Another offer is now recommended under this strategy" with a one-click apply.
- **Implicit selection follows.** If the selection was only the recommendation, a strategy change clears it and its unsent draft.
- **Locked when sent.** A sent version records its strategy and cannot be re-ranked.
- **Exceptions are never ranked.** An offer that needed a failed-rule exception is shown as the merchant's own choice, outside the ranked list, and is never recommended.
- **The recorded Groq order** is shown in the audit and behind the offer card's information button as "Recorded Groq order (not used for the recommendation)", only when the deal's economics match the recording.

## 8. Overrides and exceptions

### 8.1 Input override (before evaluation)

Changes an assumption for one deal: a service's direct cost, the contribution floor, the cash-exposure limit, the discount limit.

- Requires a short reason and confirmation.
- Stored with who, when, the account value, the deal value, and whether it **tightens** or **loosens** the account rule.
- Never changes the account economics.
- Changes `effectiveHash`, so it invalidates an unsent draft and reruns the engine.
- The quoted price is not overridable (decision 4). A price change is a new offer or a counter-offer, where the discount is visible.

### 8.2 Failed-rule exception (after evaluation)

The engine reports a failed rule and the merchant chooses to continue. This is what the counter-offer does today.

- The engine's result is stored exactly as returned. `approvable` stays false.
- Requires acknowledgement of exactly the rules shown, a reason, and confirmation.
- **Negative contribution** additionally requires a typed confirmation.
- Permanently recorded and shown in the audit.

## 9. Re-evaluating an open deal

When the active account version is newer than a deal's pinned version, the deal shows: "Your business economics have changed since this deal was evaluated."

**Re-evaluate with version N** first shows, computed by code and without changing anything:

- which inputs changed (costs, guardrails, ladder; never standard prices, per decision 5),
- which offers become feasible or infeasible,
- whether the recommendation changes,
- which unsent draft becomes stale.

On confirmation the deal pins version N. Sent and accepted versions are unaffected.

## 10. Screens

### 10.1 Business economics (new page)

Three parts: **Services**, **Commercial guardrails** (including the approved discount ladder), **Review and activate**.

- Validation: cost ≥ 0, price > 0, percentages 0–100, ladder levels ≤ ceiling, minimum payment > 0, duration ≥ 1.
- Warnings, computed by code: a floor that no offer can meet even at the standard price; a service whose cost exceeds its price.
- Review shows calculated economics per service (contribution and margin at the standard price) and a before/after of the open demo deal.
- GST is read-only. The payment fee is pre-filled and labelled as an expected fee.
- "Cash exposure" is explained as the most the merchant would have paid out before being paid.
- **Restore demo defaults** re-activates version 1's values as a new version.

### 10.2 Offer

- A strategy control above the recommendation: **Best offer for: Protect contribution**.
- The card states: why it fits the buyer, what the merchant keeps after configured costs and expected fees, cash exposure, which account rules or deal overrides applied.
- "What changes under another strategy": one row per strategy with its top offer, computed by code.
- This replaces existing text on the card; it is not an additional panel.

### 10.3 Negotiation corridor

For a buyer request marked as about the price, the merchant sees: the requested total and its GST basis (the merchant states the basis; it is not parsed from the message), projected contribution, rules passed and failed, the **lowest compliant total for the same scope**, feasible reduced-scope alternatives and feasible payment-timing alternatives.

- The lowest compliant total is found by evaluating candidate totals with the real engine (counter structure, per-line GST, every check), scanning down from the current total and refining to ₹1. If the passing range is not contiguous, the result is described as the lowest total in the contiguous range from the current offer.
- The buyer sees only the offer the merchant chooses. The floor, the corridor and the lowest compliant total are never sent.

## 11. AI tasks

All three are optional, separately versioned, and built only after the phase gate (decision 18).

### 11.1 Where they live

Because the provider, schema, prompt and run-record types are frozen and closed (3.7), the new tasks live in a new top-level module (`assist/`) with their own prompt registry, schemas, request type, Groq adapter and record store (`data/assist-runs/`). They import nothing that requires changing a frozen file.

### 11.2 Common rules

- Input and output are validated by code. A failed validation falls back to code or to an empty suggestion, and is labelled.
- A saved output is reused only when the request's input hash matches exactly. The input contains the case, the effective economics hash, the strategy and the option set where relevant.
- Attribution is derived from what was actually shown: "written by code", "Recorded Groq output", or "Groq output" for a live call.
- No task can activate economics, create an override, record an exception, rank, send or approve. Those API actions are not reachable from any model path or from the demo guide.

### 11.3 `profile_extract.v1`

- Input: pasted text or CSV supplied by the merchant, after an on-screen disclosure that the content is sent to Groq.
- Output: proposed services, standard prices, direct costs, cost timing. Each value carries a verbatim quote, its offsets in the source, and a confidence.
- Code verifies that every quote is at its stated offsets in the source. A value without verified evidence is dropped.
- Instructions inside the document are treated as data and surfaced, using the existing suspected-instruction handling.
- Missing values stay blank. Each proposed value needs its own merchant confirmation. Package relationships are manual unless a quote supports them.

### 11.4 `strategy_narrative.v1`

- Input: for each offer, an alias and its fact IDs; the strategy; no amounts, no costs, no guardrails.
- Output: for each offer, the fact IDs it used and one sentence.
- Validator: every cited fact is true for that offer; the sentence contains no figure, currency or percentage; the sentence makes no comparison outside its cited facts (checked against a closed vocabulary for each fact).
- The screen renders the code explanation at once. The model's sentence replaces it only if valid, and the attribution then says so. Latency or a rate limit never blocks the decision.
- Known limit: prose can still imply something the validator does not detect. This is stated in the evaluation and is why the code explanation is the default.

### 11.5 `negotiation_message.v1`

- Input: the options the merchant selected to offer, as aliases with code-owned descriptions.
- Output: connective sentences around code-inserted slots for every price, date, scope and schedule.
- Validator (a filter, not a guarantee): rejects merchant costs, the contribution floor, the cash limit, any "lowest acceptable" wording, pressure or artificial urgency, guarantees, unsupported figures and approval-bypass language.
- The merchant always edits and approves the message. Nothing is sent by a model.

### 11.6 Evaluation (pre-registered)

A plan is committed in a new `evaluation-assist/` directory **before any prompt is written**. For each task it fixes: success criteria, development cases, hold-out cases (committed as hashes until the final run), adversarial cases (injection, false comparatives, leaked floor, pressure wording), and the call budget. The frozen evaluation is not reused or modified. The plan and results state who authored the cases.

## 12. What replacing Groq ranking changes

Deterministic ranking becomes authoritative. These existing items assert or say that the model ranked, and each needs a deliberate change, not a weakened assertion.

**Product code**

| File | What changes |
|---|---|
| `app/deals/[dealId]/offer/page.tsx` | Order comes from the strategy, not `explanation.order`. |
| `lib/service.ts` (`reviewBuyerProposal`) | The default selection is the strategy's top offer, not `explanation.order[0]`. |
| `components/audit/sections.tsx` | The offer shown defaults to the strategy's top offer. |
| `lib/views.ts` (`explanationAttribution`) | Strings "… ranked and wrote this reason", "… ranked · code explained", "Order set by code" are replaced by the strategy attribution. |
| `lib/audit.ts` | "Option ranking and explanation" task label; "Suggested the order of eligible options" credit; "Parent option ranking and explanation" rows become "Recorded Groq order (not used)". |
| `lib/walkthrough.ts` | Notices "orders the eligible options" and "The option order in this case is sample output written by hand". |
| `components/offer/recommendation.tsx` | `shownSource.ranking`. |

**Tests** (number of lines that mention ranking in each)

`tests/lib/views.test.ts` (23), `tests/lib/audit.test.ts` (15), `tests/lib/offer-stage.test.ts` (6), `tests/data/case-recordings.test.ts` (3), `tests/lib/decision-branch-service.test.ts` (2), `tests/lib/scope-confirmation-service.test.ts` (2), `tests/lib/decision-branch.test.ts` (1), `tests/lib/sample-attribution-surfaces.test.ts` (1), `tests/lib/counter-offer-service.test.ts` (1), `tests/data/cases.test.ts` (1), `tests/domain/hero.test.ts` (1), `e2e/recorded.spec.ts` (4), `e2e/journey.spec.ts` (1).

Unchanged because they test the frozen model path itself: `tests/ai/clarify-explain.test.ts`, `tests/ai/explain-v3.test.ts`, `tests/ai/failures.test.ts`, `tests/scripts/recording-policy.test.ts`.

**Journeys and documents**

- `e2e/recorded.spec.ts` "the merchant overrides Groq's ranking…" asserts the recommended offer is the single upfront payment (B). Under Protect contribution it is the two-payment offer (C). See D2.
- `DEMO_SCRIPT.md` lines for 25–45 s and the recording guidance ("Groq ranked one payment first…", "ranked the options").
- `README.md` case table ("ranks the single upfront payment first").
- `PRODUCT_DECISIONS.md` sections on AI ranking, the Offer card attribution, and "structures needing buyer approval always rank below".
- `AI_BUILD_LOG.md` gains an entry; the applicant section is untouched.

## 13. Tests

- **Property tests** (generated economics within valid bounds):
  - The economics hash is stable under key order and changes when any engine-relevant value changes.
  - Loosening a guardrail never removes a feasible offer; tightening never adds one.
  - Every strategy returns a permutation of the same feasible set, and is deterministic.
  - Protect contribution equals `rankFeasible` for every input.
  - A deal's pinned reference and every agreement's reference are unchanged by a later activation.
- **Integrity tests:** version 1 reproduces all three recordings; a derived decision never shows the parent explanation; the discount is measured against the baseline.
- **Migration tests:** a store saved before this work gets version 1, a baseline and a pinned reference, labelled as the default demo economics.
- Existing suites stay green at every phase: 762 unit tests and 54 browser tests at the tag, apart from the deliberate changes in section 12.

## 14. Open decisions

These came out of the self-review (section 16) and need an answer before the affected phase.

| # | Decision | Recommendation |
|---|---|---|
| **D1** | Preserve scope and Minimise cash exposure, as specified, can recommend an offer that needs the buyer's MD approval (offer A on the hero case). That reverses the current rule that approval-needed offers always rank below. If approval-first is forced into all four, every strategy picks the same offer on every demo case. | Keep the orderings as approved. Show "Needs the buyer's MD approval" on the recommendation itself and name the best within-approval offer beside it. |
| **D2** | The recorded hero demo loses its "merchant overrides Groq's ranking" moment, because code already recommends the offer the merchant used to pick. | Replace it with the merchant changing strategy, which is a stronger and honest merchant-control moment. Keep Groq's recorded order visible as evidence. |
| **D3** | Editing a standard price has no visible effect on the three demo deals, because each is an existing deal with a fixed quoted baseline. | Label standard prices "applies to new quotes". Do not add a deal-creation flow in this work. |
| **D4** | With the default economics (no discount allowed) the ladder and the negotiation corridor show nothing interesting: the lowest compliant total is the current offer. | Demonstrate by activating a second version in the demo (for example a ladder of 0%, 5%, 10% under a 10% ceiling). The decision then becomes a derived one, explained by code. |
| **D5** | Whether the recorded per-offer Groq reason stays on the card when economics match the recording. | Keep it behind the information button as recorded evidence; the visible reason is the strategy explanation. |

## 15. Phases

Each phase ends with all tests green and a review.

1. Business economics model, validation, versions, hash, account store, migration. Version 1 reproduces the recordings.
2. Deal baseline, pinning, single engine-input function, derived decisions, stale-draft protection, explicit re-evaluation.
3. Strategies, fact IDs, code explanations, property tests.
4. Business economics page and activation review.
5. Strategy-led Offer screen and the comparison across strategies. Section 12 changes land here.
6. Input overrides and the exception audit, including the typed confirmation for negative contribution.
7. Negotiation corridor and alternatives.

**Gate: deterministic product review.** The product is complete with no new model call. Nothing below starts without approval.

8. Pre-registered evaluation plan for all three tasks, with the call budget, for approval.
9. `profile_extract.v1`.
10. `strategy_narrative.v1`.
11. `negotiation_message.v1`.
12. Authorised Groq runs, recorded fallbacks, results.
13. Walkthrough, demo script, product note, screenshots.

## 16. Self-review

**Placeholders:** none. **Scope:** one plan per phase is practical; phases 8–12 need their own spec section expanded into contracts with exact schemas before implementation.

**Contradictions found**

1. **Approval-first invariant against the strategy table.** The approved orderings for Preserve scope and Minimise cash exposure omit the approval tier. On the hero case both then recommend an offer needing MD approval. With the tier forced in, all four strategies recommend the same offer on every demo case and the feature shows nothing. Raised as D1.
2. **"Recorded Groq ordering stays visible" against the demo story.** Groq ranked B first and code ranks C first, so the default recommendation on the recorded hero case changes, and the test and script built on "the merchant overrides Groq" lose their premise. Raised as D2.
3. **"AI explains the trade-off" against "code-computed facts".** The attribution line "trade-off explained by AI" is false whenever the code explanation is shown, which is the default. The spec makes attribution conditional on what is displayed.
4. **"Frozen prompts and runs unchanged" against "three new tasks".** The frozen provider and record types are closed over the three existing tasks. The new tasks need their own module and Groq adapter (11.1), which duplicates a small amount of provider code by design.
5. **"Deal override of service price" (earlier design) against "the quoted price is immutable".** Price is removed from input overrides. A further consequence: standard-price edits do nothing visible on the demo deals. Raised as D3.
6. **"Reset must not erase the account economics" against the browser tests.** The tests rely on reset for a clean state. Reset keeps the account economics; a separate restore action is used by the test harness and by "Restore demo defaults".
7. **"Failed-rule exceptions never appear in the ranked list" against the built counter-offer.** The live counter-offer is currently placed at the head of the offer list. It moves out of the list and is shown as the merchant's own choice.
8. **Clarification questions depend on merchant economics.** The recorded questions may not be the right ones under changed economics. Handled in section 6; not previously covered by the design.
9. **A policy edit is silently ignored by replay today.** Not a contradiction in the design, but it means that without the derived-decision rule an edited guardrail would appear to work while changing nothing. Section 6 closes it.
10. **Naming.** "Profile" already means the buyer's constraints. Resolved in 3.8.
