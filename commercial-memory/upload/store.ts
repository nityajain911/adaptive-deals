import "server-only";
import { readJson, serialised, writeJsonAtomic } from "@/lib/store";
import { parseKnowledgeSource } from "../source-schema";
import type { KnowledgeSource } from "../types";

const INDEX = "knowledge/uploads/index.json";
const fileOf = (id: string) => `knowledge/uploads/${id}.json`;

async function ids(): Promise<string[]> {
  const value = await readJson<unknown>(INDEX);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Uploaded sources are session-local: they live under the data directory and are cleared with the demo. */
export function listUploadedSources(): Promise<KnowledgeSource[]> {
  return serialised(async () => {
    const out: KnowledgeSource[] = [];
    for (const id of await ids()) {
      const value = await readJson<unknown>(fileOf(id));
      if (value !== null) out.push(parseKnowledgeSource(value));
    }
    return out;
  });
}

/** Saving the same document twice returns the one already stored; saving a withdrawn one again brings it back. */
export function saveUploadedSource(source: KnowledgeSource): Promise<{ source: KnowledgeSource; alreadyStored: boolean }> {
  return serialised(async () => {
    const list = await ids();
    const existing = await readJson<unknown>(fileOf(source.id));
    if (existing !== null) {
      const stored = parseKnowledgeSource(existing);
      if (stored.status !== "withdrawn") return { source: stored, alreadyStored: true };
      await writeJsonAtomic(fileOf(source.id), source);
      return { source, alreadyStored: false };
    }
    await writeJsonAtomic(fileOf(source.id), source);
    await writeJsonAtomic(INDEX, [...list, source.id]);
    return { source, alreadyStored: false };
  });
}

/** Withdrawing keeps the record and the audit trail; the source simply stops counting. */
export function withdrawUploadedSource(id: string): Promise<KnowledgeSource> {
  return serialised(async () => {
    const value = await readJson<unknown>(fileOf(id));
    if (value === null) throw new Error("That uploaded source does not exist");
    const withdrawn = { ...parseKnowledgeSource(value), status: "withdrawn" as const };
    await writeJsonAtomic(fileOf(id), withdrawn);
    return withdrawn;
  });
}
