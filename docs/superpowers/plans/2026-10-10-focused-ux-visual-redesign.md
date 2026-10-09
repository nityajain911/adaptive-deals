# Focused UX and Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every merchant, buyer and judge journey truthful, focused and easy to scan, while adding five non-redundant visuals that explain evidence, transformation, economics, negotiation and payment progress.

**Architecture:** Keep the validated engine, deal state machine, frozen AI contracts and three-stage merchant journey unchanged. Add pure view-model functions that translate existing records into presentation-safe data, then render each visual as a replacement for an existing text block or table. Business actions continue through the current service layer; the redesign must not create a second source of truth in component state.

**Tech Stack:** Next.js 16.3.8 App Router, React 19, TypeScript, Tailwind/CSS, Vitest 5 and Playwright. No new dependency and no model call.

**Spec:** The approved design in the attached review, together with `docs/superpowers/specs/2026-10-02-merchant-decision-redesign-design.md` and `docs/superpowers/specs/2026-10-05-buildathon-walkthrough-design.md`. Where they differ, this plan's **Approved UX and visual addendum** is the newer decision.

## Global Constraints

- Read these repository-specific Next.js guides before editing UI code:
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`
  - `node_modules/next/dist/docs/01-app/02-guides/forms.md`
  - `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`
  - `node_modules/next/dist/docs/03-architecture/accessibility.md`
- Do not change the commercial engine, agreement hashing, reply interpretation, payment rules, frozen prompts, schemas, recorded AI runs or frozen evaluation assets.
- Do not make a provider call. Recorded AI provenance must remain true after every screen change.
- All money, dates, facts and statuses must come from existing domain or service records through pure view models. No commercial number may be typed into JSX.
- Each visual must **replace** the default text/list/table it communicates. Do not display the old explanation and the new visual together.
- Preserve exact contractual information behind progressive disclosure. Simplifying the default view must not delete agreement, approval, audit or calculation evidence.
- Keep the existing three merchant stages: Understand the buyer, Review the offer and Track the deal.
- Keep the existing money-split visual. Simplify only its labels to **You keep**, **Delivery costs**, **Payment fees** and **GST**.
- Keep preventive restructuring as step 6 of the core walkthrough.
- The complete strategy comparison remains a compact table inside **See other ways to do this deal**. Do not add a strategy trade-off chart.
- Do not add a learning-loop diagram or buyer-facing chart.
- Accessibility: keyboard operation, visible focus, semantic buttons/radios, text equivalents for visuals, no meaning conveyed by colour alone and a minimum readable supporting-text size of 14px in redesigned surfaces.
- Use TDD. Write the failing test, observe the expected failure, implement the smallest coherent change and rerun the focused test before broad verification.
- Preserve `.data-view/`, owner screenshots and unrelated working-tree changes.

## Approved UX and visual addendum

### The five visuals and their unique jobs

| Visual | Screen | Question it answers | Replaces |
|---|---|---|---|
| Evidence-to-constraint trace | Understand | “What did the system understand, and from where?” | Repeated constraint bullets plus separate evidence explanation |
| Original quote → adaptive offer | Offer | “What changed to make this deal workable?” | Textual standard-quote comparison and duplicated recommendation summary |
| Money split | Offer | “What does the merchant keep after costs?” | Existing visual retained; verbose supporting copy reduced |
| Negotiation price corridor | Track | “Where do the buyer request, safe minimum and current offer sit?” | Amount comparison prose and the default rules list |
| Agreement/payment timeline | Track | “What happened, what changed and what happens next?” | Default payment schedule plus repeated event/outcome rows |

The source-lineage pattern is shared by chat and documents:

`source quote → derived fact → used in decision`

The transformation card may show a conditional **Economics changed** state when the merchant changes costs. That is a state of the same card, not a sixth chart.

### Explicit exclusions

- No strategy trade-off map: four strategy orderings cannot be represented faithfully on two axes, and the existing collapsed table is clearer.
- No learning-loop diagram: it would describe policy rather than help the current user make a decision.
- No extra buyer charts: the buyer needs a concise contractual summary and actions.
- No full chart library: build the five visuals from semantic HTML and CSS so they remain accessible, responsive and testable.

## Review Focus

1. Can a merchant identify the single next action in under five seconds?
2. Can a judge see what AI understood without opening audit details?
3. Can the merchant distinguish engine facts, AI evidence and their own exception?
4. Do payment and delivery labels describe the current truth rather than a future state?
5. Does every visual remove at least as much text as it introduces?
6. Can the complete core walkthrough be followed at 390px, 1024px and 1440px without covering the product action?

---

# Phase 0 — Baseline and protected-boundary proof

### Task 0.1: Capture the baseline before changing presentation

**Files:**
- Inspect: `package.json`
- Inspect: `AGENTS.md`
- Inspect: `PRODUCT_DECISIONS.md`
- Inspect: `AI_BUILD_LOG.md`
- Inspect: `e2e/journey.spec.ts`
- Create only if the repository does not already have one: `artifacts/ui-review/ux-redesign-baseline.md`

- [ ] Read the five Next.js guides listed in Global Constraints.
- [ ] Record the current commit, branch and pre-existing working-tree changes. Do not stage `.data-view/`.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` and `npm run test:e2e`.
- [ ] Run the existing protected-file/frozen-asset check used by this branch and save the result in the baseline note.
- [ ] Reset the seeded product and capture the current hero states at desktop, tablet and mobile for comparison. Use new filenames; do not overwrite owner screenshots.
- [ ] If any baseline check fails, stop and report it before attributing the failure to this plan.

