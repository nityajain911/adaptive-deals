# Merchant profit strategy: architectural spec

- **Date:** 7 October 2026
- **Branch:** `codex/merchant-profit-strategy`
- **Fallback:** tag `submission-ready-pre-profit-strategy-2026-10-07` (commit `65e1de6`) is the last submission-ready state.
- **Status:** approved on 7 October 2026 with decisions 1 to 30. No decision is open. Implementation needs a plan per phase and passes a review gate after phase 7. No product code and no model call is covered by this document's approval; each phase has its own gate.

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
| 20 | **(D1)** The strategy orderings stand. An offer that needs the buyer's approval may lead. The strategy leader and the best within-approval alternative are shown together. |
| 21 | **(D2)** The "merchant overrides Groq" demo moment is replaced by a strategy demonstration: Protect contribution → Preserve scope → the annual offer with MD approval and the best within-approval alternative → back to Protect contribution for the main journey. |
| 22 | **(D3)** Standard prices apply only to new quotes. No deal-creation flow is added. |
| 23 | **(D4)** The demo activates an illustrative economics version 2 (10% ceiling; approved ladder 0%, 5%, 10%), only if the activation preview shows it is valid under the configured rules. |
| 24 | **(D5)** The recorded Groq reason sits behind the information control, labelled as historical evidence that does not drive the current recommendation. |
| 25 | The deal baseline stores a **per-service price snapshot** taken when the deal starts. An existing deal always uses those prices. Re-evaluation takes costs, cost timing, guardrails and the discount ladder from the new version, never its standard prices. The same snapshot is the basis for same-scope discount and for retained-scope value. |
| 26 | A deal's effective hash is the hash of the **exact engine inputs** it is evaluated with. A change to account standard prices alone does not change an existing deal's effective hash. |
| 27 | **(D6)** On explicit re-evaluation the deal adopts the newly pinned version's removable, deferrable and independent-value flags and its dependencies, **only for services already in the deal baseline**. The dependency graph must close over the baseline service set: if a dependency names a service that is not in the baseline, re-evaluation is blocked and the conflict is explained. A service added to the account never enters an existing deal. |
| 28 | **(D7)** A discount is never recommended merely because the ladder permits it. The ladder is permission for negotiation, not a proactive recommendation. Discounted offers become prominent only after an explicit buyer price request, inside the negotiation corridor. Version 2's 0%, 5%, 10% ladder is demonstrated there. |
| 29 | **Lower buyer commitment** orders by: within buyer approval → lower discount → smaller largest payment → lower total → earlier start → stable id. |
| 30 | The economics store lives under the configured application data directory, so the normal, sample and recorded browser environments stay isolated. |

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

### 3.8 The three demo cases share one set of engine inputs

All three cases use the same merchant, the same services and the same approved offer types (`data/synthetic/cases.ts`). They differ only in the buyer's conversation. One set of engine inputs therefore reproduces all three recordings.

### 3.9 The word "profile" is already taken

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
  services: ServicePackage[]; // existing type: standard price, direct cost, cost timing, removable, deferrable, independent value, dependencies
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

- **Version 1 is the default demo economics** and is built from the existing hero fixtures without changing them. A test asserts that a deal started under it has engine inputs equal to the fixtures, and that all three case recordings replay under it.
- **A standard price is the price used when a new quote is made.** It never reaches a deal that already exists (decisions 22 and 25). The screen labels it "applies to new quotes".
- `hash` identifies the account version. It is **not** what a deal is checked against; that is the deal's effective hash (4.3).
- A draft (unactivated) copy exists while the merchant edits. Only activation creates a version.
- Stored in a new account store, separate from the deal store: a file named `economics.json` **inside the configured application data directory** (`ADAPTIVE_DEALS_DATA_DIR`, defaulting to `.data`). The normal server, the sample browser environment (`.data-e2e`) and the recorded browser environment (`.data-e2e-recorded`) each therefore have their own account economics and cannot affect one another.

