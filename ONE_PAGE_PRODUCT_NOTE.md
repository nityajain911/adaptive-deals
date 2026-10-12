# Adaptive Deals by Razorpay — one-page product note

Nitya Jain · Razorpay × ISB AI PM Build Challenge · Track 2

**₹1,41,600** annual quote the buyer cannot afford · **−₹14,600** if the owner discounts it to the ₹50,000 budget · **+₹19,330** kept on the restructured ₹46,020 offer (50% of price) · **1 tap** for the buyer to accept, pay and authorise auto-pay

## 1. The merchant and the problem

**Who:** owners of small service businesses (agencies, consultants) who sell modular, retainer-style work. A client says, “I only have ₹50,000 this quarter, and anything above ₹60,000 goes to our MD,” and the quote stalls. The deal is not lost on price; it is lost because nobody restructures it.

**Why services.** I interviewed service-based merchants before building. A product seller facing a hesitant buyer mostly has one lever, price. A service seller has three: scope, timing and payment shape. That ambiguity is where a rules-aware tool helps, and instalments are what Razorpay's Payment Links and mandates exist for. **Why Razorpay:** a proposal tool can reshape a quote but not collect it; a gateway collects only once terms exist. Razorpay owns both ends ([mandate docs](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-intent/initiate-mandate-registration/)).

## 2. Evidence, and today's workaround

**Workaround:** the owner reshapes the deal by hand in chat, or discounts. That is the expensive option. On my synthetic merchant's numbers, discounting the ₹1,41,600 annual plan to fit a ₹50,000 budget leaves ₹42,373 before GST against ₹57,000 of delivery cost, a loss of about ₹14,600 before fees. The restructured three-month package keeps ₹19,330.

**Outside evidence (each with its limit):**

- Delayed payments to Indian MSMEs were about ₹7.34 lakh crore in March 2024 ([GAME–FISME–C2FO](https://fisme.org.in/study/delayed-payments-to-msmes-decline-from-rs-10-lakh-cr-to-rs-7-lakh-cr-but-challenges-persist-game-fisme-report/)); 7.3 crore MSMEs are registered on Udyam ([Ministry of MSME year-end review 2025, reprinted](https://www.aviation-defence-universe.com/year-end-review-2025-ministry-of-micro-small-medium-enterprises/)), but I found no trustworthy services-only split.
- 51% of B2B buyers say they would switch to a seller offering flexible terms ([TreviPay](https://www.businesswire.com/news/home/20231114210927/en/New-Research-from-TreviPay-Shows-B2B-Buyer-Seller-Loyalty-Hinges-on-a-Better-Payments-Experience); vendor survey). 78% of US agencies rarely or only sometimes charge for extra scope ([Ignition](https://www.ignitionapp.com/news/2025-agency-pricing-cashflow-report); vendor survey).
- A 1% price cut costs the average large company roughly 9–11% of operating profit (McKinsey and Marn & Rosiello, 1992, [as summarised by Ignition Group](https://www.ignitiongroup.com/propulsion-blog/price-better-by-1-and-earn-10-more-profit); 8.7% in the updated study), so discounting is the costliest lever to reach for by instinct.
My interviews shaped the segment and the risks below; they are not a demand result. How often this stall happens to Indian service sellers is an assumption I test next.

## 3. What I built, for whom, and what I left out

**Built for the owner:** (1) **Understand:** AI reads the chat and extracts constraints, each tied to a verbatim quote. (2) **Review:** a rules engine builds every offer the merchant's templates allow, checks it against the buyer's limits and the merchant's prices, costs and limits, and shows what changed from the quote, what they keep, and at most two alternatives. (3) **Send and track:** the exact terms go as a message; the buyer accepts and pays in one tap; later changes are rechecked before either side agrees. **Why it matters:** the offer that fits the client also protects the owner's margin and cash.

**Deliberately left out:** live WhatsApp (the chat is simulated); real mandates and debits (simulated; the Payment Link step targets Razorpay test mode); delivery tracking, refunds and reconciliation; buyer identity checks; any price set by AI; and a learning loop, which is designed but not claimed.

## 4. Key product and AI decisions

**AI reads words. Code decides money. The merchant approves.** A model 95% right about a budget is useful; one 95% right about a margin is a liability. Every figure and ranking is deterministic, each offer is bound to a terms hash both sides accept, and when nothing fits the product names the rule.

**I rejected** an “AI confidence” score (none is calibrated), a claim that approval “triggers the Subscriptions API” (not among the tools Razorpay's MCP server advertises), and a card promising to reach a ₹40,000 ask by dropping one service (it reaches ₹42,480, and says so). **I changed** one buyer message after the recorded model missed it three times, writing the pass rule before the rerun. **I overrode** the coding agent's two-tap accept-and-pay with one tap, with the auto-pay authorisation in plain words above the button.

**Evidence on the AI:** a frozen test on 20 labelled cases: 42 of 47 fields extracted, 2 unsupported, 4 of 6 required clarifications asked, 0 unnecessary, 14 of 16 failure states caught. An AI agent wrote those cases at my direction, so this is not independent validation.

## 5. Primary metric, risks, and what I test next

**Metric:** realised contribution within 90 days per eligible stalled deal (cash received excluding GST, minus refunds, fees and delivery costs, over all eligible stalled deals). It counts money kept, so a discount that saves a sale at a loss scores as a loss.

**Risks I would test first.** (a) **Channel:** my interviews showed many deals are negotiated in WhatsApp groups. As third-party write-ups of Meta's documentation describe it, the Groups API is Cloud API only, for official business accounts, and capped at 8 participants including the business ([Kapso](https://kapso.ai/blog/whatsapp-groups-api-state-2026); I could not confirm this on Meta's own pages), so the product takes the conversation as input (forwarded, pasted or one-to-one) and only the link and payment as output. (b) **Rails:** most UPI AutoPay debits above ₹15,000 need extra authentication, with ₹1 lakh only for certain categories ([RBI, Dec 2023](https://www.onmanorama.com/news/business/2023/12/13/automatic-payment-upi-1-lakh-rbi.amp.html); check the current limit for a merchant's category). My demo's second instalment is ₹23,010, so a real build must cap instalments at the merchant's mandate limit. (c) **Inputs:** if owners guess their delivery costs, the engine is precisely wrong.

**Next test:** 15 service sellers with ₹50,000–₹5 lakh retainers. An eligible stalled deal is a sent quote where the buyer cites budget, timing or approval and has not accepted in seven days. Four weeks of baseline, then eight weeks with the product on alternating eligible deals. **Kill or pivot** if fewer than half have two eligible deals a month, fewer than half can state a cost per service, most live deals cannot be brought in by forwarding or one-to-one chats, or realised contribution per eligible deal does not beat baseline.


