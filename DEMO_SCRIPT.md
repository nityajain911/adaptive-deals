# Adaptive Deals — 90-second demo script

## Setup

Open the hosted link a minute before you start (the free host sleeps when idle) and go to **Active deals** (`/deals`). If the state is not fresh, open the **Presenter** bar at the bottom and choose **Reset this deal to step 1**. Choose **Start walkthrough**: the guide is the dark pane on the right, with one big **Next step** button. It begins on **Deal settings** (prices, costs and limits), then moves to the deal. Keep it open while you record.

How the guide works: on a merchant step it shows **Your turn** and names the product's own button; **Show me** scrolls to that button and rings it, and never clicks for you. Only simulated buyer and system events have a guide button, and those are violet and labelled. Every merchant, buyer and amount is fictional, the green **SIMULATED** pill stays on every screen, and no real payment is taken.

If something goes wrong mid-recording: **Presenter page → Open a buyer situation** opens any of the three deals in one tap, each on its own recorded run; **Reset this deal to step 1** restarts the current one.

The hero replays **Recorded Cerebras output** from the exact frozen conversation. The other two cases replay their own recordings, and each keeps a labelled hand-written sample as its fallback.

## The 90 seconds (the hero deal: Kestrel Lane Clinics)

| Time | Show | Suggested narration |
| --- | --- | --- |
| **0–12 s** | **Deal settings.** Point at the services table: what you charge, what it costs, **You keep** and **Status** on every row, and the example deal that moves as the limits change. Then **Go to Active deals**. | “Everything starts from this merchant's own prices, costs and limits. The product only recommends deals that respect them.” |
| **12–30 s** | Open **Kestrel Lane Clinics** and start the deal. On **Understand**, point at a fact (the budget) and hover it: the buyer's own sentence lights up in the chat. Send the two questions from the chat; the guide plays the buyer's replies. Answers apply themselves (green chips under each reply) and **Review offer** appears under the chat. | “AI read the conversation and every fact is tied to the buyer's own words. The two questions are the only ones that change the decision. The buyer's clear answers apply on their own.” |
| **30–48 s** | **Review the offer.** The change list against the quote (what stays, what changes, what was dropped and why), the margin bar (**You keep about ₹19,330**), and at most two alternatives. Open the pencil on **Delivery costs** or **Edit limits** to show a deal-only change. Select **Review buyer proposal**. | “Code builds every offer the merchant's templates allow and checks each one. The annual option needs the buyer's MD; this smaller phase can move now, and the merchant sees exactly what they keep.” |
| **48–62 s** | **Send offer.** Show the summary and the drafted WhatsApp message; open **Preview buyer view** and close it; select **Send offer**. Back on Active deals the deal reads **Waiting for buyer**: open it, choose **See what the buyer sees**, and tap **Accept and pay ₹23,010**. | “The merchant sees four facts and the exact message, not the buyer's checkout. One tap accepts, pays and authorises the later debit: simulated, nothing real moves.” |
| **62–82 s** | Advance the simulated date, send the notice, and have the buyer reply “Cash is tight till the 20th.” Review the revised terms, draft and approve version 2, then accept it as the buyer. | “A fixed set of date phrases is read by rules, and the engine rechecks the schedule, profit and mandate. Nothing changes until both people approve.” |
| **82–90 s** | Track shows **Payment rescheduled to 21 Dec 2026**. Open **Performance** or the audit trail just long enough to show the outcome. | “A profitable offer the buyer accepted, with every AI output, calculation and decision traceable. We would measure realised contribution within 90 days per eligible stalled deal.” |

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

**Prove Commercial Memory (about 35 s).** **Presenter → Presenter page → Ask the rate card · judge Q&A**. Ask “Can monthly reporting be sold by itself?” and select **Test retrieval**: the exact quote appears with a **Code retrieval** label. The unsupported query returns *Insufficient evidence* instead of filling the gap, and **Show a source conflict** blocks two conflicting prices.

**The Razorpay MCP card.** It appears on Track only once a Razorpay test connection exists. The audit trail states what is implemented and what is simulated: the Payment Link part is implemented in test mode (only with your approval); the mandate and later debits are simulated; reporting reads only a link's status. Razorpay's test account refused links of ₹20,000 and above, so the ₹23,010 payment stays simulated. Do not claim a real Razorpay call was made unless the audit trail shows a receipt, and do not say the Subscriptions API is used.

## Recording guidance

- Keep the main story on the preventive path. The failed-payment path belongs on the presenter page for questions.
- Say that the merchant approves anything that moves money. The merchant's screens never name a model: which one answered, and what was tried first, are on the presenter page and in the audit trail.
- The hero replays **Recorded Cerebras output** from the exact current conversation; the other two cases (**preserve-scope** and **no-fit**) replay their own **Recorded Cerebras output** too. Every case keeps a labelled hand-written sample as its fallback if a recording ever stops matching its conversation. The three earlier Groq runs are historical evidence only. None of these is an independent evaluation.
- Live models run only for a rate card that is not a bundled sample and for a payment reply the rules cannot read. Do not say AI read a payment reply the rules could read, and do not say a model chose a price or a date: a model suggests, code checks, the merchant decides.
- Do not claim a mandate guarantees payment, that the prototype measures actual delivery, or that the frozen evaluation is independent.
- If a step is out of sequence, choose **Restart** in the walkthrough and confirm. The guide returns to case selection and the guided path starts cleanly.
