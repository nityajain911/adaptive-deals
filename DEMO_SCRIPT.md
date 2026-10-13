# Adaptive Deals — 90-second demo script

## Setup

Open the hosted link a minute before you start (the free host sleeps when idle) and go to **Active deals** (`/deals`). If the state is not fresh, open the **Presenter** bar at the bottom and choose **Reset this deal to step 1**. Choose **Start walkthrough**: the guide is the dark pane on the right, with one big **Next step** button. It begins on **Deal settings** (prices, costs and limits), then moves to the deal. Keep it open while you record.

How the guide works: on a merchant step it shows **Your turn** and names the product's own button; **Show me** scrolls to that button and rings it, and never clicks for you. Only simulated buyer and system events have a guide button, and those are violet and labelled. Every merchant, buyer and amount is fictional, the green **SIMULATED** pill stays on every screen, and no real payment is taken.

If something goes wrong mid-recording: **Presenter page → Open a buyer situation** opens any of the three deals in one tap, each on its own recorded run; **Reset this deal to step 1** restarts the current one.

The hero replays **Recorded Cerebras output** from the exact frozen conversation. The other two cases replay their own recordings, and each keeps a labelled hand-written sample as its fallback.

## The 90 seconds (the hero deal: Harbour Fresh Foods)

Open with the problem, not the product: it gives the judge the context for everything that follows. Start on **Active deals** with Harbour Fresh Foods selected, so the buyer's own words are on screen while you speak. If you have no hard length limit, a 2-minute cut with a 15-second opening is safer than rushing the product.

| Time | Show | Suggested narration |
| --- | --- | --- |
| **0–12 s** | **The problem.** Stay on **Active deals**; Harbour Fresh Foods is selected, with its facts and the chat below. | “A small agency sends a ₹1.4 lakh annual quote. The client's finance head replies on WhatsApp: ‘I would rather start small and see results first. I only have ₹50,000 left this quarter, and anything above ₹60,000 goes to our MD.’ The owner would usually discount on instinct, which on these numbers loses about ₹14,600. Adaptive Deals restructures the offer instead, keeps the margin, and collects through Razorpay.” |
| **12–17 s** | **Deal settings,** only the services table: **You keep** and **Status** on every row. Then **Go to Active deals**. | “It starts from this merchant's own prices, costs and limits.” |
| **17–32 s** | Open **Harbour Fresh Foods** and start the deal. On **Understand**, hover a fact (the budget, or the **Condition** row): the buyer's own sentence lights up in the chat. Send the two questions; the guide plays the buyer's replies in Divya's and Kabir's own words (for example “Yes, both amounts include GST. Finance confirmed it this morning.”). Answers apply themselves (green chips) and **Review offer** appears under the chat. | “AI read the conversation and every fact is tied to the buyer's own words. Only the two questions that change the decision are asked, and clear answers apply on their own.” |
| **32–48 s** | **Review the offer.** The suggested offer is the three-month package **paid upfront** (₹46,020, one payment). The change list against the quote, the margin bar (**You keep about ₹19,330**) and the alternatives. Point at the **Rest of the year** line in the change list, then select **Review buyer proposal**. | “Code builds every offer the merchant's templates allow and checks each one. The full annual plan needs the buyer's MD. This pilot phase, the website plus three months of search and reporting, fits their limit, is paid in one go and can start now. And the rest of the year, ₹84,960, is held at today's rates until 18 March, checked by the same rules, so the review in February is a decision, not a new negotiation.” |
| **48–62 s** | **Send offer.** Show the summary and the drafted WhatsApp message (it ends with the held-offer sentence); select **Send offer**. Back on Active deals the deal reads **Waiting for buyer**: open it, choose **See what the buyer sees**, and tap **Accept and pay ₹46,020**. | “The merchant sees the facts and the exact message, not the buyer's checkout. One tap accepts and pays the whole first phase: simulated, nothing real moves.” |
| **62–78 s** | Track reads **First phase paid. The review is on 1 Feb 2027.** Press the guide's **Next step** (**Advance simulated date to 1 Feb 2027**). The product sends the buyer the month-three review message by itself, and Track waits for **the buyer's decision**. In the guide's reply list choose **“…Let's go ahead with the rest of the year.”** | “Three months later the pilot is paid and it is review day. The product asks the buyer: go ahead, ask for a change, or stop. The buyer can say any of the three; I choose one for them.” |
| **78–90 s** | The merchant's card now shows what the buyer said. Press **Send the rest of the year**. The guide sends you to the buyer's page, which still has both ways to go: **Accept and pay ₹28,320** and **Stop here**. Tap **Accept and pay ₹28,320**; the guide ends with “the second and last phase”. | “Their answer decides my action: they said go ahead, so I send the rest of the year exactly as held, checked again by the same rules. The buyer can still stop on their own page.” |

