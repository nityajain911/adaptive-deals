# Persona 3: Agency account manager — complete journey review

3 October 2026 · HEAD `f03d90e`; product code last changed at `d525ce1`.

This is an agent-conducted inspection of the existing application using an assumed role. It is not an interview, independent validation or a participant in the five-person worksheet. Persona 1 and 2 recommendations remain unimplemented.

## Persona and assessment

The account manager at fictional Pinecone Media Works handles the client's messages, prepares offers, asks the founder to approve commercial commitments, and coordinates with finance and delivery. They may know the client's context without having authority to change price, scope or payment terms. This division of work is an assumption to test with merchants, not a verified description of every small agency.

Their practical questions: What did the buyer last say? Which facts are confirmed? Can I prepare this without committing the founder? Who is waiting for whom? What must I tell the client? If I hand this to a colleague, can they understand what remains unresolved?

**Assessment:** the three-stage flow supports one authorised merchant well on the routine path. It does not yet represent a separate preparer and approver. More urgently, important new messages can fail to interrupt an older recommendation, and recording that a message was handled can hide an unfinished task. These issues affect even a solo founder returning to a deal later.

## Method and boundaries

- Used the production browser build on an isolated port 3101 with synthetic state. The main port 3100 demo was untouched.
- Primary walkthrough at 1440 × 1000; inspected a conflicting-replies state at 390 × 844. This is not a full device or accessibility audit.
- Used real visible merchant controls to send questions, interpret typed answers, use answers, prepare the preview, approve/send, retry delivery, mark a message handled, draft amendments and approve revised terms.
- Used the existing actions endpoint for simulated inbound messages, buyer acceptance/decline and payment events. Those are not actual WhatsApp, banking or multiple-user sessions.
- Inspected rendered pages, saved records and the relevant state/view code. Captured 31 page states/details views; this number measures inspection coverage, not product quality or users tested.
- No live AI calls, real payments, product changes, frozen-data changes or claims of test-suite execution. An engine evaluation of new arbitrary buyer constraints was not performed; the late-correction case deliberately checked whether new evidence interrupts existing work.
- Production authentication, permissions, concurrent editing, real finance handoffs and every possible message/date combination remain outside the review.

## Journey coverage

| Account-manager journey | Observed behaviour | Assessment |
|---|---|---|
| Open stalled deal | Blockers, questions and conversation; one primary action | Useful starting point, but deal intake and assignment are outside the prototype |
| Send questions | Explicit batch send, then waiting | Clear agency-controlled action |
| Only one typed answer arrives | Shows answer but continues waiting for remaining reply | Reasonable; cannot yet interpret first answer in place |
| Both answers typed naturally | Both require manual interpretation, including the exact demo wording | Honest fallback; significantly more manual work than the scripted route |
| Interpret answers | Select value and copy supporting words; records merchant judgement | Completes through UI; no claim that code verifies the meaning |
| Apply answers and review offer | Moves to offer with calculated economics | Clear; engine evidence remains available |
| Prepare for founder | Draft persists, explicitly not sent | Useful preparation boundary; no named founder or internal approval handoff |
| Approve and send fails | Shows approved but not sent, then Retry sending | Good recovery without pretending delivery succeeded |
| Retry succeeds | Track names delivered version and waiting buyer | Clear |
| Return to prior stage | Settled confirmed summary and current-stage link | Clear until a later correction contradicts the summary |
| Buyer asks to hold delivered offer | Request saved; primary status remains waiting for buyer | Shared ownership defect from earlier reviews |
| Buyer corrects budget after draft preparation | Stored message does not reopen review or prevent sending old offer | New consequential gap; details below |
| Buyer accepts and completes simulated setup | Next debit shown after setup | Useful coordination status; actual work authorisation/finance assignment is not modelled |
| Unsupported timing reply | Shows merchant attention and suggests personal follow-up | Safe fallback, but the return path after that follow-up is incomplete |
| Mark reply handled with outstanding founder decision | Attention card disappears, “Up to date” returns; note stays in storage | Message disposition and business resolution are conflated in the main view |
| Buyer corrects an open payment-change request | Second reply retained, first request protected from overwrite | Correct data protection; first request still wins the primary action |
| Draft after corrected request | Draft uses 21 Dec from first reply, not 25 Dec implied by later reply | No silent overwrite, but unresolved newer evidence is too easy to overlook |
| Straight preventive revision | Before/after terms, rechecks, original debit status and explicit approval | Strong core path |
| Buyer accepts revision | Rescheduled payment and version history shown | Clear |
| Revised debit paid | All scheduled payments collected | Appropriate wording; delivery still continues |
| Buyer declines | Closed state; reason in outcome detail | Correct, but reason is not the first thing a returning account manager sees |
| Debit fails | Retry status appears | Useful; not a reason to claim buyer has paid or agency cash has settled |
| Buyer says “I paid” | Requests verification rather than moving the ledger | Correct; reconciliation remains outside the app |
| Requested date fails checks | Main status becomes up to date with original debit | Shared unresolved-exception issue from founder review |

