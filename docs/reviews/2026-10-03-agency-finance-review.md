# Persona 4: Agency finance/accounts operator — end-to-end review

3 October 2026 · HEAD `f03d90e`; product code last changed at `d525ce1`.

Agent-conducted product inspection, not a real finance-user interview, independent validation, accounting assurance or tax-compliance assessment. Persona 1–3 recommendations have not been implemented. All rupee figures below come from the synthetic fixture and recorded simulations.

## Persona, job and verdict

The finance/accounts operator at Pinecone Media Works checks what the agency has agreed, reconciles receipts, monitors outstanding amounts, coordinates payment exceptions and explains the cash position to the founder. They may not own sales negotiations or approve changes to commercial terms. This assumed role should be validated with actual agencies.

Their questions are:

1. Is this an offer, an accepted contract or an amount actually due?
2. What is scheduled, submitted, paid, failed, replaced or still unknown?
3. How much remains outstanding, including GST?
4. Which recorded receipt belongs to which agreement version, payment line and planned invoice?
5. Does “collected” mean a payment succeeded or money reached the bank?
6. Is the revised date authorised, and can an old retry still collect?
7. Are these actual costs and fees, estimates, or missing inputs?
8. Which period does each figure cover?

**Verdict:** the prototype has useful agreement and collection safeguards. Its financial presentation is less precise than its underlying records. The largest issues are an unqualified 90-day receipts figure beside current collections, apparent balances on unaccepted/declined offers, and an undisclosed invoice-date change inside payment amendments. It is a commercial-decision and collection prototype, not yet a reconciliation or accounting system.

## Method and evidence strength

- Inspected 25 main browser states plus expanded economics/audit views and a separate invoice-version check. Desktop 1440 × 1000; annual paid-state inspection also at 390 × 844.
- Used an isolated server/store, replayed model output and simulated payments. The user's main demo was untouched. Merchant/buyer setup was staged through the application's existing actions endpoint; financial views and details were inspected in the browser. This is not a claim that a finance user completed every action through role-specific controls.
- Compared stored payment attempts, agreement versions, invoice schedules and displayed figures. Reconciled payment-line pre-GST + GST totals and successful collections using integer paise.
- Ran **57 existing tests across 8 files; all passed**. These cover money rounding, economics, collection guards, agreement approvals, the hero amendment timeline, notices, outcome cutoff and outcome-card behaviour. No tests or source files were edited. This was not a full-suite, live-provider or frozen-AI evaluation run.
- Exercised five application actions expected to fail or be unsupported, recording the response and confirming collection attempts stayed unchanged.
- Read relevant collection, mandate, amendment, ledger and outcome code to distinguish working internal rules from absent user journeys.
- Real checkout, webhook authenticity/reordering, provider retry execution/cancellation, bank settlement, actual refunds, tax documents, external receipts and multi-user access were not tested. The scope below explicitly separates browser evidence, domain-test evidence and missing capabilities.

## Financial reconciliation observed

| State | Contract incl. GST | Successful payments recorded | Remaining contract amount incl. GST | What the UI should communicate |
|---|---:|---:|---:|---|
| Phase, first payment received | ₹46,020 | ₹23,010 | ₹23,010 | ₹19,500 pre-GST + ₹3,510 GST remain |
| Phase, revised date approved by both sides | ₹46,020 | ₹23,010 | ₹23,010 | Original scheduled attempt replaced; one revised collection remains |
| Phase, revised debit succeeds | ₹46,020 | ₹46,020 | ₹0 | All scheduled payments collected; delivery can continue |
| Annual split, May debit succeeds | ₹1,41,600 | ₹1,41,600 | ₹0 | Current collection complete, although only ₹42,480 falls in the 90-day metric |
| Deferred annual, first May payment received | ₹1,41,600 | ₹11,800 | ₹1,29,800 | Current receipt exists; none falls in the earlier measurement window |

For the phase: ₹39,000 pre-GST + ₹7,020 GST = ₹46,020. Each ₹23,010 payment comprises ₹19,500 + ₹3,510. Recorded schedule totals and line arithmetic reconciled across inspected versions under the fixture's configured 18% GST assumption. This verifies arithmetic, not the appropriateness of that rate or invoice treatment for a real business.

Evidence: [reconciliation calculations](finance-evidence/reconciliation.json), [version and attempt snapshots](finance-evidence/observations.json).

## Journey coverage