**What the buyer's three answers do (each about 15 s, in the guide's reply list).** The list reads: *Continue as offered*, *Stop here, no need to proceed further*, and *Proceed with some changes*. The last one is a first step: **Next: choose the change** shows which change the buyer wants (**a price of ₹60,000 or less**, **a start on 1 April**, or **leaving out social media**), and only the complete reply is sent.
- **Continue:** as above. Kabir has judged his own test, so you are not asked to, and no way out is shown.
- **Proceed with changes:** the merchant's card says the buyer wants a change and links to the **offer screen**, which opens with the buyer's request (for example *They want the rest of the year at ₹60,000 or less.*) and shows what is committed (the held ₹84,960) against what the change would make it, in the same "what changed" card as the first offer: removed services struck through in red, the new total beside the old, payments and approval. The best fit is the suggested offer, the others sit under **Other offers** with **Use this instead**, and **Send to the buyer** sends the one shown. A price of ₹60,000 or less suggests **Without Social media · ₹53,100** (alternatives: without Social media and Monthly reporting · ₹42,480, and as held); a start on 1 April suggests **Start 1 Apr 2027 · ₹84,960**; leaving out social media suggests **Without Social media · ₹53,100**. There is no option to close, because the buyer wants to carry on.
- **A change asked for on the sent proposal** (price or scope) comes back to the same screen: it compares the answer with the offer that was sent (₹46,020), not the original quote, and the held rest of the year is carried over unchanged.
- **Stop:** “…we'd like to stop here.” The card asks you to **Close after the first phase**; Track reads “The buyer chose to stop after the pilot, and you closed the deal…” and the deal shows **Completed**.
- A typed reply is read by you: no decision is guessed, and you confirm Kabir's condition (or close) yourself.

**Two other endings (about 15 s each).** If you choose **Not met · close after the first phase**, Track reads “You chose not to send the rest of the year because their condition was not met…”, the deal shows as **Completed**, and nothing was sent to the buyer. The buyer's own way out: On the buyer's page tap **Stop here** and confirm: Track reads **The buyer chose to stop after the first phase. Nothing more is due, and the deal closes here.** The deal shows as **Completed**, the first phase stays paid, and no automatic payment was ever set up. Use it in the 2-minute cut or when asked what happens if the pilot disappoints.

**What is sold and what is held (do not overclaim).** The first phase is the sale: it is priced, checked, approved by both sides and collected. The rest of the year is a **held offer** inside the same terms: the remaining scope at today's rates (₹84,960 including GST, three quarterly payments from 1 February 2027), held until 18 March 2027, checked by the same engine against the merchant's floor and the buyer's limits. It needs the buyer's MD, and the offer says so. Nothing is collected for it until the buyer accepts it after the month-three review (see the extras: **the month-three review**). There are exactly two phases; no third is held. The buyer's go-ahead test is shown as a **Condition** (in Understand, and again on the review card) and left to the owner to judge: sending the rest of the year records that the owner confirmed it was met, and the product never decides that itself. The hold period (45 days) is a default, not yet editable in Prices & costs.

Say “in my merchant interviews…” in the opening only if the one-pager states the interview facts (it now does: six founders, with the discounting and phasing quotes). The ₹14,600 comes from the demo merchant's own prices and costs (discounting the ₹1,41,600 annual plan to the ₹50,000 budget leaves ₹42,373 before GST against ₹57,000 of delivery cost).

## Two more cases to show on request

**They want everything, but can't pay until May (about 40 s) — Northstar.** The buyer asks for “the complete annual package” without naming services. **Which services do they need?** appears and the offer waits: tick all four and select **Confirm these services**. The offer then starts in May, and a line under it says why: any earlier start asks at least what the buyer does not have this quarter.

> “They said the whole programme but not which services, so the app refuses to guess. I confirm, and only then does it work out the offers.”

**They want to start in two weeks (about 20 s) — Blue Harbor.** No offer fits, and the app says why instead of inventing one, with the limits you could change.

> “When nothing works, it says so and explains why.”

## Optional extras