**Commit:** No product commit. Commit the baseline note only if one was created: `docs: record focused UX baseline`.

---

# Phase 1 — Truthful state and copy foundations

### Task 1.1: Make no-fit closure reasons evidence-based

**Files:**
- Modify: `components/offer/dont-proceed.tsx`
- Modify if needed: `lib/reason-codes.ts`
- Modify if needed: `lib/service.ts`
- Test: `tests/lib/closures.test.ts`
- Test: `e2e/journey.spec.ts`

- [ ] Add a failing unit test proving Blue Harbor's requested-start-date failure does not preselect `contribution_too_low` and suggests **Cannot meet the requested start date**.
- [ ] Add a failing unit test proving no closure reason is selected when no failed check maps unambiguously to a reason.
- [ ] Add a failing browser assertion that the action reads **Close this deal**.
- [ ] Implement a pure mapping from failed check IDs to supported closure reasons. Keep the reason unselected when the mapping is absent or ambiguous.
- [ ] Make the UI show a suggestion separately from the merchant's selected reason; saving still requires an explicit merchant decision.
- [ ] Run the focused tests, then unit, typecheck and lint.

**Commit:** `fix: make no-fit closure reasons truthful`

### Task 1.2: Derive truthful payment and delivery labels

**Files:**
- Modify: `lib/track-copy.ts`
- Modify: `app/deals/[dealId]/track/page.tsx`
- Modify: `app/proposal/[agreementId]/[version]/page.tsx`
- Test: `tests/lib/track-copy.test.ts`
- Test: `tests/lib/current-agreement.test.ts`
- Test: `e2e/journey.spec.ts`

- [ ] Write a table-driven failing test for: proposal sent → **Not scheduled**; accepted/setup incomplete → **Awaiting buyer setup**; link created → **Payment link sent**; mandate authorised → **Scheduled**; submitted → **Processing**; success → **Paid**; failed with retry → **Retry scheduled**; amended → **Moved to {date}**.
- [ ] Add failing browser assertions that **Sent to the buyer** disappears after acceptance and the buyer sees **Payment link awaiting payment** without a technical ID.
- [ ] Replace attempt-exists shortcuts with one pure status derivation based on delivery, link, mandate, attempt and amendment evidence.
- [ ] Retain technical IDs and delivery evidence only in audit details.
- [ ] Run focused tests and the complete Track/buyer browser group.

**Commit:** `fix: show truthful collection states`

### Task 1.3: Remove repeated waiting and technical copy

**Files:**
- Modify: `app/deals/[dealId]/understand/page.tsx`
- Modify: `components/deal/stage-tracker.tsx` only if it repeats the state
- Test: `e2e/journey.spec.ts`

