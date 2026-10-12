import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DealProgress } from "@/lib/progress";
import type { RunRecord } from "@/ai/run-record";
import type { DemoState } from "@/lib/service";
import { walkthroughCapabilities, walkthroughView } from "@/lib/walkthrough";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-walkthrough-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic"; // pinned to the labelled hand-written sample: this suite asserts that run
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
    expect(view.stepLabel).toBe("Step 2 of 6"); // economics is now step 1 of the core journey
    expect(view.completedObjectiveIds).toContain("business_economics");
  });

  it("opens on the business economics step when the guide is shown on that page, before any case", async () => {
    const p = await svc.progressOf(fresh);
    const view = walkthroughView({ state: fresh, progress: p, dealId: "hero", capabilities: walkthroughCapabilities(), route: "economics" });
    expect(view.currentObjectiveId).toBe("business_economics");
    expect(view.stepLabel).toBe("Step 1 of 6");
    expect(view.currentAction).toMatchObject({ actor: "merchant", href: "/economics", systemAction: null, productLabel: "Review changes" });
    expect(view.provenance).toBe("merchant");
    // Once a case has started, the same page no longer claims the economics step.
    expect(walkthroughView({ state: started(), progress: p, dealId: "hero", capabilities: walkthroughCapabilities(), route: "economics" }).currentObjectiveId).not.toBe("business_economics");
  });

  it("moves a deliberately started case to understanding the buyer", async () => {
    const p = await svc.progressOf(fresh);
    const view = resolve(started(), p);
    expect(view.currentObjectiveId).toBe("understand_buyer");
    expect(view.currentAction).toMatchObject({ actor: "merchant", id: "send_questions" });
  });

  it.each([
    ["understand.waiting", "understand", "buyer", "understand_buyer", "buyer"],
    ["understand.scope", "understand", "merchant", "understand_buyer", "merchant"],
    ["offer.review", "offer", "merchant", "review_decision", "merchant"],
    ["track.sent_awaiting_buyer", "track", "buyer", "confirm_terms", "buyer"],
    ["track.buyer_setup", "track", "buyer", "confirm_terms", "buyer"],
  ] as const)("maps %s to its learning objective and action actor", (rule, stage, progressActor, objective, actionActor) => {
    const view = resolve(started(), progress(rule, stage, progressActor, progressActor === "merchant" ? "action_required" : "waiting_on_buyer"));
    expect(view.currentObjectiveId).toBe(objective);
    expect(view.currentAction?.actor).toBe(actionActor);
  });

  it("offers the negotiation step only for a buyer's price request, and never as a core step", () => {
    const state = started();
    state.conversation.push({ id: "msg-price", kind: "change_request", from: "buyer", text: "Lower?", at: "2026-10-01T10:00:00+05:30", refs: { topic: "price" } } as unknown as DemoState["conversation"][number]);
    const view = resolve(state, progress("track.buyer_request", "track", "merchant", "action_required"));
    expect(view.currentObjectiveId).toBe("negotiate_price");
    expect(view.stepLabel).toBe("Optional exploration");
    expect(JSON.stringify(view.objectives.find((x) => x.id === "negotiate_price"))).toMatch(/never saves your prices or sends an offer/);
    // A change request about anything else keeps its previous mapping.
    expect(resolve(started(), progress("track.buyer_request", "track", "merchant", "action_required")).currentObjectiveId).not.toBe("negotiate_price");
  });

  it("keeps only optional explorations outside the six-step core", () => {
    const view = resolve(started(), progress("track.next_payment", "track", null, "informational"));
    expect(view.currentObjectiveId).toBe("preventive_restructure");
    expect(view.objectives.filter((x) => x.optional).map((x) => x.id)).toEqual(["no_fit", "negotiate_price"]);
    expect(view.stepLabel).toBe("Step 6 of 6");
  });

  it("keeps migration review at the last stage supported by the records", () => {
    const understand = resolve(started(), progress("review.required", "understand", "merchant"));
    expect(understand.currentObjectiveId).toBe("understand_buyer");
    expect(understand.currentAction).toMatchObject({ id: "inspect_records", href: "/deals/hero/understand" });

    const offer = resolve(started(), progress("review.required", "offer", "merchant"));
    expect(offer.currentObjectiveId).toBe("review_decision");
    expect(offer.currentAction).toMatchObject({ id: "inspect_records", href: "/deals/hero/offer" });
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
    // Negotiation (the corridor) and business economics now exist; the other future capabilities do not.
    expect([...walkthroughCapabilities()]).toEqual(["business_economics", "case_picker", "current_offer", "preventive_depth", "negotiation"]);
    const view = resolve(started(), await svc.progressOf(fresh));
    expect(view.objectives.map((x) => x.capability)).not.toEqual(expect.arrayContaining(["live_customisation", "test_invoice"]));
    expect(view.stepLabel).toBe("Step 3 of 6");
  });

  it("contains no copied commercial output", async () => {
    const view = resolve(started(), await svc.progressOf(fresh));
    expect(JSON.stringify(view.objectives)).not.toMatch(/₹|contribution|invoice_[A-Za-z0-9]|model confidence/i);
  });
});

