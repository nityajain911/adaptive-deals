import { describe, expect, it } from "vitest";
import { buildCanonicalTerms, deriveMandateTerms, type AgreementVersion } from "@/domain/agreement";
import { interpretations } from "@/domain/constraints";
import { formatDate } from "@/domain/dates";
import { enumerateAndEvaluate } from "@/domain/engine";
import { formatINR } from "@/domain/money";
import type { ChangeRequest } from "@/domain/restructure";
import { heroMerchant, heroPackages } from "@/data/synthetic/hero";
import { actionableChangeRequests, changeRequestDisplay, explanationAttribution, parseVersionSegment, pendingActions, proposalView } from "@/lib/views";
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
});

describe("recommendation attribution follows the actual output source", () => {
  it("AI wording only when the explanation text is AI", () => {
    expect(explanationAttribution({ ranking: "ai", text: "ai" })).toMatch(/^Explanation written by AI · all figures calculated by the engine/);
    expect(explanationAttribution({ ranking: "ai", text: "code_fallback" })).toMatch(/^Explanation written by code \(AI wording did not pass validation\)/);
    expect(explanationAttribution({ ranking: "ai", text: "code_fallback" })).not.toMatch(/written by AI/);
    expect(explanationAttribution({ ranking: "code", text: "code_fallback" })).toMatch(/Order set by code$/);
    expect(explanationAttribution(null)).toBe("Explanation written by code · all figures calculated by the engine");
  });
});
