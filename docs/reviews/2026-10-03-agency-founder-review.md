# Persona 1: Agency founder — complete journey review

Review of product code at `d525ce1`, with documentation at `f03d90e`, on 3 October 2026. This is an agent-conducted usability inspection using an assumed persona. It is not a merchant interview or independent validation. It does not populate the five-person worksheet's participant counts.

## Persona and decision

The founder of the fictional Pinecone Media Works sells and oversees delivery, pays freelancers, and owns the client relationship. Their job is to save commercially worthwhile deals while understanding what they have committed to deliver and collect.

Their practical questions are: What is blocking the sale? Why this offer? What do I give up? Who must act? Can I afford the changed payment date? What remains owed or undelivered?

**Assessment:** the primary three-stage flow now provides a clear decision. Trust breaks on several exception paths: a changed proposal, a rejected amendment, and an alternative requiring MD approval. Fixing these existing paths should precede adding more products or destinations.

## Method and limits

- Inspected the production app in a real Chromium browser at desktop and 390 px widths. Captured screens and rendered text across the primary flow and exception branches.
- Used an isolated server on port 3101 and a separate synthetic store. The reviewer's demo on port 3100 was not reset or advanced.
- Used visible controls for sending questions, selecting alternatives, and closing a deal. Used the app's existing actions endpoint to stage buyer responses and payment events and some approvals. Inspected the resulting rendered founder screens and stored state. This is not a claim that every step was performed unassisted through the UI.
- Used recorded model outputs and simulated payments. Made no new model calls or real payment transactions.
- Read the relevant service and view logic to distinguish missing functionality from hidden information. No product code was changed.
- Coverage is the implemented journey branches listed below, not every possible combination of messages, dates, providers and states. Real WhatsApp delivery, actual bank settlements, authentication, live provider failures, and real merchant behaviour are outside this inspection.

## Journey coverage

| Founder journey | Observed behaviour | Assessment |
|---|---|---|
| Arrive with a stalled quote | Opens a preloaded deal with blockers and two questions | Clear once inside; importing a real deal, setting policies and connecting a channel have no founder onboarding flow |
| Send clarifications | Batch send records the questions and changes to waiting | Clear; question and rationale are duplicated across the card and conversation |
| One answer arrives | Still waits for the unanswered question | Sensible state; repeating the waiting sentence adds little |
| Both scripted answers arrive | One action applies them and generates offers | Clear primary route |
| Both answers are typed | Both need manual interpretation, even when text matches the scripted answers | Legitimate prototype boundary but a material difference from the smooth scripted demonstration; the banner says “One answer” although two forms appear |
| Interpret typed replies | Merchant records a supported reading with a verbatim quote; offers can then be built | Recoverable; needs a clear explanation that this is merchant interpretation |
| Review recommendation | Scope, total, dates, contribution and exclusions appear together | Strongest commercial screen; primary button is below extensive repeated detail |
| Inspect alternatives | Three alternatives are selectable, including upfront payment and annual options | Useful choices; why the split beats upfront is not explained specifically |
| Select another offer | Selected annual offer becomes the main card | Still labelled “Recommended offer”; generic rationale wrongly says it fits the approval limit |
| Inspect rejected / undecidable options | Existing code shows reasons; April needs an exact budget day | Previously blank reason is fixed; no direct way to answer that April-day question and reconsider this option from the merchant view |
| Preview exact proposal | Shows canonical scope, dates, GST and payment setup | Builds trust; outgoing conversation message is not previewed |
| Send fails and retry succeeds | “Approved · not yet sent” with Retry, then waiting after successful send | Honest and recoverable |
| Buyer requests changes before accepting | Request is saved and visible in conversation | Main state remains “Waiting for the buyer”; no founder task to handle the request |
| Founder decides not to proceed | Reason capture, confirmation, explicit closed state | Clear; no automatic message to the buyer is promised |
| Buyer declines | Closed banner, recorded reason in outcome detail | Reason is too far below the primary state; proposed payment schedule and ₹0 provisional figure remain prominent |
| Buyer accepts annual option requiring MD approval | Buyer page has Accept without an MD-confirmation step; action can activate it without authority confirmation | Requirement advertised on merchant side is not carried through the buyer acceptance flow |
| Accepted, upfront unpaid, mandate pending | Combined waiting state names both tasks | Clear |
| Upfront paid, mandate still pending | Waiting state narrows to mandate authorisation | Clear |
| Both setup tasks complete | Next payment amount and date shown | Clear |
| Buyer claims “I paid” | Asks merchant to verify; ledger does not change | Safe; verification takes place outside the prototype, which is disclosed |
| Mark claim handled | Removes attention while retaining scheduled payment | Correctly limited; it does not reconcile money |
| Unsupported Hinglish notice reply | Merchant attention, personal follow-up suggested | Safe fallback; asking for an “exact date” does not imply that another typed answer can complete restructuring in this prototype |
| Supported preventive change | Reads “till the 20th”, proposes 21 December, shows rechecks and both approvals | Valuable, comprehensible core capability |
| Founder wants to decline proposed amendment | Approve is available, explicit decline/dismiss is not | Founder can leave it pending but cannot resolve it as a decision; counter-proposal building can remain deferred |
| Buyer challenges an amendment | Saves request, but still says waiting for buyer acceptance | Same ownership gap as the initial proposal-change path |
| Duplicate payment-change request | Keeps original request; records second message for attention | Protects schedule; the primary action still favours drafting the original request, so the newer correction can be overlooked |
| Amendment fails engine checks | Marks request not restructured; main status becomes “Up to date”, original debit stays scheduled | Critical comprehension problem: known inability to pay has not been resolved |
| Amendment accepted | Rescheduled amount/date and superseded history appear | Clear; both acceptance outcomes now recorded |
| Reply to removed or already-paid notice | Merchant attention explains refusal | Preserves payment truth |
| Debit fails | Failed debit and scheduled retry visible | Clear immediate state |
| Failed debit followed by restructuring | Amendment shows original failed attempt and retry pending removal until approvals | Useful secondary journey |
| Retry succeeds without restructuring | Simulator excludes internal retries from its debit-success selection | End-to-end browser branch is unavailable with current controls; do not count it as observed. Domain tests are separate evidence |
| All scheduled payments collected | Says exactly that and keeps Track current | Appropriate: delivery continues after collection, so “deal complete” would be misleading |
| Missing budget / unsupported commercial terms / no feasible deal | Presenter examples compute each state and describe a next step | These are examples, not complete merchant workflows. Sending the missing question, updating facts and returning to an offer were not available through these examples |
| Phone comparison | Alternatives remain on the page but descriptions become extremely narrow columns | No horizontal overflow does not mean readable; comparisons need vertical stacking |