- [ ] Add a failing browser test asserting exactly one visible **Waiting for buyer** state and one expectation: **Their reply will appear here. Nothing else is needed from you.**
- [ ] Remove the per-question waiting messages and repeated footer status. Preserve question evidence and answers behind the existing details.
- [ ] Verify that non-waiting states still show one current action and settled Understand shows no stale clarification warning.

**Commit:** `fix: reduce duplicate waiting states`

**Phase gate:** Run unit, typecheck, lint and the relevant browser flows. Review the no-fit, accepted Track and waiting Understand screens before structural work.

---

# Phase 2 — Shared evidence-to-decision visual language

### Task 2.1: Add a pure source-trace view model

**Files:**
- Create: `lib/source-trace.ts`
- Test: `tests/lib/source-trace.test.ts`
- Reuse: `lib/chat-highlights.ts`
- Reuse: `components/commercial-memory/deal-evidence.tsx`

**Interface:**

```ts
type SourceTrace = {
  id: string;
  sourceKind: "buyer_message" | "business_document";
  sourceLabel: string;
  quote: string;
  derivedLabel: string;
  derivedValue: string;
  usage: string;
  sourceId: string;
};

function sourceTracesForDeal(state: Store): SourceTrace[];
```

- [ ] Write failing tests proving every trace quote exists verbatim in the cited source, every trace has a stable source ID and no internal cost or merchant rule enters a buyer-message trace.
- [ ] Cover both patterns: buyer quote → constraint → offer check, and document line → cost/price → economics calculation.
- [ ] Implement the pure adapter from existing extraction/document records. Do not infer a new fact in this layer.
- [ ] Add an assertion that missing or invalid provenance suppresses the trace rather than inventing one.

**Commit:** `feat: derive source-to-decision traces`

### Task 2.2: Render one accessible trace component

**Files:**
- Create: `components/evidence/source-decision-trace.tsx`
- Modify: `app/deals/[dealId]/understand/page.tsx`
- Modify: `components/commercial-memory/deal-evidence.tsx`
- Test: `tests/components/source-decision-trace.test.tsx`
- Test: `e2e/journey.spec.ts`

- [ ] Write a failing render test for three semantic columns: **Source**, **Understood as**, **Used to**; on narrow screens they must read in that order as stacked rows.
- [ ] Add accessible text that communicates the connections without relying on arrows or colour.
- [ ] Replace the default Understand constraint bullets and separate evidence explanation with this visual. Keep full messages and evidence offsets behind **View source**.
- [ ] Reuse the same component for business-document lineage instead of creating a separate lineage chart.
- [ ] Verify one source is highlighted when **View source** is activated and keyboard focus moves to it.

**Commit:** `feat: show evidence-to-decision mapping`

---

# Phase 3 — Document-assisted economics simplification

### Task 3.1: Create document-summary view models

**Files:**
- Create: `lib/document-review.ts`
- Modify: `components/commercial-memory/commercial-memory-panel.tsx`
- Modify: `components/economics/economics-editor.tsx`
- Test: `tests/commercial-memory/document-review.test.ts`
- Test: `tests/commercial-memory/economics-actions.test.ts`

**Required states:**

- Default: **Your offers use prices and costs from {n} active business documents.**
- Match: **{n} values found. All already match your saved prices and costs.**
- Difference: **{n} changes found**, followed only by changed fields.

- [ ] Write failing tests for active/replaced/withdrawn grouping and exact match/difference counts.
- [ ] Ensure the comparison uses normalized stored values while each displayed change retains its verbatim source line through `SourceTrace`.
- [ ] Move replaced and withdrawn sources under **Document history**.
- [ ] When all values match, show only **Done** and **Review extracted values**; do not show the full editor by default.
- [ ] When values differ, show only the differences and **Review these changes**; reveal the editor only after that action.
- [ ] Verify accepting or rejecting changes uses the existing economics actions and version activation. No document parser or economics rule changes.

**Commit:** `refactor: focus document-assisted economics review`

### Task 3.2: Verify document UX at all widths

**Files:**
- Modify: `app/globals.css` only for scoped document styles
- Test: `e2e/journey.spec.ts`

