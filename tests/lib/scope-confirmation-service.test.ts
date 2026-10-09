import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { caseAuthoredOutputs } from "@/data/synthetic/case-ai-outputs";
import { demoCase } from "@/data/synthetic/cases";
import type { ExtractionOutput } from "@/ai/schemas";
import { PRESERVE_RUN_ID, recordedRoot, recordedRun, recordedPreserveScope, rootWith } from "../helpers/recorded-case";

/**
 * The preserve-scope extraction returned "complete annual package", which names no deal package.
 * The merchant must confirm the required services before any offer is prepared; the recorded run
 * is never edited, and the engine recalculates from the merchant's confirmation.
 */
const ALL = ["website-fixes", "search-marketing", "social-media", "monthly-reporting"];

type Svc = typeof import("@/lib/service");
let svc: Svc;

beforeAll(async () => {
  process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-scope-"));
  process.env.ADAPTIVE_DEALS_CASE_RUN_ROOT = await recordedRoot();
  delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
  delete process.env.GROQ_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  svc = await import("@/lib/service");
});

const start = () => svc.startCase("preserve-scope");

describe("an unmapped required scope owns the next action", () => {
  it("starts the recorded run with the rejected phrase and holds the merchant at Understand", async () => {
    const s = await start();
    expect(s.run.record).toMatchObject({ runId: PRESERVE_RUN_ID, kind: "live" });
    expect(s.run.record.engine.rejectedFields).toEqual([{ key: "required_package", reason: "does not match a deal package", rawText: "complete annual package" }]);
    expect(s.status).toBe("options_ready");
    const p = await svc.progressOf(s);
    expect(p).toMatchObject({ stage: "understand", rule: "understand.scope", kind: "action_required", actor: "merchant", primaryAction: { id: "confirm_required_services", label: "Confirm the services" } });
    expect(p.stages).toEqual({ understand: "current", offer: "upcoming", track: "upcoming" });
    expect(p.headline).toBe("Tell us which services they need before we suggest an offer.");
  });

  it("refuses to prepare any offer until the services are confirmed, and changes nothing", async () => {
    const s = await start();
    const top = (await svc.currentOutcome(s)).explanation!.order[0];
    await expect(svc.selectOption(top)).rejects.toThrow(/confirm the required services/i);
    await expect(svc.reviewBuyerProposal()).rejects.toThrow(/confirm the required services/i);
    const after = await svc.getState();
    expect(after.selectedOption).toBeNull();
    expect(after.agreements).toEqual([]);
    expect(after.outcomes).toEqual([]);
  });
});

