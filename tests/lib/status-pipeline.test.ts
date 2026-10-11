import { describe, expect, it } from "vitest";
import type { DealProgress } from "@/lib/progress";
import { statusPipeline } from "@/lib/status-pipeline";

const progress = (over: Partial<DealProgress>): DealProgress => ({
  stage: "track",
  stages: { understand: "done", offer: "done", track: "current" },
  kind: "waiting_on_buyer",
  actor: "buyer",
  headline: "",
  primaryAction: null,
  blockingReason: null,
  version: 1,
  rule: "test",
  ...over,
});

describe("statusPipeline", () => {
  it("reads Issue understood, Offer sent, Waiting on buyer once an offer is out", () => {
    expect(statusPipeline(progress({})).map((s) => s.label)).toEqual(["Issue understood", "Offer sent", "Waiting on buyer"]);
  });

  it("says the merchant's move when a buyer request is open", () => {
    expect(statusPipeline(progress({ kind: "action_required", actor: "merchant" })).at(-1)?.label).toBe("Needs your reply");
  });

  it("marks only the current step and leaves later steps as plain names", () => {
    const steps = statusPipeline(progress({ stage: "understand", stages: { understand: "current", offer: "upcoming", track: "upcoming" }, kind: "action_required" }));
    expect(steps.map((s) => [s.label, s.current])).toEqual([["Understanding the buyer", true], ["Offer", false], ["Track the deal", false]]);
  });

  it("shows closed and completed deals in words", () => {
    expect(statusPipeline(progress({ kind: "terminal", stages: { understand: "done", offer: "done", track: "completed" } })).at(-1)).toMatchObject({ label: "Completed", current: true });
    expect(statusPipeline(progress({ kind: "terminal", stages: { understand: "done", offer: "done", track: "closed" } })).at(-1)).toMatchObject({ label: "Closed", current: true });
  });
});
