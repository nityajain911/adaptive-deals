# Fixture rationale — synthetic hero scenario

All values live in one file: `data/synthetic/hero.ts`. **Every value is illustrative. None of them is merchant evidence.** They were chosen to make the freeze-pack hero scenario (§13) exercise each engine rule visibly. Editing them changes engine outcomes without any code change; `tests/domain/hero.test.ts` checks this.

The fixture holds inputs only. Rejections, feasibility, approval labels and every displayed figure come from the engine.

## Parties (fictional)

| Item | Value | Why |
| --- | --- | --- |
| Seller | Pinecone Media Works | Fictional agency selling modular services (FP §5 segment) |
| Buyer | Kestrel Lane Clinics | Fictional clinic chain (FP §13) |
| Timezone | Asia/Kolkata | FP §7 hero merchant timezone |

## Packages (annual quote ₹1,20,000 before GST)

| Package | Price | Direct cost | Cost timing | Flags | Rationale |
| --- | --- | --- | --- | --- | --- |
| Website fixes | ₹24,000 one-time | ₹12,000 | Start of delivery month | independent value | Large up-front cost, so payment timing matters for funding requirement |
| Search marketing | ₹4,000/month × 12 | ₹2,000/month | Start of each month | independent value | Core recurring service with stand-alone value |
| Social media | ₹3,000/month × 12 | ₹1,500/month | Start of each month | independent value | Removable, so a smaller Phase 1 can leave it out |
| Monthly reporting | ₹1,000/month × 12 | ₹250/month | Start of each month | **no** independent value; depends on search or social | Shows the scope rule that a phase needs value on its own |

Totals: ₹1,20,000 price; ₹57,000 direct cost; gross contribution ₹63,000 (52.5%). Margins around 50% are a plausible-looking assumption for small agencies, not a measured figure.

## Merchant policy

| Policy | Value | Why |
| --- | --- | --- |
| GST rate | 18% | Standard rate for these services; GST per invoice line, half-up to the paise |
| Contribution floor | 35% of accepted pre-GST price, net of fees | Percentage rule only (FP §11 lets the fixture choose) |
| Cash-at-risk limit | ₹10,000 peak funding requirement, per deal | See "Why ₹10,000 cash at risk" below |
| Maximum tenure | 12 months | Matches an annual engagement |
| Smallest instalment | ₹10,000 before GST | Keeps 12 monthly payments of the annual scope exactly at the minimum |
| Discount limit | 0% | FP §7 default; templates use no discount |
| Expected payment fee | 2% of each customer-facing collection | Illustrative gateway fee, borne by the seller |
| Advance notice | 3 days before each recurring debit | Gives the buyer time to respond; the 1 Dec debit gets a notice on 28 Nov |
| Internal retry | 3 days after a failed debit | Creates the Adaptive Deals retry that the amendment removes |
| Mandate end buffer | End of the month after the last recurring debit | Gives a mandate end date that a short reschedule fits inside |

## Why ₹10,000 cash at risk

The cash-at-risk limit caps the **peak funding requirement**: the most of its own cash the agency will have spent on this client's direct delivery costs before the client's payments (excl. GST) catch up. It is a per-deal limit, not a firm-wide one.

The fixture sets it at **₹10,000**. The principle behind it: **the agency will not fund more than one month of this client's average billing from its own cash** (₹1,20,000 ÷ 12 months = ₹10,000).

Why that is reasonable for a small agency on this deal:

- **Thin working capital.** A small agency pays freelancers, ad-tool licences and contractors monthly, often before the client pays. A cap tied to the client's own monthly billing keeps exposure on any one client proportionate to what that client is worth.
- **Bounded loss.** If the client stops paying, the agency has lost at most about one month of that client's billing in unrecovered costs. It has not funded a quarter of delivery on credit.
- **No expensive one-off work without prepayment.** The website fixes have a ₹12,000 direct cost up front. A ₹10,000 limit means the agency cannot start that work without receiving at least part of the money first. This is a common small-agency practice (a deposit before build work).
- **Not lending.** Adaptive Deals is not a lending product (FP §5). A low cap stops a "payment plan" from becoming informal credit.

**Disclosure:** the value is synthetic and also sits just below the peak of the 20/80 split (₹10,500 on 1 Apr 2027). That is what lets the demo show one structure the buyer could pay but the seller cannot afford. The result is sensitive to the setting:

- at ₹10,500 or above, the 20/80 split becomes feasible (still labelled **Needs buyer's MD approval**), as `tests/domain/hero.test.ts` shows;
- the 30/70 split peaks at ₹0;
- the May-2027 deferred start peaks at ₹5,750.

The product's claim is not that ₹10,000 is the right number. The claim is that whatever limit the merchant sets, the engine enforces it and shows why.

## Templates and parameter ranges (merchant-approved)

- **Delivery start:** 1 Nov 2026, one month after the buyer's message.
- **Split payment** (full scope): 12 monthly; 4 quarterly; 2 equal (months 1 and 7); 20/80 (months 1 and 7); 30/70 (months 1 and 7).
- **Phased scope:** one Phase 1 preset, "website fixes + 3 months of search marketing and reporting". It is paid upfront, in 2 monthly payments, or in 3 monthly payments.
- **Deferred start** (full scope, 12 monthly payments): start in Jan 2027, Apr 2027 or May 2027. Apr 2027 is included on purpose to show the month-precision "needs information" rule.
- **Shorter commitment** (all services): 3 or 6 months, upfront or monthly.

That is 15 structures in total, all evaluated.

## Timing assumptions

| Item | Value | Why |
| --- | --- | --- |
| Demo clock anchor | 2026-10-01 09:00 IST | Prompt and FP §21 |
| Merchant proposal message | 2026-09-29 16:10 IST | Context only |
| Buyer message | 2026-10-01 08:47 IST | "This quarter" → 1 Oct–31 Dec 2026; "April" → Apr 2027 (month precision); derived budget gap 1 Jan 2027 → Apr 2027 |
| Upfront payment link paid | 2026-11-01 (simulated) | First instalment of the chosen Phase 1 |
| Advance notice | 2026-11-28 10:00 IST (simulated, labelled) | FP §12: Adaptive Deals sends its own notice 3 days before each debit |
| Failed recurring debit | 2026-12-01 (simulated) | Triggers the amendment |
| Buyer reply | 2026-12-01 11:05 IST, "cash tight till the 20th", recorded as a reply to the 28 Nov notice | Normalised from the reply's own timestamp to 20 Dec 2026. "Till" is inclusive, so the revised debit is 21 Dec 2026 (rule in PRODUCT_DECISIONS.md). That date is still inside the buyer's current-quarter budget and the mandate |

The prompt's example simulated date (`2027-05-03`) is only an example. The hero's chosen agreement has its recurring debit in December 2026, so the simulated dates follow that schedule.

## Clarification answers (pinned by FP §13)

| Question | Answer | Effect |
| --- | --- | --- |
| Does ₹50,000 include GST? | Yes, confirmed by the buyer via WhatsApp | Pre-GST budget derived as ₹42,372.88 (reconciliation ₹0.00) |
| Is ₹60,000 per payment or for the full contract? | Full contract, confirmed by the buyer via WhatsApp | Phase 1 (₹46,020) is within the limit; full annual options (₹1,41,600) need the buyer's MD approval |

## Synthetic extraction

`heroSyntheticExtraction` is a hand-written stand-in for AI output, used by the credential-free synthetic replay and by the tests. It is not output from a model.
