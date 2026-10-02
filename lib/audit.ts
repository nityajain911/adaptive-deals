import type { ExplanationResult } from "@/ai/explain";
import type { RunRecord } from "@/ai/run-record";
import { formatINR } from "@/domain/money";
import type { MerchantPolicy, ServicePackage, TemplateConfig } from "@/domain/types";
import type { DemoState } from "./service";

/**
 * Read-only audit derivations for the merchant audit drawer (spec §8.3). Every source is labelled
 * truthfully, and attribution follows what actually happened in this run.
 */
type AuditState = Pick<DemoState, "conversation" | "agreements" | "attempts" | "outcomes" | "interpretations" | "handledMessages">;

export interface AuditSource {
  item: string;
  source: string;
  detail?: string;
}

const TASK_LABEL: Record<string, string> = { extract: "Constraint extraction", clarify: "Clarification wording", explain: "Option ranking and explanation" };

export function auditSources(s: AuditState, run: RunRecord): AuditSource[] {
  const out: AuditSource[] = [
    { item: "Original annual proposal", source: "Synthetic deal fixture", detail: "₹1,20,000 pre-GST annual scope at list price + 18% GST = ₹1,41,600" },
    { item: "Merchant costs and rules", source: "Synthetic deal fixture" },
  ];
  for (const f of run.engine.profile) {
    if (f.evidence.length) out.push({ item: f.label, source: "Simulated WhatsApp conversation", detail: f.evidence.map((e) => `“${e.quote}” (${e.messageId}, chars ${e.start}–${e.end})`).join(" ") });
    if (f.confirmedBy) out.push({ item: `${f.label} (confirmation)`, source: "Clarification message", detail: `${f.confirmedBy.questionId}` });
  }
  for (const i of s.interpretations) out.push({ item: `Interpretation of ${i.messageId}`, source: "Merchant interpretation of buyer message", detail: `“${i.quote}” → ${i.value}` });
  if (s.attempts.some((a) => a.status === "succeeded" || a.status === "failed")) out.push({ item: "Payment state", source: "Simulated payment record" });
  out.push({ item: "Offer figures and checks", source: "Deterministic calculation from configured inputs" });
  for (const st of run.steps) {
    if (st.outcome === "failed" || st.outcome === "rejected") continue;
    out.push({ item: TASK_LABEL[st.task] ?? st.task, source: `AI run ${run.runId} · ${st.promptVersion}`, detail: `${st.provider} · ${st.model} · ${st.outcome.replace(/_/g, " ")}` });
  }
  return out;
}

/** Who did what in this run, specific to the recorded outcomes. */
export function whoDidWhat(run: RunRecord, source: ExplanationResult["source"] | null, s: AuditState): { ai: string[]; code: string[]; merchant: string[]; buyer: string[] } {
  const step = (task: string) => run.steps.find((x) => x.task === task && x.outcome !== "failed" && x.outcome !== "rejected");
  const ai: string[] = [];
  const extract = step("extract");
  if (extract) ai.push(`Extracted the opening constraints (${extract.promptVersion})`);
  const clarify = step("clarify");
  if (clarify && run.displayed.questions.some((q) => q.wording === "ai")) ai.push(`Drafted the clarification questions (${clarify.promptVersion})`);
  const explain = step("explain");
  if (explain && source?.ranking === "ai") ai.push(`Suggested the order of eligible options (${explain.promptVersion})`);
  if (explain && source?.text === "ai") ai.push(`Wrote the recommendation explanation (${explain.promptVersion})`);

  const code = [
    "Normalised supported values and verified every evidence quote",
    "Evaluated every permitted structure and calculated every figure",
    "Enforced the approval ordering and validated AI prose",
    "Read only the narrow supported payment-date reply (reply-rules.v1)",
  ];
  if (source?.text === "code_fallback") code.push("Wrote the recommendation explanation, because the AI wording did not pass validation");

  const merchant: string[] = [];
  const sent = s.conversation.filter((i) => i.kind === "clarification" && i.state === "approved_and_sent_by_merchant").length;
  if (sent) merchant.push(`Sent ${sent} clarification question${sent === 1 ? "" : "s"}`);
  for (const v of s.agreements) if (v.merchantApproval) merchant.push(`Approved terms version ${v.version}`);
  if (s.outcomes.some((o) => o.type === "option_selected")) merchant.push("Selected an alternative offer");
  if (s.outcomes.some((o) => o.type === "merchant_closed")) merchant.push("Closed the deal in Adaptive Deals");
  if (s.interpretations.length) merchant.push(`Interpreted ${s.interpretations.length} buyer repl${s.interpretations.length === 1 ? "y" : "ies"} (merchant judgement)`);
  if (s.handledMessages.length) merchant.push(`Marked ${s.handledMessages.length} buyer message${s.handledMessages.length === 1 ? "" : "s"} handled`);

  const buyer: string[] = [];
  const replies = s.conversation.filter((i) => i.direction === "inbound").length;
  if (replies) buyer.push(`Sent ${replies} simulated repl${replies === 1 ? "y" : "ies"}`);
  for (const v of s.agreements) {
    if (v.buyerAcceptance) buyer.push(`Accepted terms version ${v.version} (simulated buyer action)`);
    if (v.status === "buyer_rejected") buyer.push(`Declined terms version ${v.version} (simulated buyer action)`);
  }
  return { ai, code, merchant, buyer };
}

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

