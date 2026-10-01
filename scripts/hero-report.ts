/** Prints the engine's result for the synthetic hero fixture. Nothing here is hardcoded. */
import { applyClarificationAnswer, buildConstraintProfile } from "@/domain/constraints";
import { evaluateDeal, featuredRejections, failingChecks, type EvaluatedStructure } from "@/domain/engine";
import { explainAmbiguity, explainCheck } from "@/domain/copy";
import { derivePreGstFromInclusive, formatINR } from "@/domain/money";
import { heroClarificationAnswers as A, heroMerchant, heroMessages, heroPackages, heroSyntheticExtraction, heroTemplates, HERO_DEAL_ID } from "@/data/synthetic/hero";

const input = { merchant: heroMerchant, packages: heroPackages, templates: heroTemplates };
let profile = buildConstraintProfile({ dealId: HERO_DEAL_ID, extraction: heroSyntheticExtraction, messages: heroMessages, packages: heroPackages, timeZone: heroMerchant.timeZone });
console.log("PROFILE budgetNow", JSON.stringify(profile.budgetNow.value), "| next", JSON.stringify(profile.nextBudget.value), "| gap", JSON.stringify({ from: profile.derivedBudgetGap?.from, until: profile.derivedBudgetGap?.until }));
const before = evaluateDeal(profile, input);
console.log("\nBEFORE CLARIFICATION state:", before.state);
for (const a of before.ambiguities) console.log(` - ${a.field} relevant=${a.decisionRelevant} diffs=${a.differences.map((d) => d.structureId).join(" ; ")}\n   ${explainAmbiguity(a)}`);
for (const c of [A.gst, A.approvalScope]) console.log(`\nCLARIFICATION ${c.clarificationId}: Q "${c.question}" → A "${c.answerText}" (confirmed by buyer via ${c.confirmedByBuyerVia}, ${c.answeredAt}${c.coversAmounts ? `, covers ${c.coversAmounts.join(" + ")}` : ""})`);
profile = applyClarificationAnswer(profile, "amountsIncludeGst", A.gst.value, A.gst);
profile = applyClarificationAnswer(profile, "approvalScope", A.approvalScope.value, A.approvalScope);
console.log("GST basis:", profile.amountsIncludeGst.value, "· confirmed for", profile.amountsIncludeGst.covers?.join(" + "));
for (const [label, paise] of [["budget ₹50K", profile.budgetNow.value!.amountPaise], ["approval limit ₹60K", profile.approvalLimit.value!.amountPaise]] as const) {
  const d = derivePreGstFromInclusive(paise, heroMerchant.policy.gstRateBps);
  console.log(`DERIVED pre-GST ${label}:`, formatINR(d.prePaise, { paise: true }), "+ GST", formatINR(d.gstPaise, { paise: true }), "=", formatINR(d.totalPaise, { paise: true }), "· reconciliation", formatINR(d.reconciliationPaise, { paise: true }));
}
const after = evaluateDeal(profile, input);
const r = after.result!;
console.log("\nAFTER state:", after.state, "| templates evaluated:", r.templatesEvaluated.join(", "), "| structures:", r.structures.length);
const row = (x: EvaluatedStructure) => {
  const pays = x.structure.payments.map((p) => `${p.dueDate} ${formatINR(p.totalPaise)}`).join(", ");
  const e = x.economics;
  console.log(`\n[${x.verdict.toUpperCase()}${x.verdict === "feasible" ? " · " + x.approval : ""}] ${x.structure.id}\n  ${x.structure.label}\n  price ${formatINR(e.pricePaise)} excl GST | total ${formatINR(x.structure.payments.reduce((a, p) => a + p.totalPaise, 0))} | payments: ${pays}\n  gross ${formatINR(e.grossContributionPaise)} fees ${formatINR(e.expectedFeesPaise)} net ${formatINR(e.netContributionPaise)} (${(e.netContributionBps / 100).toFixed(2)}%) | peak funding ${formatINR(e.peakFundingPaise)} | peak unpaid value ${formatINR(e.peakUnpaidServiceValuePaise)}`);
  for (const c of [...x.buyerChecks, ...x.sellerChecks].filter((c) => c.status !== "pass")) console.log(`   ${c.side}/${c.id}: ${c.status} ${c.code} — ${explainCheck(c)}`);
};
console.log("\n=== FEASIBLE (ranked) ==="); r.feasible.forEach(row);
console.log("\n=== NEEDS INFORMATION ==="); r.needsInformation.forEach(row);
console.log("\n=== REJECTED ==="); r.rejected.forEach(row);
const f = featuredRejections(r);
console.log("\nFEATURED buyer rejection:", f.buyer?.structure.id, failingChecks(f.buyer!).map((c) => c.code));
console.log("FEATURED seller rejection:", f.seller?.structure.id, failingChecks(f.seller!).map((c) => c.code));
