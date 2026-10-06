import { describe, expect, it } from "vitest";
import { buildCanonicalTerms, createAgreementVersion, deriveMandateTerms, type AgreementVersion } from "@/domain/agreement";
import { FixedClock } from "@/domain/clock";
import { interpretations } from "@/domain/constraints";
import { formatDate } from "@/domain/dates";
import { enumerateAndEvaluate } from "@/domain/engine";
import { formatINR } from "@/domain/money";
import type { ChangeRequest } from "@/domain/restructure";
import { heroMerchant, heroPackages } from "@/data/synthetic/hero";
import { actionableChangeRequests, buyerProposalLifecycle, changeRequestDisplay, explanationAttribution, latestReplacementVersion, parseVersionSegment, pendingActions, proposalView } from "@/lib/views";
import { amendmentDiff } from "@/lib/amendment-diff";
import type { ModelProvenance } from "@/lib/model-provenance";
import type { DecisionBranch } from "@/lib/decision-branch";
import { clarifiedHeroProfile, heroInput } from "../helpers";

const feasible = () => enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible;
const version = (n: number, status: AgreementVersion["status"], structureIndex = 0): AgreementVersion => {
  const x = feasible()[structureIndex];
  const terms = buildCanonicalTerms({ dealId: "d", merchantId: "m", buyerId: "b", structure: x.structure, gstRateBps: 1800, mandate: deriveMandateTerms(x.structure, heroMerchant.policy) });
  return { agreementId: "agr-hero", version: n, structureId: x.structure.id, terms, termsHash: "h".repeat(64), createdAt: "", status, merchantApproval: null, buyerAcceptance: null, supersedes: n > 1 ? n - 1 : null };
};
const cr = (id: string, agreementVersion: number, state: ChangeRequest["state"]): ChangeRequest => ({
  id,
  replyId: `r-${id}`,
  noticeId: "notice-1",
  attemptId: "att-1",
  scheduleLineId: "pay-2",
  agreementVersion,
  phrase: "till the 20th",
  unavailableUntil: "2026-12-20",
  earliestDebit: "2026-12-21",
  transformation: "",
  timing: "preventive",
  state,
  amendmentId: null,
  createdAt: "2026-11-28T12:30:00+05:30",
  history: [],
});

describe("stale change requests from an earlier agreement version", () => {
  const agreements = [version(1, "superseded"), version(2, "active")];
  const stale = cr("chg-stale", 1, "change_requested");
  const staleDraft = cr("chg-stale-draft", 1, "draft_amendment");
  const open = cr("chg-2", 2, "change_requested");

  it("are shown as “Superseded by agreement version <active>”, never as open", () => {
    expect(changeRequestDisplay(stale, 2)).toEqual({ kind: "stale", label: "Superseded by agreement version 2" });
    expect(changeRequestDisplay(staleDraft, 2)).toEqual({ kind: "stale", label: "Superseded by agreement version 2" });
    expect(changeRequestDisplay(open, 2)).toEqual({ kind: "open", label: "Change requested" });
  });
  it("resolved requests keep their outcome label whatever the version", () => {
    expect(changeRequestDisplay(cr("a", 1, "payment_rescheduled"), 2).label).toBe("Payment rescheduled");
    expect(changeRequestDisplay(cr("b", 1, "not_restructured"), 2).label).toBe("Not restructured");
  });
  it("are not actionable and are not counted as pending actions", () => {
    expect(actionableChangeRequests([stale, staleDraft], agreements)).toEqual([]);
    expect(pendingActions({ conversation: [], changeRequests: [stale, staleDraft], agreements, amendments: [] }).total).toBe(0);
    expect(actionableChangeRequests([stale, open], agreements).map((c) => c.id)).toEqual(["chg-2"]);
    expect(pendingActions({ conversation: [], changeRequests: [stale, open], agreements, amendments: [] })).toMatchObject({ changeRequests: 1, total: 1 });
  });
  it("nothing is actionable without an active agreement", () => {
    expect(actionableChangeRequests([open], [version(1, "sent")])).toEqual([]);
  });
});

