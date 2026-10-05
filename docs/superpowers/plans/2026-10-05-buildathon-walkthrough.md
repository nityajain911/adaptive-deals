# Buildathon Product Walkthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense demo bar with a resumable, product-style walkthrough that guides a judge through the real Adaptive Deals experience without executing merchant decisions or hardcoding commercial outputs.

**Architecture:** Add a pure resolver that turns current deal state into learning objectives and one next walkthrough action. A server wrapper supplies the resolved view to a client drawer/bottom sheet; the client owns only display preferences and route/spotlight behavior. Existing buyer and system simulations remain available through a narrow typed command boundary, while all merchant decisions remain in the product.

**Tech Stack:** Next.js 16.3.8 App Router, React 19, TypeScript 5, Tailwind CSS 4, Zod 4, Vitest 5, Playwright 1.63, existing local JSON demo store.

**Spec:** `docs/superpowers/specs/2026-10-05-buildathon-walkthrough-design.md`

## Global Constraints

- Work in `/Users/nityajain/Documents/Resolve Razorpay/adaptive-deals-build/adaptive-deals/.worktrees/persona-p0` on `codex/persona-p0`.
- Read `AGENTS.md` and the relevant Next.js 16.3.8 guides under `node_modules/next/dist/docs/` before changing layouts, navigation or client boundaries.
- Product code stays fully usable with the walkthrough hidden.
- Back, Next and **Take me there** never approve terms, accept a price, close a deal or create an invoice.
- The walkthrough contains no copied AI answer, recommendation, price, contribution, invoice ID or model confidence.
- Only labelled buyer and system simulations can mutate state from the walkthrough.
- Product state determines progress; local browser storage contains display preferences only.
- The guide uses a 340–380 px desktop drawer and a bottom sheet below the existing desktop breakpoint.
- Current capabilities appear in the step count; unimplemented live customisation, negotiation and invoice steps are absent.
- Frozen evaluation, historical run records, prompts, engine rules and payment rules remain unchanged.
- Preserve the user-owned screenshots `artifacts/ui-review/desktop-5-change-requested.png` and `artifacts/ui-review/desktop-7-other-outcomes.png`.
- No external model call occurs in this plan.
- Use test-first changes and one focused commit per task.

## Review Focus

1. **Fresh store versus deliberate case start:** a default seed must still show case selection, while a `start_case` action must advance the learning objective — covered in Task 2.
2. **Off-route and reload recovery:** the guide must keep the domain-derived objective and offer **Take me there**, rather than regress from the URL — covered in Tasks 1 and 5.
3. **Mutation authority:** no UI refactor may make a merchant-owned API action reachable through walkthrough dispatch — covered in Task 4.
4. **Unsupported or terminal outcomes:** no feasible, outside templates, merchant closed and buyer declined must end honestly without an invoice-oriented next step — covered in Tasks 1 and 5.
5. **Mobile obstruction and keyboard focus:** the bottom sheet must not cover the product primary action, and focus must move predictably between guide and target — covered in Tasks 3 and 5.

---

### Task 1: Pure walkthrough resolver and capability registry

**Files:**
- Create: `lib/walkthrough.ts`
- Create: `tests/lib/walkthrough.test.ts`
- Read/Reuse: `lib/demo-steps.ts`
- Read/Reuse: `lib/progress.ts`

**Interfaces:**
- Consumes: `DemoState`, `DealProgress`, existing `nextDemoStep(state, progress, dealId)` and `replyContext(state)`.
- Produces:
  - `WALKTHROUGH_VERSION = "buildathon.v1"`.
  - `WalkthroughCapability = "case_picker" | "current_offer" | "preventive_depth" | "live_customisation" | "negotiation" | "test_invoice"`.
  - `WalkthroughActor = "merchant" | "buyer" | "system" | "ai" | "engine"`.
  - `WalkthroughObjective` with `id`, `actor`, `title`, `instruction`, `notice`, `href`, `anchorId`, `optional` and `capability`.
  - `WalkthroughProvenance = "live_groq" | "saved_groq_exact_match" | "deterministic_engine" | "merchant" | "simulated_buyer" | "razorpay_test_mode"`.
  - `WalkthroughView` with `version`, `objectives`, `currentObjectiveId`, `completedObjectiveIds`, `currentAction`, `terminalOutcome`, `provenance` and `stepLabel`.
  - `walkthroughView(args: { state: DemoState; progress: DealProgress; dealId: string; capabilities: ReadonlySet<WalkthroughCapability> }): WalkthroughView`.
  - `walkthroughCapabilities(): ReadonlySet<WalkthroughCapability>` returning only currently shipped capabilities.

