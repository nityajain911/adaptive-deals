import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayRun } from "@/ai/orchestrator";
import { interpretExtraction } from "@/ai/extract";
import type { RunRecord } from "@/ai/run-record";
import { FixedClock } from "@/domain/clock";
import { canonicalJson } from "@/domain/agreement";
import { allDemoCases, demoCase, scriptedReplyText, type CaseId } from "@/data/synthetic/cases";
import { heroMessages } from "@/data/synthetic/hero";

const CASE_IDS: CaseId[] = ["reduced-scope", "preserve-scope", "no-fit"];
const REDUCED_SCOPE_MESSAGES = [
  "Hi Kabir, Divya, good speaking on Monday. Sharing the annual plan we discussed: website fixes, search marketing, social media and monthly reporting. It comes to ₹1,20,000 plus GST for the year.",
  "Kabir: Thanks Meera. Honestly, I would rather start small and see results before we commit to a full year.",
  "Divya: For now, we need the website fixes and search marketing. Social media can wait.",
  "Kabir: I only have ₹50,000 left in this quarter. Our fresh budget opens in January.",
  "Kabir: Anything above ₹60,000 has to go to our MD. If a smaller website-and-search phase fits within the limit, I can move it ahead.",
  "That works. Phase one could be the website fixes plus three months of search and reporting. If it goes well, I will hold today's monthly rates for the rest of the year, provided you confirm within 45 days of the month-three review.",
  "Kabir: Fair. If enquiries are up by about 20 a month by month three, we'll go ahead with the rest of the year.",
  "Divya: Sounds good. Send the offer across when it is ready.",
] as const;
const PRESERVE_SCOPE_MESSAGES = [
  "Hi Aarav, Priya, here is the six-month retainer we discussed: website fixes, search marketing, social media and monthly reporting. It comes to ₹72,000 plus GST.",
  "Aarav: Thanks Meera. Our vendor policy expects 15% off any retainer above ₹75,000.",
  "We don't usually discount, but I'm open to talking it through. What does approval look like on your side?",
  "Aarav: Our ops head can approve up to ₹75,000. Anything above that goes to our MD, and that takes about three weeks.",
  "Aarav: Our standard payment terms are net-45 from the invoice.",
  "Aarav: We mostly need the website fixes and search marketing. Monthly reporting is nice to have, but it can wait.",
  "Net-45 is hard for us, we pay our contractors at the start of every month. I can only look at a discount if you give something in return, like part of the payment on signing.",
  "Priya: I only have ₹30,000 left in this quarter. Our fresh budget opens on 1 January.",
  "Priya: If the total comes to ₹75,000 or less, we can pay ₹30,000 on signing and the balance in January. We would also look at a longer term if the rate is better.",
  "Aarav: Sounds good. Send one clear offer when it is ready.",
] as const;
const NO_FIT_MESSAGES = [
  "Hi Ritu, Sandeep, here is our annual plan: website fixes, search marketing, social media and monthly reporting. It comes to ₹1,20,000 plus GST for the year.",
  "Ritu: Thanks Meera. We love the reporting format you showed us. The team is keen.",
  "Sandeep: Honestly, we have another quote. ₹80,000 for the whole year, same deliverables.",
  "Could you share what it covers? I'd like to compare like for like.",
  "Sandeep: Website, SEO and social posts. Not sure about reporting, they said it is basic updates.",
  "Ritu: We don't want to switch only for price, but ₹80,000 is what is approved for us this quarter. We need website fixes, search marketing, social media and monthly reporting.",
  "Sandeep: If you can come to ₹80,000, I can sign today.",
  "Let me check what is possible and come back to you.",
  "Ritu: Even if it is less than a full year, we can look at it. We just can't go above ₹80,000 this quarter.",
  "Sandeep: And please send a payment link, not a long contract.",
] as const;

function storedRun(file: string): RunRecord {
  return JSON.parse(readFileSync(path.join(process.cwd(), file), "utf8")) as RunRecord;
}