### 4.2 `DealBaseline` (per deal, immutable)

Captured when a deal starts and never edited:

```ts
interface DealBaseline {
  /** Price of every service as it stood when the deal started. The only prices this deal ever uses. */
  servicePrices: { packageId: string; kind: "one_time" | "monthly"; listPricePaise: number }[];
  quotedScope: ScopeItem[];
  quotedPrePaise: number;   // must equal the snapshot prices applied to quotedScope
  quotedGstPaise: number;
  quotedTotalPaise: number;
  gstRateBps: number;       // the rate the quote was made at; this deal keeps it
  economicsVersionAtStart: number;
}
```

- **The snapshot is the single source of price for the deal.** Offer generation, the discount on any same-scope offer, the counter-offer's discount, and the retained-scope value used by Preserve scope all read `servicePrices`. Nothing reads a standard price for an existing deal.
- **Capture invariant:** `quotedPrePaise` equals the snapshot prices applied to `quotedScope`. If they differ, the baseline is refused and the deal is marked for review; nothing is guessed.
- For the three demo cases the snapshot is the fixture prices, which sum to the ₹1,20,000 quote stated in each case's own conversation.
- `originalProposal()` becomes a read of this baseline.
- `kind` is part of the price's meaning (a total, or a price per month), so it is snapshotted with it.

### 4.3 `DealEconomics` (per deal)

```ts
interface DealEconomics {
  pinned: { version: number; hash: string };   // the account economics this deal is evaluated under
  overrides: InputOverride[];                  // section 8.1
  strategy: StrategyId;                        // section 7
  effectiveHash: string;                       // hash of the exact engine inputs this deal is evaluated with (section 5)
}
```

- **`effectiveHash` is computed from the engine inputs themselves**: the canonical JSON of the policy, the services and the offer types that `engineInputFor` returns. It is not a hash of the account version. Two consequences:
  - Activating a version that only changes standard prices leaves every existing deal's `effectiveHash` unchanged.
  - Any change that would alter an engine result changes it, whatever its source (a new pinned version, an input override).
- The **recording input hash** is the `effectiveHash` of a deal started under version 1 with no overrides. By 3.8 it is the same for all three recordings.
- A new deal pins the active account version at start.
- Activating a newer account version does **not** change `pinned`. Only explicit re-evaluation does (section 9).

### 4.4 References on existing records

- `AgreementVersion` gains `economics: { version, effectiveHash, strategy }`. It is **outside** `terms`, so it does not change the terms hash and never reaches the buyer.
- `Amendment` and `CounterOffer` gain the same reference. A recheck (rescheduling, counter-offer) always uses the deal's pinned economics, never the latest account version.
- `decisionFingerprint` includes `effectiveHash`. Changing the pinned economics or an override therefore makes an unsent draft stale through the existing stale-draft rule.
- Sent and accepted versions keep their reference permanently.

## 5. Where engine inputs come from

One function, `engineInputFor(deal)`, builds the engine's input for a deal. Nothing else reads fixtures or account economics directly, and its output is exactly what `effectiveHash` is computed from:

| Engine input | Source for an existing deal |
|---|---|
| Service price and kind | `DealBaseline.servicePrices`, always |
| Service direct cost, cost timing | Pinned version, then any cost override |
| Service flags (removable, deferrable, independent value) and dependencies | Pinned version, restricted to the baseline's services (decision 27) |
| Contribution floor, cash-exposure limit, discount ceiling, minimum payment, maximum duration, expected fee | Pinned version, then any input override |
| Approved discount ladder | Pinned version (`discountsBps`) |
| Approved offer types | Pinned version's fixed offer types |
| GST rate | `DealBaseline.gstRateBps` |

- The engine files are not modified. They already accept these inputs.
- Because discounted offers are generated from the snapshot price and a ladder level, an offer's discount is by construction a discount against the deal's own baseline.
- **The deal's service set is the baseline's service set, permanently.** A service added in a newer version does not enter an existing deal.
- **Dependencies must close over that set.** When a version is pinned, each baseline service takes that version's flags and `dependsOnAny`. If any dependency names a service outside the baseline, or a baseline service is missing from the version, re-evaluation to that version is blocked (section 9).

