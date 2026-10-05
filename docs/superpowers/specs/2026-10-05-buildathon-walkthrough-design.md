# Buildathon product walkthrough — design specification

**Date:** 5 October 2026  
**Status:** conversational direction approved; awaiting review of this written specification. Product code must not change until this specification and its implementation plan are approved.  
**Baseline:** `ae29de6` on `codex/persona-p0`.

---

## 1. Purpose

Replace the compact presenter-style demo bar with a walkthrough that behaves like onboarding in a real product. A Razorpay judge should always know:

1. where they are in the story;
2. what action to take next;
3. what product judgment to notice;
4. whether the current action belongs to the merchant, the simulated buyer, the system, Groq, or deterministic code.

The walkthrough surrounds the real merchant and buyer experiences. It does not become a second product, execute merchant decisions, or contain copied commercial results.

### 1.1 Success criteria

- A first-time judge can complete the canonical buildathon journey without verbal coaching.
- The walkthrough shows one instruction and one primary walkthrough action at a time.
- The merchant product remains fully usable when the walkthrough is hidden.
- Back, Next and **Take me there** never approve terms, accept a price, close a deal or create an invoice.
- Simulated buyer and system actions are always labelled before execution.
- The walkthrough resumes from domain state after reload or after the user takes a different valid route.
- The guide credits AI, code, engine, merchant and buyer separately.
- Desktop and 390 px mobile layouts remain usable without horizontal overflow.

---

## 2. Product boundary

### 2.1 Included

- A first-visit welcome card on `/deals` with **Start walkthrough** and **Explore on my own**.
- A collapsible walkthrough drawer on desktop and bottom sheet on mobile.
- A versioned step registry resolved from the current `DemoState`, `DealProgress`, route and supported capabilities.
- Progress such as `2 of 7`, a completed-step checklist, Back, Next and **Take me there**.
- A short **What to notice** explanation for every step.
- Spotlight treatment for the relevant product region using stable walkthrough anchors.
- Labelled simulated buyer choices and system events when the current step requires them.
- Restart and hide controls.
- A permanent **Walkthrough** entry in the merchant header so the experience can be replayed.
- Compatibility points for the later live-Groq customisation and negotiated-invoice features.

### 2.2 Not included

- Any new AI prompt, model call, commercial calculation or recommendation.
- Hardcoded AI output or financial figures in walkthrough copy.
- Automatic merchant approval, merchant price acceptance, agreement activation or invoice creation.
- A presenter dashboard, raw audit data, model logs or scenario debugging inside the walkthrough.
- Analytics claims about completion, conversion or recovered revenue.
- Persistent multi-deal progress.

The presenter page remains available for debugging and audit preparation, but it is not part of the judge journey.

---

## 3. Experience

### 3.1 Entry

On the first visit to `/deals`, show a non-blocking welcome card:

> **See how Adaptive Deals turns buyer constraints into executable terms**  
> Follow a guided product walkthrough. You will make the merchant decisions; buyer and system events are clearly simulated.

Actions:

- **Start walkthrough** — opens the case selector at step 1.
- **Explore on my own** — dismisses the welcome card for this walkthrough version.

The header exposes **Walkthrough** at all times. Opening it resumes the current journey rather than restarting it.

### 3.2 Desktop

The walkthrough appears as a 340–380 px drawer on the right. The merchant product remains visible and usable beside it. The drawer contains, in this order:

1. `DEMO WALKTHROUGH · STEP X OF Y`;
2. step title;
3. one short instruction;
4. **What to notice**;
5. the step's single walkthrough action;
6. Back, Next and Hide;
7. the collapsed completed-step checklist.

The relevant product card receives a quiet blue outline and an accessible `aria-describedby` link to the current instruction. No full-screen mask obscures financial terms or buyer evidence.

### 3.3 Mobile

At widths below the existing desktop breakpoint, the guide becomes a bottom sheet with a compact sticky header. Expanding it shows the same instruction and actions. It must never cover the product's primary action; the page scroll target accounts for the sheet height.

