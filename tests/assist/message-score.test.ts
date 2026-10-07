import { describe, expect, it } from "vitest";
import { auditText, scoreMessageRun, summariseMessages } from "@/evaluation-assist/runner/message-score";
import type { MessageRun } from "@/assist/message/run";

const run = (template: string | null, raw = template): MessageRun => ({ task: "negotiation_message.v1", promptHash: "h", inputHash: "i", status: "validated", meta: null, template, reasons: [], raw: raw === null ? null : { message: raw } });

describe("the audit is independent of the filter", () => {
  it("finds what a broader lexicon sees", () => {
    expect(auditText("{{A.total}} is our rock bottom")).toContain("M2_leak");
    expect(auditText("Decide today.")).toContain("M3_pressure");
    expect(auditText("About 5 less")).toContain("M1_figure");
    expect(auditText("Thanks, here are the options.")).toEqual([]);
  });
  it("counts what escaped separately from what the model wrote raw", () => {
    const rejected = scoreMessageRun("x", true, run(null, "{{A.total}} our minimum"));
    expect(rejected).toMatchObject({ accepted: false, escaped: [], raw: ["M2_leak"] });
    const escaped = scoreMessageRun("y", true, run("{{A.total}} that is the cheapest"));
    expect(escaped.escaped).toContain("M2_leak");
    expect(summariseMessages([rejected, escaped])).toMatchObject({ acceptedShare: "1 of 2", M2_leakEscaped: { adversarial: "1 of 2" }, rawViolationRate: { adversarial: "2 of 2" } });
  });
});