- [ ] **Step 1: Write the failing resolver tests**

Add named tests for:

- a fresh seeded store resolves to `choose_case`;
- a state containing a `case_started` event resolves to `understand_buyer`;
- Understand, Offer, sent-awaiting-buyer and buyer-setup states map to their correct current objectives and action actors;
- preventive restructuring is optional and excluded from the core count;
- `no_feasible_deal`, `outside_templates`, merchant closed and buyer declined return honest `terminalOutcome` copy with no invoice objective;
- unimplemented capabilities never appear in `objectives` or the step count;
- provenance is copied from existing product/run state and never inferred from the route or tutorial history;
- serialised objectives contain none of `/₹|contribution|invoice_[A-Za-z0-9]|model confidence/i`.

- [ ] **Step 2: Run the focused test and verify the module is missing**

Run: `npm test -- tests/lib/walkthrough.test.ts`  
Expected: FAIL because `lib/walkthrough.ts` does not exist.

- [ ] **Step 3: Implement the registry and resolver**

Keep learning objectives coarser than `DemoStep`: group existing question/reply actions under `understand_buyer`, offer actions under `review_decision`, sent/acceptance actions under `confirm_terms`, and payment setup under `setup_collection`. Reuse `nextDemoStep` only for the single current action; do not duplicate its financial or state logic. Domain state selects the current objective. Route is applied second in the client presentation layer only to decide whether to show **Take me there**; navigating to another route must never move progress backwards.

The current shipped capability set is `case_picker`, `current_offer`, `preventive_depth`. Future capabilities are type-safe but disabled.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- tests/lib/walkthrough.test.ts tests/lib/demo-steps.test.ts tests/lib/progress.test.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/walkthrough.ts tests/lib/walkthrough.test.ts
git commit -m "feat: derive buildathon walkthrough state"
```

---

### Task 2: Truthful case start and versioned first-visit state

**Files:**
- Modify: `lib/service.ts`
- Modify: `tests/lib/case-store.test.ts`
- Create: `components/walkthrough/welcome.tsx`
- Create: `components/walkthrough/preferences.ts`
- Create: `tests/components/walkthrough-preferences.test.ts`
- Modify: `app/deals/page.tsx`

**Interfaces:**
- Consumes: Task 1's `WALKTHROUGH_VERSION` and the existing atomic `startCase`/`resetToSeed` behavior.
- Produces:
  - `startCase(caseId)` records `case_started` with merchant provenance after the fresh state is constructed and before its atomic write.
  - `WalkthroughPreferences = { version: "buildathon.v1"; dismissedWelcome: boolean; open: boolean; reviewingObjectiveId: string | null }`.
  - `readWalkthroughPreferences(storage: Pick<Storage, "getItem">): WalkthroughPreferences`.
  - `writeWalkthroughPreferences(storage: Pick<Storage, "setItem">, next: WalkthroughPreferences): void`.
  - `<WalkthroughWelcome />` with **Start walkthrough** and **Explore on my own**.

- [ ] **Step 1: Write failing service and preference tests**

Assert:

- `startCase("reduced-scope")` has exactly one `case_started` event identifying the case;
- reset preserves the selected case but removes `case_started`, so the walkthrough returns to case selection;
- an unknown case leaves the store byte-for-byte unchanged;
- missing, malformed or older-version local data returns `{ version: "buildathon.v1", dismissedWelcome: false, open: false, reviewingObjectiveId: null }`;
- preferences never serialise case ID, buyer data, conversation, amounts or deal status.

- [ ] **Step 2: Run the focused tests**

Run: `npm test -- tests/lib/case-store.test.ts tests/components/walkthrough-preferences.test.ts`  
Expected: FAIL for missing event and preference module.

- [ ] **Step 3: Add the case-start event**

Use the existing event helper and merchant provenance. Do not alter status, clock, run, agreements or case isolation. `resetToSeed` intentionally has no `case_started` event.

- [ ] **Step 4: Implement preferences and welcome card**

Use one localStorage key scoped by `WALKTHROUGH_VERSION`. **Start walkthrough** sets `open: true`, sets `dismissedWelcome: true`, and focuses the future guide heading through the shared open event. **Explore on my own** sets `dismissedWelcome: true` and keeps the guide closed.

Render the welcome card only on `/deals`; it must not block case selection.

- [ ] **Step 5: Run focused tests, typecheck and lint**

Run: `npm test -- tests/lib/case-store.test.ts tests/components/walkthrough-preferences.test.ts && npm run typecheck && npm run lint`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/service.ts tests/lib/case-store.test.ts components/walkthrough/welcome.tsx components/walkthrough/preferences.ts tests/components/walkthrough-preferences.test.ts app/deals/page.tsx
git commit -m "feat: start the walkthrough from case selection"
```

