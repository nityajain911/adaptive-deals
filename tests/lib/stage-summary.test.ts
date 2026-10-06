import { beforeAll, describe, expect, it } from "vitest";
import { interpretExtraction } from "@/ai/extract";
import { readFileSync } from "node:fs";
import { demoCase } from "@/data/synthetic/cases";
import type { ConstraintProfile } from "@/domain/types";
import { understandSummary } from "@/lib/stage-summary";
import { applyScopeConfirmation, confirmScope, unmappedRequiredServices } from "@/lib/scope-confirmation";

const deal = demoCase("preserve-scope")!.deal;
const rawOutput = (JSON.parse(readFileSync("tests/fixtures/preserve-scope-extract.json", "utf8")) as { rawOutput: unknown }).rawOutput;
const names = Object.fromEntries(deal.packages.map((p) => [p.id, p.name]));
let profile: ConstraintProfile;
beforeAll(() => {
  profile = interpretExtraction(rawOutput, { dealId: deal.dealId, messages: deal.messages, packages: deal.packages, timeZone: deal.merchant.timeZone }).profile;
});

describe("the Understand summary is written by code from confirmed facts only", () => {
  it("states the budget and approval limit, and leaves out a GST basis the recording did not capture", () => {
    const line = understandSummary(profile, names);
    expect(line).toBe("Budget ₹10,000 now · approval limit ₹15,000 per payment");
  });

  it("leaves out an approval scope that is not stated, and states a GST basis that is", () => {
    const unstated = { ...profile, approvalScope: { ...profile.approvalScope, status: "missing" as const } };
    expect(understandSummary(unstated, names)).toBe("Budget ₹10,000 now · approval limit ₹15,000");
    const gst = { ...unstated, amountsIncludeGst: { ...unstated.amountsIncludeGst, status: "stated" as const, value: "no" as const } };
    expect(understandSummary(gst, names)).toBe("Budget ₹10,000 now excluding GST · approval limit ₹15,000 excluding GST");
  });

  it("leaves out required services until the merchant has confirmed them", () => {
    expect(understandSummary(profile, names)).not.toMatch(/Needs/);
    const src = unmappedRequiredServices(profile, { rawOutput, inputHash: "h" } as never, deal.messages);
    const c = confirmScope({ sources: src, packageIds: ["website-fixes", "search-marketing"], packages: deal.packages, confirmedAt: "2026-10-06T10:00:00+05:30", by: "m" });
    expect(understandSummary(applyScopeConfirmation(profile, c, deal.messages, deal.packages), names)).toMatch(/Needs Website fixes and Search marketing/);
  });
});