**Answer a lower price (about 60 s).** After sending, open the buyer's page, choose **Request a change**, **A lower price**, and send “Could you do a lower total: 40000?”. On Track the buyer's message is in the chat with the answers beneath it: **Hold firm**, **Smaller scope** (“Remove Monthly reporting: ₹42,480, still ₹2,480 above their ask”) and **Choose your own amount**. The smaller scope is worked out by the rules engine and checked against every limit; it does not reach ₹40,000, and the card says so. Choosing your own amount below your limits needs a reason and is recorded as the merchant's decision.

**A reply the rules can't read (about 40 s).** When the guide asks for the buyer's reply to the notice, choose **Type a reply…** and send “20 tak cash tight hai”. The merchant sees one plain suggestion, “unavailable until 20 Dec 2026, from '20 tak'”, with **Use this date** and **Ignore**. Nothing moves until the merchant uses it.

> “A fixed set of phrases is read by rules. For anything else, such as Hinglish, a model only suggests a date, code checks the quote and works out the day, and the merchant decides.”

**Bring your own rate card (about 40 s).** On **Deal settings**, **Upload your rate card**. The sample **PDF** and **CSV** replay their **Recorded Cerebras output**. A new price list in your own wording (for example “Site repair work, one time: Rs 30,000 / Google ads management, every month: Rs 5,000”) is read by a live model, and code accepts a value only if its quote is in the document and its one amount matches. **Review what we found** opens by itself; open **Where this came from** to see the exact line, then **Looks right, use these values**.

> “The AI proposes, and code checks every value against my document. Nothing changes until I check and save it.”

**Pay the first phase in two parts, and move a payment (about 60 s).** Under **Other offers**, choose **Start with a three-month package · two monthly payments** (**Use this instead**), send it and have the buyer accept. The guide then goes: **Advance simulated date to 28 Nov 2026**, **Send scheduled advance notice**, the buyer's reply (“Cash is tight till the 20th.”), the revised terms and the buyer's acceptance; Track shows **Payment rescheduled to 21 Dec 2026**. After that the guide goes on to **Collect the payment due 21 Dec 2026** and the same review as above.

> “A fixed set of date phrases is read by rules, and the engine rechecks the schedule, profit and mandate. Nothing changes until both people approve.”

Why the default is one payment: with equal profit and equal cash exposure, the suggested offer is the one with fewer payments, because every later collection is a collection risk. The two-payment offer is the **Smaller payments for them** priority and sits under **Other offers**.

**Timing and honesty for the review.** The rest of the year is collected after the 90-day window, so the Performance tab counts only the first phase in the window and says so; do not quote ₹74,340 as the metric. The rest of the year's last two payments (1 May and 1 Aug 2027) are not walked through; they use the same notice, debit and reschedule steps as a two-part first phase.

**Prove Commercial Memory (about 35 s).** **Presenter → Presenter page → Ask the rate card · judge Q&A**. Ask “Can monthly reporting be sold by itself?” and select **Test retrieval**: the exact quote appears with a **Code retrieval** label. The unsupported query returns *Insufficient evidence* instead of filling the gap, and **Show a source conflict** blocks two conflicting prices.

**The Razorpay MCP card.** It appears on Track only once a Razorpay test connection exists. The audit trail states what is implemented and what is simulated: the Payment Link part is implemented in test mode (only with your approval); the mandate and later debits are simulated; reporting reads only a link's status. Razorpay's test account refused links of ₹20,000 and above, so the ₹46,020 first payment stays simulated. Do not claim a real Razorpay call was made unless the audit trail shows a receipt, and do not say the Subscriptions API is used.

## Recording guidance

- Keep the main story on the preventive path. The failed-payment path belongs on the presenter page for questions.
- Say that the merchant approves anything that moves money. The merchant's screens never name a model: which one answered, and what was tried first, are on the presenter page and in the audit trail.
- The hero replays **Recorded Cerebras output** from the exact current conversation; the other two cases (**preserve-scope** and **no-fit**) replay their own **Recorded Cerebras output** too. Every case keeps a labelled hand-written sample as its fallback if a recording ever stops matching its conversation. The three earlier Groq runs are historical evidence only. None of these is an independent evaluation.
- Live models run only for a rate card that is not a bundled sample and for a payment reply the rules cannot read. Do not say AI read a payment reply the rules could read, and do not say a model chose a price or a date: a model suggests, code checks, the merchant decides.
- Do not claim a mandate guarantees payment, that the prototype measures actual delivery, or that the frozen evaluation is independent.
- If a step is out of sequence, choose **Restart** in the walkthrough and confirm. The guide returns to case selection and the guided path starts cleanly.
