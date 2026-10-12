import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadBundledKnowledgeSources, parseKnowledgeSource } from "@/commercial-memory/source-schema";

describe("Commercial Memory source contracts", () => {
  it("loads a useful fictional corpus without trusting the manifest for source validity", () => {
    const sources = loadBundledKnowledgeSources();
    expect(sources).toHaveLength(9);
    expect(new Set(sources.map((source) => source.kind)).size).toBeGreaterThanOrEqual(5);
    expect(sources.filter((source) => source.merchantId === "merchant-pinecone")).toHaveLength(8);
    expect(sources.some((source) => source.merchantId === "merchant-saffron")).toBe(true);
    expect(sources.some((source) => source.buyerId === "buyer-harbour-fresh")).toBe(true);
  });

  it("refuses content whose declared hash no longer matches", () => {
    const source = loadBundledKnowledgeSources()[0]!;
    expect(() => parseKnowledgeSource({ ...source, content: `${source.content}\nAltered after indexing.` })).toThrow(/content hash/i);
  });

  it("refuses invalid access, dates, buyer scope and supersession", () => {
    const source = loadBundledKnowledgeSources()[0]!;
    expect(() => parseKnowledgeSource({ ...source, access: "public" })).toThrow();
    expect(() => parseKnowledgeSource({ ...source, effectiveFrom: "8 October" })).toThrow();
    expect(() => parseKnowledgeSource({ ...source, access: "buyer_specific", buyerId: null })).toThrow(/buyer/i);
    expect(() => parseKnowledgeSource({ ...source, effectiveTo: "2025-01-01" })).toThrow(/date/i);
  });

  it("keeps the committed manifest free of inline source content", () => {
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "data/commercial-memory/manifest.json"), "utf8")) as { files: string[]; content?: unknown };
    expect(manifest.files).toHaveLength(9);
    expect(manifest.content).toBeUndefined();
  });
});
