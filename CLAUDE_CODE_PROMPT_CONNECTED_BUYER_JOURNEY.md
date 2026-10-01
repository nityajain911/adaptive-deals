# Claude Code prompt — Connected Buyer Journey

Implement the next build round for **Adaptive Deals by Razorpay** in the existing repository.

The controlling specification for this round is `BUILD_ADDENDUM_CONNECTED_BUYER_JOURNEY.md`. The original `../FREEZE_PACK.md` remains the source of truth for existing commercial rules and safety boundaries. Read both, then read `PRODUCT_DECISIONS.md`, `IMPLEMENTATION_PLAN.md`, `AI_BUILD_LOG.md`, `DEMO_SCRIPT.md`, and `AGENTS.md` before changing anything.

This repository uses a Next.js version with breaking changes. Follow `AGENTS.md`: locate the installed Next package and read the relevant guides under `node_modules/next/dist/docs/` before changing routes, layouts, server/client components, or data mutation code.

## Objective

Build one connected journey:

1. Simulated WhatsApp buyer conversation.
2. Merchant-approved clarification questions and deterministic simulated replies.
3. Recommended-first decision screen.
4. Standalone mobile-first buyer proposal.
5. Exact-version buyer acceptance and payment setup.
6. Advance notice followed by a buyer timing constraint.
7. Preventive restructuring, two approvals, and collection rescheduling.

This is a product extension, not a rewrite. Preserve all existing commercial calculations, approval boundaries, payment guards, replay integrity, and evaluation evidence.

## Immutable evaluation assets

Do not modify:

- `ai/prompts.ts` prompt text or published versions;
- AI output schemas or validators;
- files under `evaluation/datasets/frozen/`, including `FREEZE.json`;
- the frozen result under `evaluation/results/`;
- frozen labels or expected answers;
- committed live run records;
- the meaning of the recorded `0 of 120` count.

The frozen evaluation remains attached to `extract.v2`, `clarify.v1`, and `explain.v3`. Do not run the frozen evaluation again. Do not make new Groq calls for this implementation.

If a requirement appears to require changing a frozen prompt or schema, stop that part and implement the safe code fallback described in the addendum. Record the limitation.

## Reply interpretation decision

Do not reuse `extract.v2` for payment-notice replies and do not add a new AI task in this round.

Use bounded deterministic behaviour:

- Demo buyer replies are pre-scripted and clearly labelled simulated.
- Every reply retains its timestamp and `inReplyTo` notice or message reference.
- Code recognises the supported English `till` / `until` / `up to` / `upto` date phrase and normalises it from the reply's own timestamp in the merchant timezone.
- Resolve a named day of month to the next occurrence strictly after the reply date. A reply on 28 November saying `till the 20th` resolves to 20 December; inclusive `till` makes 21 December the earliest proposed debit.
- A reply received on the named day itself is ambiguous between today and next month. Route it to merchant attention and create no amendment.
- `up to ₹10K` is an amount, not a date. Route it to merchant attention.
- `20 tak`, `till next week`, `till salary comes`, and any other expression without one safely supported date are known limitations. Route them to merchant attention.
- If code cannot read one safe date, ask for the date and create no amendment.
- “I paid” becomes a payment claim requiring Razorpay verification; it never changes the ledger.
- “Okay” is acknowledgement only; it never accepts terms.
- Other questions or unsupported replies need merchant attention.

Do not label this deterministic interpretation as AI.

## Required implementation

### A. Connected simulated conversation

- Add a merchant-side buyer conversation surface labelled `WhatsApp simulated · buyer replies selected by the demo operator`.
- Represent the three outbound/inbound states: `Suggested by AI`, `Approved and sent by merchant`, and `Received from buyer`.
- A merchant action must send each clarification draft. No auto-send.
- Proposal links exist only after merchant approval of that exact version.
- Notice, proposal, payment, and amendment messages are code-authored from current application state.
- Add `Pause suggested replies`; while paused, accept inbound messages but create no new AI-authored outbound drafts.
- Store source, timestamp, reply-to reference, state, author, and provenance for every conversation item.
- Ensure buyer-facing payloads contain no contribution, cost, margin, cash-at-risk, or internal policy details.
- Provide deterministic pre-scripted replies and an optional typed simulated reply. Typed replies use the same bounded code path in replay and live-run application states. `Run live` must not invoke a different reply interpreter.

### B. Standalone buyer proposal

- Create a clean buyer route and layout. Do not render merchant navigation, guided-step navigation, run/reset controls, evaluation provenance, or internal deal status inside the buyer frame.
- Put any merchant/buyer switching in a thin, clearly labelled demo bar outside the buyer product frame.
- Lead with scope, exclusions, GST-inclusive total, payment dates, recurring authorisation, and what happens next.
- Provide `Accept proposal`, `Request a change`, and `Decline`.
- Put version, hash, and audit details under collapsed `Agreement details`.
- Render all figures from canonical agreement terms.
- `Request a change` creates a linked conversation event; it does not mutate terms.
- `Decline` records buyer rejection and does not create payment setup.

### C. Recommended-first decision screen

- Lead with one recommendation card containing scope, exclusions, schedule, projected contribution, peak funding requirement, approval status, and why it is recommended.
- Show: `Explanation written by AI · all figures calculated by the engine` only when the explanation source is AI. If fallback prose is displayed, use accurate code attribution.
- Show alternatives compactly.
- Move detailed schedules, full checks, all rejections, and calculations behind `View details`.
- Keep rejected and needs-information options impossible to approve.
- Rename forecast economics to `Projected contribution`; reserve `Realised contribution` for the outcome metric.

