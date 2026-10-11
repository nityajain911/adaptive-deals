# UX improvement backlog, in five phases (owner's list, 12 October 2026)

Source: the applicant's complete list, compiled with ChatGPT. Each phase is reviewed before it is built. "Review" notes under a phase are the coding agent's position, not part of the owner's list. Time is not a constraint; the goal is a polished product that keeps the product's trust boundaries (engine owns money; both sides approve the same terms hash; nothing is claimed that is not true).

## Phase 1 · The buyer experience (acceptance and negotiation)

Rationale: remove friction at the conversion moment and make requesting a change feel like a conversation.

1. **Acceptance friction.** Remove the legalistic "I confirm I can approve this…" checkbox; pressing Accept is the legal intent.
2. **Post-acceptance state.** Do not leave the buyer at "waiting to pay". Load the Razorpay payment / UPI step instantly on the same page.
3. **"Request a change" inputs.** Replace the open text box with guided inputs: "A lower price" → numeric target budget; "Change what's included" → checkboxes of deliverables.
4. **Conversational UI.** Style the change request as a chat bubble, not a procurement form. Button: **Reply to Pinecone Media**.
5. **Destructive actions.** Move Decline away from the negotiation buttons to a subtle text link at the very bottom ("I am no longer interested").
6. **Soften the disclaimer.** Replace "The proposal itself does not change" with a positive statement: "This will notify Pinecone Media Works so they can send you an updated Version 2."

## Phase 2 · Merchant deal management (tracking and countering)

Rationale: from a passive accounting form to a proactive sales co-pilot.

1. **The "waiting" dead end.** After sending an offer, return the merchant to the Active Deals inbox; on the tracking page add a prominent **Return to active deals**.
2. **Status timeline clutter.** Replace the tall 1-2-3 list with a minimal horizontal status (Issue identified → Offer sent → Waiting on buyer).
3. **Counter-offer choice overload.** Reduce the "button soup" to three paths: Hold firm · AI counter-offer · Manual override.
4. **Dynamic scope adjustments.** Instead of only blocking a lowball offer, generate and present a Version 2 ("To hit ₹40,000 we must remove Monthly Reporting. Send this adjusted offer?").
5. **Conversational context.** Bring the simulated WhatsApp chat to the top centre, with suggested response strategies directly beneath the buyer's latest bubble.
6. **Remove analytics from the main view.** Move "Outcome and learning" (and ₹0 displays) off the active deal screen into a Performance tab.

## Phase 3 · Configuration and onboarding (Prices & costs)

Rationale: from manual programming to intelligent data ingestion.

1. **Unified data ingestion.** After a rate-card upload, hide the manual forms and show an "AI review" table of extracted services: "Do these prices look correct?"
2. **Abstract the logic.** Infer standard service dependencies; move manual dependency configuration behind an "Advanced rules" toggle.
3. **Live business previews.** A real-time "what-if" panel beside limit inputs (typing "35% margin" shows what will be rejected).
4. **Banish form fatigue.** Convert the vertical services form into a compact table (Service | Price | Cost | Margin | Status).

## Phase 4 · The presentation layer (reviewer tools and demo pane)

Rationale: a presenter wrapper that proves the architecture without polluting the merchant UX.

1. **Quarantine the demo pane** with a distinct high-contrast background.
2. **Simplify demo navigation.** Merge "Take me there" and "Next" into one large **Next step** button; Restart/Hide become subtle text links.
3. **Elevate demo accordions.** Rename "How this step is sourced" to "Under the hood" and highlight the architecture.
4. **Remove "For reviewers" from the main nav.** Wrap the prototype in a presenter frame (banner or floating button) holding the heavy logging.
5. **Relocate disclaimers.** Move "This is a prototype…" into the application footer.
6. **Quick resets.** "Reset deal to step 1" buttons in the presenter hub.
7. **Bulletproof the presenter page.** Degrade API errors gracefully ("Using cached runs"); turn simulation links into large colour-coded scenario cards.
8. **Rebrand Commercial Memory** as an interactive "Ask the rate card / judge Q&A" search UI.

## Phase 5 · The technical proof of work (audit trails and evidence)

Rationale: turn raw logs into a readable architectural showcase for judges.

1. **Abstract developer artefacts.** Hide raw hashes and system IDs behind a copy icon; strip internal string offsets (`chars 0-43`) from evidence quotes.
2. **Deduplicate the evidence wall.** Replace repeated "Source: Simulated WhatsApp" with a two-column map: extracted variable ↔ source quote.
3. **Condense Commercial Memory.** Group retrieval hits by service, not eight separate calls.
4. **Merge execution logs.** Combine "AI run" and "Who did what" into one System Execution Pipeline; state the model once at the top.
5. **Elevate the Razorpay MCP action.** Not just "unavailable": map the output ("Payment Links API for upfront collection; Subscriptions API for reporting").
6. **Stylise raw JSON** in dark code blocks with a Copy JSON button.
7. **Brain vs. math split.** "Who did what" in two columns: AI (Cerebras) for text and extraction; rule engine for deterministic margin maths.
8. **Make reproducibility pop.** Replace the plain "Yes" with a green **Verified** badge.
