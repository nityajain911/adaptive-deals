# Persona 5: Agency delivery/project manager — end-to-end review

4 October 2026 · inspected HEAD `f03d90e`; product code last changed at `d525ce1`.

This is an agent-conducted inspection from an assumed user role, not a participant interview or independent validation. Earlier persona recommendations have not been implemented. The observations concern the current build; suggestions below remain proposals.

## Persona and verdict

The delivery manager takes an accepted deal from the founder or account manager and coordinates the work: website fixes, search marketing and reporting. They need to understand the commitment, organise people and client inputs, and know whether a commercial change affects delivery. In a small agency, the founder may also perform this role.

Their central question is: **“What exactly must my team deliver, over which period, and has anything changed?”**

**Verdict:** Adaptive Deals provides a useful commercial record, but the handoff to delivery is incomplete. The accepted scope and planned delivery months exist, yet Track makes payments much easier to find than work commitments. The most valuable improvement is a compact, current agreement summary and clearer boundaries between payment status, planned service dates and actual delivery. A project-management suite would dilute this product.

## Method and limits

- Inspected 29 browser captures: proposed and unsent offers; sent, changed and declined proposals; acceptance and payment setup; preventive amendment; failed debit; unsupported service-change message; all-upfront, annual and deferred alternatives; historical offer; desktop and mobile views; expanded audit schedules.
- Used an isolated production server and separate temporary data store. Setup used the app's existing actions endpoint; buyer scope-change submission used the buyer form. Viewed rendered pages, expanded details and stored agreement records. This does not establish that all setup steps are available to a delivery-specific user through the UI.
- Compared agreement versions and read scope-check, agreement, ledger, progress and presentation code. No fresh automated test suite was run for this review.
- Used replayed model output and simulated payment events. No live AI calls, WhatsApp delivery, real payment or external project-system integration was tested. The main demo was untouched.
- No product code or frozen evaluation assets changed. Delivery completion, team capacity and client access were not measurable because the prototype has no corresponding operational records.

Evidence: [captured states and agreement terms](delivery-evidence/observations.json), [version comparison](delivery-evidence/delivery-version-comparison.json), [unsupported active-agreement change action](delivery-evidence/unsupported-actions.json).

## Journey coverage

| Journey / question | Current behaviour | Delivery manager's assessment |
|---|---|---|
| Review the recommendation before commitment | Standalone three-month package and exclusions available on offer/proposal | Useful; “feasible” concerns configured rules, not staffing readiness |
| Preview without sending | Clearly unsent, no buyer commitment | Correct boundary; not a work order |
| Proposal sent, buyer has not accepted | Waiting on buyer | Correct; no authority to infer that work is agreed |
| Buyer asks to add social media and move website work | Buyer request is stored; merchant still waits for acceptance | Existing shared gap: unresolved scope negotiation needs a visible next action |
| Buyer accepts, neither setup task complete | Accepted contract; upfront payment and mandate pending | Commercial status clear, permission/readiness to start undefined |
| Start date arrives, upfront paid but mandate pending | Waiting for authorisation; buyer copy states work starts 1 November | Does not answer whether delivery should begin |
| Both setup tasks complete | Next payment is prominent | Need accepted work and service period alongside the financial status |
| Handoff from founder to project manager | Buyer proposal and audit expose scope | No concise delivery handoff in the working view |
| Preventive date change requested | Original schedule remains while change is reviewed | Useful; service pause must not be inferred |
| Amendment awaits acceptance | Revised terms pending; original agreement remains relevant | Correct distinction |
| Revised date accepted | Payment moves to 21 December; scope and delivery months identical | Strong underlying boundary, weak visibility for delivery |
| All payments collected on 21 December | “All scheduled payments collected”; deal remains active | Correct wording; January work remains in the plan |
| Entire phase paid on 1 November | All scheduled payments collected, service planned through January | Payment completion is clearly not proof of completed delivery |
| Annual contract fully paid in May | Service plan continues through October | Same issue across a larger contract, not a hero-only edge case |
| Deferred annual offer | Service planned May 2027–April 2028 | Dates shift appropriately; future resource capacity remains outside scope |
| Buyer declines | Closed deal | Correct top-level state; stale buyer next-step copy is a shared Persona 2 issue |
| Debit fails | Retry scheduled | Does not define whether delivery continues; this needs agreed policy, not automatic assumptions |
| Buyer asks to stop search marketing and reports missing website access | Merchant attention appears; generic fallback asks for “one exact date” | Confirmed contextual-copy defect |
| Change scope after acceptance | Existing request-change action refuses an active agreement | Unsupported workflow; payment-date restructuring is not general contract renegotiation |
| Review old offer after amendment | Version 1 labelled historical, links to current stage | Good; old payment dates are historical, not a new current-state defect |
| Read on mobile | Same payment-first hierarchy; scope still behind other destinations | Content-priority issue, not just desktop layout |
| Record delivery, client sign-off or project completion | No exposed workflow | Known boundary; do not substitute elapsed time or payment success |
| End phase and begin further work | No automatic second-phase commitment | Correct restraint; make “no later work agreed” easy to see |

