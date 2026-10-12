import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROMPTS, promptHash } from "@/ai/prompts";
import { buildDocumentReadRequest, interpretDocumentReading } from "@/commercial-memory/upload/ai-reading";
import { defaultEconomics } from "@/lib/economics-default";
import { readManifest, sourceOf } from "../../scripts/document-eval-shared";

const active = defaultEconomics();
const recording = (id: string) => JSON.parse(readFileSync(path.join(process.cwd(), `data/document-readings/${id}.json`), "utf8")) as { inputHash: string; promptVersion: string; promptHash: string; provider: string; model: string; rawOutput: unknown };

describe("the recorded AI readings of the four evaluation documents", () => {
  it("are of Cerebras gpt-oss-120b, with the frozen prompt", () => {
    for (const doc of readManifest()) {
      const r = recording(doc.id);
      expect([r.provider, r.model, r.promptVersion]).toEqual(["cerebras", "gpt-oss-120b", "read_document.v1"]);
      expect(r.promptHash).toBe(promptHash(PROMPTS.read_document));
    }
  });

  it.each(readManifest().map((doc) => doc.id))("%s: replays only for the exact document, and nothing wrong passes the checks", async (id) => {
    const doc = readManifest().find((item) => item.id === id)!;
    const source = await sourceOf(doc);
    const r = recording(id);
    expect(r.inputHash).toBe(buildDocumentReadRequest(active, source).inputHash);
    const accepted = interpretDocumentReading(active, source, r.rawOutput).proposals;
    for (const proposal of accepted) {
      const expected = doc.expected[proposal.serviceId] ?? doc.acceptable?.[proposal.serviceId];
      expect(proposal.proposedValue, `${proposal.serviceName} in ${id}`).toBe(expected);
    }
    for (const [serviceId, value] of Object.entries(doc.expected)) expect(accepted.find((p) => p.serviceId === serviceId)?.proposedValue).toBe(value);
  });

  it("contain no credential of any kind", () => {
    const pattern = /gsk_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{16,}|csk-[A-Za-z0-9]{16,}|rzp_(live|test)_[A-Za-z0-9]+|Bearer\s+[A-Za-z0-9._-]{16,}|api[_-]?key"\s*:\s*"[^"]{8,}/i;
    for (const doc of readManifest()) expect(readFileSync(path.join(process.cwd(), `data/document-readings/${doc.id}.json`), "utf8")).not.toMatch(pattern);
  });
});