- [ ] Add browser coverage for default, all-match and differences states.
- [ ] Assert source lineage appears once, not beside a duplicate source list.
- [ ] Assert withdrawn sources are absent from the default view and present in Document history.
- [ ] At 390px, verify the change table becomes labelled value pairs rather than a horizontally scrolling table.

**Commit:** `test: cover focused document economics flow`

**Phase gate:** Inspect the economics page without demo controls. A first-time merchant should see active sources and the next decision, not documents, eight checkboxes and the full editor simultaneously.

---

# Phase 4 — Offer transformation and recommendation hierarchy

### Task 4.1: Derive original-to-adaptive transformation data

**Files:**
- Create: `lib/deal-transformation.ts`
- Test: `tests/lib/deal-transformation.test.ts`
- Reuse: `lib/offer-copy.ts`
- Reuse: existing baseline and selected-offer records

**Interface:**

```ts
type DealTransformation = {
  original: { totalPaise: number; scopeLabel: string; durationLabel: string; approvalLabel: string };
  adaptive: { totalPaise: number; scopeLabel: string; durationLabel: string; approvalLabel: string };
  changes: Array<"scope" | "timing" | "payment_split" | "approval">;
  economicsChanged?: { fromVersion: number; toVersion: number; contributionDeltaPaise: number };
};
```

- [ ] Write failing tests using the hero, preserve-scope and no-fit cases. Every amount must trace to the baseline or selected engine result.
- [ ] Prove the adapter reports only actual changes. It must not claim scope, timing or approval changed when values are equal.
- [ ] Prove a merchant cost update changes only the economics state unless the resulting selected offer actually changes.
- [ ] Implement without mutating the stored result or recomputing commercial logic.

**Commit:** `feat: derive deal transformation summary`

### Task 4.2: Replace duplicated Offer prose with the transformation card

**Files:**
- Create: `components/offer/deal-transformation.tsx`
- Modify: `components/offer/recommendation.tsx`
- Modify: `components/offer/money-split.tsx`
- Modify: `app/deals/[dealId]/offer/page.tsx`
- Modify: `components/audit/sections.tsx`
- Delete dead export if unused: `SuccessMeasure` in `components/offer/recommendation.tsx`
- Test: `tests/lib/offer-stage.test.ts`
- Test: `tests/lib/offer-copy.test.ts`
- Test: `e2e/journey.spec.ts`

- [ ] Write a failing render test for the two-column/stacked comparison: **Original quote** → **Adaptive offer**, including total, scope, timing/payment split and approval implication.
- [ ] Make the hero comparison communicate: ₹1,41,600 full annual quote needing buyer approval → ₹46,020 three-month urgent work the buyer can approve. Values must come from the view model.
- [ ] Place the retained money-split immediately below the comparison and rename its four labels to the approved plain language.
- [ ] Remove the old default standard-quote comparison and any recommendation text that repeats the same changed facts.
- [ ] Keep one **Why this offer** explanation. Keep **See other ways to do this deal** collapsed.
- [ ] Move recorded model order/reason out of the recommendation information button into audit details. The default Offer view may show truthful provenance for the currently displayed explanation, but not historical model order.
- [ ] Delete the unused `SuccessMeasure` component only after an import search proves it is dead; update the obsolete test instead of preserving dead UI.
- [ ] Render `economicsChanged` inside the same transformation card when applicable; do not add another chart.

**Commit:** `refactor: lead offer with quote-to-offer transformation`

### Task 4.3: Protect recommendation focus on mobile

**Files:**
- Modify: scoped Offer styles in `app/globals.css`
- Modify if needed: `components/offer/preview-actions.tsx`
- Test: `e2e/journey.spec.ts`

- [ ] Verify the transformation stacks in reading order at 390px and remains side-by-side where space permits.
- [ ] Keep the single primary **Review buyer proposal** action reachable through the existing sticky mobile action area.
- [ ] Assert exact figures remain available under calculation details and rounded forecasts are used in the default view.

**Commit:** `fix: keep offer decision focused on mobile`

---

# Phase 5 — Buyer proposal and revision hierarchy

