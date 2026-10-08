import { beforeAll, describe, expect, it } from "vitest";
import { interpretExtraction } from "@/ai/extract";
import type { RunStep } from "@/ai/run-record";
import { demoCase } from "@/data/synthetic/cases";
import { evaluateDeal } from "@/domain/engine";
import type { ConstraintProfile } from "@/domain/types";
import { applyScopeConfirmation, confirmScope, ScopeError, unmappedRequiredServices } from "@/lib/scope-confirmation";

/** The preserve-scope extraction, written to mimic the real Groq one: its required scope is "complete annual package". */
const deal = demoCase("preserve-scope")!.deal;
const rawOutput: unknown = demoCase("preserve-scope")!.expected.extraction;
const step = { rawOutput, inputHash: "abc123" } as Pick<RunStep, "rawOutput" | "inputHash">;
const ALL = deal.packages.map((p) => p.id);
const when = "2026-10-06T10:00:00+05:30";

let profile: ConstraintProfile;
beforeAll(() => {
  profile = interpretExtraction(rawOutput, { dealId: deal.dealId, messages: deal.messages, packages: deal.packages, timeZone: deal.merchant.timeZone }).profile;
});

describe("an unmapped required-services phrase", () => {
  it("is rejected by code because it names no package, and leaves required scope empty", () => {
    expect(profile.requiredPackages.status).toBe("missing");
    expect(profile.rejectedFields).toEqual([{ key: "required_package", reason: "does not match a deal package", rawText: "complete annual package" }]);
  });

  it("is linked to its own extraction: the phrase, the verbatim quote, the message and the extract step", () => {
    const sources = unmappedRequiredServices(profile, step, deal.messages);
    expect(sources).toEqual([
      {
        rawText: "complete annual package",
        evidenceQuote: "We need the complete annual package for the admissions launch",
        messageId: "preserve-2",
        extractInputHash: "abc123",
      },
    ]);
    expect(deal.messages.find((m) => m.id === "preserve-2")!.text).toContain(sources[0].evidenceQuote);
  });

  it("finds nothing when every required package mapped, or the extraction is unavailable", () => {
    const mapped = { ...profile, rejectedFields: [] };
    expect(unmappedRequiredServices(mapped, step, deal.messages)).toEqual([]);
    expect(unmappedRequiredServices(profile, undefined, deal.messages)).toEqual([]);
  });

  it("ignores other rejected fields and a quote that is not in its message", () => {
    const other = { ...profile, rejectedFields: [{ key: "latest_start", reason: "cannot be safely normalised", rawText: "soon" }] };
    expect(unmappedRequiredServices(other, step, deal.messages)).toEqual([]);
    const altered = deal.messages.map((m) => (m.id === "preserve-2" ? { ...m, text: "Nothing like the quote." } : m));
    expect(unmappedRequiredServices(profile, step, altered)).toEqual([]);
  });
});

describe("the merchant's confirmation", () => {
  const sources = () => unmappedRequiredServices(profile, step, deal.messages);

  it("records who confirmed which services, linked to the rejected extraction", () => {
    const c = confirmScope({ sources: sources(), packageIds: ALL, packages: deal.packages, confirmedAt: when, by: "Merchant (Pinecone Media Works)" });
    expect(c).toMatchObject({ kind: "required_services", packageIds: ALL, confirmedAt: when, by: "Merchant (Pinecone Media Works)" });
    expect(c.sources).toEqual(sources());
  });

  it("stores package IDs in catalogue order without duplicates", () => {
    const c = confirmScope({ sources: sources(), packageIds: ["monthly-reporting", "website-fixes", "website-fixes"], packages: deal.packages, confirmedAt: when, by: "m" });
    expect(c.packageIds).toEqual(["website-fixes", "monthly-reporting"]);
  });

  it.each([
    ["nothing to confirm", () => confirmScope({ sources: [], packageIds: ALL, packages: deal.packages, confirmedAt: when, by: "m" }), /nothing to confirm/i],
    ["no service chosen", () => confirmScope({ sources: sources(), packageIds: [], packages: deal.packages, confirmedAt: when, by: "m" }), /at least one service/i],
    ["an unknown service", () => confirmScope({ sources: sources(), packageIds: ["podcast"], packages: deal.packages, confirmedAt: when, by: "m" }), /not a service in this deal/i],
  ])("refuses %s", (_name, run, message) => {
    expect(run).toThrow(ScopeError);
    expect(run).toThrow(message);
  });

  it("makes the confirmed services the required scope, keeping the evidence and the original rejection", () => {
    const c = confirmScope({ sources: sources(), packageIds: ALL, packages: deal.packages, confirmedAt: when, by: "m" });
    const next = applyScopeConfirmation(profile, c, deal.messages, deal.packages);
    expect(next.requiredPackages).toMatchObject({ status: "stated", value: ALL, transformation: "merchant-confirmed required services", merchantConfirmation: { confirmedAt: when, by: "m", unmappedPhrases: ["complete annual package"] } });
    const quote = c.sources[0].evidenceQuote;
    expect(next.requiredPackages.evidence).toEqual([{ quote, messageId: "preserve-2", start: deal.messages.find((m) => m.id === "preserve-2")!.text.indexOf(quote), end: deal.messages.find((m) => m.id === "preserve-2")!.text.indexOf(quote) + quote.length }]);
    // The rejected extraction stays on the profile as history, and the input profile is untouched.
    expect(next.rejectedFields).toEqual(profile.rejectedFields);
    expect(profile.requiredPackages.status).toBe("missing");
  });

  it("is what the engine evaluates: the confirmed scope rejects structures that leave a required service out", () => {
    const input = { merchant: deal.merchant, packages: deal.packages, templates: deal.templates };
    const evaluate = (packageIds?: string[]) => evaluateDeal(packageIds ? applyScopeConfirmation(profile, confirmScope({ sources: sources(), packageIds, packages: deal.packages, confirmedAt: when, by: "m" }), deal.messages, deal.packages) : profile, input);
    const excluded = (e: ReturnType<typeof evaluate>) => e.result!.structures.filter((x) => [...x.buyerChecks].some((c) => c.id === "buyer_required_packages" && c.status === "fail")).length;
    const unconfirmed = evaluate();
    const full = evaluate(ALL);
    const small = evaluate(["website-fixes", "search-marketing"]);
    // Without a confirmed scope the engine has no required-service check at all. Confirming every
    // service makes it reject each structure that drops one; confirming two rejects none here
    // because every structure still includes both.
    const checked = (e: ReturnType<typeof evaluate>) => e.result!.structures.every((x) => x.buyerChecks.some((c) => c.id === "buyer_required_packages"));
    expect(checked(unconfirmed)).toBe(false);
    expect(checked(full)).toBe(true);
    expect(excluded(unconfirmed)).toBe(0);
    expect(excluded(full)).toBeGreaterThan(0);
    expect(excluded(small)).toBe(0);
    // Here the eligible options are the same either way: the buyer's budget, not scope, is binding.
    expect(full.state).toBe("options_ready");
    expect(full.result!.feasible.map((x) => x.structure.id)).toEqual(unconfirmed.result!.feasible.map((x) => x.structure.id));
  });
});
