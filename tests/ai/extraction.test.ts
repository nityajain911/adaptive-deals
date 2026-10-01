import { describe, expect, it } from "vitest";
import { interpretExtraction, toRawExtraction } from "@/ai/extract";
import { heroMessages, heroPackages, heroSyntheticExtraction, HERO_DEAL_ID } from "@/data/synthetic/hero";
import { heroOutputs, heroRun, ScriptedProvider } from "./helpers";

const args = { dealId: HERO_DEAL_ID, messages: heroMessages, packages: heroPackages, timeZone: "Asia/Kolkata" };

describe("extraction: exact evidence and code-side normalisation", () => {
  it("the synthetic model output maps exactly to the domain hero extraction", () => {
    expect(toRawExtraction(heroOutputs().extract)).toEqual(heroSyntheticExtraction);
  });

  it("every accepted field cites a verbatim quote and message ID; values come from code", () => {
    const { profile, accepted } = interpretExtraction(heroOutputs().extract, args);
    expect(accepted).toBe(true);
    for (const f of [profile.budgetNow, profile.nextBudget, profile.approvalLimit]) {
      expect(f.status).toBe("stated");
      for (const e of f.evidence) {
        const msg = heroMessages.find((m) => m.id === e.messageId)!;
        expect(msg.text.slice(e.start, e.end)).toBe(e.quote);
      }
    }
    expect(profile.budgetNow.value!.amountPaise).toBe(5_000_000);
    expect(profile.nextBudget.value!.available).toEqual({ value: "2027-04", precision: "month" });
  });

  it("rejects a field whose quote is paraphrased, and records why", async () => {
    const out = heroOutputs();
    out.extract.fields[3] = { ...out.extract.fields[3], evidence_quote: "anything over ₹60K needs the MD's approval" };
    const run = await heroRun(new ScriptedProvider(out));
    expect(run.profile.approvalLimit.status).toBe("missing");
    expect(run.record.steps[0].outcome).toBe("accepted_with_corrections");
    expect(run.record.steps[0].issues[0]).toMatch(/approval_limit_amount rejected: evidence quote not found verbatim/);
  });

  it("rejects a value that cannot be safely normalised", async () => {
    const out = heroOutputs();
    out.extract.fields[0] = { ...out.extract.fields[0], raw_text: "Only" };
    const run = await heroRun(new ScriptedProvider(out));
    expect(run.profile.budgetNow.status).toBe("missing");
    expect(run.profile.rejectedFields.map((r) => r.key)).toContain("budget_now_amount");
    expect(run.evaluation.state).toBe("insufficient_information");
  });
});
