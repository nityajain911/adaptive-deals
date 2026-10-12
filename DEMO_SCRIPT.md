# Adaptive Deals — 90-second demo script

## Setup

Run `npm run reset:seed`, open `/deals` and choose **Start walkthrough**. The first card asks the question the product answers: *A client says your quote doesn't fit their budget. What now?* The guide begins on **Prices & costs** (what the merchant charges, what it costs, and the lowest deal they will accept), then moves to the deal. Select **They only need the website and search for now** when the guide asks you to start a deal. Keep the guide open during the recording.

How the guide works: on a merchant step it shows **Your turn** and names the product's own button. **Show me** scrolls to that button and rings it; it never clicks for you. Only simulated buyer and system events have a guide button, and those are violet and labelled. All data, messages and payment events are fictional.

The merchant's screens are written for a merchant, not an auditor: there are two tabs (**Prices & costs** and **Deals**), each stage shows one decision, and the detail sits in closed sections. The **For reviewers** menu (top right) holds the guide, **Audit trail for this deal** and the presenter page. No model call is made during the demo. The hero replays **Recorded Cerebras output** from the exact frozen conversation; the other cases use a clearly labelled hand-written sample.

| Time | Show | Suggested narration |
| --- | --- | --- |
| **0–14 s** | Start on **Prices & costs**. Briefly open **Where this came from** on one value, then move to the hero case. | “These recommendations start with this merchant's own prices, costs and limits. Every imported value keeps its source, and nothing changes until the merchant approves it.” |
| **14–30 s** | **Understand the buyer.** In the WhatsApp chat, click the marked budget phrase. Send the two questions, choose the simulated buyer replies and select **Use these answers**. | “Cerebras extracted the buyer's constraints from this exact conversation and drafted the two questions that change the decision. Evidence validators keep unsupported text out.” |
| **30–48 s** | **Review the offer.** Show the three-month, two-payment recommendation and **How we worked this out**. Briefly switch to *Keep the full project* and back. | “Code evaluates every allowed offer against the merchant's economics and ranks the feasible ones. The annual option needs the buyer's MD; this smaller phase can move now.” |
| **48–62 s** | Select **Review buyer proposal**, preview exactly what the buyer sees, then approve and send. Open the buyer page, accept, then tap **Pay ₹23,010 and set up auto-pay** on the same page (a simulated payment: nothing real moves). | “The merchant previews the same canonical terms the buyer receives. Private costs and failed checks never leave the merchant side, and both approvals bind the same version.” |
| **62–82 s** | Advance the simulated date, send the notice and choose “Cash is tight till the 20th.” Draft and approve version 2, then accept it as the buyer. | “When the buyer asks for time, a narrow rule reads the date and the engine rechecks the schedule, profit and mandate. Nothing changes until both people approve.” |
| **82–90 s** | Track shows **Payment rescheduled to 21 Dec 2026**. Open **Performance** (the tab beside the buyer's name) or the audit trail just long enough to show the outcome and source attribution. | “The result is a profitable offer the buyer accepted, with every AI output, calculation and human decision traceable. We would measure realised contribution within 90 days per eligible stalled deal.” |

## Two more cases to show on request

**They want everything, but can't pay until May (about 40 s).** The buyer asks for “the complete annual package” without naming services. **Which services do they need?** appears and the offer waits: tick all four and select **Confirm these services**. The offer then reads *Worked out again after the merchant confirmed the services.* The page also notes that whether GST is included was not mentioned and that every offer works either way. In the chat, “complete annual package” is marked amber.

> “They said the whole programme but not which services, so the app refuses to guess. I confirm, and only then does it work out the offers.”

**They want to start in two weeks (about 20 s).** The buyer needs work to start by the 15th with all four services. No offer fits, and the app says why instead of inventing one.

> “When nothing works, it says so and explains why.”

## Optional extras

**Answer a lower price (about 60 s).** After the proposal is sent, open the buyer's page, choose **Request a change**, pick **A lower price**, and send “Could you do a lower total: 40000?”. On **Track**, the buyer's message sits in the chat with three answers beneath it: **Hold firm**, **Suggested counter-offer** and **Choose your own amount**. Choose the third, enter 40000, choose **Including GST** and select **Check amount**. (With the shipped 0% discount limit, the suggested path says nothing lower fits and the lowest is ₹46,020. To show a suggested counter-offer instead, raise the discount limit under **Prices & costs → Demo tools** first.) The app shows the limit it breaks (*Discount … is above your 0% limit*). Tick the override, give a reason and select **Prepare counter-offer**. The offer card reads **Your counter-offer** and says *It is outside your limits, and you chose to go ahead anyway.* Say that it is the merchant's decision, not the app's.

**Try a discount example (about 60 s).** Open **Prices & costs → Demo tools** and select **Try an example that allows discounts (up to 10%)**, then **Check my changes** and save. Start a new deal and ask for a lower price after sending: the corridor lists the lowest total that meets every limit, the discounts you allow with what you keep, and other ways to lower the payment. **Put the demo prices back** restores the defaults.

**Prove Commercial Memory (about 35 s).** Open **For reviewers → Presenter page → Commercial Memory proof**. Ask “Can monthly reporting be sold by itself?” and select **Test retrieval**: the exact quote appears with a **Code retrieval** label. **Use unsupported query** returns *Insufficient evidence* instead of filling the gap, and **Show simulated source conflict** blocks two conflicting prices.

**Bring your own rate card (about 40 s).** On **Prices & costs**, under **Your documents**, open **Upload your own rate card or cost sheet**, choose a CSV or a text-based PDF (the sample links are there), tick **Replace the sample**, and add it. **Review what we found** opens by itself: the table shows each value, what it is now, and who read it (**Line reader and AI agree**). Open **Where this came from** to see the exact line, then **Looks right, use these values**. Use the **CSV** sample for this: it replays the recorded Cerebras reading, labelled **Recorded Cerebras output**. Say: “The AI proposes, and code checks every value against my document: the quote has to be in it and the amount has to match. Nothing changes until I check and save it.” (A pasted note with different wording, such as `data/document-eval/messy-email.txt`, shows the AI matching “SEO retainer” to Search marketing, marked for you to confirm. Any other document is read by the built-in line reader alone and says so.)

**The Razorpay MCP card.** It appears on Track only once a Razorpay test connection exists. Without one, nothing happened with Razorpay and the card is not shown; the audit trail states that. Do not claim a real Razorpay call was made unless the audit trail shows a receipt.

## Recording guidance

- Keep the main story on the preventive path. The failed-payment path belongs on the presenter page for questions.
- In a counter-offer, say that the merchant overrode a limit and that the app still reports it as outside the limits.
- No provider call runs during this demo. The hero replays **Recorded Cerebras output** from the exact current conversation; the other two cases remain hand-written samples. The three earlier Groq runs are historical evidence only. None of these is an independent evaluation.
- Do not say that AI read the payment-change reply. A fixed set of date phrases is read by rules; anything else needs the merchant.
- Do not claim a mandate guarantees payment, that the prototype measures actual delivery, or that the frozen evaluation is independent.
- If a step is out of sequence, choose **Restart** in the walkthrough and confirm. The guide returns to case selection and the guided path starts cleanly.