### 3.4 Walkthrough actions

- **Take me there** navigates to the route containing the current product action and scrolls to its anchor.
- **Next** advances only when the state resolver says the current learning step is complete. It cannot mutate deal state.
- **Back** reviews an earlier explanation; it does not rewind domain state.
- **Simulate buyer response** shows the structured buyer choices before applying one.
- **Simulate system event** names the exact event before applying it.
- Merchant steps say **Complete this in the product** and point to the real product button.

---

## 4. Canonical walkthrough

The registry supports capability-gated steps. The current build can ship the shell against the existing journey; later approved features contribute their steps without rewriting the controller.

| Step | Learning objective | Walkthrough behavior | Product action |
|---|---|---|---|
| 1. Choose a case | Different buyer constraints should create different decisions. | Navigates to `/deals` and spotlights the cards. | Merchant deliberately starts a case. |
| 2. Understand the buyer | Groq extracts constraints with evidence; code preserves unsupported uncertainty. | Shows the run provenance and spotlights conversation/evidence. When live customisation is implemented, this step exposes **Run Groq analysis** and its live or exact-saved status. | Merchant reviews and sends clarification questions. |
| 3. Resolve customisation | Price, scope, timing and payment choices are explicit, with an optional note. | Later feature contribution displays the structured buyer choice and labels the simulated buyer action. | Merchant reviews the interpreted request. |
| 4. Review the commercial decision | AI explains; deterministic code calculates GST, feasibility and economics. | Spotlights recommendation, attribution and policy exception. | Merchant previews the chosen proposal. |
| 5. Negotiate | Buyer and merchant can accept, counter or decline; suggestions do not override humans. | Later feature contribution can simulate a buyer proposal or response. | Merchant accepts, counters or declines in the product. |
| 6. Confirm exact terms | Mutual agreement binds the amount, GST basis, scope and schedule to one hash. | Spotlights the final terms and both human acceptances. | Merchant performs the final approval. |
| 7. Create the Razorpay test invoice | The invoice comes from the exact agreed terms. | Spotlights test-mode status, invoice ID, amount and link. | Merchant clicks **Create Razorpay test invoice** in the product. |

If a capability is not implemented yet, its contributed step is absent. The guide reports the actual step count, never an empty or “coming soon” step.

### 4.1 Current preventive journey

Until negotiation and invoice creation are implemented, the existing payment setup and preventive restructuring steps remain available as optional depth after the core walkthrough. They appear under **Explore another product capability**, not as mandatory steps in the main count.

---

## 5. Architecture

### 5.1 Pure resolver

Create a pure walkthrough resolver that consumes:

```ts
interface WalkthroughContext {
  state: DemoState;
  progress: DealProgress;
  route: string;
  capabilities: WalkthroughCapabilities;
}
```

It returns:

```ts
interface WalkthroughView {
  version: "buildathon.v1";
  steps: WalkthroughStep[];
  currentStepId: string;
  completedStepIds: string[];
  actionAvailable: boolean;
}
```

Each `WalkthroughStep` contains identity, actor, title, instruction, what-to-notice copy, destination, stable anchor ID and at most one labelled simulation command. It contains no AI answer, copied engine result or commercial figure.

The current step comes from product state first and the current route second. Local browser state stores only whether the guide is open, whether the welcome card was dismissed and which already-completed explanation the user is reviewing.

### 5.2 Step contributions

The tutorial controller owns navigation and presentation. Product capabilities own their step definitions:

- case picker and Understand contribute selection and extraction steps;
- Offer contributes decision review;
- negotiation will contribute price proposal and mutual acceptance;
- invoice integration will contribute test-invoice creation;
- Track contributes optional preventive restructuring depth.

This prevents the walkthrough from becoming coupled to one fixed hero output.

### 5.3 Stable anchors

Product regions expose semantic `data-walkthrough` IDs such as:

