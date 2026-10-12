# Adaptive Deals by Razorpay — one-page product note

Nitya Jain · Razorpay × ISB AI PM Build Challenge · Track 2

## The problem, and who it is for

A service seller sends a ₹1.4 lakh annual quote. The client replies on WhatsApp: "I only have ₹50,000 this quarter, and anything above ₹60,000 goes to our MD." The sale is not lost on price. It is lost because nobody restructures it. The owner discounts on instinct or gives informal credit, without knowing what the new shape does to margin or to cash spent before being paid.

**I chose service sellers on purpose, after interviewing service-based merchants.** A product seller facing a hesitant buyer mostly has one lever, price. A service seller has three: scope (drop social media), timing (start in May) and payment shape (two payments, or a mandate). That ambiguity is where a rules-aware tool helps, and instalment payments are what Razorpay's Payment Links and mandates are for.

The cash squeeze is documented: delayed payments to Indian MSMEs were about ₹7.34 lakh crore in March 2024 ([GAME–FISME–C2FO](https://fisme.org.in/study/delayed-payments-to-msmes-decline-from-rs-10-lakh-cr-to-rs-7-lakh-cr-but-challenges-persist-game-fisme-report/)), and 51% of B2B buyers in a vendor survey would switch to a seller offering flexible terms ([TreviPay](https://www.businesswire.com/news/home/20231114210927/en/New-Research-from-TreviPay-Shows-B2B-Buyer-Seller-Loyalty-Hinges-on-a-Better-Payments-Experience)). I found no public figure for service sellers, so how often this exact stall happens is an assumption to test.

**Why Razorpay.** A proposal tool can reshape a quote but not collect it; a gateway collects only after terms exist. Razorpay owns the rails a restructured deal needs, a Payment Link for the first payment and a mandate for the rest ([docs](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-intent/initiate-mandate-registration/)), so "the offer accepted" and "the schedule collected" can be one object.

## The product

1. **Understand the buyer.** AI reads the chat and extracts constraints, each tied to a verbatim quote. Clear answers apply by themselves; unclear ones wait for the merchant.
2. **Review the offer.** A rules engine builds every offer the merchant's own templates allow, checks each against the buyer's limits and the merchant's prices, costs and limits, and ranks what passes. The merchant sees what changed from the quote, what they keep, and at most two alternatives.
3. **Send and track.** The exact terms go as a message; the buyer accepts and pays in one tap. Later changes are rechecked before either side agrees.

## The judgement call I would defend first

**AI reads words. Code decides money. The merchant approves.** A model 95% right about a budget is useful; one 95% right about a margin is a liability. So every figure and ranking is deterministic, each offer is bound to a terms hash both sides accept, and when nothing fits the product names the rule.

With AI, I **rejected** an "AI confidence" score (none is calibrated), a claim that approval "triggers the Subscriptions API" (not among the tools Razorpay's MCP server advertises), and a card promising to hit a ₹40,000 ask by dropping one service (it reaches ₹42,480, and says so). I **changed** one buyer message after the recorded model missed it three times, writing the acceptance rule before the rerun. I **overrode** the agent's two-tap accept-and-pay with one tap, keeping the auto-pay authorisation in plain words above the button.

## Evidence, stated honestly

A frozen evaluation on 20 labelled cases: 42 of 47 fields extracted, 2 unsupported, 4 of 6 required clarifications asked, 0 unnecessary, 14 of 16 failure states identified. An AI agent wrote those cases at my direction, so it is not independent validation. Demo cases replay recorded Cerebras runs; messaging, mandates and debits are simulated, and the Payment Link step targets Razorpay test mode only. My interviews shaped the segment and the risks below; they are not a demand result.

## Metric

**Realised contribution within 90 days per eligible stalled deal**: cash received excluding GST, minus refunds, fees and delivery costs, over all eligible stalled deals. It counts money kept, so a discount that saves a sale at a loss scores as a loss.

## The two risks I would test first

1. **The channel.** My interviews showed many deals are negotiated in WhatsApp groups, not one-to-one chats. As third-party write-ups of Meta's documentation describe it, the Groups API is a Cloud API feature for official business accounts, capped at 8 participants including the business ([Kapso](https://kapso.ai/blog/whatsapp-groups-api-state-2026), [Unipile](https://www.unipile.com/whatsapp-group-api/)); I could not confirm this in Meta's own pages. A hands-off integration would miss many real deals, so the product takes the conversation as input (forwarded or pasted text, or a one-to-one chat) and only the proposal link and payment as output. The prototype simulates the chat.
2. **The merchant's own numbers.** If owners guess their delivery costs, the engine gives confident, precise, wrong offers.

## Next validation

Recruit 15 service sellers with ₹50,000 to ₹5 lakh retainers. An eligible stalled deal is a sent quote where the buyer cites budget, timing or approval and has not accepted in seven days. Run four weeks of baseline, then eight weeks with the product on alternating eligible deals. **Kill or pivot** if fewer than half have two eligible deals a month, fewer than half can state a cost per service, most live deals cannot be brought in by forwarding or one-to-one chats, or realised contribution per eligible deal does not beat baseline.
