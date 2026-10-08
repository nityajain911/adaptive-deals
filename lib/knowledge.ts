import "server-only";
import { listUploadedSources } from "@/commercial-memory/upload/store";
import { loadBundledKnowledgeSources } from "@/commercial-memory/source-schema";
import type { KnowledgeSource } from "@/commercial-memory/types";

/**
 * Every source the merchant can use: the bundled demo documents and anything they uploaded. A source that an
 * active uploaded source says it replaces is marked superseded here; the bundled files themselves never change.
 */
export async function loadKnowledgeSources(): Promise<KnowledgeSource[]> {
  const uploaded = await listUploadedSources();
  const replaced = new Set(uploaded.filter((source) => source.status === "active" && source.supersedes).map((source) => source.supersedes!));
  return [...loadBundledKnowledgeSources(), ...uploaded].map((source) => (replaced.has(source.id) && source.status === "active" ? { ...source, status: "superseded" as const } : source));
}