### Task 5.1: Put the contractual decision in the first viewport

**Files:**
- Modify: `components/proposal-content.tsx`
- Modify: `app/proposal/[agreementId]/[version]/page.tsx`
- Modify: `lib/proposal-copy.ts`
- Test: `tests/lib/proposal-copy.test.ts`
- Test: `e2e/journey.spec.ts`

- [ ] Add failing tests for the buyer summary order: merchant, concise scope, **amount now + amount on date**, work period, included scope, payment details, authority, actions.
- [ ] Move GST arithmetic, detailed mandate language and post-acceptance explanation into labelled disclosures.
- [ ] Keep included and excluded scope explicit; never hide a contractual exclusion.
- [ ] Rewrite the authority confirmation in plain language while preserving the independent-purchase meaning.
- [ ] Confirm the first viewport at 390px answers who, what, how much and when before the primary action.

**Commit:** `refactor: focus buyer proposal on the decision`

### Task 5.2: Show revision differences before the full proposal

**Files:**
- Modify: `components/proposal-content.tsx`
- Reuse: `lib/amendment-diff.ts`
- Test: `tests/lib/amendment-diff.test.ts`
- Test: `e2e/journey.spec.ts`

- [ ] Add a failing test for the hero revision: **Payment date changed**, ₹23,010 moves 1 Dec → 21 Dec, and price/scope/payment authorisation remain unchanged.
- [ ] Render **Accept new date**, **Request another change** and **View full revised proposal** in that order.
- [ ] If more than one contractual field changed, generate a truthful list of changes rather than using the date-only copy.
- [ ] Verify agreement-version and hash checks remain exactly where the existing service enforces them.

**Commit:** `refactor: lead revisions with the contractual difference`

---

# Phase 6 — Negotiation as a staged decision

### Task 6.1: Derive the negotiation decision view

**Files:**
- Create: `lib/negotiation-view.ts`
- Reuse: `domain/corridor.ts`
- Reuse: counter-offer actions in `lib/service.ts`
- Test: `tests/lib/negotiation-view.test.ts`

**States:**

1. Choose response: buyer request, lowest total within rules and current offer.
2. Check amount: contribution plus failed/passed rule summary.
3. Confirm exception: exact failed rules, required reason and explicit statement that the engine result remains outside rules.

- [ ] Write failing tests for ₹40,000 requested, ₹41,418 compliant minimum and ₹46,020 current offer using engine-derived records.
- [ ] Cover a compliant request, a rule-breaking profitable request and a loss-making request.
- [ ] Prove no price counter is offered for non-price change-request topics.
- [ ] Prove checking an amount never changes the engine's stored verdict or marks it approvable.

**Commit:** `feat: derive staged negotiation decisions`

### Task 6.2: Rebuild negotiation UI and corridor

**Files:**
- Modify: `components/track/negotiation-corridor.tsx`
- Modify: `components/track/counter-form.tsx`
- Modify: `app/deals/[dealId]/track/page.tsx`
- Test: `tests/lib/corridor-service.test.ts`
- Test: `tests/lib/counter-offer-service.test.ts`
- Test: `e2e/journey.spec.ts`

- [ ] Replace the overloaded form with state 1 actions: **Offer {safe minimum}**, **Check {buyer amount}**, **Keep {current amount}**, **Handle outside Adaptive Deals**, **Leave request open**.
- [ ] Render one horizontal/stacked corridor with three labelled anchors: buyer asked, lowest within rules, current offer. Add approved discount stops only when they exist.
- [ ] Make the corridor semantic: labels and values remain understandable without bar position or colour.
- [ ] In state 2, show contribution/loss and the first failed rule; keep all checks behind **See all checks**.
- [ ] In state 3, require one exception reason, remove any duplicate general note field and label the final action **Review {amount} counter-offer**.
- [ ] Keep buyer request open until a counter or different offer is successfully delivered, preserving existing service behavior.
- [ ] Verify Back returns without mutating the request and editing the amount invalidates the earlier check.

**Commit:** `refactor: turn negotiation into a staged decision`

**Phase gate:** Review the price, date, scope and free-text request flows. Confirm only price requests enter this journey and every exception remains visibly outside rules.

