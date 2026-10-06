import { describe, expect, it } from "vitest";
import { confirmedRestartCommand, walkthroughCommand } from "@/lib/walkthrough-actions";

describe("walkthrough mutation authority", () => {
  it("accepts only labelled system, buyer and reset controls", () => {
    expect(walkthroughCommand({ action: "demo_system_step", stepId: "pay_upfront_link" })).toEqual({ action: "demo_system_step", stepId: "pay_upfront_link" });
    expect(walkthroughCommand({ action: "buyer_reply", inReplyTo: "conv-1", scriptId: "clar-gst-yes" })).toEqual({ action: "buyer_reply", inReplyTo: "conv-1", scriptId: "clar-gst-yes" });
    expect(walkthroughCommand({ action: "buyer_reply", inReplyTo: "conv-1", text: "Another buyer reply" })).toEqual({ action: "buyer_reply", inReplyTo: "conv-1", text: "Another buyer reply" });
    expect(walkthroughCommand({ action: "reset" })).toEqual({ action: "reset" });
  });

  it("requires the dedicated confirmation helper before restart emits reset", () => {
    expect(confirmedRestartCommand(false)).toBeNull();
    expect(confirmedRestartCommand(true)).toEqual({ action: "reset" });
  });

  it.each([
    "start_case",
    "send_questions",
    "adopt_replies",
    "select_option",
    "review_buyer_proposal",
    "approve_and_send_draft",
    "accept_agreement",
    "close_by_merchant",
    "approve_amendment",
    "accept_amendment",
    "create_test_invoice",
    "confirm_required_services",
  ])("rejects merchant-owned action %s", (action) => {
    expect(() => walkthroughCommand({ action })).toThrow(/walkthrough command/i);
  });

  it("rejects incomplete or mixed buyer replies", () => {
    expect(() => walkthroughCommand({ action: "buyer_reply", inReplyTo: "conv-1" })).toThrow(/walkthrough command/i);
    expect(() => walkthroughCommand({ action: "buyer_reply", inReplyTo: "conv-1", scriptId: "one", text: "two" })).toThrow(/walkthrough command/i);
  });
});