| Finance journey | Observed / verified behaviour | Assessment |
|---|---|---|
| Review proposed economics | Forecast exposes configured direct costs, estimated fees, contribution and rule checks | Good disclosure; forecast is not bank cash or realised profit |
| Sent, unaccepted offer | No collection attempt; simulation refuses payment | Correct action boundary; displayed balance looks like an accepted obligation |
| Buyer declines | No payment setup, closed state | Balance and “GST to collect” still shown from proposed terms |
| Acceptance and setup | Upfront and recurring setup pending stated together | Clear |
| Debit before mandate confirmation | Refused without changing attempts | Correct |
| Upfront receipt | Paid row, split balance/GST and collected figure | Correct arithmetic; total amount still to collect deserves prominence |
| Repeat upfront receipt simulation | Refused, attempts unchanged | No duplicate receipt in this exercised path |
| Mandate confirmed | Next payment appears | Method/cap/end date and confirmation provenance not consolidated on merchant Track |
| Advance notice | Notice amount/date linked to scheduled debit | Useful; channel and notice are simulated |
| Buyer says “I paid” | Verification task; no payment recorded | Correct; no receipt-matching workflow completes the task in this prototype |
| Claim marked handled | Schedule and ledger unchanged | Correct financial boundary; unresolved follow-up can disappear, as Persona 3 found |
| Preventive amendment draft | Original debit remains scheduled; new date pending | Clear |
| Merchant approves amendment | Original collection remains until buyer acceptance | Correct distinction |
| Buyer accepts preventive amendment | Original attempt removed; revised version schedules one replacement | Correct in exercised branch |
| Debit fails | Failure retained, internal retry dated 4 Dec | Correct internal scheduling; not proof of provider execution |
| Retry succeeds without amendment | Current simulator cannot select the internal retry | Not an observed end-to-end branch; do not claim recovery is fully demonstrated |
| Amendment after failure | Failed attempt kept; retry stays until both approvals, then removed | Strong traceability |
| Revised debit succeeds | Only successful receipts counted; failed/removed attempts not counted as extra money | Correct in exercised branch |
| Repeated success after full payment | Refused; attempts unchanged | Correct exercised boundary |
| Unknown/submitted outcome | Existing domain tests block overlapping collection | Domain evidence only; browser simulator has no standalone pending-outcome event |
| Out-of-mandate revision / revoked mandate | Existing hero/domain checks require fresh authorisation or reject the plan | No full browser reauthorisation/revocation journey demonstrated |
| All-upfront alternative | Entire payment recorded without a recurring mandate | Correct variant; service completion is separate |
| Annual payment after day 90 | Operational ledger includes it; outcome cash excludes it | Correct period logic with misleading labels |
| Deferred offer starts after window ends | ₹11,800 collected operationally, ₹0 in outcome receipts | Same period-label issue, more visible |
| Requested date fails engine checks | No change to amounts or original schedule | Safe engine refusal; unresolved inability to pay is not prominent enough |
| Invoice/receipt reconciliation | Planned invoice lines and attempts visible in audit | No actual issued-invoice status, receipt document or bank matching |
| Refund, partial receipt, overpayment, write-off, external transfer | No completed finance journey exposed | Missing capability; do not treat unsupported events as zero or silently settle balances |
| Cancel accepted service / stop future collections | No completed operator workflow exposed | Distinct from declining an initial offer; future scope |

## Findings, ranked

### FN1 — A 90-day metric is labelled like an all-time payment balance

**High confidence, presentation defect.** In the annual split after 1 May 2027:

- Payment schedule: both instalments Paid.
- Payment details: Collected (verified) **₹1,41,600**.
- Outcome card: Payments recorded in Adaptive Deals **₹42,480**.

The outcome excludes the ₹99,120 May receipt because the measurement cutoff is **30 December 2026, 09:00 IST**. Its arithmetic is intentional and correct. The label omits the time boundary. In the deferred plan, the same screen shows ₹11,800 collected and ₹0 “Payments recorded”.

**Recommendation:** maintain two explicit scopes: current contract collections as of a visible date, and receipts within the eligibility-based 90-day measurement window. Label the latter “Payments recorded within the 90-day window” and show its cutoff beside the number, not only inside calculation details. Explain excluded later receipts where relevant. Preserve the frozen metric definition; do not change it to make figures match.

Evidence: [annual completed collections](finance-evidence/21-annual-paid-after-window.png), [deferred first receipt](finance-evidence/23-deferred-first-payment.png), [mobile view](finance-evidence/22-mobile-annual-paid.png). Sources: `lib/outcome.ts`, `components/outcome-card.tsx`.

### FN2 — Proposed and declined terms are presented as a balance to collect

**High confidence, state/presentation defect.** After buyer decline, Track says Closed and Current accepted contract: Not accepted. Yet Payment details shows **Balance excl. GST ₹39,000** and **GST to collect ₹7,020**. The same tiles appear while the buyer has not accepted. These figures are calculated from the proposed structure, not an accepted agreement.