---

# Phase 7 — One truthful agreement and payment timeline

### Task 7.1: Build a pure timeline view model

**Files:**
- Create: `lib/payment-timeline.ts`
- Reuse: `lib/track-copy.ts`
- Reuse: current notices, attempts, links, mandate, amendments and deliveries
- Test: `tests/lib/payment-timeline.test.ts`

**Interface:**

```ts
type TimelineItem = {
  id: string;
  at: string;
  label: string;
  detail?: string;
  state: "completed" | "current" | "future" | "replaced" | "failed" | "waiting";
  sourceIds: string[];
};
```

- [ ] Write failing tests for initial acceptance/setup, paid upfront, notice, moved payment, revised acceptance, processing, paid and retry paths.
- [ ] The preventive hero must read as one sequence: 1 Nov paid → 28 Nov reminder → 1 Dec moved/replaced → 21 Dec new payment.
- [ ] A failed attempt remains visible as failed history and never blocks completed status once verified collections cover the contract total.
- [ ] A removed/replaced attempt cannot appear as scheduled or due.
- [ ] Implement by adapting existing records; do not create timeline-only state.

**Commit:** `feat: derive agreement payment timeline`

### Task 7.2: Replace repeated schedule and event blocks

**Files:**
- Create: `components/track/payment-timeline.tsx`
- Modify: `components/track/collection-flow.tsx`
- Modify: `components/track/current-agreement.tsx`
- Modify: `app/deals/[dealId]/track/page.tsx`
- Test: `e2e/journey.spec.ts`

- [ ] Render status through text, icon/shape and colour; use `<ol>` so reading order is semantic.
- [ ] Replace the default payment schedule and repeated “what happened” payment rows with this visual.
- [ ] Keep the full conversation, raw event history, calculation details and outcome records in disclosures/audit.
- [ ] Keep one current-state sentence and one next action/waiting expectation above the timeline.
- [ ] Verify the Track default view contains no duplicate payment event in another visible card.

**Commit:** `refactor: unify agreement and payment progress`

---

# Phase 8 — Stable six-step walkthrough

### Task 8.1: Replace optional-count logic with one six-step core journey

**Files:**
- Modify: `lib/walkthrough.ts`
- Modify: `components/walkthrough/walkthrough-progress.tsx`
- Modify: `components/walkthrough/walkthrough.tsx`
- Test: `tests/lib/walkthrough.test.ts`
- Test: `tests/components/walkthrough-copy.test.ts`

**Core steps:**

1. Business economics.
2. Buyer situation.
3. Understand and clarify.
4. Review and send.
5. Buyer accepts and collection is set up.
6. Buyer moves a payment before failure.

- [ ] Write failing tests proving the core journey always says **Step n of 6** and ends after the preventive payment move.
- [ ] Move negotiation and no-fit to named optional explorations outside the six-step counter.
- [ ] Reduce each step contract to title, one value sentence, one action and Hide. Remove repeated actor/action/instruction labels.
- [ ] Ensure demo controls may simulate buyer/system events but never make merchant approval or buyer acceptance decisions.

**Commit:** `refactor: make walkthrough a stable six-step journey`

### Task 8.2: Make the coach responsive without shrinking the product

**Files:**
- Modify: `components/walkthrough/walkthrough.tsx`
- Modify: `components/walkthrough/walkthrough-launcher.tsx`
- Modify: `app/globals.css`
- Test: `e2e/journey.spec.ts`

- [ ] At ≥1280px keep the 360px side panel.
- [ ] At 768–1279px use a floating coachmark positioned over unused space; do not reduce the merchant frame width.
- [ ] Below 768px use a collapsed bottom sheet with the action visible when expanded.
- [ ] Implement **Show me** so it scrolls to, focuses and temporarily highlights the target without activating it.
- [ ] Add Playwright checks at 390px, 1024px and 1440px for no covered primary action, stable progress and keyboard close/reopen.

**Commit:** `feat: make walkthrough responsive and contextual`

---

# Phase 9 — Presenter, audit and typography cleanup

### Task 9.1: Separate demo controls from evidence and integrity

