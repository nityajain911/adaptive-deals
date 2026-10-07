import { createHash } from "node:crypto";
import { instructionSpans } from "@/assist/profile/verify";
import type { KnowledgeChunk, KnowledgeSource } from "./types";
import { extractAmountsPaise, extractEntities, normaliseTokens } from "./normalise";

const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

function makeChunk(source: KnowledgeSource, start: number, end: number, heading: string | null, rowNumber: number | null): KnowledgeChunk {
  const text = source.content.slice(start, end);
  const suspicious = instructionSpans(source.content)
    .filter((span) => span.start < end && span.end > start)
    .map((span) => {
      const clippedStart = Math.max(span.start, start);
      const clippedEnd = Math.min(span.end, end);
      const raw = source.content.slice(clippedStart, clippedEnd);
      const leading = raw.length - raw.trimStart().length;
      const trailing = raw.length - raw.trimEnd().length;
      const exactStart = clippedStart + leading;
      const exactEnd = clippedEnd - trailing;
      return { start: exactStart - start, end: exactEnd - start, text: source.content.slice(exactStart, exactEnd) };
    });
  return {
    id: `chunk-${hash(`${source.id}:${start}:${end}:${text}`).slice(0, 20)}`,
    sourceId: source.id,
    merchantId: source.merchantId,
    buyerId: source.buyerId,
    start,
    end,
    text,
    heading,
    rowNumber,
    tokens: normaliseTokens(`${heading ?? ""} ${text}`),
    entities: extractEntities(`${heading ?? ""} ${text}`),
    amountsPaise: extractAmountsPaise(text),
    instructionSpans: suspicious,
    hash: hash(text),
  };
}

function csvChunks(source: KnowledgeSource): KnowledgeChunk[] {
  const lines = source.content.split("\n");
  const heading = lines[0] ?? null;
  const chunks: KnowledgeChunk[] = [];
  let cursor = (heading?.length ?? 0) + 1;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.trim()) chunks.push(makeChunk(source, cursor, cursor + line.length, heading, index + 1));
    cursor += line.length + 1;
  }
  return chunks;
}

function textChunks(source: KnowledgeSource): KnowledgeChunk[] {
  const blocks = [...source.content.matchAll(/[^\n](?:.|\n(?!\n))*[^\n]|[^\n]/g)];
  if (!blocks.length) return [];
  let heading: string | null = null;
  const chunks: KnowledgeChunk[] = [];
  for (const [blockIndex, block] of blocks.entries()) {
    const text = block[0];
    if (blockIndex === 0 && blocks.length > 1 && !text.includes("\n") && text.length <= 100) {
      heading = text.trim();
      continue;
    }
    chunks.push(makeChunk(source, block.index!, block.index! + text.length, heading, null));
  }
  return chunks;
}

export function chunkSource(source: KnowledgeSource): KnowledgeChunk[] {
  return source.format === "csv" ? csvChunks(source) : textChunks(source);
}