---

### Task 3: Responsive drawer, launcher and stable product anchors

**Files:**
- Create: `components/walkthrough/walkthrough.tsx`
- Create: `components/walkthrough/walkthrough-server.tsx`
- Create: `components/walkthrough/walkthrough-launcher.tsx`
- Create: `components/walkthrough/walkthrough-progress.tsx`
- Modify: `components/merchant-header.tsx`
- Modify: `app/deals/page.tsx`
- Modify: `app/deals/[dealId]/layout.tsx`
- Modify: `app/proposal/layout.tsx`
- Modify: `components/deal/case-picker.tsx`
- Modify: `components/conversation-thread.tsx`
- Modify: `components/offer/recommendation.tsx`
- Modify: `app/deals/[dealId]/track/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/components/walkthrough-copy.test.ts`

**Interfaces:**
- Consumes: `WalkthroughView`, `WalkthroughPreferences`, existing `replyContext`, merchant layout, buyer layout and Razorpay-style UI primitives.
- Produces:
  - `<WalkthroughServer dealId: string backHref?: string />`, which calls `loadDeal`, resolves `WalkthroughView`, and passes serialisable data to the client.
  - `<Walkthrough view reply backHref />`, the responsive guide. It uses `usePathname` only to compare the current route with the domain-derived objective destination.
  - `<WalkthroughLauncher />`, which opens/resumes the guide via the versioned local event.
  - stable `data-walkthrough` anchors: `case-picker`, `buyer-conversation`, `constraint-evidence`, `commercial-recommendation`, `final-terms`, and `collection-setup`.

- [ ] **Step 1: Write failing static-copy and structure tests**

Render the drawer with representative views and assert:

- `DEMO WALKTHROUGH`, `STEP X OF Y`, title, instruction and **What to notice** are visible;
- exactly one walkthrough primary action is rendered;
- the current actor is named;
- no hardcoded recommendation, amount, contribution, invoice ID or model confidence appears;
- current enabled objectives have a declared anchor;
- the merchant header includes **Walkthrough**.

- [ ] **Step 2: Run the component test**

Run: `npm test -- tests/components/walkthrough-copy.test.ts`  
Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the server wrapper and client shell**

Desktop: fixed right drawer, 340–380 px, product remains visible. Mobile: bottom sheet with compact sticky header. Include checklist, Back, Next, Hide, Restart and **Take me there**. For the current incomplete objective, Next remains disabled until `WalkthroughView` advances. After Back selects a completed explanation, Next walks forward through completed explanations and then returns to the current objective; neither control changes deal state.

Restart first opens an explicit confirmation. Confirmation sends only the dedicated reset control defined in Task 4, clears `reviewingObjectiveId`, retains the user's open/dismissed display preference and returns to `/deals` so case selection is step 1.

Opening moves focus to the guide heading. **Take me there** navigates with `router.push`, waits for the anchor, scrolls it into view and focuses it. Use `usePathname` only for destination comparison; never derive completion from route history.