describe("buyer proposal is derived from canonical terms", () => {
  it("renders every amount and date from the terms of that exact version", () => {
    const v = version(1, "sent");
    const view = proposalView(v, heroPackages, heroMerchant.policy);
    expect(view.totalPaise).toBe(v.terms.pricing.totalPaise);
    expect(view.gstPaise).toBe(v.terms.pricing.gstPaise);
    expect(view.payments.map((p) => [p.id, p.dueDate, p.totalPaise, p.gstPaise])).toEqual(v.terms.paymentSchedule.map((p) => [p.id, p.dueDate.value, p.totalPaise, p.gstPaise]));
    expect(view.payments.map((p) => p.date)).toEqual(v.terms.paymentSchedule.map((p) => formatDate(p.dueDate.value)));
    expect(view.included.map((i) => i.packageId)).toEqual(v.terms.scope.map((s) => s.packageId));
    expect(view.excluded.map((e) => e.packageId)).toEqual(v.terms.excludedPackageIds);
    expect(view.recurring?.perDebitLimitPaise).toBe(v.terms.mandate?.perDebitLimitPaise);
    for (const step of view.nextSteps) for (const m of step.match(/₹\d[\d,]*\d(?:\.\d{2})?/g) ?? []) expect(v.terms.paymentSchedule.map((p) => formatINR(p.totalPaise)).concat(v.terms.mandate ? [formatINR(v.terms.mandate.perDebitLimitPaise)] : [])).toContain(m);
  });
  it("changes when the terms change: no figure is a constant", () => {
    const v = version(1, "sent");
    const moved: AgreementVersion = { ...v, terms: { ...v.terms, paymentSchedule: v.terms.paymentSchedule.map((p, i) => (i === 1 ? { ...p, dueDate: { value: "2026-12-21", precision: "day" as const } } : p)) } };
    expect(proposalView(moved, heroPackages, heroMerchant.policy).payments[1].date).toBe("21 Dec 2026");
    const other = version(1, "sent", 2);
    expect(proposalView(other, heroPackages, heroMerchant.policy).totalPaise).toBe(other.terms.pricing.totalPaise);
  });
  it("parses only well-formed version segments", () => {
    expect(parseVersionSegment("v1")).toBe(1);
    expect(parseVersionSegment("v12")).toBe(12);
    for (const bad of ["1", "v0", "v-1", "v1.5", "vx", "V1", "v01"]) expect(parseVersionSegment(bad)).toBeNull();
  });
  it("exposes the exact authority reason from canonical conditions", () => {
    const requires = feasible().find((x) => x.approval === "requires_approval")!;
    const v = createAgreementVersion({ agreementId: "a", version: 1, evaluated: requires, dealId: "d", merchantId: "m", buyerId: "b", policy: heroMerchant.policy, clock: new FixedClock() });
    expect(proposalView(v, heroPackages, heroMerchant.policy).authorityReason).toBe("required_approval");
    expect(proposalView(version(1, "sent"), heroPackages, heroMerchant.policy).authorityReason).toBe("phase_scope");
  });
});

describe("buyer proposal lifecycle", () => {
  const lifecycle = (status: AgreementVersion["status"], overrides: Partial<Parameters<typeof buyerProposalLifecycle>[0]> = {}) =>
    buyerProposalLifecycle({
      agreement: version(status === "superseded" ? 1 : 2, status),
      hasBuyerRequest: false,
      paymentLinkStatus: null,
      mandateStatus: null,
      attempts: [],
      replacementVersion: status === "superseded" ? 2 : null,
      ...overrides,
    });

  it("asks for a response while sent and describes payment setup as proposed", () => {
    const out = lifecycle("sent");
    expect(out.state).toBe("awaiting_response");
    expect(out.headline).toContain("Review and respond");
    expect(out.showResponseActions).toBe(true);
    expect(out.setupBasis).toBe("proposed");
  });

  it("puts a buyer change request into a truthful waiting-on-merchant state", () => {
    const out = lifecycle("sent", { hasBuyerRequest: true });
    expect(out.state).toBe("waiting_on_merchant");
    expect(out.headline).toBe("Waiting for Pinecone Media Works");
    expect(out.showResponseActions).toBe(false);
  });

  it("reports actual accepted setup and collection states", () => {
    expect(lifecycle("active", { paymentLinkStatus: "created", mandateStatus: "pending" }).detail).toMatch(/payment link.*awaiting payment.*mandate.*pending/i);
    expect(lifecycle("active", { paymentLinkStatus: "paid", mandateStatus: "confirmed", attempts: [{ status: "scheduled", dueDate: "2026-12-21" }] }).state).toBe("payment_scheduled");
    expect(lifecycle("active", { paymentLinkStatus: "paid", mandateStatus: "confirmed", attempts: [{ status: "failed", dueDate: "2026-12-01" }, { status: "scheduled", dueDate: "2026-12-04", origin: "internal_retry" }] }).state).toBe("retry_scheduled");
    expect(lifecycle("active", { paymentLinkStatus: "paid", mandateStatus: "confirmed", attempts: [{ status: "succeeded", dueDate: "2026-12-21" }], fullyPaid: true }).state).toBe("paid");
  });

  it("keeps declined and superseded versions historical", () => {
    expect(lifecycle("buyer_rejected")).toMatchObject({ state: "declined", showResponseActions: false });
    expect(lifecycle("superseded")).toMatchObject({ state: "superseded", replacementVersion: 2, showResponseActions: false });
  });

  it("never tells an accepted revision to accept again", () => {
    const out = lifecycle("active", { isRevision: true, paymentLinkStatus: "paid", mandateStatus: "confirmed" });
    expect(`${out.headline} ${out.detail}`).not.toMatch(/until you accept|after you accept/i);
    expect(out.setupBasis).toBe("actual");
  });
});