describe("confirming the required services", () => {
  it.each([
    ["no service chosen", [], /at least one service/i],
    ["an unknown service", ["podcast"], /not a service in this deal/i],
  ])("refuses %s and changes nothing", async (_name, ids, message) => {
    const before = await start();
    await expect(svc.confirmRequiredServices(ids)).rejects.toThrow(message);
    expect((await svc.getState()).decisionBranch).toBeNull();
    expect(await svc.getState()).toEqual(before);
  });

  it("refuses when nothing was left unmapped", async () => {
    await svc.startCase("reduced-scope");
    await expect(svc.confirmRequiredServices(ALL)).rejects.toThrow(/nothing to confirm/i);
    await start();
  });

  it("stores a merchant correction linked to the rejected extraction, without touching the recorded run", async () => {
    const before = await start();
    const recordedBefore = structuredClone(before.run.record);
    const s = await svc.confirmRequiredServices(ALL);
    const branch = s.decisionBranch!;
    expect(branch).toMatchObject({ parentRunId: PRESERVE_RUN_ID, reason: "merchant_scope_confirmation", answersChanged: false, explanationSource: "code_fallback" });
    expect(branch.scope).toMatchObject({ kind: "required_services", packageIds: ALL, by: "Merchant (Pinecone Media Works)" });
    expect(branch.scope!.sources).toEqual([
      {
        rawText: "complete annual package",
        evidenceQuote: "We need the complete annual package for the admissions season",
        messageId: "preserve-2",
        extractInputHash: before.run.record.steps.find((x) => x.task === "extract")!.inputHash,
      },
    ]);
    expect(s.run.record).toEqual(recordedBefore);
    expect(s.events.at(-1)).toMatchObject({ kind: "required_services_confirmed", provenance: "merchant" });
  });

  it("recalculates through the engine, and the confirmed services reach the profile with their evidence", async () => {
    await start();
    const s = await svc.confirmRequiredServices(ALL);
    const out = await svc.currentOutcome(s);
    expect(out.profile.requiredPackages).toMatchObject({ status: "stated", value: ALL, merchantConfirmation: { by: "Merchant (Pinecone Media Works)", unmappedPhrases: ["complete annual package"] } });
    expect(out.evaluation.state).toBe("options_ready");
    expect(out.evaluation.result!.structures.every((x) => x.buyerChecks.some((c) => c.id === "buyer_required_packages"))).toBe(true);
    // The recorded model explanation described the unconfirmed profile, so code writes this one.
    expect(out.explanation!.source).toEqual({ ranking: "code", text: "code_fallback" });
  });

  it("moves to the Offer stage and then allows the offer to be prepared", async () => {
    await start();
    const s = await svc.confirmRequiredServices(ALL);
    const p = await svc.progressOf(s);
    expect(p).toMatchObject({ stage: "offer", rule: "offer.review", primaryAction: { id: "review_buyer_proposal" } });
    const draft = await svc.reviewBuyerProposal();
    expect(draft.version).toBe(1);
  });

  it("survives a reload and refuses a second confirmation", async () => {
    await start();
    await svc.confirmRequiredServices(ALL);
    const reloaded = await svc.getState();
    expect(reloaded.decisionBranch!.scope!.packageIds).toEqual(ALL);
    await expect(svc.currentOutcome(reloaded)).resolves.toBeTruthy();
    await expect(svc.confirmRequiredServices(["website-fixes"])).rejects.toThrow(/already confirmed/i);
  });

  it("treats a smaller confirmed scope as the merchant's decision, and the engine honours it", async () => {
    await start();
    const s = await svc.confirmRequiredServices(["website-fixes", "search-marketing"]);
    const out = await svc.currentOutcome(s);
    expect(out.profile.requiredPackages.value).toEqual(["website-fixes", "search-marketing"]);
    expect(out.evaluation.state).toBe("options_ready");
  });

  it("is not available once a proposal was sent", async () => {
    await start();
    await svc.confirmRequiredServices(ALL);
    const draft = await svc.reviewBuyerProposal();
    await svc.approveDraft(draft.version, draft.termsHash);
    await svc.sendProposal(draft.version);
    await expect(svc.confirmRequiredServices(ALL)).rejects.toThrow(/already confirmed|cannot be confirmed/i);
  });

  it("resets with the case: a new start clears the confirmation", async () => {
    await start();
    await svc.confirmRequiredServices(ALL);
    const fresh = await start();
    expect(fresh.decisionBranch).toBeNull();
    expect((await svc.progressOf(fresh)).rule).toBe("understand.scope");
  });
});