## 6. Recorded runs and derived decisions

- A recorded run is replayed only when the deal's `effectiveHash` equals the recording input hash. This is today's behaviour and stays byte-identical.
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
| **Lower buyer commitment** | Within buyer approval → lower discount → smaller largest payment → lower total → earlier start → stable id |

Preserve scope and Minimise cash exposure do not put buyer approval first, so an offer that needs the buyer's approval may lead (decision 20). On the hero case both lead with offer A.

- **Leader and within-approval alternative.** When the strategy's leader needs the buyer's approval, the recommendation states that on the offer itself ("Needs the buyer's MD approval") and shows, beside it, the **best within-approval alternative**: the first offer in the same strategy's order that is within the buyer's limit. When the leader is already within the limit, no alternative is shown. If no offer is within the limit, the card says so.

**Discounts are never recommended proactively (decision 28).**

- The proactive recommendation on the Offer screen is ranked over **undiscounted offers only** whenever at least one undiscounted offer is feasible. Offers generated from a ladder level above 0% are not in that ranked list, are not the strategy leader, and are not the within-approval alternative.
- Discounted ladder offers are shown in the **negotiation corridor**, which opens only after an explicit buyer price request (section 10.3). There they are ordered by the deal's strategy.
- If **no** undiscounted offer is feasible, the Offer screen does not silently promote a discount. It says that no offer fits at the quoted prices, and lists the feasible discounted offers ordered lower discount first, then by the strategy. The leading one is labelled with its discount and is not called "recommended"; the merchant may select it.
- Under version 1 the ladder is 0% only, so this changes nothing there.

Rules:

- **Fact IDs.** For each offer, code computes a closed set of facts against the feasible set: `highest_contribution`, `lowest_cash_exposure`, `most_scope_retained`, `smallest_largest_payment`, `lowest_total`, `earliest_start`, `no_discount`, `lowest_discount`, `within_buyer_approval`, `needs_buyer_approval`, plus `tied_on:<key>`. These are the only comparative claims anything may make.
- **Code explanation.** Code writes the reason for the top offer from its facts and the strategy's keys, and the figures. This is always available and is the default.
- **Explicit selection survives.** If the merchant explicitly selected an offer, a strategy change leaves it selected and shows "Another offer is now recommended under this strategy" with a one-click apply.
- **Implicit selection follows.** If the selection was only the recommendation, a strategy change clears it and its unsent draft.
- **Locked when sent.** A sent version records its strategy and cannot be re-ranked.
- **Exceptions are never ranked.** An offer that needed a failed-rule exception is shown as the merchant's own choice, outside the ranked list, and is never recommended.
- **The recorded Groq order and reason** are shown in the audit and behind the offer card's information control, labelled "Historical evidence from the recorded Groq run. It does not drive the current recommendation." They appear only when the deal's `effectiveHash` equals the recording input hash, because they describe those inputs and no others.

## 8. Overrides and exceptions

### 8.1 Input override (before evaluation)

Changes an assumption for one deal: a service's direct cost, the contribution floor, the cash-exposure limit, the discount limit.

- Requires a short reason and confirmation.
- Stored with who, when, the account value, the deal value, and whether it **tightens** or **loosens** the account rule.
- Never changes the account economics.
- Changes `effectiveHash`, so it invalidates an unsent draft and reruns the engine.
- No price is overridable: neither the quoted price nor a service's snapshot price (decisions 4 and 25). A price change is a new offer or a counter-offer, where the discount is visible.

### 8.2 Failed-rule exception (after evaluation)

The engine reports a failed rule and the merchant chooses to continue. This is what the counter-offer does today.

- The engine's result is stored exactly as returned. `approvable` stays false.
- Requires acknowledgement of exactly the rules shown, a reason, and confirmation.
- **Negative contribution** additionally requires a typed confirmation.
- Permanently recorded and shown in the audit.

