# Adaptive Deals — 90-second demo script

## Setup

Run `npm run reset:seed`, open `/deals/hero`, and keep **Demo controls · simulated** visible. The bar navigates to merchant and buyer decisions; it performs only labelled system simulations and buyer replies. All data, messages and payment events are synthetic.

| Time | Show | Suggested narration |
| --- | --- | --- |
| **0–12 s** | **Understand the buyer.** The current-action banner and “What's blocking this deal”: ₹50,000 available this quarter, no new budget until April, and MD approval above ₹60,000. Open one evidence quote. | “A buyer wants the work, but the standard annual quote does not fit their timing or approval constraints. Adaptive Deals starts from their exact words.” |
| **12–25 s** | Send the two suggested questions. Use the demo bar for the two simulated buyer replies, then select **Use these answers**. | “The AI drafts two questions because code has found that the answers change which structures are eligible. The merchant still chooses to send them.” |
| **25–43 s** | **Review the offer.** Lead with “Standalone three-month package · two monthly payments.” Show why it ranks first and the short attribution line. Expand **Compare alternatives** just long enough to show the paid-upfront Phase 1 and the conditional annual option. | “Every approved template is checked. This structure lowers the largest payment, stays within the buyer's confirmed limit and protects the seller's contribution and cash-at-risk rules. AI explains; the engine calculates every figure.” |
| **43–56 s** | Select **Review buyer proposal**. On the preview, expand **Message the buyer will receive**, then collapse it and approve and send. | “Before sending, the merchant sees the exact proposal and the exact simulated WhatsApp message. The buyer receives only canonical commercial terms, never the seller's costs or limits.” |
| **56–66 s** | Open buyer version 1 in the mobile view and accept it. Return to Track. Use the two labelled system steps for the upfront payment and mandate. | “The buyer accepts the same version the merchant approved. Payment setup starts only after that acceptance.” |
| **66–84 s** | Advance the simulated date, send the advance notice, and choose “Cash is tight till the 20th.” Draft the change, approve version 2, then accept it as the buyer. Return to Track and show **Payment rescheduled to 21 Dec 2026**. | “Before the debit, the buyer asks for time. Narrow code rules read the supported date phrase, then the engine rechecks buyer limits, contribution, funding and mandate fit. The original collection changes only after both parties accept version 2.” |
| **84–90 s** | End on the compact current-agreement summary and the collapsed **Outcome and learning** card. | “The merchant always sees what is agreed, what remains to collect and who acts next. We will measure realised contribution within 90 days per eligible stalled deal, and the engine can still say no feasible deal.” |

## Recording guidance

- Keep the main story on the preventive path. The failed-debit path belongs on `/presenter` for questions.
- Show one safeguard in the main recording: the AI/code boundary. Use Audit details only if a judge asks for evidence, rules, hashes or run provenance.
- Do not say that AI read the payment-change reply. The supported phrase is read by `reply-rules.v1`; unsupported phrases require merchant attention.
- Do not claim a mandate guarantees payment, that the prototype measures actual delivery, or that the frozen evaluation is independent.
- If a step is out of sequence, choose **More → Reset demo** and restart. The guided path is deterministic.
