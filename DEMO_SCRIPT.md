# Adaptive Deals — 90-second demo script

## Setup

Run `npm run reset:seed`, open `/deals`, choose **Start walkthrough**, and select **Repair bookings now, defer social**. Keep the walkthrough open during the recording. It follows stored product state, navigates to the current decision, and performs only labelled system simulations and buyer replies. Merchant decisions remain in the product. All data, messages and payment events are synthetic.

Each case starts from its recorded Groq run, replayed from stored outputs: no model call is made during the demo. The case cards and the walkthrough show **Recorded Groq output**. If you see **Sample output written by hand · no model ran**, the recordings are not loaded; stop and check `data/case-runs.json`.

| Time | Show | Suggested narration |
| --- | --- | --- |
| **0–12 s** | **Understand the buyer.** The current-action banner and “What's blocking this deal”: ₹50,000 available this quarter, no new budget until April, and MD approval above ₹60,000. Open one evidence quote. | “A buyer wants the work, but the standard annual quote does not fit their timing or approval constraints. Adaptive Deals starts from their exact words.” |
| **12–25 s** | Send the two questions, badged **Suggested by AI**. Use the walkthrough for the two simulated buyer replies, then select **Use these answers** in the product. | “Groq worded two questions, because code found that the answers change which structures are eligible. The merchant still chooses to send them.” |
| **25–45 s** | **Review the offer.** Groq recommends the single ₹46,020 payment up front. Read the attribution line under the reason: *Groq ranked and wrote this reason … Full comparison written by code.* Expand **Compare alternatives** and **select the two-payment offer**; the card now reads **Selected by you**. | “Groq ranked one payment first and wrote that reason. Its longer comparison failed our validation because it contained figures, so code wrote that part. I would rather split the payment, so I choose the alternative. The product records that the choice is mine, and every figure is the engine's.” |
| **45–57 s** | Select **Review buyer proposal**. On the preview, expand **Message the buyer will receive**, then collapse it and approve and send. | “Before sending, the merchant sees the exact proposal and the exact simulated WhatsApp message. The buyer receives only canonical commercial terms, never the seller's costs or limits.” |
| **57–66 s** | Open buyer version 1 in the mobile view and accept it. Return to Track. Use the two labelled system steps for the upfront payment and mandate. | “The buyer accepts the same version the merchant approved. Payment setup starts only after that acceptance.” |
| **66–84 s** | Advance the simulated date, send the advance notice, and choose “Cash is tight till the 20th.” Draft the change, approve version 2, then accept it as the buyer. Return to Track and show **Payment rescheduled to 21 Dec 2026**. | “Before the debit, the buyer asks for time. Narrow code rules read the supported date phrase, then the engine rechecks buyer limits, contribution and funding. Nothing changes until both sides approve the same version.” |
| **84–90 s** | End on the compact current-agreement summary and the collapsed **Outcome and learning** card. | “The merchant always sees what is agreed, what remains to collect and who acts next. We will measure realised contribution within 90 days per eligible stalled deal, and the engine can still say no feasible deal.” |

## Two more cases to show on request

**Keep the annual scope, move the start (about 40 s).** On **Understand the buyer**, the card reads *We couldn't map “complete annual package” to specific services* and quotes the buyer's words. Offer is blocked until the merchant confirms: tick all four services and select **Confirm required services**. The Offer card then reads *Recalculated by the engine after the merchant confirmed the services · explanation written by code*. Open **Audit details**: Groq extracted the phrase, the merchant confirmed the services, the engine recalculated. Also point to the line saying the GST basis was not captured and that every structure has the same outcome either way.

> “The model returned a phrase that names no service, so code refused to guess. The buyer said they need the whole programme and not to reduce it, so the merchant confirms the services, and only then does the engine recalculate. The model also missed that the buyer had said both amounts exclude GST; here that changes nothing, and the product says so instead of asking.”

**Decline an impossible start date (about 20 s).** Groq's extraction is clean: ₹2,00,000 including GST, a start by the 15th, all four services required. The engine rejects every approved structure.

> “When no approved structure works, the product says so and explains why, instead of inventing one.”

## Recording guidance

- Keep the main story on the preventive path. The failed-debit path belongs on `/presenter` for questions.
- Say exactly what Groq did and no more. In these recordings Groq extracted constraints, worded the two questions, ranked the options and wrote per-offer reasons. Code wrote the comparison text in the first case and the whole explanation in the second, and decided every figure, check and approval.
- The recordings are one real run per case, kept as they came, misses included. They are not an evaluation and show nothing about reliability. Do not claim they do.
- Do not say that AI read the payment-change reply. The supported phrase is read by `reply-rules.v1`; unsupported phrases require merchant attention.
- Do not claim a mandate guarantees payment, that the prototype measures actual delivery, or that the frozen evaluation is independent.
- If a step is out of sequence, choose **Restart** in the walkthrough and confirm. The guide returns to case selection and the guided path starts cleanly.
