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
| Cash-at-risk limit | ₹10,000 peak funding requirement | Low enough to reject a back-loaded 20/80 split (peak ₹10,500) and accept 30/70 (peak ₹0) |
| Maximum tenure | 12 months | Matches an annual engagement |
| Smallest instalment | ₹10,000 before GST | Keeps 12 monthly payments of the annual scope exactly at the minimum |
| Discount limit | 0% | FP §7 default; templates use no discount |
| Expected payment fee | 2% of each customer-facing collection | Illustrative gateway fee, borne by the seller |
| Internal retry | 3 days after a failed debit | Creates the Adaptive Deals retry that the amendment removes |
| Mandate end buffer | End of the month after the last recurring debit | Gives a mandate end date that a short reschedule fits inside |

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
| Advance notice | 2026-11-28 (simulated, labelled) | FP §12: Adaptive Deals sends its own notice before each debit |
| Failed recurring debit | 2026-12-01 (simulated) | Triggers the amendment |
| Buyer reply | 2026-12-01 11:05 IST, "cash tight till the 20th" | Normalised from the reply's own timestamp to 20 Dec 2026; revised debit on 21 Dec 2026, still inside the buyer's current-quarter budget and the mandate |

The prompt's example simulated date (`2027-05-03`) is only an example. The hero's chosen agreement has its recurring debit in December 2026, so the simulated dates follow that schedule.

## Clarification answers (pinned by FP §13)

| Question | Answer | Effect |
| --- | --- | --- |
| Does ₹50,000 include GST? | Yes, confirmed by the buyer via WhatsApp | Pre-GST budget derived as ₹42,372.88 (reconciliation ₹0.00) |
| Is ₹60,000 per payment or for the full contract? | Full contract, confirmed by the buyer via WhatsApp | Phase 1 (₹46,020) is within the limit; full annual options (₹1,41,600) need the buyer's MD approval |

## Synthetic extraction

`heroSyntheticExtraction` is a hand-written stand-in for AI output, used by the credential-free synthetic replay and by the tests. It is not output from a model.
