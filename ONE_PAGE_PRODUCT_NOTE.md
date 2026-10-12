# Adaptive Deals by Razorpay — one-page product note

AI-native deal desk for B2B and SME commerce · Nitya Jain · Razorpay × ISB AI PM Build Challenge · Track 2

**The same stalled deal.** The buyer can commit ₹50,000 now, and any contract above ₹60,000 needs their MD's sign-off. Our annual quote: ₹1,41,600 (incl. GST).

**Today: the owner discounts:** Delivers 12 months of work for ₹42,373 (before GST); Costs ₹57,000 to deliver. **Result: loses ₹14,600.**

**With Adaptive Deals: the owner restructures:** Sells a 3-month package for ₹39,000 (before GST); Under their ₹50,000 and ₹60,000 limits; costs and fees paid. **Result: earns ₹19,330.**

## 1. The merchant, the problem and the Razorpay opportunity

- **Merchant:** founders of small B2B service firms (marketing agencies, design studios, IT and compliance consultancies) selling modular retainers.
- **Problem:** checkout is binary: pay in full now or walk away. A buyer says, “I only have ₹50,000 this quarter; anything above ₹60,000 needs our MD,” and the quote stalls: it is over the contact's own approval limit, even if the money exists over the year. Service deals stall not on willingness to pay but because rebuilding scope, phases and cost by hand takes days.
- **Razorpay opportunity:** proposal tools (PandaDoc, Proposify) reshape quotes but cannot collect; a gateway collects only after terms are final. An adaptive deal desk upstream of Payment Links and mandates moves Razorpay from settlement rail to revenue recovery ([mandate docs](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-intent/initiate-mandate-registration/)).

## 2. Evidence, workarounds and merchant discovery

**I interviewed 6 B2B SME founders** (3 digital marketing agencies, 2 software or design shops, 1 compliance consultancy; retainers ₹40,000–₹2,50,000 a month):

- **Panic discounting.** “When a client says budget is tight, I panic and shave 15–20% off without checking my freelance contractor costs. By month three, I'm delivering at a loss.” (founder, 12-person performance agency). **Product change:** delivery cost per service sits at the centre of setup, so every offer is checked against a margin floor.
- **Restructuring.** “Clients rarely say ‘no’; they say ‘not all at once.’ If I break it into phased milestones, they sign, but doing that math on the fly takes hours of spreadsheet recalculations.” (founder, design studio). **Product change:** the rules engine tries scope reduction and phased schedules before fee cuts.
- **WhatsApp.** 4 of 6 founders said most of their negotiations happen in WhatsApp groups (client contact, finance head, agency team). An automated bot inside client groups is unacceptable, so the product is an out-of-band co-pilot: the conversation is forwarded or pasted in.
**Cost of discounting:** on my synthetic merchant, discounting the annual plan to the ₹50,000 budget leaves ₹42,373 before GST against ₹57,000 of delivery cost (−₹14,600 before fees). Outside evidence, each with its limit: McKinsey's analysis of an average S&P 1500 company puts the effect of a 1% price change at about 8% of operating profit, volume held constant ([The power of pricing](https://www.mckinsey.com/Business%20Functions/Marketing%20and%20Sales/Our%20Insights/The%20power%20of%20pricing); large listed firms, 2003, the latest I could verify). 51% of B2B buyers say they would switch for more flexible terms ([TreviPay](https://www.businesswire.com/news/home/20231114210927/en/New-Research-from-TreviPay-Shows-B2B-Buyer-Seller-Loyalty-Hinges-on-a-Better-Payments-Experience); vendor survey). Six interviews show a pattern, not its frequency; I test that next.

## 3. What I built, for whom, and what I left out

**An AI deal-restructuring desk for the agency owner.** (1) **Understand (AI):** reads the buyer's chat and extracts constraints (budget ceiling, start date, approval limit), each tied to a verbatim quote. (2) **Review (rules engine):** checks every offer the merchant's templates allow against the buyer's limits and the merchant's rate card and margin floor, and shows what changed, what the owner keeps, and at most two alternatives. (3) **Send and close:** the owner reviews and sends the offer; the buyer accepts, pays and authorises later debits in one tap; later changes are rechecked first.

**Left out, deliberately:** (1) autonomous negotiating bots: the merchant stays in the loop (legal and brand risk); (2) AI-set prices: all pricing is the merchant's rate card; (3) B2B credit or BNPL: affordability comes from scope and schedules; (4) live WhatsApp and real mandates: chat and recurring debits are simulated, and the upfront payment step targets Razorpay test mode; delivery tracking and refunds.

## 4. Key product and AI decisions

- **AI reads words; code decides money.** Models are good at meaning in messy chat and unsafe for unit economics. Cerebras (gpt-oss-120b) extracts text; a deterministic engine computes margins, applies GST and enforces floors, and each offer is bound to a terms hash both sides accept.
- **Verbatim grounding.** When a rate card is uploaded, AI proposes line items but code accepts a value only if its quote appears in the document and its amount matches. If a budget cannot be met, the product names the broken rule instead of inventing an unviable offer.
- **Explainable trade-offs.** The owner sees services removed, cost saved and margin kept. I rejected an “AI confidence” score because none is calibrated.
- **Tested, with limits.** A frozen set of 20 synthetic cases: 42 of 47 constraints extracted, 14 of 16 failure states caught, 4 of 6 ambiguous constraints flagged for clarification.

## 5. Primary metric, risks and what I test next

**Metric:** realised contribution per eligible stalled deal within 90 days (cash received excluding GST, minus direct delivery cost, payment fees and refunds). Deal count or GMV misleads: a deal saved at a loss is a net loss.

**Risks.** (a) **Omnichannel fragmentation:** deals span WhatsApp, calls and email, so a forwarded chat can miss a verbal agreement. The engine never assumes a missing variable; it asks the owner. (b) **Garbage in, margin out:** if founders guess their delivery costs, the margin floors are wrong.

**Next test:** 8 weeks with 15 B2B service merchants (₹50,000–₹5 lakh retainers) on stalled quotes (inactive for more than 7 days), against a 4-week baseline. **Gates:** (1) merchants set up rate cards and costs in under 5 minutes unaided; (2) realised contribution per stalled quote beats baseline, with at least a 15% conversion lift. **Kill or pivot** if fewer than half of merchants have two eligible stalled deals a month, or founders cannot give a delivery cost per service.