## Findings and improvements

### A1 — New buyer evidence does not interrupt an older offer

**Observed; high confidence, highest priority.** After the original answers were applied and a ₹46,020 draft prepared, I submitted a new reply to the GST clarification:

> Correction: our available budget is now only ₹20,000 including GST. Please do not send the ₹46,020 proposal.

The message was stored. Understand still said “Buyer constraints confirmed” and its expanded details still showed ₹50,000. Offer/preview continued to invite approval. I clicked the real Approve and send button; the ₹46,020 proposal was delivered successfully in simulation.

This is not proof that the engine calculates incorrectly. Its confirmed inputs had not changed. The gap is that unreviewed buyer evidence does not make the existing decision require review. The draft fingerprint checks the existing engine options and terms; it does not cover this new reply. Stage-scoped conversation also hides the new clarification reply from Track and the settled Understand summary.

**Recommendation:** track whether incoming evidence relevant to the prepared decision remains unreviewed. A later reply to a clarification used by the offer should flag review and block initial approval/sending until disposition. Show the old confirmed value and the new message together. The merchant can confirm a correction and recompute, or explicitly record why it does not change the terms. Do not let AI silently rewrite commercial facts or treat every inbound “thanks” as a changed budget.

If updating the budget is outside the prototype's supported workflow, hold the offer and provide an explicit external handoff. Accepted contracts must retain their terms until the existing amendment/approval process completes; this proposal-review rule must not silently mutate them.

Evidence: [expanded stale summary](account-manager-evidence/29-settled-details-after-correction.png), [still-approvable preview](account-manager-evidence/13-late-correction-preview.png), [delivery after correction](account-manager-evidence/14-sent-after-correction.png), and [stored observations](account-manager-evidence/observations.json), entries 11–14. Source paths: `lib/service.ts` (`applyBuyerReply`, `progressFacts`, `currentFingerprint`) and settled Understand rendering.

### A2 — A corrected payment request should be reviewed before advancing the first one

**Observed; high confidence.** On 28 November, the buyer first says “Cash is tight till the 20th”, then “Actually cash is tight till the 24th.” The duplicate guard correctly preserves the original request and records the second reply for attention. But the prominent action still says Draft revised terms based on the 20th. Clicking it produces a 21 December draft. The newer correction is in a collapsed attention card; its full context sits farther down the page.

**Recommendation:** put the conflicting newer reply ahead of drafting or approving that amendment. Display both replies with their order. Require explicit resolution before advancing; never overwrite the first date automatically. If selecting a corrected date is not supported, show an honest handoff instead of presenting the original date as ready for approval.

This sharpens founder F1's duplicate-request finding. It is one shared issue, not another independent customer report.

Evidence: [mobile conflicting replies](account-manager-evidence/18-mobile-conflicting-replies.png), [original date drafted](account-manager-evidence/19-draft-original-date.png).

### A3 — “Handled” does not necessarily mean the buyer's problem is resolved

**Observed; high confidence.** For unsupported “20 tak cash tight hai”, I entered the handling note “Spoke to buyer. They asked for 24 December; founder to confirm.” Mark as handled removed the attention card and restored “Up to date · next payment ₹23,010 on 1 Dec 2026.” The original message still displayed “Merchant attention needed”. The saved note was not visible in the normal Track view or the audit drawer; audit only said one message had been handled. The note remains in stored records/events.

The action explicitly warns that it does not send a reply or change payment terms. Its limited behaviour is therefore intentional, not a ledger defect. The workflow lacks a place for “I followed up, but someone still needs to decide.”

**Recommendation:** expose the existing handling note and time beside the message, labelled as merchant-reported follow-up. Distinguish acknowledged/follow-up pending from resolved. A pending founder or buyer decision should remain visible alongside the unchanged scheduled debit. Do not infer resolution by interpreting a free-text note with AI. Do not mark a payment received merely because someone marked its message handled.

An explicit resolution disposition requires a small state design; merely renaming the button cannot create a real follow-up workflow.

Evidence: [post-handling screen](account-manager-evidence/16-handled-but-unresolved.png), [saved handling record](account-manager-evidence/handling-record.json), [audit text](account-manager-evidence/31-audit-handling-note.txt).

### A4 — Preparation and authority are not separate roles in this build