describe("run provenance", () => {
  const recordedRun = () => JSON.parse(readFileSync("data/live-runs/run-live-3f518779.json", "utf8")) as RunRecord;

  it("describes a hand-written sample as a sample and never as AI", async () => {
    const p = await svc.progressOf(fresh);
    const view = resolve(started(), p);
    expect(view.provenance).toBe("synthetic_replay");
    expect(view.provenanceLabel).toBe("Sample output written by hand · no model ran");
    expect(view.objectives.find((item) => item.id === "understand_buyer")).toMatchObject({ actor: "sample", notice: "The buyer's details in this case were written by hand; no AI ran. The app keeps what is unclear and shows where each fact came from." });
    expect(view.objectives.find((item) => item.id === "review_decision")!.notice).toBe("You choose what matters most; the app picks the offers and works out every figure. This case's sample ranking was written by hand (no AI ran) and is kept only as history.");
    expect(JSON.stringify(view)).not.toMatch(/Groq|(?<!no )\bAI\b/);
  });

  it("names the provider for a recorded run and for a fresh live run", async () => {
    const live = started(await svc.seedState(recordedRun(), "replay"));
    const p = await svc.progressOf(live);
    const replayed = resolve(live, p);
    expect(replayed.provenance).toBe("recorded_model");
    expect(replayed.provenanceLabel).toBe("Recorded Groq output");
    expect(replayed.objectives.find((item) => item.id === "understand_buyer")).toMatchObject({ actor: "ai", notice: "Groq read the buyer's messages. The app keeps what is unclear and shows where each fact came from." });
    expect(replayed.objectives.find((item) => item.id === "review_decision")!.notice).toBe("You choose what matters most; the app picks the offers and works out every figure. A saved AI ranking is kept only as history.");

    live.run.viewing = "fresh";
    expect(resolve(live, p)).toMatchObject({ provenance: "live_model", provenanceLabel: "Live Groq output" });
  });

  it("uses neutral walkthrough provenance while naming a fresh Cerebras run", async () => {
    const record = recordedRun();
    record.provider = "cerebras";
    record.model = "gpt-oss-120b";
    record.steps = record.steps.map((step) => ({ ...step, provider: "cerebras", model: "gpt-oss-120b" }));
    const live = started(await svc.seedState(record, "fresh"));
    const view = resolve(live, await svc.progressOf(live));
    expect(view).toMatchObject({ provenance: "live_model", provenanceLabel: "Live Cerebras output" });
    expect(view.objectives.find((item) => item.id === "understand_buyer")).toMatchObject({ actor: "ai", notice: expect.stringContaining("Cerebras read the buyer's messages") });
  });

  it("attributes each walkthrough step to its own stored step on a mixed run", async () => {
    const live = started(await svc.seedState(recordedRun(), "replay"));
    // Test-only: add a hand-written explanation step to an otherwise recorded Groq run.
    live.run.record.steps = [...live.run.record.steps, { ...live.run.record.steps[0], task: "explain", provider: "synthetic_replay" }];
    const view = resolve(live, await svc.progressOf(await svc.seedState(recordedRun(), "replay")));
    expect(view.objectives.find((item) => item.id === "understand_buyer")).toMatchObject({ actor: "ai", notice: "Groq read the buyer's messages. The app keeps what is unclear and shows where each fact came from." });
    expect(view.objectives.find((item) => item.id === "review_decision")!.notice).toBe("You choose what matters most; the app picks the offers and works out every figure. This case's sample ranking was written by hand (no AI ran) and is kept only as history.");
  });

  it("does not credit a model when a record marked live carries hand-written steps", async () => {
    const mislabelled = started();
    mislabelled.run.record.kind = "live";
    const view = resolve(mislabelled, await svc.progressOf(fresh));
    expect(view.provenance).toBe("synthetic_replay");
    expect(JSON.stringify(view)).not.toMatch(/Groq|(?<!no )\bAI\b/);
  });

  it("says a merchant confirmation recalculated the decision, and credits no model for the order", async () => {
    const branched = started();
    branched.decisionBranch = { schema: "adaptive-deals.decision-branch.v1", branchId: "branch-1", parentRunId: branched.run.record.runId, createdAt: "2026-10-01T09:30:00+05:30", answers: [], reason: "merchant_scope_confirmation", answersChanged: false, scope: { kind: "required_services", packageIds: ["website-fixes"], confirmedAt: "2026-10-01T09:30:00+05:30", by: "Merchant", sources: [{ rawText: "x", evidenceQuote: "x", messageId: "m1", extractInputHash: "h" }] }, explanationSource: "code_fallback" };
    const view = resolve(branched, await svc.progressOf(fresh));
    expect(view.objectives.find((item) => item.id === "review_decision")!.notice).toBe("The app worked this out again after the merchant confirmed the services.");
  });

  it("credits code, not the parent run, on a changed-answer branch", async () => {
    const branched = started();
    branched.decisionBranch = { schema: "adaptive-deals.decision-branch.v1", branchId: "branch-1", parentRunId: branched.run.record.runId, createdAt: "2026-10-01T09:30:00+05:30", answers: [], reason: "changed_clarification_answers", explanationSource: "code_fallback" };
    const view = resolve(branched, await svc.progressOf(fresh));
    expect(view.objectives.find((item) => item.id === "review_decision")!.notice).toBe("The app worked this out again after the buyer's answer.");
  });
});

