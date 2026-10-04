# Razorpay Track 2 judge review

4 October 2026 · reviewed product commit `ab35c37` · review only; no implementation changes.

## Judgement

Adaptive Deals demonstrates careful commercial checks and a connected approval-to-payment journey. Its strongest evidence is the deterministic agreement and amendment control. Its weakest evidence is that AI understands a real commercial negotiation and improves the resulting decision. The default story is narrow enough that a judge could reasonably ask whether a structured form plus a rules engine would produce the same value.

The next round should prove that different conversations and replies lead to different justified decisions. More AI calls, more screens, or more payment scenarios would not by themselves answer that question.

## Review method and limits

- Read the supplied campus guide, especially page 2's five judging dimensions and the seven Track 2 demonstration requirements. No numerical judging weights are provided in that guide; the assessments below are my judgement, not an official Razorpay score.
- Walked the main journey in the local browser: opening conversation, questions, confirmation, offer, alternatives, rejections, merchant preview, buyer acceptance, payment setup, notice, preventive amendment, revised acceptance and outcome card.
- Exercised the negative GST branch through typed input and merchant interpretation. Also exercised a per-payment clarification, annual proposal approval condition, buyer scope-change request, buyer decline, merchant closure, failed initial delivery and retry, failed debit, and an infeasible payment amendment. Some branch setup used the app's existing actions endpoint; the resulting pages were inspected in the browser.
- Inspected the three presenter failure examples and the current model inputs, attribution and replay behavior. No live model calls were made. This is a product inspection, not merchant validation or an exhaustive test of every possible input.
- The simulated deal was reset after inspection. Product source and frozen assets were not edited.

## Assessment against the brief

| Judging dimension | Current evidence | What would strengthen it |
| --- | --- | --- |
| Importance and clarity of the problem | A financially constrained buyer is plausible; an affordable, profitable executable structure is a coherent opportunity | Show the seller's current workaround and the buyer's actual business need before displaying extracted numbers |
| Merchant understanding | Costs, contribution, approval conditions and funding exposure receive serious attention | Explain which service matters, what may be removed, who makes the decision and why this deal is stalled; validate frequency separately |
| Product judgement and prioritisation | Clear approvals, bounded templates, abstention and frozen evaluation are strengths | Complete supported reply branches and one bounded commercial revision loop before adding broader features |
| AI use during the build | Substantial build and evaluation records exist | Provide a concise account of how AI accelerated the work and where the applicant overruled it; test counts alone do not establish this |
| Communication | Three merchant stages are understandable; buyer terms are explicit | Make the opening context credible and the AI decision visible; reduce repeated figures and operational detail in the main pitch |

| Track 2 requirement | Current assessment |
| --- | --- |
| Signal identifying the opportunity | A preselected buyer message is visible; the product does not visibly show how a new conversation becomes an opportunity |
| Why AI beats a fixed rule | Extraction of varied language is defensible; the one short, structured hero sentence does not demonstrate the advantage well |
| Recommendation or action | Strong: proposal, approval, acceptance, collections and amendment form a connected action flow |
| Merchant review, change, approve or stop | Approval, selection and stopping work; supported commercial changes after a counter-request need a path back into offer preparation |
| Learning from outcomes | Events and reasons are captured; the policy describes future governed improvement. Actual learned improvement has not been demonstrated |
| Accuracy, permissions, trust and failure | Strong architectural controls, but alternate clarification replies expose a runtime failure. Authentication and channel delivery remain explicitly simulated |
| Business outcome | The 90-day contribution metric is sensible; the provisional number needs to remain visually subordinate to the current commercial decision |

## Confirmed findings

### 1. Alternate clarification answers break the default replay — P0

Reproduction through the interface:

1. Send the two hero questions.
2. Type `No, both ₹50,000 and ₹60,000 exclude GST.`
3. Record `Excludes GST` and quote the reply in the merchant interpretation form.
4. Complete the approval-scope answer and use the answers.
5. The Offer page shows `This page couldn’t load`.

The recorded error is `Replay needed outputs this run never produced (explain)`. A per-payment approval answer also reaches the same failure in the default replay mode.

The engine can represent these answers. The continuation path asks a pinned replay for an explanation corresponding to changed inputs, then stores a state that fails the next replay integrity check. Preserving the integrity check is correct; the app must handle the unsupported replay branch before saving or rendering a broken state.

Recommended behavior: keep exact recorded replays immutable. A changed input creates a separately identified branch. With no model available, recompute using the real engine and display accurately labelled code ranking/explanation. With a live model, obtain and record fresh outputs for the changed inputs. A fresh extraction or explanation must never inherit an old run's provenance merely because it starts from that run.

The earlier passing suites established their covered journeys. They did not establish that alternate clarification answers worked in replay mode.