## 9. Re-evaluating an open deal

A deal is offered re-evaluation only when pinning the active version **would change its engine inputs**, that is, when the prospective `effectiveHash` differs from the current one. A version that only changed standard prices produces no prompt and no change; the audit records that a newer version exists and does not affect this deal.

When it would change, the deal shows: "Your business economics have changed since this deal was evaluated."

**Re-evaluate with version N** first shows, computed by code and without changing anything:

- which inputs change: costs, cost timing, guardrails, discount ladder. Service prices are shown as "unchanged for this deal".
- which offers become feasible or infeasible,
- whether the recommendation changes,
- which unsent draft becomes stale.

On confirmation the deal pins version N and its inputs are rebuilt by the table in section 5, with prices still from the baseline. Sent and accepted versions are unaffected.

Re-evaluation is refused, and nothing changes, when version N cannot be applied to this deal's baseline services. The preview names the conflict:

- a baseline service is missing from version N, or
- a baseline service's dependency in version N names a service that is not in this deal's baseline ("Search marketing now depends on Analytics setup, which was not part of this deal").

The merchant then keeps the pinned version for this deal, or changes the account economics.

## 10. Screens

### 10.1 Business economics (new page)

Three parts: **Services**, **Commercial guardrails** (including the approved discount ladder), **Review and activate**.

- Validation: cost ≥ 0, price > 0, percentages 0–100, ladder levels ≤ ceiling, minimum payment > 0, duration ≥ 1.
- Warnings, computed by code: a floor that no offer can meet even at the standard price; a service whose cost exceeds its price.
- Review shows calculated economics per service (contribution and margin at the standard price) and a before/after of the open demo deal.
- GST is read-only. The payment fee is pre-filled and labelled as an expected fee.
- "Cash exposure" is explained as the most the merchant would have paid out before being paid.
- Standard prices carry the label "applies to new quotes" and a note that existing deals keep the prices they were quoted at.
- **Restore demo defaults** re-activates version 1's values as a new version.
- **Illustrative version 2 for the demo** (decision 23): a 10% discount ceiling with an approved ladder of 0%, 5% and 10%. It is activated only through the same review step as any other version, and only if that preview shows at least one feasible offer on the open demo deal under the configured rules. It is labelled "Illustrative" wherever it appears. If the preview does not hold, the demo does not use it. Activating it does not change the recommendation on the Offer screen, because discounted offers are not ranked proactively; its ladder is shown in the negotiation corridor.

### 10.2 Offer

- A strategy control above the recommendation: **Best offer for: Protect contribution**.
- The card states: why it fits the buyer, what the merchant keeps after configured costs and expected fees, cash exposure, which account rules or deal overrides applied.
- When the leader needs the buyer's approval, the best within-approval alternative is shown beside it (section 7).
- "What changes under another strategy": one row per strategy with its top offer, computed by code.
- This replaces existing text on the card; it is not an additional panel.

### 10.3 Negotiation corridor

For a buyer request marked as about the price, the merchant sees: the requested total and its GST basis (the merchant states the basis; it is not parsed from the message), projected contribution, rules passed and failed, the **lowest compliant total for the same scope**, feasible reduced-scope alternatives and feasible payment-timing alternatives.

- The lowest compliant total is found by evaluating candidate totals with the real engine (counter structure, per-line GST, every check), scanning down from the current total and refining to ₹1. If the passing range is not contiguous, the result is described as the lowest total in the contiguous range from the current offer.
- **This is where the ladder appears.** The feasible offers at each approved ladder level for the same scope are listed with their discount, total and contribution, ordered by the deal's strategy. Under the illustrative version 2 that is the 0%, 5% and 10% levels.
- The corridor opens only for a buyer request marked as about the price. It is not reachable from the Offer screen without one.
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