## Findings requiring correction before expanding scope

### F1. Buyer requests do not reliably become founder work

**Observed:** after the buyer requested “Please remove reporting and move the first payment to 15 November,” Track still said “Waiting for the buyer to review offer version 1.” The request was below the outcome card. Challenging the amended proposal produced the same mismatch.

**Consequence:** the founder may wait for a buyer who is already waiting for the founder.

**Recommendation:** current-version proposal and amendment requests should produce a merchant-owned “Buyer requested a change” state and a Review request action. Show the request above measurement. If the prototype cannot revise those terms, offer an explicitly recorded handoff outside Adaptive Deals. Do not pretend a generic request can be automatically implemented.

[Evidence: proposal change](founder-evidence/09-proposal-change-request.png). Source: `lib/service.ts` attention selection only includes notice replies; `lib/progress.ts` gives amendment waiting states priority.

### F2. Failed restructuring should remain an unresolved problem

**Observed:** on 28 November, “Cash is tight till the 31st” led to a proposed 1 January debit. The engine rejected it because January falls before the next budget. The founder then saw “Up to date · next payment ₹23,010 on 1 Dec 2026.” Only a low conversation badge said “Not restructured.”

**Recommendation:** keep the failed check, original scheduled debit, and merchant follow-up visible together. Suggested state: “The requested date does not fit the confirmed budget. The 1 December debit remains scheduled. Review with the buyer.” This requires no relaxation of engine rules. The original debit should not silently disappear either.

[Evidence: rejected amendment](founder-evidence/25-amendment-check-result.png).

### F3. Alternative selection misrepresents recommendation and approval

**Observed:** selecting the annual split changes the amount to ₹1,41,600 and displays “Needs buyer's MD approval.” The main card still says “Recommended offer,” and the explanation says the option fits the approval limit. On the buyer page the MD condition is absent and acceptance can proceed without recording it.

**Recommendation:** distinguish “Recommended” from “Selected by you.” Generate accurate visible conditions for the selected engine result. Carry “MD approval required” through the preview and buyer acceptance. A minimal prototype can record an explicit confirmation of authority/approval; it must describe that as an attestation, not verified corporate approval. A full approver-routing product is a separate scope decision.

[Evidence: selected annual option](founder-evidence/05-alternative-2.png) and [buyer page](founder-evidence/30-md-buyer.png).

