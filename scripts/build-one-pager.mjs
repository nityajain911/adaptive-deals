// Builds the one-page product note from one source of truth: ONE_PAGE_PRODUCT_NOTE.md and a one-page PDF.
// Run: node scripts/build-one-pager.mjs   (needs Playwright's Chromium, already used by the e2e tests)
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { getDocumentProxy } from "unpdf";
import { readFileSync } from "node:fs";

const TITLE = "Adaptive Deals by Razorpay — one-page product note";
const BYLINE = "AI-native deal desk for B2B and SME commerce · Nitya Jain · Razorpay × ISB AI PM Build Challenge · Track 2";

// The headline numbers, from the demo deal on the synthetic merchant's own prices and costs.
const INTRO = "**The same stalled deal.** Client budget: ₹50,000 this quarter. Our annual quote: ₹1,41,600 (incl. GST).";
const STRIP = [
  ["Today: the owner discounts", ["Delivers 12 months of work for ₹42,373 (before GST)", "Costs ₹57,000 to deliver"], "Result: loses ₹14,600"],
  ["With Adaptive Deals: the owner restructures", ["Sells a 3-month package for ₹39,000 (before GST)", "Fits the ₹50,000 budget; costs and fees paid"], "Result: earns ₹19,330"],
];

// Inline: **bold** and [text](url). Blocks: { h, p[] } where an item starting "- " is a bullet.
const SECTIONS = [
  {
    h: "1. The merchant, the problem and the Razorpay opportunity",
    p: [
      "- **Merchant:** founders of small B2B service firms (marketing agencies, design studios, IT and compliance consultancies) selling modular retainers.",
      "- **Problem:** checkout is binary: pay in full now or walk away. A buyer says, “I only have ₹50,000 this quarter; anything above ₹60,000 needs our MD,” and the quote stalls. Service deals stall not on willingness to pay but because rebuilding scope, phases and cost by hand takes days.",
      "- **Razorpay opportunity:** proposal tools (PandaDoc, Proposify) reshape quotes but cannot collect; a gateway collects only after terms are final. An adaptive deal desk upstream of Payment Links and mandates moves Razorpay from settlement rail to revenue recovery ([mandate docs](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-intent/initiate-mandate-registration/)).",
    ],
  },
  {
    h: "2. Evidence, workarounds and merchant discovery",
    p: [
      "**I interviewed 6 B2B SME founders** (3 digital marketing agencies, 2 software or design shops, 1 compliance consultancy; retainers ₹40,000–₹2,50,000 a month):",
      "- **Panic discounting.** “When a client says budget is tight, I panic and shave 15–20% off without checking my freelance contractor costs. By month three, I'm delivering at a loss.” (founder, 12-person performance agency). **Product change:** delivery cost per service sits at the centre of setup, so every offer is checked against a margin floor.",
      "- **Restructuring.** “Clients rarely say ‘no’; they say ‘not all at once.’ If I break it into phased milestones, they sign, but doing that math on the fly takes hours of spreadsheet recalculations.” (founder, design studio). **Product change:** the rules engine tries scope reduction and phased schedules before fee cuts.",
      "- **WhatsApp.** 4 of 6 founders said most of their negotiations happen in WhatsApp groups (client contact, finance head, agency team). An automated bot inside client groups is unacceptable, so the product is an out-of-band co-pilot: the conversation is forwarded or pasted in.",
      "**Cost of discounting:** on my synthetic merchant, discounting the annual plan to the ₹50,000 budget leaves ₹42,373 before GST against ₹57,000 of delivery cost (−₹14,600 before fees). Outside evidence, each with its limit: McKinsey's analysis of an average S&P 1500 company puts the effect of a 1% price change at about 8% of operating profit, volume held constant ([The power of pricing](https://www.mckinsey.com/Business%20Functions/Marketing%20and%20Sales/Our%20Insights/The%20power%20of%20pricing); large listed firms, 2003, the latest I could verify). 51% of B2B buyers say they would switch for more flexible terms ([TreviPay](https://www.businesswire.com/news/home/20231114210927/en/New-Research-from-TreviPay-Shows-B2B-Buyer-Seller-Loyalty-Hinges-on-a-Better-Payments-Experience); vendor survey). Six interviews show a pattern, not its frequency; I test that next.",
    ],
  },
  {
    h: "3. What I built, for whom, and what I left out",
    p: [
      "**An AI deal-restructuring desk for the agency owner.** (1) **Understand (AI):** reads the buyer's chat and extracts constraints (budget ceiling, start date, approval limit), each tied to a verbatim quote. (2) **Review (rules engine):** checks every offer the merchant's templates allow against the buyer's limits and the merchant's rate card and margin floor, and shows what changed, what the owner keeps, and at most two alternatives. (3) **Send and close:** the owner reviews and sends the offer; the buyer accepts, pays and authorises later debits in one tap; later changes are rechecked first.",
      "**Left out, deliberately:** (1) autonomous negotiating bots: the merchant stays in the loop (legal and brand risk); (2) AI-set prices: all pricing is the merchant's rate card; (3) B2B credit or BNPL: affordability comes from scope and schedules; (4) live WhatsApp and real mandates: chat and recurring debits are simulated, and the upfront payment step targets Razorpay test mode; delivery tracking and refunds.",
    ],
  },
  {
    h: "4. Key product and AI decisions",
    p: [
      "- **AI reads words; code decides money.** Models are good at meaning in messy chat and unsafe for unit economics. Cerebras (gpt-oss-120b) extracts text; a deterministic engine computes margins, applies GST and enforces floors, and each offer is bound to a terms hash both sides accept.",
      "- **Verbatim grounding.** When a rate card is uploaded, AI proposes line items but code accepts a value only if its quote appears in the document and its amount matches. If a budget cannot be met, the product names the broken rule instead of inventing an unviable offer.",
      "- **Explainable trade-offs.** The owner sees services removed, cost saved and margin kept. I rejected an “AI confidence” score because none is calibrated.",
      "- **Tested, with limits.** A frozen set of 20 synthetic cases: 42 of 47 constraints extracted, 14 of 16 failure states caught, 4 of 6 ambiguous constraints flagged for clarification.",
    ],
  },
  {
    h: "5. Primary metric, risks and what I test next",
    p: [
      "**Metric:** realised contribution per eligible stalled deal within 90 days (cash received excluding GST, minus direct delivery cost, payment fees and refunds). Deal count or GMV misleads: a deal saved at a loss is a net loss.",
      "**Risks.** (a) **Omnichannel fragmentation:** deals span WhatsApp, calls and email, so a forwarded chat can miss a verbal agreement. The engine never assumes a missing variable; it asks the owner. (b) **Garbage in, margin out:** if founders guess their delivery costs, the margin floors are wrong.",
      "**Next test:** 8 weeks with 15 B2B service merchants (₹50,000–₹5 lakh retainers) on stalled quotes (inactive for more than 7 days), against a 4-week baseline. **Gates:** (1) merchants set up rate cards and costs in under 5 minutes unaided; (2) realised contribution per stalled quote beats baseline, with at least a 15% conversion lift. **Kill or pivot** if fewer than half of merchants have two eligible stalled deals a month, or founders cannot give a delivery cost per service.",
    ],
  },
];

