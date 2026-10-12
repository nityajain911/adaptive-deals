# Adaptive Deals by Razorpay — one-page product note

Nitya Jain · Razorpay × ISB AI PM Build Challenge · Track 2

## The problem

A small agency sends a ₹1.4 lakh annual quote. The client replies on WhatsApp: "I only have ₹50,000 this quarter, and anything above ₹60,000 goes to our MD." The sale is not lost on price. It is lost because nobody restructures it. Today the owner discounts on instinct, gives informal credit, or lets the thread go quiet, without knowing what the new shape does to margin or to cash spent before being paid.

The cash constraint behind this is well documented: delayed payments to Indian MSMEs stood at about ₹7.34 lakh crore in March 2024 ([GAME–FISME–C2FO](https://fisme.org.in/study/delayed-payments-to-msmes-decline-from-rs-10-lakh-cr-to-rs-7-lakh-cr-but-challenges-persist-game-fisme-report/)), and in a vendor survey 51% of B2B buyers said they would switch to a seller offering flexible terms ([TreviPay, 2023](https://www.businesswire.com/news/home/20231114210927/en/New-Research-from-TreviPay-Shows-B2B-Buyer-Seller-Loyalty-Hinges-on-a-Better-Payments-Experience)). How often this exact pre-signing stall happens to Indian service sellers is my assumption, not a finding.

**Why Razorpay.** A proposal tool can reshape a quote but cannot collect it. A payment gateway collects but only after terms exist. Razorpay already owns the rails a restructured deal needs, a Payment Link for the first payment and a registered mandate for the rest ([Razorpay docs](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-intent/initiate-mandate-registration/)), so it is the one place where "the offer the buyer accepted" and "the schedule that gets collected" can be the same object.

## The product

1. **Understand the buyer.** AI reads the conversation and extracts constraints, each tied to a verbatim quote. Clear answers apply by themselves; unclear ones wait for the merchant.
2. **Review the offer.** A rules engine builds every offer the merchant's own templates allow, checks each against the buyer's limits and the merchant's prices, costs and limits, and ranks what passes. The merchant sees one change list against the original quote, what they keep, and at most two alternatives.
3. **Send and track.** The merchant sends the exact terms as a message. The buyer accepts and pays in one tap. Later changes (a lower price, a moved payment date) are rechecked before either side agrees.

## The judgement call I would defend first

**AI reads words. Code decides money. The merchant approves.** A model that is 95% right about a budget figure is useful; a model that is 95% right about a margin is a liability. So every figure, check and ranking comes from deterministic code, each offer is bound to a terms hash both sides accept, and when nothing fits the product says so and names the rule.

This shaped what I took from AI during the build:

- **Rejected:** a suggested "AI confidence" score (no calibrated score exists), a claim that approval "triggers the Subscriptions API" (it is not among the tools Razorpay's MCP server advertises), and a card promising to hit a ₹40,000 ask by dropping one service (the engine shows it reaches ₹42,480, and the card now says so).
- **Changed:** when the recorded model missed one case three times, I reworded a single buyer message, wrote the acceptance rule before the rerun, and kept the misses as evidence.
- **Overrode:** the coding agent recommended two taps for accept and pay. I chose one, keeping the auto-pay authorisation in plain words above the button.

## Evidence, stated honestly

A frozen evaluation on 20 labelled cases: 42 of 47 expected fields extracted, 2 unsupported fields, 4 of 6 required clarifications asked, 0 unnecessary ones, 14 of 16 failure states identified. The cases were written by an AI agent at my direction, so this is not independent validation. All three demo cases replay recorded Cerebras runs. Messaging, mandates and debits are simulated; the Payment Link step is built for Razorpay test mode only. No merchant has used this.

## Metric

**Realised contribution within 90 days per eligible stalled deal**: cash received excluding GST, minus refunds, fees and delivery costs, divided by all eligible stalled deals. It counts money kept, not offers sent, so a discount that "saves" a sale at a loss scores as a loss.

## The riskiest assumption

That merchants know their delivery costs well enough to set them. The whole engine rests on prices, costs and limits the merchant enters. If owners guess, the product produces confident, precise, wrong offers. I would rather learn this early than tune extraction accuracy.

## Next validation

Recruit 15 agencies of 5 to 50 people selling retainers of ₹50,000 to ₹5 lakh. An eligible stalled deal is a sent quote where the buyer cites budget, timing or approval and has not accepted in seven days. Run four weeks of each merchant's own baseline, then eight weeks with Adaptive Deals on alternating eligible deals. **Kill or pivot** if fewer than half the merchants see two eligible deals a month, if fewer than half can state a cost per service, or if realised contribution per eligible deal does not beat baseline.