### F4. Mobile alternatives cannot be scanned

**Observed:** at 390 px the amount/contribution takes most of the row; option descriptions wrap into one- or two-word lines. Choosing an alternative requires excessive scrolling.

**Recommendation:** stack each alternative's name, payment pattern, approval condition, figures and selection button vertically at narrow widths. Review screenshot readability as well as overflow.

[Evidence: mobile alternatives](founder-evidence/37-mobile-alternatives.png).

## Improvements to understanding and focus

1. **Explain the actual choice.** Name payment patterns in the headings: “Three-month package · two payments” and “Three-month package · pay upfront.” Say that both have the same projected contribution where the engine confirms that. Explain any preference using the actual ranking source; do not invent buyer demand for instalments. Keep the annual alternative conditional on MD approval.
2. **Use one clear measurement time basis.** Proposed improvement: show collected and still to collect first. If displaying forecast beside provisional contribution, label “Full-contract forecast” and “Provisional through [cutoff date]”; they are not comparable achievement measures. At 21 December the review showed ₹21,579.60 provisional versus ₹19,329.60 full-contract forecast: ₹2,250 of January delivery costs had not yet been incurred. That is timing, not outperformance. The 90-day target also ends before January delivery. Keep the target metric and missing-input disclosures intact.
3. **Put the right facts first in closed and waiting states.** Before acceptance, prioritise the offer and waiting status over a large ₹0 contribution. After decline, prioritise the reason and disposition over the unactivated payment schedule. A closed deal must still remain in measurement eligibility.
4. **Keep decision evidence accessible without repeating it.** Preserve the full code-derived clarification rationale under an expandable explanation. A concise visible summary may be added only if supported by those results and approved; do not replace it with a claim that misdescribes which option changes. Reduce duplication of questions, totals and contribution across the same screen.
5. **Preview the outbound message.** Show the exact code-generated message alongside the proposal before send. Personal-note editing needs separate design; showing existing text is enough to close the immediate transparency gap.
6. **Make it possible to say no to a revision.** A founder needs a recorded “Don't change the schedule / handle personally” disposition with explicit consequences for the current debit. This is smaller than arbitrary counter-proposal construction, but does need state and service support.
7. **Use plain financial labels.** “Still to collect, excluding GST” is clearer than “Balance.” Keep the buyer total including GST close by. Distinguish unpaid delivered service from the agency's own funding requirement.
8. **Explain where the prototype hands over.** Typed clarification replies, unsupported payment replies and claims of external payment have different manual steps. Make that next step explicit in each state. Sending another exact-date reply is not enough if there is no supported way to adopt that date.

## Pushback on the supplied analysis

- A founder does not necessarily prefer upfront payment or always pursue MD approval. Those are plausible preferences, not observed merchant findings. Show the trade-off and preserve choice.
- ₹60,168 is a conditional full-year projection, whereas ₹19,329.60 concerns a smaller contract. It is not money demonstrably lost by taking the smaller offer, nor a direct comparison of 90-day results.
- The statement that January work is delivered before the December payment is incorrect for the hero: the revised debit is 21 December; January delivery follows it. The useful question is what work and costs precede 21 December. November delivery can precede collection even when the agency's funding requirement stays within policy.
- “Nothing to do while waiting” can be a correct product state. Do not add nudges, viewed signals or expiries merely to create activity. Add them when real merchant evidence warrants it.
- The card is visibly present before acceptance in this build. The suggestion to keep it quiet before acceptance remains unimplemented.
- The previously identified missing acceptance outcomes and blank needs-information reason are already fixed; they should not appear as new open defects.

## Recommended build order

1. Correct request ownership and failed-amendment state visibility (F1, F2).
2. Correct alternative attribution and MD-condition continuity (F3).
3. Repair mobile comparisons (F4).
4. Improve recommendation specificity, financial time labels and state-appropriate emphasis.
5. Add bounded decline/handoff for revisions, then consider broader editing or negotiation separately.

Keep the three stages, canonical proposal preview, engine checks, version-specific approval, original-schedule truth and explicit simulation labels. Move structure counts, validator internals and prominent hashes into existing details without falsely attributing code text to AI.

Future founder capabilities: import/create a deal, configure and version merchant rules, connect messaging, return to multiple deals, revisit a later budget, revise commercial scope, and reconcile invoices and settlements. These are genuine productisation needs, not prerequisites for making this single-deal build coherent.

The next persona should be the buyer's business manager, who must understand scope, secure internal approval, accept terms and request changes. Review that role separately; do not count this founder inspection as their feedback.