const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${TITLE}</title><style>
@page { size: A4; margin: 9mm 11mm; }
* { box-sizing: border-box; }
body { font: 8.7pt/1.28 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #14171f; margin: 0; }
h1 { font-size: 13.5pt; margin: 0 0 1px; letter-spacing: -0.01em; }
.by { color: #5b6270; font-size: 7.8pt; margin-bottom: 4px; border-bottom: 1.5px solid #2d5bff; padding-bottom: 3px; }
h2 { font-size: 9.8pt; margin: 6px 0 1px; color: #1d47e6; }
.strip { display: flex; gap: 6px; margin: 2px 0 2px; }
.strip div { flex: 1; border: 1px solid #d6defe; background: #f4f6ff; border-radius: 4px; padding: 3px 6px; }
.intro { font-size: 8.7pt; margin: 2px 0; }
.strip em { display: block; font-style: normal; font-weight: 700; font-size: 8.3pt; color: #14171f; }
.strip b { display: block; font-size: 10.5pt; margin-top: 1px; color: #b3261e; }
.strip .c1 b { color: #12794a; }
.strip span { font-size: 7.4pt; color: #5b6270; line-height: 1.15; display: block; }
p { margin: 0 0 2px; } ul { margin: 0 0 2px; padding-left: 12px; } li { margin: 0 0 1px; }
a { color: #1d47e6; text-decoration: none; }
</style></head><body><h1>${TITLE}</h1><div class="by">${BYLINE}</div><div class="intro">${inline(INTRO)}</div><div class="strip">${STRIP.map(([h, l, r], i) => `<div class="c${i}"><em>${h}</em><span>${l.join("<br>")}</span><b>${r}</b></div>`).join("")}</div>${SECTIONS.map((s) => {
  const out = []; let list = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`); list = []; } };
  for (const para of s.p) { if (para.startsWith("- ")) list.push(para.slice(2)); else { flush(); out.push(`<p>${inline(para)}</p>`); } }
  flush();
  return `<h2>${s.h}</h2>${out.join("")}`;
}).join("")}</body></html>`;

const md = [`# ${TITLE}`, "", BYLINE, "", INTRO, "", STRIP.map(([h, l, r]) => `**${h}:** ${l.join("; ")}. **${r}.**`).join("\n\n"), "", ...SECTIONS.flatMap((s) => [`## ${s.h}`, "", ...s.p.map((x) => (x.startsWith("- ") ? x : x + "\n")), ""])].join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
writeFileSync("ONE_PAGE_PRODUCT_NOTE.md", md);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
if (process.env.ONEPAGER_PNG) { await page.setViewportSize({ width: 794, height: 1123 }); await page.emulateMedia({ media: "print" }); await page.screenshot({ path: process.env.ONEPAGER_PNG, fullPage: true, scale: "device" }); }
await page.pdf({ path: "ONE_PAGE_PRODUCT_NOTE.pdf", format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
const pdf = await getDocumentProxy(new Uint8Array(readFileSync("ONE_PAGE_PRODUCT_NOTE.pdf")));
console.log(`pages: ${pdf.numPages}; words: ${md.split(/\s+/).length}`);
if (pdf.numPages !== 1) { console.error("The note is more than one page."); process.exit(1); }
