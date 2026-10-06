# Adaptive Deals — 90-second demo script

## Setup

Run `npm run reset:seed`, open `/deals` and choose **Start walkthrough**. The first card asks the question the product answers: *A client says your quote doesn't fit their budget. What now?* Select **Repair bookings now, defer social**. Keep the guide open during the recording.

How the guide works: on a merchant step it shows **Your turn** and names the product's own button ("Click “Send 2 questions to buyer”"). **Show me** scrolls to that button and rings it; it never clicks for you. Only simulated buyer and system events have a guide button, and those are violet and labelled. All data, messages and payment events are synthetic.

Each case starts from its recorded Groq run, replayed from stored outputs: no model call is made during the demo. The case cards and the guide show **Recorded Groq output**. If you see **Sample output written by hand · no model ran**, the recordings are not loaded; stop and check `data/case-runs.json`.

| Time | Show | Suggested narration |
| --- | --- | --- |
| **0–12 s** | The opening card, then **Understand the buyer**. In the chat, the buyer's own words are marked: click “₹50,000 left this quarter” to see what was understood. **What's blocking this deal** reads: ₹50,000 now, no new budget until April, MD approval above ₹60,000. | “A client says the annual quote doesn't fit. Adaptive Deals starts from their exact words, and every figure it uses is marked where the buyer said it.” |
| **12–25 s** | **Your turn**: send the two questions, badged **Suggested by AI**. In the guide, choose each simulated buyer reply from the list, then select **Use these answers** in the product. | “Groq worded two questions, because code found that the answers change which offers are eligible. I still choose to send them. The buyer can answer, or say they are not sure, and then the fact stays unresolved.” |
| **25–45 s** | **Review the offer.** The buyer's quote sits above the recommendation. Groq recommends the single payment up front, with a projected contribution of about ₹19,330. Read the attribution line. Under **Other offers you could send**, **select the two-payment offer**; the card now reads **Selected by you**. | “Groq ranked one payment first and wrote that reason. Its longer comparison failed our validation because it contained figures, so code wrote that part. I would rather split the payment, so I choose it. The forecast is rounded here; the exact figure is in the economics detail.” |
| **45–57 s** | Select **Review buyer proposal**. The preview says *You're seeing what the buyer will see.* Open **Message the buyer will receive**, then approve and send. | “Before sending I see exactly what the buyer sees, and the exact message. The buyer receives only the agreed terms, never my costs or limits.” |
| **57–66 s** | Open buyer version 1. It opens with one line: total, number of payments, what is included. The recurring-payment text says a date changes only if both sides accept a revision. Accept it, then return to **Your next step** on Track and use the two labelled system steps for the upfront payment and mandate. | “The buyer accepts the same version I approved. Payment setup starts only after that.” |
| **66–84 s** | Advance the simulated date, send the advance notice, and pick “Cash is tight till the 20th.” Draft the change, approve version 2, accept it as the buyer. Track shows **Payment rescheduled to 21 Dec 2026**. | “Before the debit the buyer asks for time. Narrow code rules read the date phrase, then the engine rechecks the buyer's limits, my contribution and funding. Nothing changes until both sides approve the same version.” |
| **84–90 s** | The guide ends with a short summary written from the real state and **Try another case**. | “It shows what was agreed and who decided each step. We would measure realised contribution within 90 days per eligible stalled deal, and the engine can still say there is no feasible offer.” |

## Two more cases to show on request

**Keep the annual scope, move the start (about 40 s).** On **Understand the buyer**, the card reads *We couldn't map “complete annual package” to specific services* and quotes the buyer's words. Offer is blocked until the merchant confirms: tick all four services and select **Confirm required services**. The Offer card then reads *Recalculated by the engine after the merchant confirmed the services · explanation written by code*. Open **Audit details**: Groq extracted the phrase, the merchant confirmed the services, the engine recalculated. Also point to the line saying the GST basis was not captured and that every offer has the same outcome either way. In the chat, “complete annual package” is marked amber: the phrase code could not map.

> “The model returned a phrase that names no service, so code refused to guess. The buyer said they need the whole programme and not to reduce it, so the merchant confirms the services, and only then does the engine recalculate. The model also missed that the buyer had said both amounts exclude GST; here that changes nothing, and the product says so instead of asking.”

**Decline an impossible start date (about 20 s).** Groq's extraction is clean: ₹2,00,000 including GST, a start by the 15th, all four services required. The engine rejects every approved offer.

> “When no approved offer works, the product says so and explains why, instead of inventing one.”

## Recording guidance

- Keep the main story on the preventive path. The failed-debit path belongs on `/presenter` for questions.
- Say exactly what Groq did and no more. In these recordings Groq extracted constraints, worded the two questions, ranked the options and wrote per-offer reasons. Code wrote the comparison text in the first case and the whole explanation in the second, and decided every figure, check and approval.
- The recordings are one real run per case, kept as they came, misses included. They are not an evaluation and show nothing about reliability. Do not claim they do.
- Do not say that AI read the payment-change reply. The supported phrase is read by `reply-rules.v1`; unsupported phrases require merchant attention.
- Do not claim a mandate guarantees payment, that the prototype measures actual delivery, or that the frozen evaluation is independent.
- If a step is out of sequence, choose **Restart** in the walkthrough and confirm. The guide returns to case selection and the guided path starts cleanly.
