# Adaptive Deals — 90-second demo script

## Setup

Run `npm run reset:seed`, open `/deals` and choose **Start walkthrough**. The first card asks the question the product answers: *A client says your quote doesn't fit their budget. What now?* The guide begins on **Prices & costs** (what the merchant charges, what it costs, and the lowest deal they will accept), then moves to the deal. Select **They only need the website and search for now** when the guide asks you to start a deal. Keep the guide open during the recording.

How the guide works: on a merchant step it shows **Your turn** and names the product's own button. **Show me** scrolls to that button and rings it; it never clicks for you. Only simulated buyer and system events have a guide button, and those are violet and labelled. All data, messages and payment events are fictional.

The merchant's screens are written for a merchant, not an auditor: there are two tabs (**Prices & costs** and **Deals**), each stage shows one decision, and the detail sits in closed sections. The **For reviewers** menu (top right) holds the guide, **Audit trail for this deal** and the presenter page. No model runs during the demo: every case starts from a hand-written sample output, and the audit trail says so plainly.

| Time | Show | Suggested narration |
| --- | --- | --- |
| **0–12 s** | The opening card, then **Understand the buyer**. In the WhatsApp chat the buyer's own words are marked; click “₹50,000 left this quarter” to see what was understood. **What's in the way** reads: your quote, their budget this quarter, more budget from April, their MD must approve above ₹60,000. | “A client says the annual quote doesn't fit. Adaptive Deals starts from their exact words, and every figure it uses is marked where the buyer said it.” |
| **12–25 s** | **Your turn**: send the two questions. In the guide, choose each simulated buyer reply, then select **Use these answers**. | “Two facts change which offers are allowed, so I ask the buyer instead of guessing. I choose to send. If they are not sure, the fact stays unresolved.” |
| **25–45 s** | **Review the offer.** The buyer's words sit above the **Suggested offer**: a three-month package, two monthly payments, about ₹19,330 kept. Open **How we worked this out**. Open **See other ways to do this deal**, choose *Keep the full project*: the annual offer leads, says *Needs their MD's approval*, and names the best offer the buyer can approve on their own. Go back to *Earn the most*. | “I choose what matters most; the app picks the offers and works out every figure. The annual deal is bigger but needs their MD, so I start with the three-month package they can approve themselves.” |
| **45–57 s** | Select **Review buyer proposal**. The preview says *You're seeing what the buyer will see.* Open **Message the buyer will receive**, then approve and send. | “Before sending I see exactly what the buyer sees. They receive only the agreed terms, never my costs or limits.” |
| **57–66 s** | Open the buyer's page. One line gives the total, the number of payments and what is included. Accept it, then use the two labelled system steps for the first payment and automatic payments. | “The buyer accepts the same version I approved. Payment setup starts only after that.” |
| **66–84 s** | Advance the simulated date, send the advance notice, and pick “Cash is tight till the 20th.” Draft the change, approve version 2, accept it as the buyer. Track shows the payment moved to 21 Dec 2026. | “Before the payment the buyer asks for time. The app reads the date, rechecks their limits and my profit, and nothing changes until both of us approve the same version.” |
| **84–90 s** | The guide ends with a summary written from the real state and **Try another case**. | “It shows what was agreed and who decided each step. We would measure what the merchant actually collects within 90 days per stalled deal, and the app can still say there is no offer that works.” |

## Two more cases to show on request

**They want everything, but can't pay until May (about 40 s).** The buyer asks for “the complete annual package” without naming services. **Which services do they need?** appears and the offer waits: tick all four and select **Confirm these services**. The offer then reads *Worked out again after the merchant confirmed the services.* The page also notes that whether GST is included was not mentioned and that every offer works either way. In the chat, “complete annual package” is marked amber.

> “They said the whole programme but not which services, so the app refuses to guess. I confirm, and only then does it work out the offers.”

**They want to start in two weeks (about 20 s).** The buyer needs work to start by the 15th with all four services. No offer fits, and the app says why instead of inventing one.

> “When nothing works, it says so and explains why.”

## Optional extras

**Answer a lower price (about 60 s).** After the proposal is sent, open the buyer's page, choose **Request a change**, pick **A lower price**, and send “Could you do a lower total: 40000?”. On **Track**, open the buyer's request and choose **Answer with a different total**. Enter 40000, choose **Including GST** and select **Check this amount**. The app shows the limit it breaks (*Discount … is above your 0% limit*). Tick the override, give a reason and select **Prepare counter-offer**. The offer card reads **Your counter-offer** and says *It is outside your limits, and you chose to go ahead anyway.* Say that it is the merchant's decision, not the app's.

**Try a discount example (about 60 s).** Open **Prices & costs → Demo tools** and select **Try an example that allows discounts (up to 10%)**, then **Check my changes** and save. Start a new deal and ask for a lower price after sending: the corridor lists the lowest total that meets every limit, the discounts you allow with what you keep, and other ways to lower the payment. **Put the demo prices back** restores the defaults.

**Prove Commercial Memory (about 35 s).** Open **For reviewers → Presenter page → Commercial Memory proof**. Ask “Can monthly reporting be sold by itself?” and select **Test retrieval**: the exact quote appears with a **Code retrieval** label. **Use unsupported query** returns *Insufficient evidence* instead of filling the gap, and **Show simulated source conflict** blocks two conflicting prices.

**Bring your own rate card (about 40 s).** On **Prices & costs**, under **Your documents**, open **Upload your own rate card or cost sheet**, choose a CSV or a text-based PDF (the sample links are there), tick **Replace the sample**, and add it. Select **Fill in from my documents**, open **Where this came from** to see the exact line, then **Use these values**. Say: “No AI read my file. The app found my services and one amount per line, and every value quotes its own line. Nothing changes until I check and save it.”

**The Razorpay MCP card.** It appears on Track only once a Razorpay test connection exists. Without one, nothing happened with Razorpay and the card is not shown; the audit trail states that. Do not claim a real Razorpay call was made unless the audit trail shows a receipt.

## Recording guidance

- Keep the main story on the preventive path. The failed-payment path belongs on the presenter page for questions.
- In a counter-offer, say that the merchant overrode a limit and that the app still reports it as outside the limits.
- No AI runs in this demo. All outputs are hand-written samples, and the case conversations were written to read like real chats. Do not say the demo shows a model reading these conversations. The three earlier real Groq runs are kept as historical evidence only (see the README) and are not an evaluation.
- Do not say that AI read the payment-change reply. A fixed set of date phrases is read by rules; anything else needs the merchant.
- Do not claim a mandate guarantees payment, that the prototype measures actual delivery, or that the frozen evaluation is independent.
- If a step is out of sequence, choose **Restart** in the walkthrough and confirm. The guide returns to case selection and the guided path starts cleanly.