**Observed; high confidence.** I can prepare an unsent preview, but the next action is Approve and send. The app has no visible “Awaiting founder approval”, assignment or named approver. Approval records use “Merchant (Pinecone Media Works)”, while interpretations and handling notes use the generic merchant actor. The demo does not distinguish account manager from founder.

**Recommendation for the current submission:** explicitly scope commercial approval to the authorised merchant. A manager can prepare the preview and the founder can review that same draft, but describe this as a manual handoff. Do not claim the app enforces separate team permissions or authenticated founder approval.

**If team operation becomes part of the product promise:** add a lightweight prepare → request approval → named authorised approver flow, enforced by the service and identity system. A role dropdown or an approval-status badge alone would be misleading. This is additional functionality, not a presentation fix; defer it unless central to the selected customer.

Evidence: [draft handoff boundary](account-manager-evidence/06-founder-handoff.png), [approval attribution](account-manager-evidence/31-audit-handling-note.txt).

### A5 — Manual interpretation needs a clearer, smaller working area

**Observed; high confidence on behaviour, moderate confidence on proposed usability improvement.** Two ordinary typed answers require selecting Includes GST / Per contract and copying a verbatim quote. The explanation correctly says semantic interpretation is the merchant's judgement. The banner says “One answer needs your interpretation” although there are two forms. The same reply appears in the question, interpretation form and conversation.

**Recommendation:** use the actual outstanding count, focus one answer at a time, and reduce repeated text. Let the operator select supporting text directly or reuse the visible reply while requiring deliberate value confirmation. Keep source text and attribution accessible. Provide an honest “Not clear yet” path instead of making binary choices seem obligatory.

A useful wording distinction after completion is “Buyer replied; interpretation recorded by merchant”, wherever that is true. Do not present manual interpretation as model extraction or code-verified meaning. There is no need to change a frozen prompt to improve these surrounding controls.

Evidence: [typed-answer screen](account-manager-evidence/03-typed-replies.png). Both manual interpretations completed through the UI before offers were generated.

### A6 — The conversation looks like an inbox, but cannot support a normal personal reply

**Observed; high confidence.** It shows questions, proposals and messages, but the merchant cannot compose a normal response there. The fallback explicitly tells them to reply personally outside the prototype. After the offer, only the latest two conversation items are expanded, and the conversation is below the outcome card. Earlier clarification replies can disappear from the current working stage even when still relevant.

**Recommendation:** keep the explicit simulation boundary. Put unresolved messages and their next steps above measurement; show resolved history compactly. Expose recorded follow-up notes where colleagues would look for the conversation. Preview the exact generated outbound message before sending, as already proposed in Persona 1.

A real outbound composer, channel delivery status and WhatsApp integration are separate scope. Do not add a fake Send reply button or a second inbox merely to imply that integration exists.

## What builds trust for this role

- Drafts visibly remain unsent until approval; delivery failure and retry have honest states.
- Evidence quotes, explicit manual interpretation and the existing audit drawer support explainability.
- The amendment card separates the proposed date from the still-active debit and makes both approvals visible.
- Payment claims do not move the ledger; unsupported language goes to the merchant instead of being guessed.
- Completed payments are described as collected, without claiming all service delivery is complete.

Preserve those boundaries. The goal is a reliable handoff between conversation, decision and execution, not more dashboard cards.

## Consolidated priority from this persona

1. **Before expanding scope:** prevent unreviewed later clarification replies from being ignored at approval/send; surface conflicting replies before advancing amendments.
2. **Existing-flow clarity:** distinguish follow-up from resolution and show saved handling notes; fix the outstanding-interpretation count and attribution.
3. **Shared backlog items:** proposal change requests need merchant ownership; failed restructuring must remain unresolved; outgoing message preview and mobile focus still matter. Do not duplicate them as separate features.
4. **Explicit product boundary:** the current build is an authorised-merchant workspace. Team approval, named assignments and real chat integration are productisation work.

Do not add a CRM pipeline, automatic follow-ups, internal chat, multiple approval levels or a new inbox during this review round. For the account manager, the immediate win is knowing which buyer statement is current, which decision is pending, and who needs to act.

## Questions for real merchant research

- Does the founder typically operate the tool, or does an employee prepare offers?
- Can that employee approve within a limit, and which changes always need the founder?
- How often do buyers correct a constraint after a draft is prepared?
- Where are phone-call outcomes and personal WhatsApp follow-ups recorded today?
- Does the team need in-product follow-up tracking, or just a reliable handoff into its existing system?

These determine the team roadmap. This inspection demonstrates workflow gaps; it does not establish their frequency or commercial demand. Continue remaining persona inspections on this baseline, then consolidate approved changes.