## Findings and proposed improvements

### D1 — The current agreement is hard to use as a delivery handoff

**Observed.** Track continues to say **“Kestrel Lane Clinics · Annual digital marketing”** after the buyer accepts a standalone three-month package. The accepted terms contain website fixes once, search marketing for three months and reporting for three months; social media is excluded. Scope can be found in the buyer proposal and delivery months in Audit → Schedules, but neither is prominent in the delivery manager's working view.

**Persona reaction:** “The title says annual. Did sales sell the year, or only the first phase? Do I allocate the social team?”

**Suggested change:** a compact **Agreed work · version 2** summary on Track, populated from current accepted canonical terms:

- Standalone three-month package; planned period November 2026–January 2027.
- Website fixes once; search marketing and reporting for three months.
- Social media excluded; no later phase agreed.
- Expand for package and monthly details.

Use the current agreement for the main label. Retain the original annual opportunity as secondary context. Before acceptance, label the same information **Proposed work**. This should replace redundant context rather than become another large, permanently expanded card.

Evidence: [accepted, unpaid Track](delivery-evidence/06-accepted-unpaid.png), [delivery rows in audit](delivery-evidence/07-accepted-delivery-schedule.png), [settled offer text](delivery-evidence/10-settled-offer.txt).

### D2 — A planned start is presented more firmly than operational readiness supports

**Observed.** Buyer next-step copy states **“Work starts 1 Nov 2026.”** The view builds that day from the first delivery month. The fixture's configured plan starts then, but canonical delivery rows carry month precision, and there is no kickoff/readiness record. Acceptance can exist with an unpaid upfront link and a pending mandate. Paying the link while authorisation remains pending still does not resolve whether work may begin.

**Persona reaction:** “Have I been authorised to start? Do we have access and the client's assets? Or is November only the commercial plan?”

**Suggested change:** distinguish facts already known—agreement accepted, upfront payment recorded, mandate pending—from **delivery readiness not tracked**. Use planned-service-period wording unless an exact start promise is explicitly supported by agreed terms. Do not invent a universal rule that work waits for full payment or mandate authorisation.

If a future release adds a binding start condition, the merchant must define it and the buyer must see it in the agreed terms. A tooltip cannot introduce a new contractual condition after acceptance.

Evidence: [buyer start wording](delivery-evidence/04-buyer-start-promise.txt), [start date with mandate pending](delivery-evidence/08-start-date-mandate-pending.txt). Source: `lib/views.ts` buyer `nextSteps`; canonical `deliverySchedule` in the captured agreement records.

### D3 — Payment completion is correct, but delivery obligations are not visible beside it