- `e2e/recorded.spec.ts` "the merchant overrides Groq's ranking…" asserts the recommended offer is the single upfront payment (B). Under Protect contribution it is the two-payment offer (C). The journey is rewritten as the strategy demonstration (decision 21): Protect contribution recommends C; Preserve scope recommends A with "Needs the buyer's MD approval" and C as the best within-approval alternative; back to Protect contribution, then the existing preview, send, accept and reschedule path continues from C.
- `DEMO_SCRIPT.md` lines for 25–45 s and the recording guidance ("Groq ranked one payment first…", "ranked the options").
- `README.md` case table ("ranks the single upfront payment first").
- `PRODUCT_DECISIONS.md` sections on AI ranking, the Offer card attribution, and "structures needing buyer approval always rank below".
- `AI_BUILD_LOG.md` gains an entry; the applicant section is untouched.

## 13. Tests

- **Property tests** (generated economics within valid bounds):
  - The economics hash is stable under key order and changes when any engine-relevant value changes.
  - Loosening a guardrail never removes a feasible offer; tightening never adds one.
  - Every strategy returns a permutation of the same feasible set, and is deterministic.
  - Protect contribution equals `rankFeasible` applied to the same set, for every input.
  - A deal's pinned reference and every agreement's reference are unchanged by a later activation.
  - Activating a version that differs only in standard prices leaves every existing deal's `effectiveHash`, offers and figures unchanged.
  - After any re-evaluation, every service price the engine receives still equals the deal's baseline snapshot.
  - The proactive ranked list contains no discounted offer whenever an undiscounted offer is feasible, under every strategy.
  - The services the engine receives are exactly the baseline's services, under every version; a version whose dependencies leave that set is refused.
- **Integrity tests:** version 1 reproduces all three recordings; a derived decision never shows the parent explanation; a ladder discount, a counter-offer's discount and the retained-scope value are all computed from the baseline snapshot; a baseline whose quoted price does not equal its snapshot is refused.
- **Migration tests:** a store saved before this work gets version 1, a baseline and a pinned reference, labelled as the default demo economics.
- Existing suites stay green at every phase: 762 unit tests and 54 browser tests at the tag, apart from the deliberate changes in section 12.

## 14. Decisions from the self-reviews

**Resolved.** D1 to D5 from the first self-review are adopted as decisions 20 to 24. The price-snapshot correction is decisions 25 and 26.

D6 and D7 from the second self-review are adopted as decisions 27 to 29. The store location is decision 30. **No decision is open.**

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

Run twice: on the first draft, and again after decisions 20 to 26.

**Placeholders:** none. **Scope:** one plan per phase is practical; phases 8 to 12 need their contracts expanded into exact schemas before implementation.

### 16.1 Contradictions found in the first review, and their outcome

1. **Approval-first invariant against the strategy table.** Resolved by decision 20: the orderings stand, and the leader is shown with the best within-approval alternative.
2. **"Recorded Groq ordering stays visible" against the demo story.** Resolved by decision 21.
3. **"AI explains the trade-off" against "code-computed facts".** Attribution is conditional on what is displayed.
4. **"Frozen prompts and runs unchanged" against "three new tasks".** The new tasks get their own module and Groq adapter (11.1).
5. **"Deal override of service price" against "the quoted price is immutable".** Price is removed from input overrides; decision 22 covers the consequence for the demo deals.
6. **"Reset must not erase the account economics" against the browser tests.** Reset keeps the account economics; a separate restore action is used by the test harness.
7. **"Failed-rule exceptions never appear in the ranked list" against the built counter-offer.** The counter-offer moves out of the list.
8. **Clarification questions depend on merchant economics.** Handled in section 6.
9. **A policy edit is silently ignored by replay today.** Closed by the derived-decision rule.
10. **Naming.** Resolved in 3.9.

### 16.2 Contradictions found in the second review

