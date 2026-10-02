import { readFileSync } from "node:fs";
// Data directory is set inside the store-reading test before any dynamic import (see test-isolation).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RunRecord } from "@/ai/run-record";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";
import { appliedRules, auditSources, whoDidWhat } from "@/lib/audit";

/** Spec §8.3: truthful sources, run-specific attribution, read-only. */
const run = JSON.parse(readFileSync("data/live-runs/run-live-3f518779.json", "utf8")) as RunRecord;
const state = {
  conversation: [{ kind: "clarification", state: "approved_and_sent_by_merchant", direction: "outbound" }],
  agreements: [{ version: 1, merchantApproval: { by: "Merchant", at: "t" }, buyerAcceptance: { by: "Buyer", at: "t" }, status: "active" }],
  attempts: [{ status: "succeeded", method: "payment_link" }],
  outcomes: [],
  interpretations: [{ messageId: "conv-3", questionId: "clar-gst", value: "yes", quote: "with gst", actor: "merchant", at: "t" }],
  handledMessages: [],
} as never;

describe("audit sources", () => {
  const src = auditSources(state, run);
  it("labels each source truthfully", () => {
    expect(src.find((x) => x.item === "Original annual proposal")!.source).toBe("Synthetic deal fixture");
    expect(src.find((x) => x.item === "Merchant costs and rules")!.source).toBe("Synthetic deal fixture");
    expect(src.find((x) => x.item === "Budget available now")!.source).toBe("Simulated WhatsApp conversation");
    expect(src.find((x) => x.item === "Amounts include GST (confirmation)")!.source).toBe("Clarification message");
    expect(src.find((x) => x.item === "Payment state")!.source).toBe("Simulated payment record");
    expect(src.find((x) => x.item.startsWith("Interpretation of conv-3"))!.source).toBe("Merchant interpretation of buyer message");
    expect(src.find((x) => x.item === "Offer figures and checks")!.source).toBe("Deterministic calculation from configured inputs");
    expect(src.find((x) => x.item === "Constraint extraction")!.source).toBe(`AI run ${run.runId} · extract.v2`);
  });
});

describe("who did what", () => {
  it("credits code, not AI, when AI prose failed validation", () => {
    const w = whoDidWhat(run, { ranking: "ai", text: "code_fallback" }, state);
    expect(w.ai).toContain("Suggested the order of eligible options (explain.v3)");
    expect(w.ai.join(" ")).not.toMatch(/wrote the recommendation explanation/i);
    expect(w.code).toContain("Wrote the recommendation explanation, because the AI wording did not pass validation");
    expect(w.code).toContain("Read only the narrow supported payment-date reply (reply-rules.v1)");
    expect(w.merchant).toContain("Interpreted 1 buyer reply (merchant judgement)");
  });
  it("credits AI with the explanation only when its prose was used", () => {
    const w = whoDidWhat(run, { ranking: "ai", text: "ai" }, state);
    expect(w.ai).toContain("Wrote the recommendation explanation (explain.v3)");
    expect(w.code.join(" ")).not.toMatch(/did not pass validation/);
  });
});

describe("applied rules", () => {
  it("come from configuration, with every binding rule present", () => {
    const rules = appliedRules(heroMerchant.policy, heroTemplates, heroPackages);
    expect(rules.map((r) => r.id)).toEqual(["contribution_floor", "cash_at_risk", "templates", "max_tenure", "smallest_instalment", "discount", "package_rules"]);
    expect(rules.find((r) => r.id === "cash_at_risk")!.value).toBe("₹10,000");
  });
});

describe("audit drawer content is read-only", () => {
  it("contains no forms, buttons or action endpoints, on a real deal state", async () => {
    const { mkdtempSync } = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-audit-"));
    delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
    const svc = await import("@/lib/service");
    const { driveTo } = await import("../helpers/drive");
    await svc.resetToSeed();
    const s = await driveTo(svc, (x) => x.amendments.at(-1)?.state === "active");
    const out = await svc.currentOutcome(s);
    const { AuditSections } = await import("@/components/audit/sections");
    const html = renderToStaticMarkup(AuditSections({ s, out }));
    expect(html).not.toMatch(/<form|<button|\/api\/actions|data-action=/);
    for (const h of ["Evidence", "Applied merchant rules", "Approval and acceptance history", "Calculation provenance", "Who did what", "Schedules"]) expect(html).toContain(h);
    expect(html).toContain("Simulated WhatsApp conversation");
  });
});