**Recommendation:** before acceptance, call this a proposed payment schedule and keep its figures out of operational balance tiles. On decline, show the proposal as history and “No accepted contract recorded in Adaptive Deals”. Do not assert the business is owed nothing anywhere; simply state what this app has recorded. Keep the declined deal in the eligible-deal measurement denominator as designed.

Even after acceptance, label the figure “Remaining contract payments”, not an assertion that the entire amount is overdue or recognised revenue.

Evidence: [declined deal](finance-evidence/24-declined.png), [unaccepted deal](finance-evidence/02-not-accepted.txt). Source: Track computes the ledger from the latest delivered structure even when it lacks buyer acceptance.

### FN3 — The amendment changes an invoice date without explaining that change

**High confidence, change-summary inconsistency.** Version 1 contains planned invoice `inv-2` dated **1 December**. Version 2 moves it to **21 December**, alongside the revised debit. The invoice ID and amounts remain the same. The audit displays the revised invoice date. Meanwhile, the buyer summary says the payment date changes and “everything else” stays unchanged.

This is a planned invoice schedule; the prototype has not issued a real invoice. It is not evidence of an actual tax-document alteration. Nevertheless, finance needs the complete change explained.

**Recommendation:** establish the intended relationship between the payment date and planned invoice date. If both move, show both in the amendment comparison and label invoices as planned/not issued. If the product intends a payment-only change, preserve the invoice schedule through an explicitly reviewed domain change. Do not patch canonical terms or frozen rules casually. Issued-document corrections need a separate future workflow; never imply that accepting an amendment rewrites an already-issued document.

Evidence: [invoice version comparison](finance-evidence/invoice-version-comparison.json), [audit schedule](finance-evidence/26-invoice-schedule.png), [buyer summary](finance-evidence/26-revision-summary.txt). Source: `rescheduleLine` in `domain/amendment.ts` changes both schedules.

### FN4 — Receipt evidence and settlement status are not available where finance needs them

**High confidence on missing workflow.** The app has successful attempt records and simulated payment IDs, but the merchant's operational view primarily shows date, amount and Paid. The audit adds attempt status/version and advanced internal keys. It does not provide a compact reconciliation row joining the actual success timestamp, payment reference, source/mode, agreement version, schedule line and planned invoice. Bank settlement and actual fee records are not modelled.

**Recommendation for this build:** make an existing-record payment-details drawer available from a paid/failed row. Include source, mode, success timestamp, references that actually exist, GST split and agreement version. Say “Simulated payment success” for these runs. Clearly state bank settlement is not tracked. Use explicit unknown/unavailable states for absent fee, refund and settlement data.

**Potential next feature:** a downloadable collection statement assembled from those records, clearly identified as a payment history, not a GST invoice or bank statement. This is more focused than building an accounting dashboard. Actual reconciliation with Razorpay/bank data remains an integration project.

No claim is made that the existing simulation label is absent everywhere; it is visible in the surrounding app and audit. The improvement is to attach provenance directly to the financial status users may quote or export.

### FN5 — The headline financial figure is less useful than the outstanding amount

**High confidence on current layout; usability priority is a hypothesis.** After the first phase payment, finance sees Balance excl. GST ₹19,500 and GST to collect ₹3,510 in collapsed details, while provisional contribution has a prominent headline. To answer the client, the operator needs **₹23,010 remaining including GST** and its date.

At 21 December, provisional contribution is **₹21,579.60**, above the full-contract forecast **₹19,329.60**. This is not demonstrated outperformance: the provisional calculation includes ₹16,500 modelled costs so far, whereas the contract forecast includes ₹18,750. The remaining ₹2,250 is January delivery cost. Refunds, actual payment fees and irrevocably committed future costs are not available.

**Recommendation:** lead Track's financial summary with current accepted value, recorded collections, remaining contractual amount including GST, and next debit/exception. Keep the pre-GST/GST split accessible. Put the 90-day contribution metric below operational facts with its time boundary and existing missing-input disclosures. If forecast and provisional figures are compared, explicitly label their different horizons; do not show a performance delta.

“Unpaid service value” and “Funding requirement” are also model-derived from the delivery/cost schedule, not proof of completed work or actual bank expenditure. Label that basis. Preserve their separation; they must not be added into a single loss figure.

Evidence: [first receipt](finance-evidence/04-upfront-paid.png), [phase collected](finance-evidence/12-phase-collected.png), [forecast breakdown](finance-evidence/01-economics-open.txt).

### FN6 — Authorisation and retry history need a concise operational view

**High confidence on existing limitations.** Pending mandate authorisation is clear in the main status. Once confirmed, the merchant lacks one concise read-only block showing authorisation status, method, cap, end date and whether a revision reuses it. The amendment says the existing mandate fits, which is useful. The attempt audit correctly retains paid, failed and removed records.

