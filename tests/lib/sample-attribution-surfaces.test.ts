import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { RunRecord } from "@/ai/run-record";
import { CASE_IDS } from "@/data/synthetic/cases";
import type { DemoState } from "@/lib/service";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-attribution-"));
// Force the hand-written fallback even when a recorded run is mapped to the case.
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
delete process.env.GROQ_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

type Svc = typeof import("@/lib/service");
let svc: Svc;

beforeAll(async () => {
  svc = await import("@/lib/service");
});

/**
 * Phrases that mention AI without crediting it: the audit row stating that no model ran, and
 * the fixed statements that payment-date replies are read by code.
 */
const NON_CREDITING = [/<dt[^>]*>AI<\/dt><dd>No model ran for this case\.<\/dd>/g, /Read by code \(reply-rules\.v1\), not AI/g, /Read by code, not AI/g];
const creditsModel = (text: string) => /\bAI\b|Groq|Anthropic|model run\b/.test(NON_CREDITING.reduce((rest, allowed) => rest.replace(allowed, ""), text));

/** Every merchant-visible surface that carries model attribution, rendered from one state. */
async function surfaces(s: DemoState): Promise<Record<string, string>> {
  const out = await svc.currentOutcome(s);
  const progress = await svc.progressOf(s);
  const { ConversationThread } = await import("@/components/conversation-thread");
  const { AuditSections } = await import("@/components/audit/sections");
  const { Recommendation } = await import("@/components/offer/recommendation");
  const { WalkthroughProgress } = await import("@/components/walkthrough/walkthrough-progress");
  const { walkthroughCapabilities, walkthroughView } = await import("@/lib/walkthrough");
  const { questionWordingLabel, taskOrRunProvenance } = await import("@/lib/model-provenance");
  const provenance = taskOrRunProvenance(s.run.record, "clarify", s.run.viewing);
  const view = walkthroughView({ state: s, progress, dealId: "hero", capabilities: walkthroughCapabilities() });
  const noop = () => undefined;
  const top = out.evaluation.result?.structures.find((x) => x.structure.id === out.explanation?.order[0]);
  const rendered: Record<string, string> = {
    "question badges": s.run.record.displayed.questions.map((q) => questionWordingLabel(q.wording, provenance)).join(" | "),
    "understand thread": renderToStaticMarkup(ConversationThread({ s, scope: "understand", buyerName: "Buyer", opening: s.run.record.inputs.messages })),
    "track thread": renderToStaticMarkup(ConversationThread({ s, scope: "track", buyerName: "Buyer" })),
    "audit drawer": renderToStaticMarkup(AuditSections({ s, out })),
    "walkthrough data": JSON.stringify(view),
  };
  for (const objective of view.objectives) {
    rendered[`walkthrough · ${objective.id}`] = renderToStaticMarkup(
      createElement(WalkthroughProgress, { view: { ...view, currentAction: null }, displayedObjectiveId: objective.id, primaryLabel: null, primaryDisabled: false, onPrimary: noop, onBack: noop, onNext: noop, onHide: noop, onRestart: noop }),
    );
  }
  if (top) {
    rendered["offer card"] = renderToStaticMarkup(
      Recommendation({ x: top, exp: out.explanation, policy: s.run.record.inputs.policy, context: "Context", primary: null, presentation: "recommended", provenance: taskOrRunProvenance(s.run.record, "explain", s.run.viewing), decisionBranch: s.decisionBranch }),
    );
  }
  return rendered;
}

describe("hand-written sample cases never appear as model output", () => {
  for (const caseId of CASE_IDS) {
    it(`${caseId}: no surface credits AI or a provider, from first load to the furthest state`, async () => {
      const { driveTo } = await import("../helpers/drive");
      const seeded = await svc.startCase(caseId);
      expect(seeded.run.record.kind).toBe("synthetic_replay");
      const furthest = await driveTo(svc, (x) => x.amendments.at(-1)?.state === "active", 30).catch(() => svc.getState());
      // The offer card must be part of the check wherever the case reaches an offer.
      if (caseId !== "no-fit") expect(Object.keys(await surfaces(furthest))).toContain("offer card");
      for (const state of [seeded, furthest]) {
        const rendered = await surfaces(state);
        for (const [name, text] of Object.entries(rendered)) expect(creditsModel(text), `${caseId} · ${name}`).toBe(false);
        expect(rendered["audit drawer"]).toContain("Sample output written by hand · no model ran");
        expect(rendered["audit drawer"]).toContain("No model ran for this case.");
        expect(rendered["walkthrough · understand_buyer"]).toContain("sample output written by hand; no model ran");
        expect(rendered["walkthrough · understand_buyer"]).toContain("Sample analysis · written by hand");
      }
    });
  }

  it("keeps crediting the model on a recorded Groq run, so the check above is not vacuous", async () => {
    const recorded = JSON.parse(readFileSync("data/live-runs/run-live-3f518779.json", "utf8")) as RunRecord;
    const rendered = await surfaces(await svc.seedState(recorded, "replay"));
    expect(rendered["question badges"]).toContain("Suggested by AI");
    expect(rendered["understand thread"]).toContain("Suggested by AI");
    expect(rendered["audit drawer"]).toContain("AI · Recorded Groq output");
    expect(rendered["audit drawer"]).toContain(`Recorded Groq output · run ${recorded.runId} · extract.v2`);
    expect(rendered["audit drawer"]).not.toContain("Sample output written by hand");
    expect(rendered["walkthrough · understand_buyer"]).toContain("Groq structures the conversation");
    expect(rendered["walkthrough · understand_buyer"]).toContain("AI analysis");
  });
});

describe("wording that could imply AI on a sample", () => {
  it("names the presenter pause control neutrally", () => {
    const page = readFileSync("app/presenter/page.tsx", "utf8");
    expect(page).toContain("Pause suggested question drafts");
    expect(page).not.toMatch(/Pause AI suggestions|AI-worded/);
  });

  it("records pausing without crediting AI", async () => {
    await svc.startCase("reduced-scope");
    const paused = await svc.setSuggestionsPaused(true);
    const event = paused.events.at(-1)!;
    expect(event.title).toBe("Suggested replies paused");
    expect(`${event.title} ${event.detail}`).not.toMatch(/\bAI\b/);
    await svc.setSuggestionsPaused(false);
  });

  it("never turns the stored draft author field into visible attribution", async () => {
    const seeded = await svc.startCase("reduced-scope");
    // The stored field marks model-task wording; on a sample it still reads "ai" internally.
    expect(seeded.conversation.filter((item) => item.author === "ai").length).toBeGreaterThan(0);
    const sent = await svc.sendQuestions();
    expect(sent.conversation.filter((item) => item.author === "ai" && item.state === "approved_and_sent_by_merchant").length).toBeGreaterThan(0);
    for (const state of [seeded, sent]) {
      for (const [name, text] of Object.entries(await surfaces(state))) expect(creditsModel(text), name).toBe(false);
    }
  });
});

