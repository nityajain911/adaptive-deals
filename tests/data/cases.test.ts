import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayRun } from "@/ai/orchestrator";
import type { RunRecord } from "@/ai/run-record";
import { FixedClock } from "@/domain/clock";
import { canonicalJson } from "@/domain/agreement";
import { allDemoCases, demoCase, type CaseId } from "@/data/synthetic/cases";
import { heroMessages } from "@/data/synthetic/hero";

const CASE_IDS: CaseId[] = ["reduced-scope", "preserve-scope", "no-fit"];
const REDUCED_SCOPE_MESSAGES = [
  "Hi, good speaking on Monday. Sharing the annual plan we discussed — website fixes, search marketing, social media and monthly reporting. It comes to ₹1,20,000 plus GST for the year.",
  "Thanks. The broken booking page is costing us patient enquiries, so fixing that is urgent.",
  "For now, we need the website fixes and search marketing. Social media can wait.",
  "I only have ₹50,000 left in this quarter. Our fresh budget opens in April.",
  "Anything above ₹60,000 has to go to our MD. If a smaller website-and-search phase fits within the limit, I can move it ahead.",
] as const;

function storedRun(file: string): RunRecord {
  return JSON.parse(readFileSync(path.join(process.cwd(), file), "utf8")) as RunRecord;
}

describe("commercial demo case catalog", () => {
  it("contains the three designed cases and refuses unknown IDs", () => {
    expect(allDemoCases().map((item) => item.id)).toEqual(CASE_IDS);
    expect(demoCase("missing")).toBeNull();
  });

  it("keeps merchant policy, packages and approved templates identical", () => {
    const cases = allDemoCases();
    const first = cases[0].deal;
    for (const item of cases.slice(1)) {
      expect(canonicalJson(item.deal.merchant)).toBe(canonicalJson(first.merchant));
      expect(canonicalJson(item.deal.packages)).toBe(canonicalJson(first.packages));
      expect(canonicalJson(item.deal.templates)).toBe(canonicalJson(first.templates));
    }
  });

  it("uses chronological, unique messages and only verbatim extraction evidence", () => {
    for (const item of allDemoCases()) {
      const ids = item.deal.messages.map((message) => message.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(item.deal.messages.map((message) => Date.parse(message.timestamp))).toEqual(
        [...item.deal.messages].map((message) => Date.parse(message.timestamp)).sort((a, b) => a - b),
      );
      for (const field of item.expected.extraction.fields) {
        const message = item.deal.messages.find((candidate) => candidate.id === field.message_id);
        expect(message, `${item.id}: missing ${field.message_id}`).toBeTruthy();
        const start = message!.text.indexOf(field.evidence_quote);
        expect(start, `${item.id}: evidence missing from ${field.message_id}`).toBeGreaterThanOrEqual(0);
        expect(message!.text.slice(start, start + field.evidence_quote.length)).toBe(field.evidence_quote);
        expect(field.evidence_quote).toContain(field.raw_text);
      }
    }
  });

  it("keeps reduced-scope GST basis and approval scope unresolved in the opening extraction", () => {
    const extraction = demoCase("reduced-scope")!.expected.extraction;
    const keys = extraction.fields.map((field) => field.key);
    expect(keys).not.toContain("amounts_include_gst");
    expect(keys).not.toContain("approval_limit_scope");
    expect(extraction.ambiguities.map((ambiguity) => ambiguity.field_key)).toEqual(
      expect.arrayContaining(["amounts_include_gst", "approval_limit_scope"]),
    );
  });

  it("uses the approved five-message reduced-scope opening without pre-answering clarification", () => {
    const messages = demoCase("reduced-scope")!.deal.messages;
    expect(messages.map((message) => message.text)).toEqual(REDUCED_SCOPE_MESSAGES);
    expect(messages.map((message) => message.author)).toEqual(["merchant", "buyer", "buyer", "buyer", "buyer"]);
    expect(messages.map((message) => message.id)).toEqual(["reduced-1", "reduced-2", "reduced-3", "reduced-4", "reduced-5"]);
    expect(messages.map((message) => message.text).join(" ")).not.toMatch(/both amounts include GST|per contract/i);
  });

  it("matches required and optional package evidence to the shared catalog", () => {
    for (const item of allDemoCases()) {
      const names = item.deal.packages.map((pkg) => pkg.name.toLowerCase());
      const packageFields = item.expected.extraction.fields.filter((field) => field.key === "required_package" || field.key === "optional_package");
      for (const field of packageFields) {
        // A buyer who says "the complete annual package" names no service: the engine rejects it and the merchant confirms the services.
        if (field.raw_text === "complete annual package") continue;
        expect(names.some((name) => field.raw_text.toLowerCase().includes(name) || name.includes(field.raw_text.toLowerCase()))).toBe(true);
      }
    }
  });

  it("replays to three distinct commercial decisions", async () => {
    const expected = {
      "reduced-scope": { state: "options_ready", template: "phased_scope" },
      "preserve-scope": { state: "options_ready", template: "deferred_start" },
      "no-fit": { state: "no_feasible_deal", template: null },
    } as const;

    for (const id of CASE_IDS) {
      const item = demoCase(id)!;
      const outcome = await replayRun(storedRun(item.bundledRunPath), structuredClone(item.deal), new FixedClock());
      expect(outcome.evaluation.state).toBe(expected[id].state);
      expect(outcome.explanation?.order[0] ?? null).toSatisfy((structureId: string | null) =>
        expected[id].template === null ? structureId === null : structureId?.startsWith(`${expected[id].template}:`) === true,
      );
    }
  });

  it("labels designed proof points honestly and leaves the historical hero untouched", () => {
    for (const item of allDemoCases()) {
      expect(item.provenance).toBe("Synthetic scenario");
      expect(item.proofPoint).not.toMatch(/recovered|conversion|success rate|guarantee/i);
    }
    expect(heroMessages.map((message) => message.id)).toEqual(["msg-1", "msg-2"]);
    expect(heroMessages[1].text).toBe("Only ₹50K left this quarter; new budget in April; anything above ₹60K needs MD approval.");
  });

  it("returns defensive copies so one case cannot mutate the catalog", () => {
    const first = demoCase("reduced-scope")!;
    first.deal.messages[0].text = "mutated";
    expect(demoCase("reduced-scope")!.deal.messages[0].text).not.toBe("mutated");
  });
});