describe("historical proposal replacement", () => {
  it("links every superseded version to the latest delivered descendant", () => {
    const v1 = version(1, "superseded");
    const v2 = version(2, "superseded");
    const v3 = version(3, "active");
    expect(latestReplacementVersion([v1, v2, v3], 1)?.version).toBe(3);
    expect(latestReplacementVersion([v1, v2, v3], 2)?.version).toBe(3);
  });
});

describe("recommendation attribution follows the actual output source", () => {
  const groq: ModelProvenance = { source: "recorded_model", modelMade: true, providerName: "Groq", label: "Recorded Groq output" };
  const sample: ModelProvenance = { source: "hand_written", modelMade: false, providerName: null, label: "Sample output written by hand · no model ran" };
  it("names the model only for what a recorded model actually produced", () => {
    // `text` is the reason shown on the card; the last argument is the full comparison's source.
    expect(explanationAttribution({ ranking: "ai", text: "ai" }, groq, null, "code_fallback")).toBe("Groq ranked and wrote this reason · recorded Groq output · figures calculated by the engine. Full comparison written by code.");
    expect(explanationAttribution({ ranking: "ai", text: "ai" }, groq, null, "ai")).toBe("Groq ranked and wrote this reason · recorded Groq output · figures calculated by the engine.");
    expect(explanationAttribution({ ranking: "ai", text: "code_fallback" }, groq, null, "code_fallback")).toBe("Groq ranked · code explained · recorded Groq output · all figures calculated by the engine");
    expect(explanationAttribution({ ranking: "ai", text: "code_fallback" }, groq, null, "code_fallback")).not.toMatch(/did not pass validation/i);
    expect(explanationAttribution({ ranking: "code", text: "ai" }, groq, null, "code_fallback")).toBe("Groq wrote this reason · order set by code · recorded Groq output · figures calculated by the engine. Full comparison written by code.");
    expect(explanationAttribution({ ranking: "code", text: "code_fallback" }, groq, null, "code_fallback")).toBe("Explanation written by code · all figures calculated by the engine · Order set by code");
    expect(explanationAttribution(null, groq)).toBe("Explanation written by code · all figures calculated by the engine");
  });
  it("never claims the model wrote the full comparison when code wrote it", () => {
    for (const ranking of ["ai", "code"] as const) {
      const line = explanationAttribution({ ranking, text: "ai" }, groq, null, "code_fallback");
      expect(line).toContain("Full comparison written by code.");
      expect(line).not.toMatch(/ranked and explained|Groq explained/);
    }
  });
  it("never credits AI or Groq for a hand-written sample", () => {
    const lines = [
      explanationAttribution({ ranking: "ai", text: "ai" }, sample, null, "code_fallback"),
      explanationAttribution({ ranking: "ai", text: "code_fallback" }, sample, null, "code_fallback"),
      explanationAttribution({ ranking: "code", text: "ai" }, sample, null, "ai"),
      explanationAttribution({ ranking: "code", text: "code_fallback" }, sample, null, "code_fallback"),
      explanationAttribution(null, sample),
    ];
    expect(lines[0]).toBe("Sample order and reason written by hand · no model ran · figures calculated by the engine. Full comparison written by code.");
    expect(lines[1]).toBe("Sample order written by hand · no model ran · code explained · all figures calculated by the engine");
    expect(lines[2]).toBe("Sample reason written by hand · no model ran · order set by code · figures calculated by the engine.");
    for (const line of lines) expect(line).not.toMatch(/\bAI\b|Groq/);
  });
  it("says what recalculated the decision: the buyer's answer, the merchant's confirmed services, or both", () => {
    const branch = (over: Partial<DecisionBranch>): DecisionBranch => ({ schema: "adaptive-deals.decision-branch.v1", branchId: "b", parentRunId: "p", createdAt: "2026-10-01T09:30:00+05:30", answers: [], reason: "changed_clarification_answers", explanationSource: "code_fallback", ...over });
    const scope = { kind: "required_services" as const, packageIds: ["website-fixes"], confirmedAt: "t", by: "m", sources: [{ rawText: "x", evidenceQuote: "x", messageId: "m1", extractInputHash: "h" }] };
    const line = (b: DecisionBranch) => explanationAttribution({ ranking: "code", text: "code_fallback" }, groq, b);
    expect(line(branch({}))).toBe("Recalculated by the engine after the buyer's answer · explanation written by code.");
    expect(line(branch({ reason: "merchant_scope_confirmation", answersChanged: false, scope }))).toBe("Recalculated by the engine after the merchant confirmed the services · explanation written by code.");
    expect(line(branch({ answersChanged: true, scope }))).toBe("Recalculated by the engine after the buyer's answers and the merchant's confirmation of the services · explanation written by code.");
    for (const b of [branch({}), branch({ reason: "merchant_scope_confirmation", answersChanged: false, scope })]) expect(line(b)).not.toMatch(/Groq|AI/);
  });
  it("never credits AI with a changed-answer branch it did not process", () => {
    const branch = {
      schema: "adaptive-deals.decision-branch.v1",
      branchId: "branch-1",
      parentRunId: "run-parent",
      createdAt: "2026-10-01T09:30:00+05:30",
      answers: [],
      reason: "changed_clarification_answers",
      explanationSource: "code_fallback",
    } satisfies DecisionBranch;
    const copy = explanationAttribution({ ranking: "code", text: "code_fallback" }, { source: "recorded_model", modelMade: true, providerName: "Groq", label: "Recorded Groq output" }, branch);
    expect(copy).toBe("Recalculated by the engine after the buyer's answer · explanation written by code.");
    expect(copy).not.toMatch(/AI ranked|AI explained|suggested by AI/i);
  });
});

