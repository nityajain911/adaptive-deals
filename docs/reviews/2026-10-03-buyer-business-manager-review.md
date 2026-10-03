# Persona 2: Buyer's business manager — complete journey review

3 October 2026 · repository HEAD `f03d90e`, product code last changed at `d525ce1`.

This is an agent-conducted usability inspection using an assumed persona, not feedback from a real buyer or independent research. No participant counts or conversion results are claimed. Persona 1's suggestions have not been implemented; this review uses the same current build.

## Persona and verdict

The business manager at fictional Kestrel Lane Clinics wants a useful marketing package within the current budget. They can approve a standalone purchase within ₹60,000 including GST, need their MD's approval above that amount, and may rely on a finance colleague to pay or authorise recurring payments. That division of responsibilities is a review assumption, not an interview finding.

Their questions are: What will the agency deliver? What am I committing the company to? Can I approve it? Does accepting charge me? Who pays next? If I ask for a change, what remains scheduled? How do I know payment is complete?

**Verdict:** the proposal communicates price, dates and exclusions clearly. The experience becomes incomplete after the buyer responds. It needs to distinguish a proposal, an accepted agreement, payment setup, a change request and payment completion. Adding more information to the same static proposal would worsen that problem.

## Method and boundaries

- Browser inspection at 390 × 844 and 1440 × 1000, with screenshots and rendered text. Visually inspected initial, revised, accepted and superseded mobile pages.
- Separate server on port 3101, isolated synthetic store; the user's port 3100 demo was left alone.
- Accepted proposals and revisions, submitted free-text change requests, cancelled a decline confirmation and declined through actual buyer controls. Selected merchant alternatives through the offer UI. Staged merchant approval/delivery, notices and payment events through existing simulation actions.
- Reviewed all four feasible offer variants: two-payment phase, upfront phase, annual split and deferred annual scope. Completed acceptance for the first three; inspected the deferred proposal without simulating its entire annual schedule.
- Followed preventive restructuring and failed-debit → amendment → successful revised debit. Checked initial/revision draft links before delivery, the superseded link, and buyer views before/after payment setup and collection.
- Sent “okay”, “I paid” and an unsupported Hinglish notice reply through simulation; verified none changed payment attempts. These were not typed into a real WhatsApp account.
- No live AI calls, bank transactions, WhatsApp integration or product changes. This is coverage of implemented branches, not every possible date, message or provider condition. Fresh-mandate amendments, actual bank errors, production identity verification and finance handoff are not demonstrated end to end.

## Journey coverage

| Buyer journey | Observed result | Assessment |
|---|---|---|
| Open proposal before merchant sends | Proposal unavailable; same for an unsent revision | Correct delivery boundary |
| Open delivered proposal on phone | Merchant/buyer names, scope, exclusions, GST-inclusive total, dates and mandate limit | Readable; no horizontal overflow |
| Understand the smaller purchase | Three-month package; social media excluded; future purchases follow normal approvals | Useful distinction; individual deliverables remain broad |
| Inspect agreement details | Version, hash, merchant approval and invoice count | Good traceability; hash also appears unnecessarily beside Accept |
| Accept phase without authority confirmation | Accept disabled | Correct explicit authority gate |
| Ask to change initial terms | Request saved below the still-active response buttons | Receipt exists, but buyer is not prominently told they are waiting on the agency |
| Merchant receives request | Merchant still says “Waiting for the buyer to review offer version 1” | Ownership defect shared with Persona 1 |
| Accept despite an outstanding request | Original terms accepted; old “Change requested” card remains | Exact terms are preserved, but request disposition is unclear |
| Decline, then cancel confirmation | Returns to reviewing | Clear and reversible before confirmation |
| Decline with scope reason | Declined banner, no payment links created, response buttons removed | Correct action; lower page still promises payment setup and work start |
| Review/accept upfront phase | One payment, no recurring-authorisation box | Correct variant; accepted page lacks a buyer payment action |
| Review/accept annual split | ₹1,41,600 total, ₹42,480 upfront and ₹99,120 later | MD requirement absent; accepts without authority confirmation |
| Review deferred annual proposal | Deferred delivery/payment schedule rendered | Same approval-condition gap; full schedule execution not tested |
| Accept, with upfront payment and mandate pending | “Accepted”; future-tense setup instructions and a non-clickable simulated payment-link ID | Buyer cannot finish setup from this page |
| Upfront payment recorded; mandate pending | Payment-link text changes to paid | No prominent remaining task or mandate status |
| Mandate confirmed | Buyer still sees instructions to set up authorisation | Does not distinguish pending from complete |
| Notice sent | Accepted proposal stays unchanged | Notice conversation/reply entry belongs to simulated channel, not this buyer page |
| Reply “okay”, “I paid”, or unsupported Hinglish | Attempts unchanged; buyer proposal unchanged | Safe payment behaviour; buyer acknowledgement/handoff is not visible here |
| Receive preventive revision | Header says ₹23,010 moves from 1 Dec to 21 Dec, amount and other terms unchanged | Excellent change summary; action buried below repeated full proposal |
| Counter-request on revision | Text saved; merchant still waiting for acceptance | Same broken handoff |
| Decline revision | No distinct decline action; instructed to request a change | Cannot explicitly record “keep existing terms” |
| Accept revision | Version 2 active, version 1 superseded | Correct agreement transition; stale “Until you accept” remains |
| Open superseded link | Prominent link to current version, no acceptance buttons | Good; old dates still sit under live-sounding “What happens next” |
| Debit fails | Buyer still sees Accepted and original schedule | Failure/retry not surfaced; merchant has more current information |
| Failed debit restructured and paid | Failed attempt and removed retry retained; successful payments total ₹46,020 | Buyer still lacks “all scheduled payments paid” and per-line statuses |