/** The merchant's applied rules, read from configuration (the synthetic fixture). Read-only. */
export function appliedRules(policy: MerchantPolicy, templates: TemplateConfig, packages: ServicePackage[]): { id: string; name: string; value: string; detail: string }[] {
  const floor = [policy.contributionFloor.minPercentBps !== null ? `${pct(policy.contributionFloor.minPercentBps)} of the accepted price (excl. GST)` : null, policy.contributionFloor.minPaise !== null ? formatINR(policy.contributionFloor.minPaise) : null]
    .filter(Boolean)
    .join(policy.contributionFloor.combine === "both" ? " and " : " or ");
  const enabled = (
    [
      ["Split payment", templates.split_payment.enabled, templates.split_payment.plans.map((p) => p.label)],
      ["Phased scope", templates.phased_scope.enabled, templates.phased_scope.phase1Scopes.map((p) => p.label)],
      ["Deferred start", templates.deferred_start.enabled, templates.deferred_start.startDates],
      ["Shorter commitment", templates.shorter_commitment.enabled, templates.shorter_commitment.terms.map((t) => `${t.termMonths} months`)],
    ] as const
  ).filter(([, on]) => on);
  return [
    { id: "contribution_floor", name: "Contribution floor", value: floor, detail: "Projected net contribution after direct costs and expected payment fees must reach this." },
    { id: "cash_at_risk", name: "Cash-at-risk limit", value: formatINR(policy.cashAtRiskLimitPaise), detail: "Peak funding requirement (costs paid before cash arrives) may not exceed this." },
    { id: "templates", name: "Permitted structure templates", value: `${enabled.length} of 4`, detail: enabled.map(([n, , xs]) => `${n}: ${xs.join(", ")}`).join(" · ") },
    { id: "max_tenure", name: "Maximum tenure", value: `${policy.maxTenureMonths} months`, detail: "From delivery start to the later of the last delivery and the last payment." },
    { id: "smallest_instalment", name: "Smallest instalment", value: `${formatINR(policy.smallestInstalmentPaise)} excl. GST`, detail: "No payment line may be smaller." },
    { id: "discount", name: "Discount policy", value: policy.discountLimitBps === 0 ? "No discount" : `Up to ${pct(policy.discountLimitBps)}`, detail: `Discount levels templates may use: ${templates.discountsBps.map(pct).join(", ")}.` },
    {
      id: "package_rules",
      name: "Package separability and independent value",
      value: `${packages.length} packages`,
      detail: packages
        .map((p) => `${p.name}: ${p.removable ? "removable" : "not removable"}, ${p.deferrable ? "deferrable" : "not deferrable"}, ${p.hasIndependentValue ? "has value on its own" : "no value on its own"}${p.dependsOnAny?.length ? `, needs ${p.dependsOnAny.map((d) => packages.find((x) => x.id === d)?.name ?? d).join(" or ")}` : ""}`)
        .join(" · "),
    },
  ];
}
