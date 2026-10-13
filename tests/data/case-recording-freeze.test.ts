import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { promptFor, promptHash } from "@/ai/prompts";
import { canonicalJson } from "@/domain/agreement";
import { CASE_IDS, demoCase, type CaseId } from "@/data/synthetic/cases";
import { RECORDED_CASE_MESSAGES } from "@/data/synthetic/recorded-conversations";
import { mappedCaseRun } from "@/lib/case-runs";

type CaseRecordingFreeze = {
  schema: "adaptive-deals.case-recording-freeze.v1";
  frozenAt: string;
  authoredBy: "OpenAI Codex, directed by Nitya Jain";
  cases: Record<CaseId, { messagesSha256: string }>;
  prompts: Record<"extract" | "clarify" | "explain", { version: string; sha256: string }>;
  provider: "cerebras";
  model: "gpt-oss-120b";
  scope: string[];
  maximumProviderRequests: 7;
  retryRule: "technical failures only";
  resultRule: "keep the first technically valid output, misses included";
  networkCallsMade: 0;
};

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const freeze = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE.json"), "utf8"),
) as CaseRecordingFreeze;

describe("the pre-call case recording freeze", () => {
  it("pins every current conversation and published prompt to the live repository", () => {
    expect(freeze.schema).toBe("adaptive-deals.case-recording-freeze.v1");
    expect(freeze.authoredBy).toBe("OpenAI Codex, directed by Nitya Jain");
    expect(Number.isNaN(Date.parse(freeze.frozenAt))).toBe(false);

    // The first batch pins the text as it was; preserve-scope's message was revised later, and its own freeze pins the new text.
    const revised = JSON.parse(readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE_BATCH6.json"), "utf8")) as CaseRecordingFreeze;
    // The hero was replaced on 13 October 2026 (Harbour Fresh Foods); its own freeze pins the new text, the first batch keeps the old hash.
    const hero = JSON.parse(readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE_BATCH7.json"), "utf8")) as CaseRecordingFreeze;
    // The second case was replaced on 13 October 2026 (Zephyr Logistics); its own freeze pins the new text.
    const zephyr = JSON.parse(readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE_BATCH9.json"), "utf8")) as CaseRecordingFreeze;
    // The third case was replaced on 13 October 2026 (Lotus Row Interiors); its own freeze pins the new text.
    const lotus = JSON.parse(readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE_BATCH10.json"), "utf8")) as CaseRecordingFreeze;
    for (const id of CASE_IDS) {
      const pinned = id === "preserve-scope" ? zephyr : id === "reduced-scope" ? hero : id === "no-fit" ? lotus : freeze;
      expect(pinned.cases[id].messagesSha256).toBe(sha256(canonicalJson(demoCase(id)!.deal.messages)));
    }
    expect(freeze.cases["reduced-scope"].messagesSha256).toBe("81db55020d060e55f8927a2a81a17a3b0da6d7b4c583dbef9d729b8c71f0d7af");
    expect(freeze.cases["preserve-scope"].messagesSha256).toBe("a98421b32768095881447b048a786171388886f23c17ddc337324ea6c759f30f");

    for (const [task, version] of Object.entries({ extract: "extract.v2", clarify: "clarify.v1", explain: "explain.v3" }) as ["extract" | "clarify" | "explain", string][]) {
      expect(freeze.prompts[task]).toEqual({ version, sha256: promptHash(promptFor(task, version)) });
    }
  });

  it("authorises no call and records the later hero-only Cerebras contract", () => {
    expect(freeze).toMatchObject({
      provider: "cerebras",
      model: "gpt-oss-120b",
      scope: ["reduced-scope"],
      maximumProviderRequests: 7,
      retryRule: "technical failures only",
      resultRule: "keep the first technically valid output, misses included",
      networkCallsMade: 0,
    });
  });

  it("keeps historical Groq inputs separate and maps only exact frozen Cerebras recordings", () => {
    const mapped: Partial<Record<CaseId, string>> = { "reduced-scope": "run-case-reduced-scope-4e94d36d", "preserve-scope": "run-case-preserve-scope-9fe9e42b" };
    for (const id of CASE_IDS) {
      expect(RECORDED_CASE_MESSAGES[id]).not.toEqual(demoCase(id)!.deal.messages);
      const runId = mapped[id];
      if (runId) expect(mappedCaseRun(id)).toMatchObject({ runId, provider: "cerebras", model: "gpt-oss-120b" });
      else expect(mappedCaseRun(id)).toBeNull();
    }
  });

  it("the second batch authorises only the two remaining cases, with the same prompts and conversations", () => {
    const second = JSON.parse(readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE_BATCH2.json"), "utf8")) as CaseRecordingFreeze & { authorisedBy: string };
    expect(second).toMatchObject({ provider: "cerebras", model: "gpt-oss-120b", scope: ["preserve-scope", "no-fit"], maximumProviderRequests: 7, retryRule: "technical failures only", resultRule: "keep the first technically valid output, misses included" });
    expect(second.authorisedBy).toMatch(/Nitya Jain/);
    expect(second.cases).toEqual(freeze.cases);
    expect(second.prompts).toEqual(freeze.prompts);
  });
});