## Priority findings

### B1 — The page's next steps contradict its actual state

**Observed, high confidence:** after decline, the top says “No payment has been set up”, but “What happens next” still says the buyer receives a payment link, sets up authorisation and that work starts 1 November. After accepting version 2, the page still says “Until you accept, your current agreement and its schedule stay in place.” Superseded version 1 also retains forward-looking instructions.

**Buyer consequence:** uncertainty about whether declining or accepting changed anything, and which date actually applies.

**Change:** derive buyer instructions from agreement and payment state. Keep canonical contractual terms intact. A declined or superseded proposal is historical, with no operational next steps. Accepted revisions should say the revised schedule is in effect. Show setup instructions only while setup is pending.

Evidence: [declined page](buyer-evidence/08-declined.png), [accepted revision](buyer-evidence/19-revision-accepted.png), [superseded page](buyer-evidence/20-old-version.png).

### B2 — Acceptance leads to a payment handoff the buyer cannot complete

**Observed, high confidence:** after acceptance, the page shows a payment-link identifier as plain text. It has no Pay or Authorise control, no mandate-pending/confirmed indicator, and no buyer-facing failed-debit or retry status. The recurring payment rows are contractual dates, not payment status rows. After two successful simulated payments total ₹46,020, the page still describes a forthcoming debit.

**Buyer consequence:** the business manager cannot tell whether to act, ask finance to act, or simply wait. A returning buyer cannot reliably confirm what remains unpaid.

**Small build correction:** add a compact state-driven payment section using existing recorded events: upfront payment pending/paid, authorisation pending/confirmed, next scheduled debit, failure/retry, and all scheduled payments collected. Disclose these as simulated records. Do not label the whole deal completed while delivery remains outstanding.

**Handoff boundary:** where payment execution is simulated, say exactly that and show the expected next step; do not invent a working payment button. Actual checkout/mandate authorisation and finance delegation are additional integration work. A separate buyer payment screen is optional; state clarity on this page is enough for this build.

Evidence: [upfront paid, mandate pending](buyer-evidence/06-upfront-paid-mandate-pending.png), [failed debit](buyer-evidence/22-failed-debit-buyer.png), [all payments collected after revision](buyer-evidence/25-paid-after-failure-revision.png), [recorded attempts](buyer-evidence/payment-evidence.json).

### B3 — A change request does not establish who must act next

**Observed, high confidence:** initial request “Can we pay on 15 November instead? Please confirm before I accept” is saved, but the merchant remains waiting for buyer review. A revision counter-request for 24 December produces the same problem. The request appears below Accept on the buyer page and remains labelled “Change requested” even after that version is accepted.

**Change:** show “Change requested — waiting for Pinecone Media Works” above response actions and make the merchant's next action review that request. Preserve the original terms until both sides approve a revision. If the buyer elects to accept unchanged terms, explicitly confirm that choice and record the outstanding request's disposition; do not silently erase it or imply it was implemented.

For a revision, a bounded “Keep current terms” decision is clearer than disguising rejection as another request. It must show the currently scheduled debit and record the decision. This needs explicit state/service design; it is not just button text.

Evidence: [buyer request](buyer-evidence/03-change-requested.png), [merchant after request](buyer-evidence/04-merchant-after-request.txt), [merchant after counter-request](buyer-evidence/18-merchant-counter-request.txt). Shared root issue with founder finding F1; count it once in the backlog.

### B4 — The buyer loses the MD approval condition

**Observed, high confidence:** merchant's annual option requires MD approval. The buyer's ₹1,41,600 proposal has no such condition or authority checkbox. I accepted through its button; stored acceptance has `authorityConfirmed: false`. The smaller phase correctly requires a confirmation, making the inconsistency especially noticeable.