11. **The first draft's baseline could not honour "never new standard prices".** It stored only the quoted totals, so the engine would have read service prices from whichever account version was pinned, and a re-evaluation would have pulled new prices into an existing deal. Fixed by the per-service snapshot (4.2) and the input table (section 5).
12. **The first draft hashed the account version, not the engine inputs.** A standard-price-only activation would then have made every open deal look changed, and staled its draft, while changing nothing. Fixed by hashing the exact engine inputs (4.3).
13. **"Economics have changed" prompt against a price-only change.** With decision 26 a newer version can exist that does not affect a deal. Section 9 now offers re-evaluation only when the engine inputs would actually change.
14. **"Recording economics hash" was defined on the account version.** It is now the recording input hash, defined on a deal's engine inputs, which is the thing a replay actually depends on.
15. **Service flags and dependencies on re-evaluation are unspecified.** The instruction lists what a re-evaluation adopts and what it must not; flags are in neither list. Raised as D6.
16. **A removed or added service.** Not covered before. A baseline service missing from a newer version blocks re-evaluation; an added service does not enter an existing deal (sections 5 and 9).
17. **GST rate.** The baseline stores the rate the quote was made at and the first draft also took a rate from the pinned version. An existing deal now takes it from the baseline only.
18. **Lower buyer commitment under a discount ladder.** Not a contradiction in the text, but a consequence worth a decision: it recommends the most discounted offer. Raised as D7.
19. **Decision 23's condition.** "Valid under the configured rules" is made checkable: the activation preview must show at least one feasible offer on the open demo deal, or the demo does not use version 2.

### 16.3 Checked and consistent

- A ladder discount is computed from the snapshot price, so "discount against the baseline" and "discount the engine checks" are the same number.
- The counter-offer's discount is computed from the structure's list price, which comes from the snapshot.
- Version 1 with no overrides yields the fixture inputs exactly, so the three recordings still replay and their attribution is unchanged until economics or strategy change what is shown.
- In the strategy demonstration the selection is implicit, so it follows the strategy back to Protect contribution (section 7), and the main journey continues from offer C.

### 16.4 Final review, after decisions 27 to 30

**Outcome of the two decisions that were open**

15 (flags and dependencies) is resolved by decision 27. 18 (Lower buyer commitment under a ladder) is resolved by decisions 28 and 29.

**Contradictions found in this review**

20. **"Lower discount first" in one strategy against "never recommend a discount merely because the ladder permits it" in all of them.** Decision 29 puts discount second in Lower buyer commitment only. The other three strategies have no discount key, and Minimise cash exposure could have led with a discounted offer of one structure over an undiscounted offer of another. Even Lower buyer commitment, as ordered, would rank a within-approval discounted offer above an approval-needed undiscounted one. Resolved in section 7 by a rule above the strategies: the proactive ranking is over undiscounted offers only whenever one is feasible. Decision 29's key then orders the lists that do contain discounts (the corridor, and the fallback list).
21. **"Discounted offers only inside the negotiation corridor" against a deal where nothing fits without a discount.** The corridor needs a buyer price request, so such a deal would have shown no offer at all while a permitted one existed. Resolved in section 7: the screen says nothing fits at the quoted prices and lists the permitted discounted offers, without calling any of them recommended.
22. **Decision 23 (demonstrate version 2) against decision 28.** The first reading had version 2 visibly changing the Offer screen. It no longer does. Section 10.1 now says so, and the ladder is demonstrated in the corridor.
23. **"Adopt the new version's dependencies" against "the deal's service set is fixed".** A dependency can name a service the deal never had. Resolved by decision 27's closure rule, with the block reason shown (section 9).
24. **A literal store path against the three isolated environments.** Fixed by decision 30.

**Checked and consistent**

- With a 0%-only ladder (version 1) every rule about discounts is inert, so the recordings and today's behaviour are unaffected.
- Protect contribution over the undiscounted set is `rankFeasible` over that set; a stable sort of a subset is the same order.
- The counter-offer is not a ladder offer: it is the merchant's own total, checked against the ceiling, and stays outside the ranked list.
- Fact IDs `no_discount` and `lowest_discount` are added so that an explanation can state the discount position without the model writing a figure.

