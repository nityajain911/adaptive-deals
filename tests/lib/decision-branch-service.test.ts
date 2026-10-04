import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-branches-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
delete process.env.GROQ_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

type Svc = typeof import("@/lib/service");
let svc: Svc;

beforeAll(async () => {
  svc = await import("@/lib/service");
});

const answers = (gst: "yes" | "no", approval: "per_contract" | "per_payment") => [
  {
    questionId: "clar-gst",
    value: gst,
    answerText: gst === "yes" ? "Yes, both amounts include GST." : "No, both amounts exclude GST.",
    confirmedByBuyerVia: "whatsapp" as const,
    answeredAt: "2026-10-01T09:20:00+05:30",
  },
  {
    questionId: "clar-approval",
    value: approval,
    answerText: approval === "per_contract" ? "₹60,000 is per contract." : "₹60,000 is per payment.",
    confirmedByBuyerVia: "whatsapp" as const,
    answeredAt: "2026-10-01T09:22:00+05:30",
  },
];

describe("persisted decision branches", () => {
  it("renders and reloads all four supported answer combinations without a new model call", async () => {
    const branchIds = new Set<string>();
    for (const gst of ["yes", "no"] as const) {
      for (const approval of ["per_contract", "per_payment"] as const) {
        await svc.resetToSeed();
        const saved = await svc.recordAnswers(answers(gst, approval));
        const reloaded = await svc.getState();
        const out = await svc.currentOutcome(reloaded);

        expect(reloaded).toEqual(saved);
        expect(out.evaluation.state).toBe("options_ready");
        expect(out.evaluation.result?.structures).toHaveLength(15);
        expect(out.profile.amountsIncludeGst.value).toBe(gst);
        expect(out.profile.approvalScope.value).toBe(approval);
        expect(svc.decisionAnswers(reloaded).map((answer) => answer.value)).toEqual([gst, approval]);

        if (gst === "yes" && approval === "per_contract") {
          expect(reloaded.decisionBranch).toBeNull();
          expect(out.explanation?.source).toEqual({ ranking: "ai", text: "ai" });
          expect(JSON.parse(JSON.stringify(reloaded.run.record))).toEqual(svc.bundledSyntheticRun());
        } else {
          expect(reloaded.decisionBranch).toMatchObject({
            schema: "adaptive-deals.decision-branch.v1",
            parentRunId: svc.bundledSyntheticRun().runId,
            reason: "changed_clarification_answers",
            explanationSource: "code_fallback",
          });
          expect(out.explanation?.source).toEqual({ ranking: "code", text: "code_fallback" });
          branchIds.add(reloaded.decisionBranch!.branchId);
        }
      }
    }
    expect(branchIds.size).toBe(3);
  });

  it("does not save a partial branch when derivation rejects an unsupported answer", async () => {
    await svc.resetToSeed();
    const before = await svc.getState();
    await expect(svc.recordAnswers([{ ...answers("yes", "per_contract")[0], value: "maybe" }, answers("yes", "per_contract")[1]])).rejects.toThrow(/GST answer must be yes or no/);
    expect(await svc.getState()).toEqual(before);
  });
});