- [ ] **Step 4: Add the launcher and anchors**

The header button opens/resumes the guide on merchant routes. Buyer routes receive the guide without merchant navigation and preserve **Back to merchant view**. Add anchors to the nearest existing semantic region; do not wrap or duplicate the underlying content. The Understand step renders only the provenance already stored by the product (for example, live Groq versus replay); the walkthrough never manufactures or upgrades provenance.

When the guide is open, set `data-walkthrough-active="true"` on the current target and remove it on step change, hide and unmount. Add reduced-motion-safe outline/spotlight CSS.

- [ ] **Step 5: Run component tests, typecheck and lint**

Run: `npm test -- tests/components/walkthrough-copy.test.ts && npm run typecheck && npm run lint`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/walkthrough components/merchant-header.tsx app/deals/page.tsx 'app/deals/[dealId]/layout.tsx' app/proposal/layout.tsx components/deal/case-picker.tsx components/conversation-thread.tsx components/offer/recommendation.tsx 'app/deals/[dealId]/track/page.tsx' app/globals.css tests/components/walkthrough-copy.test.ts
git commit -m "feat: add responsive product walkthrough"
```

---

### Task 4: Strict walkthrough action boundary and demo-bar replacement

**Files:**
- Create: `lib/walkthrough-actions.ts`
- Create: `tests/lib/walkthrough-actions.test.ts`
- Modify: `components/walkthrough/walkthrough.tsx`
- Modify: `components/walkthrough/walkthrough-server.tsx`
- Modify: `lib/demo-steps.ts`
- Modify: `tests/lib/demo-steps.test.ts`
- Delete: `components/demo-bar.tsx`
- Delete: `components/demo-bar-server.tsx`

**Interfaces:**
- Consumes: existing `SystemStepId`, `replyContext`, API actions `demo_system_step` and `buyer_reply`.
- Produces:
  - `WalkthroughCommand = { action: "demo_system_step"; stepId: SystemStepId } | { action: "buyer_reply"; inReplyTo: string; scriptId?: string; text?: string } | { action: "reset" }`.
  - `walkthroughCommand(input: unknown): WalkthroughCommand`, which rejects every other action.
  - drawer controls for a labelled system event and structured/typed simulated buyer reply.

- [ ] **Step 1: Write failing authority tests**

Assert that valid system, buyer and reset commands parse. Assert that reset requires the separate confirmed-restart code path in the component. Assert that `start_case`, `send_questions`, `adopt_replies`, `select_option`, `review_buyer_proposal`, `approve_and_send_draft`, `accept_agreement`, `close_by_merchant`, `approve_amendment`, `accept_amendment` and future `create_test_invoice` are rejected.

Assert the current action copy names the actor and consequence before the mutation is enabled.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- tests/lib/walkthrough-actions.test.ts tests/lib/demo-steps.test.ts`  
Expected: FAIL because the command guard does not exist.

- [ ] **Step 3: Implement the command guard and controls**

Validate again in the client immediately before handing the body to `useAction`; do not create a generic walkthrough action prop. The product API retains its own existing Zod validation. The reset command is emitted only by the Restart confirmation handler; it is never derived from a learning objective or simulation step.

Buyer choices show all scripts for the exact awaiting message plus **Type another reply**. The guide labels the action `Simulated buyer response` and retains the step on failure.

- [ ] **Step 4: Remove the old bar**

Replace every `DemoBarServer` render with `WalkthroughServer`, then delete both bar files. Keep `lib/demo-steps.ts` as the lower-level state/action resolver until future capability steps replace it.

- [ ] **Step 5: Run focused tests, typecheck and lint**

Run: `npm test -- tests/lib/walkthrough-actions.test.ts tests/lib/demo-steps.test.ts tests/components/walkthrough-copy.test.ts && npm run typecheck && npm run lint`  
Expected: PASS and no import of `demo-bar` remains.

- [ ] **Step 6: Commit**

```bash
git add lib/walkthrough-actions.ts tests/lib/walkthrough-actions.test.ts components/walkthrough lib/demo-steps.ts tests/lib/demo-steps.test.ts components/demo-bar.tsx components/demo-bar-server.tsx
git commit -m "refactor: replace demo bar with guarded walkthrough"
```

