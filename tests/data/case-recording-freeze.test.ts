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
  scope: ["reduced-scope"];
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

    for (const id of CASE_IDS) {
      expect(freeze.cases[id].messagesSha256).toBe(sha256(canonicalJson(demoCase(id)!.deal.messages)));
    }

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

  it("keeps historical Groq inputs separate and maps only the exact frozen Cerebras hero", () => {
    for (const id of CASE_IDS) {
      expect(RECORDED_CASE_MESSAGES[id]).not.toEqual(demoCase(id)!.deal.messages);
      if (id === "reduced-scope") {
        expect(mappedCaseRun(id)).toMatchObject({ runId: "run-case-reduced-scope-ed5442a3", provider: "cerebras", model: "gpt-oss-120b" });
      } else {
        expect(mappedCaseRun(id)).toBeNull();
      }
    }
  });
});