**Observed, with a positive safeguard.** The app says **“All scheduled payments collected”**, not “Project completed,” and keeps the deal active. This is correct. However:

| Exercised variant | All payments recorded | Last planned service month |
|---|---|---|
| Three-month package, upfront payment | 1 November 2026 | January 2027 |
| Three-month package, revised second payment | 21 December 2026 | January 2027 |
| Annual split | 1 May 2027 | October 2027 |

These are planned obligations, not proof that work is unfinished or finished: actual delivery is not recorded.

**Persona reaction:** “There is nothing left to collect, but what commitment still runs?”

**Suggested change:** keep the payment-completion wording. Beside the agreed-work summary, show the planned service end and a restrained **“Delivery completion is not tracked here.”** Never mark delivery complete because the last debit succeeded or the calendar passed the last month.

Evidence: [phase paid before service period ends](delivery-evidence/15-paid-before-delivery-ends.png), [future planned rows](delivery-evidence/16-future-delivery-rows.png), [annual paid in May](delivery-evidence/21-annual-paid-mid-service.png), [all-upfront case](delivery-evidence/19-full-payment-on-start.png).

### D4 — Modelled service value must not look like verified delivery progress

**Source-confirmed boundary.** Structures assign a planned `deliveredDate` at month end. The ledger counts service value as delivered when that date passes. There is no website publication event, deliverable acceptance or project completion input behind that calculation.

This is a legitimate modelling assumption for the existing economics engine. It becomes misleading if “Delivery,” “Unpaid service value” or a future progress display is read as evidence of completed work.

**Suggested change:** label the audit schedule **Planned delivery schedule** and explain date-based service-value calculations where they appear: **“Modelled from planned service dates; actual delivery is not recorded.”** Keep the validated engine unchanged. Do not repurpose these values as a completion tracker.

Evidence: `domain/structures.ts` assigns month-end `deliveredDate`; `domain/ledger.ts` counts those entries by date. [Audit schedule screenshot](delivery-evidence/16-future-delivery-rows.png).

### D5 — Payment restructuring preserves delivery, but the product needs to say so

**Verified.** In the preventive amendment, version 1 and version 2 have identical scope, exclusions and delivery schedules. The second payment moves from 1 December to 21 December. This is useful product discipline.

**Persona reaction:** “The buyer needs more time to pay. Are we also postponing the work, or should the team continue under the original service period?”

**Suggested change:** include a short amendment difference summary: **“Payment date revised. Agreed scope and service months unchanged.”** Both approval screens and the current agreement should support this distinction. Do not interpret a cash problem as an instruction to pause work.

This wording must coexist with Persona 4's finding: the planned invoice date also changes in this implementation. Do not say “everything else unchanged.”

Evidence: [exact version comparison](delivery-evidence/delivery-version-comparison.json), [revised Track](delivery-evidence/13-payment-revised.png).

### D6 — A service problem receives a date-change instruction

**Confirmed defect.** I submitted this notice reply:

> Please stop search marketing from December. We cannot give website access yet.

The system correctly created a merchant-attention item and did not silently change scope or payments. But its suggested next step was:

> Reply to the buyer personally and ask for one exact date.

This is wrong for the message. Stopping a service and missing access need a commercial/delivery conversation; a debit date does not resolve them.

**Suggested change:** for an unsupported reply, use **“Review the buyer's request and agree the next step.”** Reserve the exact-date instruction for a recognised date ambiguity. Existing deterministic outcome reasons can support this distinction; do not expand the frozen AI prompt or silently build a general reply classifier.

Keep the warning that marking a message handled does not send a reply or change payments. A broader resolution/handoff improvement belongs with Persona 3's already-recorded issue; count it once in the final backlog.

The separate active-agreement `request_change` action also rejects general scope changes. Present that as a prototype boundary. A service-cancellation or scope-amendment workflow would require explicit commercial terms and approvals; it is not a small extension of the date parser.