### 2. The conversation omits the information needed to justify the recommendation — P0

The default visible opening is one buyer sentence: `Only ₹50K left this quarter; new budget in April; anything above ₹60K needs MD approval.` The existing merchant proposal is hidden under Show full conversation, after the visible buyer messages. The thread component partitions opening messages by author rather than maintaining one visible chronological exchange.

There is no buyer evidence explaining why website fixes and search should remain while social media can be removed. The three-month Phase 1 scope comes from a merchant preset. That is permitted, but it does not demonstrate AI discovering the correct commercial compromise.

The claim that January–March has no available budget should also be explicit buyer evidence or a confirmed interpretation. `New budget in April` alone does not fully explain rollover, other budgets or future availability.

Recommended new synthetic conversation, authored as a new fixture and run:

1. Buyer states the desired business outcome and timing: fix booking friction and begin attracting enquiries in November.
2. Merchant offers the current annual package, with its actual scope and price.
3. Buyer states the budget and approval constraints, including the January–March gap explicitly if it is intended to be a hard constraint.
4. Buyer explains that website and search are essential, social media can wait, and a standalone first phase is acceptable.
5. AI identifies the supported constraints and remaining ambiguities with citations.
6. Buyer answers clarification questions; a different answer changes the resulting evaluation.

These are proposed synthetic facts, not existing evidence. A new scenario must not reuse an old model output as though it processed the new messages.

### 3. Reply choices should match the question and allow uncertainty — P0

The GST menu exposes one canned answer plus Type a reply. The approval-scope menu likewise exposes one canned answer. Typed replies require the merchant to select a value and copy supporting words; they are not interpreted by the AI.

Use explicit options:

| Question | Supported examples | Uncertain/custom route |
| --- | --- | --- |
| Do both amounts include GST? | Both include GST; both exclude GST | Different bases; not sure; type a reply |
| Is the limit per payment or contract? | Per contract; per payment | Not sure; type a reply |
| Does a revised offer work? | Accept; request a change; decline initial proposal | Clarification question or merchant attention |

Mixed GST bases are a distinct model capability: the current profile has one basis with per-amount coverage. Until separate bases are supported, explicitly retain the ambiguity. Do not force a mixed response into Yes or No.

An uncertain reply should offer a follow-up or waiting state. The current manual form presents supported values but no clear Not clear yet path. Unknown information must remain unknown.

### 4. The best additional AI task is commercial intent and counter-request understanding — high priority

The current explanation request contains feasible options, approval status and calculated values. It does not receive the buyer's original conversation, business goal or soft preferences. It therefore cannot ground the recommendation in those preferences. Required/optional package extraction already exists in part; build on it rather than claiming all scope understanding is new.

In the default actual run, AI ranking is accepted but prose falls back to code. The merchant card credits code for the explanation but loses the AI ranking attribution. Accurate, compact wording should distinguish selection/ranking from explanation and arithmetic.

Suggested bounded AI expansion:

- Extract business goal, required versus negotiable scope, timing and payment preferences, and corrections across several messages. Every fact has a quote, source and status: stated, inferred for confirmation, or unresolved.
- Read ordinary clarification replies into candidate structured answers; request merchant confirmation where uncertain or conflicting.
- Interpret a buyer counter-request as a proposed change to supported inputs. Show the exact proposed changes before applying them.
- Re-evaluate all permitted structures in code, then rank feasible options against the confirmed buyer priorities and merchant objective. Tie the reason to specific evidence.

AI must not calculate contractual numbers, decide feasibility, invent packages/costs, override approval conditions, or directly move a payment.

A useful demonstration holds the money constant while changing a business priority. If a buyer requires social media, a package excluding it must stop qualifying. If scope is negotiable but starting now matters, the eligible alternatives and recommendation should reflect that. If the fixed template catalogue cannot represent a suitable package, show that boundary instead of inventing one.

Evaluate the new task against a simple structured-form/rules baseline using messy multi-message conversations. Count correctly supported fields, mistaken must-have classifications, handled corrections, unnecessary questions, merchant corrections and whether recommendations honour confirmed priorities. Add new versioned evidence; retain the historical frozen result as evidence for its original tasks only.

### 5. A commercial counter-request currently ends in manual disposition — high priority

I requested: `We need social media immediately, but cannot sign the annual contract.` The merchant correctly became responsible. Available choices were Keep current terms, Handle outside Adaptive Deals and Follow-up still pending. There was no bounded path to review changed constraints and prepare another offer.

This is an important limitation for a product named Adaptive Deals. Add one narrow pre-acceptance revision loop: request → cited candidate changes → merchant confirmation → complete engine re-evaluation → new proposal → fresh acceptance. An accepted agreement remains governed by the existing amendment boundary; broader changes to live contracts should be a separate decision.