const recordedRun = () => JSON.parse(readFileSync("data/live-runs/run-live-3f518779.json", "utf8")) as RunRecord;

describe("the real button the person must click", () => {
  it("names the product's own button for merchant steps, taken from the progress derivation", () => {
    const p = { ...progress("understand.send", "understand", "merchant", "action_required"), primaryAction: { id: "send_questions" as const, label: "Send 2 questions to buyer" } };
    expect(resolve(started(), p).currentAction).toMatchObject({ id: "send_questions", type: "merchant", productLabel: "Send 2 questions to buyer" });
  });

  it("names the buyer's button when the person plays the buyer, and no button for simulated events", () => {
    expect(resolve(started(), progress("track.sent_awaiting_buyer", "track", "buyer", "waiting_on_buyer")).currentAction).toMatchObject({ type: "buyer", productLabel: "Accept and pay" });
    expect(resolve(started(), progress("understand.waiting", "understand", "buyer", "waiting_on_buyer")).currentAction).toMatchObject({ usesReplyControl: true, productLabel: null });
  });

  it("points at approve-and-send, not the earlier review button, once the draft exists", async () => {
    const s = started();
    s.selectedOption = { structureId: "x", fingerprint: "f", selectedAt: "t", draftVersion: 1, evidenceMessageIds: [], explicit: false };
    s.agreements = [{ version: 1, status: "draft" }] as never;
    const view = resolve(s, { ...progress("offer.review", "offer", "merchant", "action_required"), primaryAction: { id: "review_buyer_proposal" as const, label: "Review buyer proposal" } });
    expect(view.currentAction).toMatchObject({ id: "approve_and_send_draft", productLabel: "Send offer", href: "/deals/hero/offer/preview" });
  });
});