Evidence: [message and incorrect next step](delivery-evidence/29-service-pause-request.png), [rendered text](delivery-evidence/29-service-pause-request.txt), [unsupported action result](delivery-evidence/unsupported-actions.json).

### D7 — Package checks do not establish operational deliverability

**Observed / source-confirmed.** The prototype has real package-dependency checks and a standalone-value condition. Reporting depends on search or social; a phase must contain independently valuable work. It would be inaccurate to say the engine ignores package dependencies.

However, package names such as “Website fixes” do not define deliverables, quantities, revision limits, customer inputs or acceptance criteria. The engine does not check staffing capacity, website access or supplier availability.

**Persona reaction:** “What counts as finished, and what did the client agree to provide?”

**Suggested change:** first make clear what the existing checks cover. For a production version, support a merchant-approved package description or scope document referenced by the offer and delivery handoff. If it defines binding work, include its version in the agreement approval boundary. AI should not invent extra deliverables.

For this build, avoid a new package editor, task board or resource planner. A concise disclosure and current-scope summary are sufficient; real package definitions need merchant evidence.

## What already earns trust

- Scope, exclusions and delivery months are present in versioned agreement records.
- Historical offers are labelled as historical after amendments.
- Payment-date changes do not silently change scope or service months in the exercised flow.
- Unsupported replies become human-attention items rather than automatic service/payment changes.
- Payment completion is not called project completion.
- The phased recommendation is explicitly standalone; further work is not automatically committed.
- Merchant costs and margins remain out of buyer-facing proposal content in the inspected views.

## Recommended cut

| Priority | Proposed change | Boundary |
|---|---|---|
| First | Fix the unsupported-message next step | Small contextual-copy correction; keep narrow parser |
| First | Compact accepted-work summary and current package label | Read existing canonical terms; do not add another dashboard |
| First | Distinguish planned service dates and modelled delivery from readiness/completion | Presentation clarification; no engine changes |
| First | Show scope/service-period impact in amendment summary | Include the already-known invoice-date caveat |
| Later, after merchant validation | Approved package descriptions and lightweight handoff to a delivery owner/project | Define actual workflow and agreement implications first |
| Defer | Task boards, capacity planning, timesheets, project completion certification, automated work suspension, general scope/cancellation engine | Too broad for the current demonstration |

Do not automatically make the delivery manager an approver for every payment change. Their need is visibility into the commercial commitment; approval responsibilities depend on the agency. Do not expose the entire audit or internal economics merely to deliver a readable scope summary.

## Overlap with previous personas

The initial proposal-change request that does not advance the merchant task, unresolved messages that can be marked handled, stale buyer next-step text and invoice-date changes already appear in earlier reviews. This walkthrough adds delivery consequences and evidence, not new independent instances of user demand.

The genuinely new emphasis is the distinction between **agreed work, planned dates, payment completion and actual delivery**. These can be clarified within the existing three-stage journey. A sixth stage or separate project workspace is unnecessary.

## Acceptance checks for any approved follow-up

1. From Track, the reviewer can identify current agreed scope, exclusions, service period and version without opening Audit.
2. A three-month accepted phase is not labelled as an accepted annual contract.
3. Unpaid/pending setup is distinguishable from delivery readiness; the app does not invent a start condition.
4. All-upfront, phased and annual paid states retain a clear service-period reference; none claims actual delivery completion.
5. Advancing the simulated calendar never turns planned service-value calculations into proof of performed work.
6. A payment-date amendment explicitly preserves the service plan, while accurately disclosing other changed terms.
7. An unsupported service-pause message requests human review; it does not demand a debit date or change scope automatically.
8. The accepted-work summary updates to the current version; old summaries stay explicitly historical.
9. Buyer-facing handoff content contains no internal cost, margin or funding-limit information.
10. These fixes make the merchant view easier to scan; they do not introduce another large block of always-visible detail.

These are proposed verification checks, not tests added or executed during this inspection.
