import { readFileSync } from "node:fs";
import path from "node:path";
import { buildUploadSource } from "@/commercial-memory/upload/ingest";
import type { KnowledgeSource } from "@/commercial-memory/types";

export interface EvalDocument {
  id: string;
  role: string;
  file: string;
  format: "csv" | "text";
  kind: "rate_card" | "cost_sheet";
  expected: Record<string, number>;
  /** A value that is also acceptable if present, but is not required. */
  acceptable?: Record<string, number>;
}

export const readManifest = (): EvalDocument[] => (JSON.parse(readFileSync(path.join(process.cwd(), "data/document-eval/manifest.json"), "utf8")) as { documents: EvalDocument[] }).documents;

/** The knowledge source an upload of this document produces, exactly as the product builds it. */
export async function sourceOf(doc: EvalDocument): Promise<KnowledgeSource> {
  const text = readFileSync(path.join(process.cwd(), doc.file), "utf8");
  const built = await buildUploadSource({ title: doc.id, kind: doc.kind, effectiveFrom: "2026-10-08", format: doc.format, fileName: path.basename(doc.file), text }, "2026-10-09T10:00:00+05:30");
  return built.source;
}