### 6. Multiple real case workspaces would strengthen the proof — high priority after branching

Only `hero` is a valid merchant deal route. Other outcomes are separate presenter examples, not independently progressing deal conversations.

Use a compact native case list for one merchant, with three independently stored deals:

- Start now with reduced scope: proves phased scope and payment trade-offs.
- Preserve required scope and wait: proves a materially different choice driven by buyer priorities and timing.
- No permitted structure fits: proves justified abstention and the next merchant action.

Allow one deal to be open at a time. Preserve each deal's messages, draft, approvals, collections and run evidence when switching. This meets the request to see multiple cases without adding a CRM or presenting several full conversations simultaneously.

The case list can make opportunity identification visible: source conversation, original quote, suspected barrier, unresolved facts and next review action. Avoid invented conversion probabilities or recovered-revenue totals.

### 7. Secondary flow and copy gaps

- The failed debit correctly reports a retry for 4 December. The presenter's next-debit-success simulation refuses to complete that retry with `No recurring debit is scheduled`, because it excludes internal retries. Either complete this demonstrable branch or clearly bound it as unsupported. This observation concerns the simulation path, not a real payment integration failure.
- The revision buyer page says payment setup starts after acceptance even though the existing mandate is already active, while later text correctly says existing authorisation is reused. Use version-specific setup copy.
- Terms hashes still appear directly under buyer acceptance despite the advanced Agreement details section. Exact-version confirmation is useful; the raw hash can remain in the details.
- Track repeats next-action information in the banner and Now card. The outcome panel displays several financial concepts prominently while the user is resolving a buyer request. Keep operational action first and measurement collapsed when it is not the task.
- Both question cards repeat long engine comparisons before the merchant can send. Preserve the evidence but put the detailed option counts behind an explanation control; use one visible consequence sentence derived from the same analysis.
- The offer repeats total and contribution in several sections. The ₹95,580 lower proposal value is a scope reduction, not a savings or performance result. Show scope and commitment trade-offs first.

## What to add and what to defer

| Priority | Work | Success evidence |
| --- | --- | --- |
| P0 | Repair changed-answer replay branches | Both GST readings and both approval scopes render correct, traceable decisions without a page error |
| P0 | Contextual, chronological synthetic conversation | A judge can explain why this buyer wants the selected scope, using actual source messages |
| P0 | Question-specific replies plus uncertain/custom handling | Supported choices recalculate; ambiguous choices remain unresolved; no silent guessing |
| P1 | Cited commercial-intent and counter-request AI task | New evaluated task interprets supported changes and grounded priorities; merchant reviews them |
| P1 | Three native, independent cases | Switching deals preserves each case; at least two cases produce materially different decisions |
| P1 | Focus the initial screen and pitch on AI's decision contribution | Conversation → cited constraints/priorities → changed recommendation is visible without opening developer records |
| P2 | Governed outcome review | Captured outcomes and reasons feed a clearly labelled future review process; no claimed learning uplift from synthetic cases |

Defer broad autonomous negotiation, arbitrary AI pricing, auto-discounting, automatic merchant-policy changes, live WhatsApp integration, a general chatbot, a full CRM and payment prediction without data.

## Suggested judge journey

Start with a newly received conversation and the commercial opportunity. Show the buyer need and the original offer, then the specific constraints and priorities the AI found. Let the judge choose a different clarification answer and see the consequences. Explain one recommended structure using buyer evidence and engine figures. Preview, approve and accept the proposal. Finish with the measurable business outcome and the approval boundary.

Keep the existing preventive amendment accessible as depth evidence. In a short pitch, give more time to the conversation-to-commercial-decision transformation than to payment setup, notices and repeated acceptances.

The product note is currently roughly 848 words before applicant answers. It needs an actual one-page layout check and condensation before submission. The demo narration also needs a timed read rather than relying on table timestamps. A concise AI-build-log summary should point to the detailed history and highlight applicant judgement.

## Source references

- Supplied guide: `/Users/nityajain/Downloads/RazorpayxISB_BuildChallenge.docx (1).pdf`, pages 2–4.
- `data/synthetic/hero.ts`: opening messages and pinned replies.
- `components/conversation-thread.tsx`: opening-message partition and full-conversation placement.
- `lib/deal-page.ts`: single supported hero deal.
- `lib/service.ts`: clarification continuation, work disposition, simulations and scenario handling.
- `ai/orchestrator.ts`: replay integrity check.
- `ai/explain.ts`: ranking inputs and explanation validation.
- `components/offer/recommendation.tsx`: visible ranking/explanation attribution.
- `components/presenter/other-outcomes.tsx`: limited separate failure demonstrations.

Inspection text and temporary screenshots were captured under `/private/tmp/adaptive-judge-*`. Product implementation and historical evaluation records remain unchanged.