describe("shared proposal content (spec §5.6)", () => {
  it("renders every canonical amount and date, and no merchant-only information", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { ProposalContent } = await import("@/components/proposal-content");
    const v = version(1, "sent");
    const view = proposalView(v, heroPackages, heroMerchant.policy);
    const html = renderToStaticMarkup(ProposalContent({ view, nextHeading: "After you accept", nextSteps: view.nextSteps }));
    for (const p of v.terms.paymentSchedule) {
      expect(html).toContain(formatINR(p.totalPaise));
      expect(html).toContain(formatDate(p.dueDate.value));
    }
    expect(html).toContain(formatINR(v.terms.pricing.totalPaise));
    expect(html).not.toMatch(/contribution|cash-at-risk|funding|margin|floor|rejected|recommend/i);
  });
  it("shows the complete amendment difference on merchant and buyer content", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AmendmentDifferences } = await import("@/components/proposal-content");
    const from = version(1, "active").terms;
    const to = structuredClone(from);
    to.paymentSchedule[1].dueDate.value = "2026-12-21";
    to.invoiceSchedule[1].invoiceDate.value = "2026-12-21";
    const html = renderToStaticMarkup(AmendmentDifferences({ differences: amendmentDiff(from, to) }));
    expect(html).toContain("Payment date revised");
    expect(html).toContain("Planned invoice date revised (not an issued invoice)");
    expect(html).toContain("Agreed scope and service months unchanged");
    expect(html).toContain("Existing mandate still fits");
    expect(html).not.toContain("everything else stays unchanged");
  });
});