describe("commercial demo case catalog", () => {
  it("contains the three designed cases and refuses unknown IDs", () => {
    expect(allDemoCases().map((item) => item.id)).toEqual(CASE_IDS);
    expect(demoCase("missing")).toBeNull();
  });

  it("keeps merchant policy, packages and approved templates identical, except for a buyer with terms agreed for them", () => {
    const cases = allDemoCases();
    const first = cases[0].deal;
    for (const item of cases.slice(1)) {
      expect(canonicalJson(item.deal.packages)).toBe(canonicalJson(first.packages));
      if (item.terms) {
        // A buyer's own terms (a discount limit, ways to pay, commitments) are applied to that deal only, and are part of its hash.
        expect(item.deal.templates.discountsBps.length).toBeGreaterThan(0);
        expect(canonicalJson(item.deal.templates)).not.toBe(canonicalJson(first.templates));
        continue;
      }
      expect(canonicalJson(item.deal.merchant)).toBe(canonicalJson(first.merchant));
      expect(canonicalJson(item.deal.templates)).toBe(canonicalJson(first.templates));
    }
    // Only the discount case changes the merchant's own policy (its discount limit); the competitor case changes only what is offered.
    expect(demoCase("preserve-scope")!.deal.merchant.policy.discountLimitBps).toBe(1000);
    expect(canonicalJson(demoCase("no-fit")!.deal.merchant)).toBe(canonicalJson(first.merchant));
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

  it("uses the approved eight-message reduced-scope conversation without pre-answering clarification", () => {
    const messages = demoCase("reduced-scope")!.deal.messages;
    expect(messages.map((message) => message.text)).toEqual(REDUCED_SCOPE_MESSAGES);
    expect(messages.map((message) => message.author)).toEqual(["merchant", "buyer", "buyer", "buyer", "buyer", "merchant", "buyer", "buyer"]);
    expect(messages.map((message) => message.id)).toEqual(["reduced-1", "reduced-2", "reduced-3", "reduced-4", "reduced-5", "reduced-6", "reduced-7", "reduced-8"]);
    expect(messages.map((message) => message.text).join(" ")).not.toMatch(/both amounts include GST|per contract/i);
  });

  it("uses the ten-message discount conversation: a 15% ask, net-45, and ₹30,000 on signing", () => {
    const item = demoCase("preserve-scope")!;
    expect(item.deal.messages.map((message) => message.text)).toEqual(PRESERVE_SCOPE_MESSAGES);
    expect(item.deal.messages.map((message) => message.author)).toEqual(["merchant", "buyer", "merchant", "buyer", "buyer", "buyer", "merchant", "buyer", "buyer", "buyer"]);
    expect(item.deal.messages.map((message) => message.id)).toEqual(Array.from({ length: 10 }, (_, i) => `discount-${i + 1}`));
    // The conversation asks for the discount and the terms but does not pre-answer either question: the GST basis is for the buyer to say.
    const keys = item.expected.extraction.fields.map((field) => field.key);
    expect(keys).not.toContain("amounts_include_gst");
    expect(item.expected.extraction.ambiguities.map((a) => a.field_key)).toEqual(["amounts_include_gst", "approval_limit_scope"]);
    expect(item.expected.extraction.unsupported_requests).toEqual([expect.objectContaining({ kind: "discount", message_id: "discount-2" })]);
    expect(item.terms).toMatchObject({ discountLimitBps: 1000 });
    expect(item.terms!.templates.discountsBps).toEqual([0, 1000, 1500]);
    expect(item.hiddenReplies).toEqual(["clar-gst-no"]);
  });

  it("uses the ten-message competitor conversation: a rival's ₹80,000 for the year, a cap, and one payment link", () => {
    const item = demoCase("no-fit")!;
    expect(item.deal.messages.map((message) => message.text)).toEqual(NO_FIT_MESSAGES);
    expect(item.deal.messages.map((message) => message.author)).toEqual(["merchant", "buyer", "buyer", "merchant", "buyer", "buyer", "buyer", "merchant", "buyer", "buyer"]);
    expect(item.deal.messages.map((message) => message.id)).toEqual(Array.from({ length: 10 }, (_, i) => `lotus-${i + 1}`));
    // The questions are not pre-answered: whether the ₹80,000 includes GST is for the buyer to say.
    expect(item.expected.extraction.fields.map((field) => field.key)).not.toContain("amounts_include_gst");
    expect(item.expected.extraction.ambiguities.map((a) => a.field_key)).toEqual(["amounts_include_gst"]);
    const profile = interpretExtraction(item.expected.extraction, { dealId: item.deal.dealId, messages: item.deal.messages, packages: item.deal.packages, timeZone: item.deal.merchant.timeZone }).profile;
    expect(profile.requiredPackages.value).toEqual(["website-fixes", "search-marketing", "social-media", "monthly-reporting"]);
    expect(item.terms).toMatchObject({ discountLimitBps: 0 });
    expect(item.hiddenReplies).toEqual(["clar-gst-no"]);
  });

  it("gives the simulated buyer this case's own words, each carrying the recorded answer verbatim so the recorded run still continues", () => {
    const item = demoCase("reduced-scope")!;
    const answers = item.expected.recordedAnswers;
    expect(Object.keys(item.replyScripts!)).toEqual(expect.arrayContaining(["clar-gst-yes", "clar-approval-contract"]));
    expect(item.replyScripts!["clar-gst-yes"]).toContain(answers.find((a) => a.questionId === "clar-gst")!.answerText);
    expect(item.replyScripts!["clar-approval-contract"]).toContain(answers.find((a) => a.questionId === "clar-approval")!.answerText);
    expect(scriptedReplyText("reduced-scope", { id: "clar-gst-yes", text: "shared" })).toMatch(/^Divya:/);
    expect(scriptedReplyText("no-fit", { id: "clar-approval-contract", text: "shared" })).toBe("shared");
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
      "preserve-scope": { state: "options_ready", template: "phased_scope" },
      "no-fit": { state: "options_ready", template: "shorter_commitment" },
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
