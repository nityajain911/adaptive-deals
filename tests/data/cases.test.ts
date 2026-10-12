import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayRun } from "@/ai/orchestrator";
import { interpretExtraction } from "@/ai/extract";
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
const PRESERVE_SCOPE_MESSAGES = [
  "Hi, sharing the annual admissions plan again. It is ₹1,20,000 plus GST for the full year.",
  "Thanks. We need the complete annual package for the admissions season, so please don’t remove anything.",
  "I can release only ₹10,000 right now, as this quarter is tight.",
  "Our next campaign budget opens on 1 May. Starting then is fine as long as the full plan stays intact.",
  "Finance lets me approve up to ₹15,000 per payment without escalating it. Both the ₹10,000 and ₹15,000 figures are before GST.",
] as const;
const NO_FIT_MESSAGES = [
  "Hi, sharing the launch proposal. It is ₹1,20,000 plus GST for website fixes, search marketing, social media and monthly reporting. We currently have delivery starting in November.",
  "The issue is timing. We need your team to start no later than 15 October.",
  "We need the full scope: website fixes, search, social and monthly reporting.",
  "Budget isn’t the issue. We have ₹2,00,000 available this quarter, including GST.",
  "We can’t move the date or reduce the scope. If you can’t start by then, please tell us clearly.",
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

  it("uses the approved five-message preserve-scope opening with an explicit pre-GST basis", () => {
    const item = demoCase("preserve-scope")!;
    expect(item.deal.messages.map((message) => message.text)).toEqual(PRESERVE_SCOPE_MESSAGES);
    expect(item.deal.messages.map((message) => message.author)).toEqual(["merchant", "buyer", "buyer", "buyer", "buyer"]);
    expect(item.deal.messages.map((message) => message.id)).toEqual(["preserve-1", "preserve-2", "preserve-3", "preserve-4", "preserve-5"]);
    const gst = item.expected.extraction.fields.find((field) => field.key === "amounts_include_gst");
    expect(gst).toMatchObject({ raw_text: "before GST", message_id: "preserve-5" });
    expect(gst!.evidence_quote).toContain("₹10,000 and ₹15,000");
  });

  it("uses the approved no-fit opening and normalises its exact deadline", () => {
    const item = demoCase("no-fit")!;
    expect(item.deal.messages.map((message) => message.text)).toEqual(NO_FIT_MESSAGES);
    expect(item.deal.messages.map((message) => message.author)).toEqual(["merchant", "buyer", "buyer", "buyer", "buyer"]);
    expect(item.deal.messages.map((message) => message.id)).toEqual(["no-fit-1", "no-fit-2", "no-fit-3", "no-fit-4", "no-fit-5"]);
    const latest = item.expected.extraction.fields.find((field) => field.key === "latest_start");
    expect(latest).toMatchObject({ raw_text: "15 October", message_id: "no-fit-2" });
    const profile = interpretExtraction(item.expected.extraction, {
      dealId: item.deal.dealId,
      messages: item.deal.messages,
      packages: item.deal.packages,
      timeZone: item.deal.merchant.timeZone,
    }).profile;
    expect(profile.latestStart).toMatchObject({ status: "stated", value: { value: "2026-10-15", precision: "day" }, unit: "day" });
    expect(profile.requiredPackages.value).toEqual(["website-fixes", "search-marketing", "social-media", "monthly-reporting"]);
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

  it("binds every bundled sample to its current case messages and hand-written provenance", () => {
    for (const item of allDemoCases()) {
      const run = storedRun(item.bundledRunPath);
      expect(run.kind).toBe("synthetic_replay");
      expect(run.provider).toBe("synthetic_replay");
      expect(run.inputs.messages).toEqual(item.deal.messages);
      expect(run.steps.length).toBeGreaterThan(0);
      for (const step of run.steps) {
        expect(step.provider).toBe("synthetic_replay");
        expect(step.model).toMatch(/synthetic outputs written by hand/i);
      }
      expect(JSON.stringify(run)).not.toMatch(/recorded cerebras output|live cerebras output/i);
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
