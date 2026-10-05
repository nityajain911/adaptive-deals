import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DealProgress } from "@/lib/progress";
import type { DemoState } from "@/lib/service";
import { walkthroughCapabilities, walkthroughView } from "@/lib/walkthrough";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-walkthrough-"));
delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
delete process.env.GROQ_API_KEY;

type Svc = typeof import("@/lib/service");
let svc: Svc;
let fresh: DemoState;

beforeAll(async () => {
  svc = await import("@/lib/service");
  fresh = await svc.resetToSeed();
});

const stages = (stage: DealProgress["stage"]): DealProgress["stages"] => ({
  understand: stage === "understand" ? "current" : "done",
  offer: stage === "offer" ? "current" : stage === "understand" ? "upcoming" : "done",
  track: stage === "track" ? "current" : "upcoming",
});

function progress(rule: string, stage: DealProgress["stage"], actor: DealProgress["actor"], kind: DealProgress["kind"] = "action_required"): DealProgress {
  return {
    rule,
    stage,
    stages: stages(stage),
    actor,
    kind,
    headline: rule,
    primaryAction: kind === "action_required" ? { id: "inspect_records", label: "Continue" } : null,
    blockingReason: null,
    version: stage === "track" ? 1 : null,
  };
}

function started(state: DemoState = fresh): DemoState {
  return {
    ...structuredClone(state),
    events: [
      ...state.events,
      {
        id: "evt-case-started",
        at: "2026-10-01T09:00:00+05:30",
        kind: "case_started",
        title: "Case started",
        detail: state.caseId,
        provenance: "merchant",
      },
    ],
  };
}

const resolve = (state: DemoState, p: DealProgress) => walkthroughView({ state, progress: p, dealId: "hero", capabilities: walkthroughCapabilities() });

describe("walkthrough state comes from the deal", () => {
  it("starts a freshly seeded workspace at case selection", async () => {
    const p = await svc.progressOf(fresh);
    const view = resolve(fresh, p);
    expect(view.currentObjectiveId).toBe("choose_case");
    expect(view.currentAction).toMatchObject({ actor: "merchant", href: "/deals" });
    expect(view.stepLabel).toBe("Step 1 of 4");
  });

  it("moves a deliberately started case to understanding the buyer", async () => {
    const p = await svc.progressOf(fresh);
    const view = resolve(started(), p);
    expect(view.currentObjectiveId).toBe("understand_buyer");
    expect(view.currentAction).toMatchObject({ actor: "merchant", id: "send_questions" });
  });

  it.each([
    ["understand.waiting", "understand", "buyer", "understand_buyer", "buyer"],
    ["offer.review", "offer", "merchant", "review_decision", "merchant"],
    ["track.sent_awaiting_buyer", "track", "buyer", "confirm_terms", "buyer"],
    ["track.buyer_setup", "track", "buyer", "setup_collection", "system"],
  ] as const)("maps %s to its learning objective and action actor", (rule, stage, progressActor, objective, actionActor) => {
    const view = resolve(started(), progress(rule, stage, progressActor, progressActor === "merchant" ? "action_required" : "waiting_on_buyer"));
    expect(view.currentObjectiveId).toBe(objective);
    expect(view.currentAction?.actor).toBe(actionActor);
  });

  it("keeps preventive depth out of the core step count", () => {
    const view = resolve(started(), progress("track.next_payment", "track", null, "informational"));
    expect(view.currentObjectiveId).toBe("preventive_restructure");
    expect(view.objectives.filter((x) => x.optional).map((x) => x.id)).toEqual(["setup_collection", "preventive_restructure"]);
    expect(view.stepLabel).toBe("Explore another product capability");
  });
});

describe("capability and outcome honesty", () => {
  it.each([
    ["offer.no_feasible", "offer", "merchant", "No offer fits"],
    ["offer.outside_templates", "offer", "merchant", "custom arrangement"],
    ["offer.closed", "offer", null, "Closed"],
    ["track.terminal", "track", null, "Buyer declined"],
  ] as const)("ends %s without promising an invoice", (rule, stage, actor, phrase) => {
    const state = started();
    if (rule === "offer.closed") state.status = "merchant_rejected";
    if (rule === "track.terminal") state.status = "buyer_rejected";
    const view = resolve(state, progress(rule, stage, actor, actor ? "action_required" : "terminal"));
    expect(view.terminalOutcome).toContain(phrase);
    expect(JSON.stringify(view)).not.toMatch(/invoice/i);
  });

  it("ships only capabilities that exist and omits their future steps from the count", async () => {
    expect([...walkthroughCapabilities()]).toEqual(["case_picker", "current_offer", "preventive_depth"]);
    const view = resolve(started(), await svc.progressOf(fresh));
    expect(view.objectives.map((x) => x.capability)).not.toEqual(expect.arrayContaining(["live_customisation", "negotiation", "test_invoice"]));
    expect(view.stepLabel).toBe("Step 2 of 4");
  });

  it("contains no copied commercial output", async () => {
    const view = resolve(started(), await svc.progressOf(fresh));
    expect(JSON.stringify(view.objectives)).not.toMatch(/₹|contribution|invoice_[A-Za-z0-9]|model confidence/i);
  });
});

describe("run provenance", () => {
  it("preserves live, replayed-live and synthetic run origins", async () => {
    const p = await svc.progressOf(fresh);
    const live = started();
    live.run.record.kind = "live";
    live.run.viewing = "fresh";
    expect(resolve(live, p).provenance).toBe("live_groq");

    live.run.viewing = "replay";
    expect(resolve(live, p).provenance).toBe("live_groq_replay");

    const synthetic = started();
    synthetic.run.record.kind = "synthetic_replay";
    synthetic.run.viewing = "replay";
    expect(resolve(synthetic, p).provenance).toBe("synthetic_replay");
  });
});