describe("the confirmation together with clarification answers", () => {
  /** A recorded reduced-scope run whose required scope is one unmapped phrase, with its two questions answered. */
  async function startClarifying() {
    const item = demoCase("reduced-scope")!;
    const base = item.expected.extraction;
    const required = base.fields.find((f) => f.key === "required_package")!;
    const extract: ExtractionOutput = {
      ...base,
      fields: [
        ...base.fields.filter((f) => f.key !== "required_package"),
        {
          ...required,
          raw_text: "smaller website-and-search phase",
          evidence_quote: "a smaller website-and-search phase fits within the limit",
          message_id: "reduced-5",
        },
      ],
    };
    const outputs = { extract, clarify: caseAuthoredOutputs["reduced-scope"].clarify, explain: caseAuthoredOutputs["reduced-scope"].explain };
    const record = await recordedRun({ caseId: "reduced-scope", runId: "run-case-reduced-scope-0a1b2c3d", outputs, answers: item.expected.recordedAnswers });
    process.env.ADAPTIVE_DEALS_CASE_RUN_ROOT = rootWith([{ caseId: "reduced-scope", record }]);
    return svc.startCase("reduced-scope");
  }
  const reply = async (gst: "clar-gst-yes" | "clar-gst-no") => {
    let s = await svc.sendQuestions();
    for (const q of s.conversation.filter((i) => i.kind === "clarification")) await svc.buyerReply({ inReplyTo: q.id, scriptId: q.refs.questionId === "clar-gst" ? gst : "clar-approval-contract" });
    s = await svc.adoptRepliesAsAnswers();
    return s;
  };

  it("asks the questions first; answers matching the recording leave only the services to confirm", async () => {
    let s = await startClarifying();
    expect(s.run.record.kind).toBe("live");
    expect(s.status).toBe("clarifying");
    expect((await svc.progressOf(s)).rule).toBe("understand.send");
    s = await reply("clar-gst-yes");
    expect(s.status).toBe("options_ready");
    expect(s.decisionBranch).toBeNull();
    expect((await svc.progressOf(s)).rule).toBe("understand.scope");

    s = await svc.confirmRequiredServices(["website-fixes", "search-marketing"]);
    expect(s.decisionBranch).toMatchObject({ reason: "merchant_scope_confirmation", answersChanged: false });
    expect(s.decisionBranch!.answers).toEqual(s.run.record.inputs.answers);
    const out = await svc.currentOutcome(s);
    expect(out.profile.amountsIncludeGst.value).toBe("yes");
    expect(out.profile.requiredPackages.value).toEqual(["website-fixes", "search-marketing"]);
    expect((await svc.progressOf(s)).rule).toBe("offer.review");
  });

  it("keeps changed answers and the confirmation together on one branch", async () => {
    await startClarifying();
    let s = await reply("clar-gst-no");
    expect(s.decisionBranch).toMatchObject({ reason: "changed_clarification_answers", answersChanged: true, scope: null });
    expect((await svc.progressOf(s)).rule).toBe("understand.scope");

    s = await svc.confirmRequiredServices(["website-fixes", "search-marketing"]);
    expect(s.decisionBranch).toMatchObject({ reason: "changed_clarification_answers", answersChanged: true });
    expect(s.decisionBranch!.answers.map((a) => [a.questionId, a.value])).toEqual([["clar-gst", "no"], ["clar-approval", "per_contract"]]);
    expect(s.decisionBranch!.scope!.packageIds).toEqual(["website-fixes", "search-marketing"]);
    const out = await svc.currentOutcome(s);
    expect(out.profile.amountsIncludeGst.value).toBe("no");
    expect(out.profile.requiredPackages.value).toEqual(["website-fixes", "search-marketing"]);
    expect(await svc.getState()).toEqual(s);
    process.env.ADAPTIVE_DEALS_CASE_RUN_ROOT = await recordedRoot();
  });
});

describe("a recorded run is separate from the sample", () => {
  it("gates the hand-written preserve-scope sample too, because its buyer names the package without naming the services", async () => {
    process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
    try {
      const s = await svc.startCase("preserve-scope");
      expect(s.run.record.kind).toBe("synthetic_replay");
      expect((await svc.progressOf(s)).rule).toBe("understand.scope");
      const clear = await svc.startCase("no-fit");
      expect((await svc.progressOf(clear)).rule).not.toBe("understand.scope");
    } finally {
      delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
    }
  });

  it("is built from the same real extraction as the fixture", async () => {
    const record = await recordedPreserveScope();
    expect(record.steps.map((x) => [x.task, x.provider, x.outcome])).toEqual([["extract", "groq", "accepted_with_corrections"], ["explain", "groq", "rejected"]]);
  });
});