### D. Preventive restructuring

- The hero flow must accept a reply to a sent advance notice before the scheduled debit is submitted or failed.
- Show `Change requested` after the qualifying buyer message.
- Generate a `Draft amendment` only after the supported date is safely normalised and the revision is rechecked.
- Generate the amendment explanation from code and verified state. Do not use or change `explain.v3`, and do not imply that AI read the payment reply.
- Recheck buyer constraints, contribution, funding/cash-at-risk, and mandate fit.
- Require merchant approval and buyer acceptance of the same new terms hash.
- Keep the original scheduled attempt until both approvals exist.
- Show `Payment rescheduled` only after the collection update succeeds.
- Preserve the existing failed-debit amendment path as a tested secondary path.
- Submitted attempts with an unknown outcome block rescheduling.
- Succeeded and failed attempts remain in history; succeeded lines cannot be charged again.

### E. P1, after all P0 gates pass

- Add an `Applied merchant rules` drawer to the decision page. Values must come from configuration or the hero fixture. Link seller-side rejections to their binding rules.
- Rename the failure scenario area `Other outcomes` and give each state the bounded next action specified in the addendum.
- Do not build an inbox or a separate rules page.

## Working method

1. Inspect the current state model, message model, amendment flow, agreement routes, and demo guide before editing.
2. Keep the current visual language aligned with the Razorpay-style dashboard; the buyer page should be simpler and mobile-first.
3. Extend domain types and tests before wiring the UI.
4. Use `apply_patch` for hand edits and preserve unrelated work.
5. Keep all demo time changes on the injected clock and record them.
6. Update the build log as decisions are made. Do not write the applicant-only reflection section.

### Phase gate

After implementing the domain/state changes and their tests, stop and report:

- the exact state sequence for preventive restructuring;
- how a notice reply selects the collection line;
- what happens for `cash tight`, `I paid`, `Okay`, and unsupported replies;
- the month-rollover and same-day rules;
- when the old attempt is removed;
- the test results;
- confirmation that prompts, frozen cases, frozen hashes, live runs, and results are unchanged.

Continue with UI implementation only after this report is reviewed.

## Required tests

At minimum, add meaningful tests proving:

- a buyer reply must link to a sent notice and cannot predate it;
- the supported date phrase uses the reply's timestamp;
- a reply on 28 November saying `till the 20th` resolves to 20 December and proposes 21 December;
- a reply received on the named day itself creates no amendment;
- `up to ₹10K`, `20 tak`, `till next week`, and `till salary comes` need merchant attention and create no amendment;
- an unsafe or ambiguous date creates no amendment;
- `Okay` cannot accept an agreement or amendment;
- `I paid` cannot change a payment, attempt, or ledger amount;
- no buyer-facing conversation item leaks internal economics or policy;
- preventive restructuring rechecks buyer constraints, seller economics, and mandate fit;
- the scheduled attempt remains until matching approvals exist;
- accepted restructuring replaces the schedule without overlap;
- submitted-outcome-pending blocks the collection change;
- succeeded attempts are not charged again;
- the failed-debit path still works;
- the buyer proposal derives every amount and date from canonical terms;
- AI/code/simulation attribution is accurate.
- typed simulated replies behave the same in replay and live-run application states without making an external model call.

After the UI phase, update the Playwright journey and screenshots for desktop and 390px mobile. Verify keyboard access, narrow-screen layout, and expanded/collapsed detail controls.

## Documentation and demo

Update `DEMO_SCRIPT.md`, `ONE_PAGE_PRODUCT_NOTE.md`, `PRODUCT_DECISIONS.md`, `README.md`, and `AI_BUILD_LOG.md` to match the implemented experience and the 90-second storyboard in the addendum.

In `PRODUCT_DECISIONS.md`, record the exact month-rollover, same-day ambiguity, inclusive-`till`, amount-versus-date, and unsupported-language rules. Identify code as the owner of this interpretation.

Add this judgement to the product note and video narration in the applicant's voice, preserving its meaning:

> We deliberately kept AI out of reading payment-change replies. The phrases are narrow and an error moves money, so code handles them and everything else goes to the merchant. A broader reply reader would be a separate AI task with its own evaluation.

In the amendment scene, narrate that code read the supported date phrase and rechecked the agreement. Do not say or imply that AI interpreted the reply.

State these limitations plainly:

- WhatsApp is simulated.
- Buyer replies are selected by the demo operator.
- The buyer route is a demonstration unless authentication is actually implemented.
- Recurring payments remain simulated.
- The earlier frozen evaluation covers its recorded prompts, not the complete new journey.
- The frequency of commercial negotiation over WhatsApp remains an assumption to validate.
- Supported payment-change language is deliberately narrow; Hinglish and imprecise relative-date replies require merchant attention.

## Final verification

Run the relevant unit and integration tests, typecheck, lint, production build, and Playwright journey. Confirm that the working tree contains no credentials and that existing replay integrity still passes.

In the final report, list:

- what changed and why;
- which P1 items were completed or cut;
- test, typecheck, lint, build, and Playwright results;
- screenshots produced;
- all remaining limitations;
- a diff check proving immutable evaluation assets and published prompts did not change.