- `case-picker`
- `buyer-conversation`
- `constraint-evidence`
- `commercial-recommendation`
- `negotiation`
- `final-terms`
- `test-invoice`

The drawer scrolls to anchors after route navigation. Tests fail when a registered target is missing from a state in which it should be available.

### 5.4 Mutations

Reuse the existing mutation endpoint for labelled buyer and system simulations. The walkthrough allowlist contains buyer or system actions only. Merchant actions are structurally impossible to dispatch from the controller.

Restart uses the current case's existing atomic reset, preceded by an explicit confirmation that unfinished demo progress will be removed.

---

## 6. Provenance and AI states

The walkthrough displays the same provenance as the product and never invents its own:

- `Live Groq response`
- `Saved Groq response · exact input match`
- `Deterministic engine calculation`
- `Merchant decision`
- `Simulated buyer action`
- `Razorpay Test Mode`

The later live-AI feature defines exact-cache eligibility using normalised inputs, prompt version, merchant policy, templates and engine result. This walkthrough only renders the resulting provenance. It never decides that a saved response is eligible.

If Groq is unavailable and there is no exact saved response, the AI step remains incomplete and offers **Retry AI**. The walkthrough does not substitute synthetic wording.

---

## 7. Error handling and alternate paths

- If the user navigates away, the guide retains the current learning objective and offers **Take me there**.
- If the user completes a valid alternative action, the resolver advances from domain state.
- If a target is temporarily unavailable, the guide states the blocking product action instead of silently skipping it.
- If a simulation fails, show the product error in the guide and retain the same step.
- If the saved state requires migration review, the guide routes to **Inspect records** and blocks commercial continuation.
- If the merchant declines or no structure is feasible, the guide ends with an honest outcome summary rather than pushing toward invoicing.
- If the guide's local version changes, dismissal state resets for the new walkthrough version; deal state does not reset.

---

## 8. Accessibility and trust

- Drawer and bottom sheet use dialog/region semantics without trapping focus while the product must remain actionable.
- Opening the guide moves focus to its heading; **Take me there** moves focus to the product target.
- All controls work by keyboard and have visible focus.
- Progress is announced as text, not conveyed by colour alone.
- Spotlight animation respects reduced-motion settings.
- Simulated buyer/system controls include actor and consequence in their accessible names.
- Hiding the guide removes every walkthrough highlight.

---

## 9. Verification

### 9.1 Unit and integration

- Pure resolver returns the correct step for every current `DealProgress` rule.
- Completed explanations cannot mutate or rewind domain state.
- Walkthrough dispatch rejects every merchant-owned action.
- Capability gating changes the count without leaving empty steps.
- Local dismissal/resume state is versioned and does not store commercial data.
- Every registered active anchor exists in its supported state.

### 9.2 Browser

- First visit: welcome → start → case selection.
- Judge completes the canonical flow using the walkthrough with no verbal instruction.
- Merchant decisions are clicked only inside the product.
- Simulated buyer and system actions show their labels before mutation.
- Reload and off-route navigation resume correctly.
- Hide leaves the complete product usable.
- Restart warns, resets only the active case and returns to step 1.
- Keyboard journey and 390 px bottom sheet have no horizontal overflow.
- No live model call occurs in automated tests.

### 9.3 Release check

- No tutorial string contains a hardcoded recommendation, price, contribution, invoice ID or model confidence.
- Presenter-only controls and raw run data remain outside the walkthrough.
- Existing frozen evaluation and historical live-run assets remain unchanged.

---

## 10. Delivery sequence

1. Build the walkthrough shell, resolver, welcome card, navigation, anchors and current-journey coverage.
2. Replace the existing bar after browser parity is proven; retain the presenter page separately.
3. Add live-AI customisation steps when that subsystem's contract is approved.
4. Add negotiation and Razorpay test-invoice steps when those subsystem contracts are approved.
5. Record the final buildathon walkthrough only after all enabled steps pass the full release gate.

This sequence keeps the walkthrough reusable and prevents it from hardcoding features that do not yet exist.