---

### Task 5: End-to-end walkthrough, accessibility and release gate

**Files:**
- Modify: `e2e/journey.spec.ts`
- Create: `e2e/walkthrough.spec.ts`
- Modify: `README.md`
- Modify: `DEMO_SCRIPT.md`
- Modify: `AI_BUILD_LOG.md`
- Modify: `scripts/check-release.ts`
- Modify: `tests/scripts/check-release.test.ts`

**Interfaces:**
- Consumes: the complete walkthrough shell, resolver, anchors and command guard from Tasks 1–4.
- Produces: browser proof that the walkthrough is intuitive, resumable, optional, authority-safe and responsive; release checks preventing hardcoded outputs.

- [ ] **Step 1: Write failing browser journeys**

Add serial journeys for:

1. first visit → welcome → start → select case → Understand;
2. completing the current core journey with instructions from the guide and merchant decisions in the product;
3. navigating away and reloading, then resuming the same domain-derived objective;
4. **Take me there** route navigation and target focus;
5. hide, full product use, and reopen from the header;
6. restart warning and atomic return to case selection;
7. no-feasible and declined terminal outcomes with no invoice-oriented action;
8. keyboard-only guide/product transitions;
9. 390 px bottom sheet, visible product primary action and no horizontal overflow.

Keep the existing no-controls product journey. Replace selectors tied only to the old demo bar; do not weaken its commercial assertions.

- [ ] **Step 2: Add failing release checks**

Scan walkthrough source and rendered copy for hardcoded rupee amounts, recommendation names, contribution, invoice IDs and model confidence. Assert presenter-only strings such as `Run live`, `Fail next send`, raw prompt hash and frozen evaluation remain absent.

- [ ] **Step 3: Run focused browser and release tests**

Run: `npm test -- tests/scripts/check-release.test.ts && ADAPTIVE_E2E_NO_SHOTS=1 npx playwright test e2e/walkthrough.spec.ts`  
Expected: FAIL until the final copy, focus and responsive behaviors are complete.

- [ ] **Step 4: Complete accessibility and error behavior**

Fix only evidenced gaps from Step 3. Ensure the drawer is a labelled region rather than a modal focus trap, target focus is restored, mobile sheet height leaves the product primary action reachable, simulation errors retain the current objective, and migration review routes to **Inspect records**.

- [ ] **Step 5: Update factual documentation**

Document how to start, hide, resume and restart the walkthrough. State that it simulates buyer/system events, never merchant decisions, and contains no hardcoded AI outcome. Keep applicant-owned reflection text untouched.

- [ ] **Step 6: Run the complete verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run test:e2e
npm run check:release
git diff --exit-code ab35c37 -- ai evaluation data/live-runs data/demo-run.json domain/engine.ts domain/checks.ts domain/economics.ts domain/replies.ts
```

Expected: all checks pass; protected paths show no diff. If this environment blocks Turbopack's internal PostCSS worker port, record that exact limitation and use the repository's documented `ADAPTIVE_E2E_WEBPACK=1` fallback without changing production configuration.

- [ ] **Step 7: Perform a visual review**

Open `/deals` at desktop and 390 px widths. Verify one clear walkthrough action, product visibility, active Deals navigation, readable checklist, visible current target, and no overlap with the product primary action. Preserve user-owned screenshots; save any temporary review images outside the tracked artifact directory.

- [ ] **Step 8: Commit**

```bash
git add e2e/journey.spec.ts e2e/walkthrough.spec.ts README.md DEMO_SCRIPT.md AI_BUILD_LOG.md scripts/check-release.ts tests/scripts/check-release.test.ts
git commit -m "test: verify the buildathon walkthrough"
```

- [ ] **Step 9: Request whole-feature review**

Review the diff from `ae29de6`, prioritising merchant authority, resume logic, terminal outcomes, mobile obstruction, hardcoded commercial copy and protected-asset preservation. Fix only evidenced defects, rerun affected tests, then repeat the complete verification once.
