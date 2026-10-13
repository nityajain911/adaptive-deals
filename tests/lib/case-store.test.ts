import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CASE_SYNTHETIC_RUN_IDS } from "@/data/synthetic/case-ai-outputs";
import { CASE_IDS, DEFAULT_CASE_ID, demoCase, type CaseId } from "@/data/synthetic/cases";

const dataDir = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-cases-"));
process.env.ADAPTIVE_DEALS_DATA_DIR = dataDir;
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic"; // pinned to the labelled hand-written sample: this suite asserts that run
delete process.env.GROQ_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

type Svc = typeof import("@/lib/service");
let svc: Svc;

beforeAll(async () => {
  svc = await import("@/lib/service");
});

const bytes = () => readFileSync(path.join(dataDir, "store.json"), "utf8");

describe("one active commercial case store", () => {
  it("defaults old and fresh workspaces to reduced scope", async () => {
    const s = await svc.resetToSeed();
    expect(s.caseId).toBe(DEFAULT_CASE_ID);
    expect(s.run.record.runId).toBe(CASE_SYNTHETIC_RUN_IDS[DEFAULT_CASE_ID]);
    expect(s.run.record.inputs.messages).toEqual(demoCase(DEFAULT_CASE_ID)!.deal.messages);
  });

  it("seeds each case with only its buyer, conversation, run and clean clock", async () => {
    for (const id of CASE_IDS) {
      const s = await svc.startCase(id);
      const item = demoCase(id)!;
      expect(s.caseId).toBe(id);
      expect(s.clockAdvances).toEqual([]);
      expect(s.run.record.runId).toBe(CASE_SYNTHETIC_RUN_IDS[id]);
      expect(s.run.record.inputs.messages).toEqual(item.deal.messages);
      expect(s.run.record.inputs.messages.every((message) => message.dealId === item.deal.dealId)).toBe(true);
      expect(s.agreements).toEqual([]);
      expect(s.outcomes).toEqual([]);
      expect(s.events.filter((event) => event.kind === "case_started")).toEqual([
        expect.objectContaining({ detail: id, provenance: "merchant" }),
      ]);
    }
  });

  it("reset preserves the selected case", async () => {
    await svc.startCase("preserve-scope");
    const reset = await svc.resetToSeed();
    expect(reset.caseId).toBe("preserve-scope");
    expect(reset.run.record.runId).toBe(CASE_SYNTHETIC_RUN_IDS["preserve-scope"]);
    expect(reset.events.some((event) => event.kind === "case_started")).toBe(false);
  });

  it("constructs and validates a replacement before writing it", async () => {
    await svc.startCase("preserve-scope");
    const before = bytes();
    await expect(svc.startCase("unknown" as CaseId)).rejects.toThrow(/unknown case/i);
    expect(bytes()).toBe(before);
  });

  it("switching cases clears agreements, outcomes and messages from the previous buyer", async () => {
    await svc.startCase("reduced-scope");
    await svc.recordAnswers([
      { questionId: "clar-gst", value: "yes", answerText: "Yes, both amounts include GST.", confirmedByBuyerVia: "whatsapp", answeredAt: "2026-10-01T09:20:00+05:30" },
      { questionId: "clar-approval", value: "per_contract", answerText: "₹60,000 is per contract.", confirmedByBuyerVia: "whatsapp", answeredAt: "2026-10-01T09:22:00+05:30" },
    ]);
    await svc.reviewBuyerProposal();
    const previous = await svc.getState();
    expect(previous.agreements).toHaveLength(1);

    const next = await svc.startCase("no-fit");
    expect(next.agreements).toEqual([]);
    expect(next.outcomes).toEqual([]);
    // Only the new buyer's own unsent question drafts; nothing of the previous buyer's conversation.
    expect(next.conversation.every((item) => item.kind === "clarification" && !item.sentAt)).toBe(true);
    expect(next.run.record.inputs.messages.some((message) => message.text.includes("Harbour"))).toBe(false);
    expect(next.run.record.inputs.messages).toEqual(demoCase("no-fit")!.deal.messages);
  });
});