**Change:** carry the engine's approval requirement into canonical proposal conditions and the buyer acceptance gate. The minimum is an explicit, recorded attestation that the required approval has been obtained. It must not claim to verify the MD's identity or corporate approval. A multi-person approval workflow can remain deferred.

Evidence: [annual proposal](buyer-evidence/11-annual-needs-md.png), [observations](buyer-evidence/observations.json), entries 11 and 12. Shared with founder finding F3; this is further confirmation, not a second independent user finding.

### B5 — Revisions ask the buyer to reread almost the entire agreement

**Observed:** the mobile revision starts with an excellent before/after date sentence, then repeats scope, GST, all payments, recurring terms, authority wording and next steps before acceptance. The existing-scope authority confirmation is repeated even though only one payment date changed. The page is roughly two phone screens long before reaching its response controls.

**Recommendation, moderate confidence:** lead with what changes, what remains unchanged, and what happens if the buyer does nothing. Follow with the version-specific response controls and an expandable full agreement. Preserve full-term access and the same-hash acceptance rule. Do not simply remove required authority confirmation without deciding how prior approval carries forward.

Keep raw hashes under Agreement details. Beside the action, plain wording such as “You are accepting the terms shown in version 2” is sufficient. Reduce duplicate mandate and authority explanations on the initial proposal too; do not add another large trust panel.

Evidence: [revision before response](buyer-evidence/16-revision-awaiting.png).

### B6 — The commercial scope is readable but not precise enough to resolve expectations

**Observed:** “Website fixes”, “Search marketing” and “Monthly reporting” are the scope labels, with duration but no deliverable definition. The page does not establish whether media spend is included in the stated total or whether service continuation after January requires a separate agreement.

**Buyer risk, unvalidated hypothesis:** a manager may accept the price but interpret these labels differently from the agency, creating later disputes.

**Recommendation:** provide a short, merchant-approved scope detail for each package and an explicit end-of-contract/renewal statement consistent with actual terms. Establish whether advertising spend is included; do not invent that answer. Any binding scope detail belongs in canonical, versioned terms and the acceptance hash, not in an untracked UI tooltip. This is a small commercial-model extension, not merely a cosmetic change, and needs separate scope approval.

## Trust and focus: what to keep

- Named merchant and buyer, visible included/excluded scope, GST-inclusive total, dated payments and explicit mandate cap/end date.
- No seller margins, direct costs, funding limit or other internal economics on the buyer proposal inspected.
- Disabled phase acceptance until the authority confirmation is given; a separate decline confirmation with optional reason.
- Merchant-approved terms before link access; explicit acceptance of a particular version; superseded version links to the current one.
- Revision summary names the original date, revised date and unchanged amount. This is the strongest buyer-facing explanation of Adaptive Deals' value.
- Clear synthetic/simulation labels. A demo limitation should remain explicit rather than be disguised by a fake live checkout.

The buyer needs confidence in terms and the agency's response. An AI explanation panel, engine checks, merchant economics and a large audit dashboard would distract them. Technical integrity details can stay available but secondary.

## Suggested cut for the eventual consolidated build

| Order | Change | Nature |
|---|---|---|
| 1 | Correct state-dependent buyer instructions and payment statuses | Existing-flow correctness and comprehension; preserve contracts |
| 2 | Repair request ownership and outstanding-request disposition | Shared merchant/buyer state fix |
| 3 | Preserve MD approval requirement through acceptance | Shared approval-condition fix; explicit service guard |
| 4 | Focus revision screen on the change; collapse repeated detail | Presentation improvement after correctness |
| 5 | Decide package detail, spend treatment and renewal wording | Commercial-model follow-up; requires authoritative inputs |
| Later | Real WhatsApp/checkout, finance delegation, approver routing, invoice download, authentication and support channel | Productisation; not prerequisites for this persona review |

Do not build a new buyer dashboard or an entire procurement system for this round. The existing proposal page can become a clear agreement-status page as the deal progresses.

## Relationship to Persona 1 and remaining questions

This review strengthens two existing findings: change requests need merchant ownership, and MD conditions must survive offer selection and acceptance. Its main new findings are stale buyer instructions across lifecycle states, missing buyer payment progress, and the reading burden of revisions.

Not answered by this inspection: whether real buyers prefer a link or WhatsApp for negotiation, who normally approves mandates, which deliverable details are essential, or whether an explicit confirmation when accepting after a change request creates helpful caution or unnecessary friction. These need actual buyer conversations or usability sessions. The persona is a way to inspect the current design, not evidence of demand.

No product code or frozen evaluation assets were changed. Keep these findings beside Persona 1's findings and review the next persona on the same baseline before consolidating changes, except for a blocker that prevents further inspection.