**Files:**
- Modify: `app/presenter/page.tsx`
- Modify or create: `components/presenter/presenter-tabs.tsx`
- Modify: `components/audit/sections.tsx`
- Test: `e2e/journey.spec.ts`

- [ ] Add two presenter tabs: **Demo controls** and **Evidence and integrity**.
- [ ] Move recorded model order/reason, run records, hashes, raw events and complete applied-rule evidence to Evidence and integrity.
- [ ] Keep the deal audit drawer read-only and scoped to the current deal; it must not become the presenter controls page.
- [ ] Verify the merchant product remains understandable with the demo bar hidden and no default card exposes raw hashes or model-history internals.

**Commit:** `refactor: separate presenter controls from evidence`

### Task 9.2: Perform a scoped typography and density pass

**Files:**
- Modify: `app/globals.css`
- Modify only affected components from Phases 2–9
- Test: `e2e/journey.spec.ts`

- [ ] Audit every redesigned screen for 12px/13px muted copy. Promote information required for a decision to at least 14px and sufficient contrast.
- [ ] Remove labels that repeat the card heading, banner or button.
- [ ] Preserve compact metadata only inside disclosures/audit.
- [ ] At 200% zoom and 390px, verify no clipped actions, overlapping text or horizontal page scroll.
- [ ] Run an accessibility pass for headings, form labels, disclosure names, focus order and reduced-motion behavior.

**Commit:** `style: improve decision-screen readability`

---

# Phase 10 — Cross-persona verification and release evidence

### Task 10.1: Add end-to-end acceptance journeys

**Files:**
- Modify: `e2e/journey.spec.ts`
- Modify if the suite supports it: screenshot helper/config

- [ ] Merchant founder: case selection → evidence mapping → clarification → transformed offer → preview/send → accepted Track → setup → preventive move.
- [ ] Buyer: initial proposal decision, request lower price, receive counter/different offer, revision acceptance and decline paths.
- [ ] No-fit: actual failed start-date check → explicit supported closure reason → closed summary.
- [ ] Document economics: active source summary → matching values; differences → review changes → version activation → offer economics-changed state.
- [ ] Audit: recorded model history appears only in audit/presenter evidence, never as the reason for the code-ranked recommendation.
- [ ] Walkthrough hidden: every product journey remains usable without tutorial controls.
- [ ] Responsive matrix: 390px, 1024px and 1440px.
- [ ] Capture new screenshots under new names after all assertions pass.

**Commit:** `test: verify focused cross-persona journeys`

### Task 10.2: Final regression and boundary checks

**Files:**
- Modify docs only if the verified UI changed a documented statement:
  - `README.md`
  - `PRODUCT_DECISIONS.md`
  - `AI_BUILD_LOG.md`

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint` and read the full output.
- [ ] Run `npm run build`.
- [ ] Run `npm run test:e2e` on the default Next.js build.
- [ ] Run `npm run check:release -- --build`.
- [ ] Verify protected/frozen files and recorded-run hashes are unchanged.
- [ ] Reset the seeded product and manually walk the complete six-step flow once without the presenter page.
- [ ] Verify no screen renders both an old text/table explanation and its replacement visual.
- [ ] Verify there are exactly five user-facing visual patterns in scope: trace, transformation, money split, corridor and timeline.
- [ ] Record any remaining applicant-owned release placeholders; do not write first-person applicant judgement on the user's behalf.

**Commit:** `docs: align product evidence with focused UX`

---

# Recommended execution order and review gates

1. **Gate A — Truth:** Phase 0–1. Review status correctness before visual work.
2. **Gate B — Merchant comprehension:** Phase 2–4. Review the evidence trace, document flow and transformation plus money split.
3. **Gate C — Mutual decision:** Phase 5–6. Review buyer hierarchy and staged negotiation.
4. **Gate D — Progress and demo:** Phase 7–9. Review timeline and all three walkthrough breakpoints.
5. **Gate E — Release:** Phase 10 only after all earlier gates are accepted.

Do not combine the five visual tasks into one large commit. Their view models and tests are deliberately separate so any visual that fails to reduce cognitive load can be removed without reverting the rest of the redesign.
