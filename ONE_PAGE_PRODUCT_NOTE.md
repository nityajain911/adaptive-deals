# Adaptive Deals by Razorpay — one-page product note

Nitya Jain · Razorpay × ISB AI PM Build Challenge · Track 2

## The problem, and who it is for

A service seller sends a ₹1.4 lakh annual quote. The client replies on WhatsApp: "I only have ₹50,000 this quarter, and anything above ₹60,000 goes to our MD." The sale is not lost on price. It is lost because nobody restructures it. The owner discounts on instinct, gives informal credit, or lets the thread go quiet, without knowing what the new shape does to margin or to cash spent before being paid.

**I chose service businesses on purpose.** I interviewed service-based merchants before writing a line of code. Product sellers mostly have one lever when a buyer balks, the price. A service seller has three: scope (drop social media), timing (start in May) and payment shape (two payments, or a mandate). That is where the ambiguity is, and where a rules-aware tool can help. It also fits Razorpay: services are often paid in instalments, which is what Payment Links and mandates are for.

The cash constraint is well documented: delayed payments to Indian MSMEs stood at about ₹7.34 lakh crore in March 2024 ([GAME–FISME–C2FO](https://fisme.org.in/study/delayed-payments-to-msmes-decline-from-rs-10-lakh-cr-to-rs-7-lakh-cr-but-challenges-persist-game-fisme-report/)), and in a vendor survey 51% of B2B buyers said they would switch to a seller offering flexible terms ([TreviPay, 2023](https://www.businesswire.com/news/home/20231114210927/en/New-Research-from-TreviPay-Shows-B2B-Buyer-Seller-Loyalty-Hinges-on-a-Better-Payments-Experience)). I found no public figure for service sellers specifically, so how often this exact stall happens is an assumption I want to test, not a finding.

**Why Razorpay.** A proposal tool can reshape a quote but cannot collect it. A gateway collects only after terms exist. Razorpay already owns the rails a restructured deal needs, a Payment Link for the first payment and a registered mandate for the rest ([docs](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-intent/initiate-mandate-registration/)), so it is the one place where "the offer the buyer accepted" and "the schedule that gets collected" can be the same object.

## The product

1. **Understand the buyer.** AI reads the conversation and extracts constraints, each tied to a verbatim quote. Clear answers apply by themselves; unclear ones wait for the merchant.
2. **Review the offer.** A rules engine builds every offer the merchant's own templates allow, checks each against the buyer's limits and the merchant's prices, costs and limits, and ranks what passes. The merchant sees one change list against the original quote, what they keep, and at most two alternatives.
3. **Send and track.** The merchant sends the exact terms as a message. The buyer accepts and pays in one tap. Later changes (a lower price, a moved payment date) are rechecked before either side agrees.

## The judgement call I would defend first

**AI reads words. Code decides money. The merchant approves.** A model that is 95% right about a budget figure is useful; one that is 95% right about a margin is a liability. So every figure, check and ranking is deterministic code, each offer is bound to a terms hash both sides accept, and when nothing fits the product says so and names the rule.

How I used AI while building:

- **Rejected:** an "AI confidence" score (none is calibrated); a claim that approval "triggers the Subscriptions API" (it is not among the tools Razorpay's MCP server advertises); and a card promising to hit a ₹40,000 ask by dropping one service (the engine shows ₹42,480, and the card says so).
- **Changed:** when the recorded model missed one case three times, I reworded a single buyer message, wrote the acceptance rule before the rerun, and kept every miss as evidence.
- **Overrode:** the coding agent recommended two taps for accept and pay. I chose one, with the auto-pay authorisation in plain words above the button.

## Evidence, stated honestly

A frozen evaluation on 20 labelled cases: 42 of 47 expected fields extracted, 2 unsupported fields, 4 of 6 required clarifications asked, 0 unnecessary ones, 14 of 16 failure states identified. An AI agent wrote those cases at my direction, so this is not independent validation. All three demo cases replay recorded Cerebras runs. Messaging, mandates and debits are simulated; the Payment Link step is built for Razorpay test mode only. My merchant interviews shaped the segment and the risks below; they are not a demand result.

## Metric

**Realised contribution within 90 days per eligible stalled deal**: cash received excluding GST, minus refunds, fees and delivery costs, divided by all eligible stalled deals. It counts money kept, not offers sent, so a discount that "saves" a sale at a loss scores as a loss.

## The two risks I would test first

1. **The channel.** In my interviews, many deals were negotiated in WhatsApp groups, not one-to-one chats. Meta's WhatsApp Business Platform can only reach those in a limited way: its Groups API, as third-party write-ups of Meta's documentation describe it, is a Cloud API feature for official business accounts, capped at 8 participants including the business, with one Cloud API business per group ([Kapso](https://kapso.ai/blog/whatsapp-groups-api-state-2026), [Unipile](https://www.unipile.com/whatsapp-group-api/)). I could not confirm this in Meta's own documentation. So a hands-off integration will miss many real deals. The product therefore treats the conversation as input (forwarded or pasted text, or a one-to-one chat) and only the proposal link and payment as output; the prototype simulates the chat. WhatsApp is widely used by Indian small businesses for selling (72% in one 2022 survey, [Bluehost](https://yourstory.com/smbstory/bluehost-survey-msme-digitisation-covid-19-whatsapp)), but that survey is dated and does not cover groups.
2. **The merchant's own numbers.** The engine is only as good as the prices and costs the merchant enters. If owners guess their delivery costs, the product gives confident, precise, wrong offers.

## Next validation

Recruit 15 service sellers with retainers of ₹50,000 to ₹5 lakh. An eligible stalled deal is a sent quote where the buyer cites budget, timing or approval and has not accepted in seven days. Run four weeks of each merchant's own baseline, then eight weeks with Adaptive Deals on alternating eligible deals. **Kill or pivot** if fewer than half the merchants have two eligible deals a month, if fewer than half can state a cost per service, if most live deals cannot be brought in through forwarded or one-to-one conversations, or if realised contribution per eligible deal does not beat baseline.
