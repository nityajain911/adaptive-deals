import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createLiveProvider } from "@/ai/live";
import { promptHash } from "@/ai/prompts";
import type { ProviderName } from "@/ai/provider";
import { DocumentReadingSchema } from "@/ai/schemas";
import { readJson, serialised, writeJsonAtomic } from "@/lib/store";
import type { BusinessEconomics } from "@/domain/business-economics";
import type { KnowledgeSource } from "../types";
import { buildDocumentReadRequest } from "./ai-reading";

export const DOCUMENT_READING_SCHEMA = "adaptive-deals.document-reading.v1" as const;
/** Recordings of real model readings of the sample documents, replayed by exact request hash. */
export const DOCUMENT_RECORDINGS_DIR = "data/document-readings";

export interface StoredDocumentReading {
  schema: typeof DOCUMENT_READING_SCHEMA;
  sourceId: string;
  sourceHash: string;
  inputHash: string;
  promptVersion: string;
  promptHash: string;
  provider: ProviderName;
  model: string;
  temperature: string;
  usage?: { inputTokens: number; outputTokens: number } | null;
  origin: "recorded" | "live";
  recordingId: string | null;
  rawOutput: unknown;
  readAt: string;
}

export type DocumentReadOutcome =
  | { mode: "recorded" | "live"; reading: StoredDocumentReading }
  | { mode: "unavailable" | "failed"; message: string };

const fileOf = (sourceId: string) => `knowledge/uploads/${sourceId}.reading.json`;

interface Recording {
  id: string;
  inputHash: string;
  promptVersion: string;
  promptHash: string;
  provider: ProviderName;
  model: string;
  temperature: string;
  usage?: { inputTokens: number; outputTokens: number } | null;
  rawOutput: unknown;
}

function recordings(): Recording[] {
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), DOCUMENT_RECORDINGS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(path.join(dir, name), "utf8")) as Recording);
}

/** A live model call is made only when explicitly switched on, with a configured key. Otherwise nothing is sent anywhere. */
const liveEnabled = () => process.env.ADAPTIVE_DEALS_DOCUMENT_AI === "live";

/**
 * Ask for an AI reading of one document: a recording of this exact request when there is one, a live call only when
 * switched on, otherwise nothing. The model's answer is stored as it came; it is checked against the document every
 * time it is used (`interpretDocumentReading`), never trusted from storage.
 */
export async function readDocumentWithAi(active: BusinessEconomics, source: KnowledgeSource): Promise<DocumentReadOutcome> {
  const request = buildDocumentReadRequest(active, source);
  const hash = promptHash(request.prompt);
  const base = { schema: DOCUMENT_READING_SCHEMA, sourceId: source.id, sourceHash: source.contentHash, inputHash: request.inputHash, promptVersion: request.prompt.version, promptHash: hash, readAt: new Date().toISOString() };
  const recorded = recordings().find((item) => item.inputHash === request.inputHash && item.promptVersion === request.prompt.version && item.promptHash === hash);
  if (recorded) {
    if (!DocumentReadingSchema.safeParse(recorded.rawOutput).success) return { mode: "failed", message: "The recorded AI reading no longer matches the expected format, so it was not used." };
    const reading: StoredDocumentReading = { ...base, provider: recorded.provider, model: recorded.model, temperature: recorded.temperature, usage: recorded.usage ?? null, origin: "recorded", recordingId: recorded.id, rawOutput: recorded.rawOutput };
    await saveReading(reading);
    return { mode: "recorded", reading };
  }
  if (!liveEnabled()) return { mode: "unavailable", message: "No AI reading is available for this document, so only the built-in line reader was used." };
  const provider = createLiveProvider();
  if (!provider) return { mode: "unavailable", message: "The AI reader is not configured, so only the built-in line reader was used." };
  const result = await provider.generate(request);
  if (!result.ok) return { mode: "failed", message: "The AI reader could not read this document, so only the built-in line reader was used." };
  if (!DocumentReadingSchema.safeParse(result.raw).success) return { mode: "failed", message: "The AI's answer did not match the expected format, so only the built-in line reader was used." };
  const reading: StoredDocumentReading = { ...base, provider: result.meta.provider, model: result.meta.model, temperature: result.meta.temperature, usage: result.meta.usage ?? null, origin: "live", recordingId: null, rawOutput: result.raw };
  await saveReading(reading);
  return { mode: "live", reading };
}

export function saveReading(reading: StoredDocumentReading): Promise<void> {
  return serialised(() => writeJsonAtomic(fileOf(reading.sourceId), reading));
}

/** The stored AI readings of the given documents, by source id. A reading of different text than the document now holds is ignored. */
export async function loadReadings(sources: KnowledgeSource[]): Promise<Record<string, StoredDocumentReading>> {
  const out: Record<string, StoredDocumentReading> = {};
  for (const source of sources) {
    if (!source.origin) continue;
    const stored = await readJson<StoredDocumentReading>(fileOf(source.id));
    if (stored && stored.sourceHash === source.contentHash) out[source.id] = stored;
  }
  return out;
}

/** How a stored reading is labelled to the merchant. */
export function readingLabel(reading: Pick<StoredDocumentReading, "origin" | "provider" | "model">): string {
  const who = reading.provider === "cerebras" ? "Cerebras" : reading.provider;
  return reading.origin === "recorded" ? `Recorded ${who} output` : `${who} (${reading.model}), live`;
}