The retry-only recovery path cannot be completed with the existing simulator: after failure schedules the 4 December retry, Simulate debit succeeded reports “No recurring debit is scheduled”, because the selector excludes internal retries. The retry is also never automatically submitted by the internal model. The UI's scheduled retry must not be narrated as demonstrated bank automation.

**Recommendation:** expose existing mandate facts and per-line attempt history, with the active attempt clearly separated from superseded ones. For demo coverage, consider a labelled internal-retry event and an unknown-outcome scenario as a separately scoped enhancement. Keep the real-world distinction between removing an internal planned attempt and confirming provider cancellation. Revocation, expiry, fresh authorisation and provider cancellation need integration validation before production claims.

Evidence: [retry scheduled](finance-evidence/13-failed-retry-scheduled.png), [retry awaiting amendment](finance-evidence/14-retry-amendment-draft.png), [retry replaced](finance-evidence/16-retry-removed.png), [guard responses](finance-evidence/guards.json).

### FN7 — Exception resolution remains incomplete

The finance review confirms earlier findings: an unverified payment claim can be marked handled without being reconciled, and a rejected reschedule can return the page to Up to date while the original debit remains planned. Neither changes the ledger improperly. The danger is that unresolved work appears finished.

**Recommendation:** preserve the pending verification or buyer-follow-up state, its owner/disposition and the still-active collection schedule. Add a real matching workflow only when actual provider/external-payment data is in scope. Do not add an unchecked “Mark paid” shortcut.

These are shared Persona 1/3 findings; merge them into the same backlog items.

## Safeguards worth retaining

Browser action checks recorded unchanged attempts when refusing:

- Payment before an active agreement.
- Recurring debit before mandate confirmation.
- Repeating an already-paid upfront simulation.
- Another recurring success after all scheduled payments were collected.

The fifth guard response documents the unsupported retry-success simulation, not a passed product capability.

Domain tests separately verify duplicate scheduled-line prevention, unique internal idempotency keys, no overlapping collection while outcome is unknown, no further charge on paid lines/fully paid agreements, valid transitions, and retry scheduling only after a confirmed failure. The hero timeline verifies that a failed attempt stays in history, the old retry is removed only after approval/acceptance, and the paid upfront line is not charged again.

These tests support internal correctness. They do not prove provider webhook idempotency, concurrent multi-process safety or successful cancellation of a real debit.

## Unsupported finance journeys and scope decision

| Missing journey | Honest current boundary | Recommendation |
|---|---|---|
| Partial receipt / split external payment | Current simulation records scheduled line amounts in full | Defer modelling and allocation; never pretend it is supported because Razorpay has payment-link partial payments |
| Refunds and chargebacks | Missing-input disclosure; no transaction workflow | Keep unavailable rather than assuming zero |
| External bank transfer / buyer payment claim | Requires verification outside app | Future evidence-based matching, not manual unverified settlement |
| Overpayment, deductions, write-off | No allocation/disposition workflow | Productisation requirement if real receivables management is promised |
| Issued GST invoices / credit notes | Planned invoice schedule only | Label plans; actual document lifecycle is separate |
| Bank settlement and actual fees | Not modelled | Explicitly unavailable; future provider integration |
| Mandate revoked/expired / fresh authorisation | Domain concepts exist; incomplete user/provider journey | Separate production scope and scenario validation |
| Cancellation after acceptance | Not the initial-decline flow | Needs explicit service, contract and collection consequences |
| Multi-deal aging / accounting export | Single-deal prototype | Defer dashboard; a bounded collection statement is a more focused next step |

Do not add all of these to the buildathon. The immediate work is making existing facts truthful and legible, not expanding into an accounting suite.

## Recommended order

1. Correct proposed/declined balance presentation and disclose the 90-day boundary beside outcome receipts.
2. Resolve the invoice-date amendment summary/model decision explicitly.
3. Prioritise current collections and gross outstanding; expose existing payment references, source and dates.
4. Keep exception resolution visible and add compact mandate/attempt detail.
5. Consider a collection-history export and additional simulated failure states only after the core corrections.
6. Defer bank reconciliation, invoices, refunds, partial payments and team permissions as distinct productisation work.

## Questions for actual finance users

- Which identifier do they use to match a payment to an invoice, buyer and bank deposit?
- How often do buyers pay partly, pay externally, deduct amounts or request refunds?
- Who can approve a payment-date change, and who can stop collection?
- Which documents are already issued when a rescheduling request arrives?
- Would existing accounting exports suffice, or does the team need an in-product payment statement?
- Is the 90-day metric useful to this operator, or primarily to the founder/product owner?

No product code was changed. Existing uncommitted screenshots and frozen evaluation assets were left untouched. The next persona remains the delivery/project manager, who should inspect obligations and the meaning of service completion separately.