describe("sub-steps inside one stage", () => {
  const items = (view: ReturnType<typeof resolve>) => view.subSteps?.map((x) => `${x.state}:${x.label}`);
  it("shows the two Understand actions and where the person is", () => {
    expect(items(resolve(started(), progress("understand.send", "understand", "merchant")))).toEqual(["current:Send the questions", "todo:Buyer answers"]);
    expect(items(resolve(started(), progress("understand.waiting", "understand", "buyer", "waiting_on_buyer")))).toEqual(["done:Send the questions", "current:Buyer answers"]);
    expect(items(resolve(started(), progress("understand.use_answers", "understand", "merchant")))).toEqual(["done:Send the questions", "done:Buyer answers"]);
  });
  it("shows choose then preview for the offer, switching when a draft exists", () => {
    expect(items(resolve(started(), progress("offer.review", "offer", "merchant")))).toEqual(["current:Choose the offer", "todo:Preview and send"]);
    const s = started();
    s.selectedOption = { structureId: "x", fingerprint: "f", selectedAt: "t", draftVersion: 1, evidenceMessageIds: [], explicit: false };
    s.agreements = [{ version: 1, status: "draft" }] as never;
    expect(items(resolve(s, progress("offer.review", "offer", "merchant")))).toEqual(["done:Choose the offer", "current:Preview and send"]);
  });
  it("has none where a stage is one action", () => {
    expect(resolve(started(), progress("understand.scope", "understand", "merchant")).subSteps).toBeNull();
    expect(resolve(started(), progress("track.sent_awaiting_buyer", "track", "buyer", "waiting_on_buyer")).subSteps).toBeNull();
  });
});

describe("how the walkthrough ends", () => {
  it("is not finished while there is something to do", () => {
    expect(resolve(started(), progress("understand.send", "understand", "merchant")).finish).toBeNull();
    expect(resolve(started(), progress("offer.no_feasible", "offer", "merchant")).finish).toBeNull();
  });
  it("ends honestly when the buyer declined, with what the merchant did and no amounts", () => {
    const s = started();
    s.status = "buyer_rejected";
    s.agreements = [{ version: 1, status: "buyer_rejected", merchantApproval: { by: "m", at: "t" } }] as never;
    const view = resolve(s, progress("track.terminal", "track", null, "terminal"));
    expect(view.finish).toMatchObject({ title: "Walkthrough ended" });
    expect(view.finish!.lines).toContain("Buyer declined the offer.");
    expect(view.finish!.lines.join(" ")).toContain("approved version 1");
    expect(view.finish!.lines.join(" ")).not.toMatch(/₹/);
  });
  it("completes after a preventive restructuring that both sides approved", () => {
    const s = started();
    s.amendments = [{ state: "active", toVersion: 2 }] as never;
    s.agreements = [{ version: 1, merchantApproval: { by: "m", at: "t" } }, { version: 2, merchantApproval: { by: "m", at: "t" } }] as never;
    const view = resolve(s, progress("track.next_payment", "track", null, "informational"));
    expect(view.finish!.title).toBe("Walkthrough complete");
    expect(view.finish!.lines.join(" ")).toMatch(/approved version 1, approved version 2/);
    expect(view.finish!.lines).toContain("A payment was moved to a later date after both sides approved version 2.");
  });
  it("credits the right source for what was understood", async () => {
    const recorded = started(await svc.seedState(recordedRun(), "replay"));
    recorded.amendments = [{ state: "active", toVersion: 2 }] as never;
    expect(resolve(recorded, progress("track.next_payment", "track", null, "informational")).finish!.lines).toContain("Buyer constraints came from: Recorded Groq output.");
    const sample = started();
    sample.amendments = [{ state: "active", toVersion: 2 }] as never;
    expect(resolve(sample, progress("track.next_payment", "track", null, "informational")).finish!.lines).toContain("Buyer constraints came from: Sample output written by hand · no model ran.");
  });
});

describe("the pitch copy", () => {
  it("gives every step a pitch, a line to watch and how it is built, without claims the product cannot back", async () => {
    const source = (await import("node:fs")).readFileSync("lib/walkthrough.ts", "utf8");
    const ids = [...source.matchAll(/^\s{4}id: "([a-z_]+)",\n\s{4}actor/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    for (const id of ids) {
      const block = source.slice(source.indexOf(`id: "${id}",`), source.indexOf("capability:", source.indexOf(`id: "${id}",`)));
      expect(block, id).toContain("pitch:");
      expect(block, id).toContain("watch:");
      expect(block, id).toContain("architecture:");
    }
    expect(source).not.toMatch(/Pinecone vector|zero-risk|without human intervention|AI negotiat/i);
  });
});
