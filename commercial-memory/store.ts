import "server-only";
import { z } from "zod";
import { readJson, serialised, writeJsonAtomic } from "@/lib/store";

const retrievalRunSchema = z.object({
  id: z.string().min(1), merchantId: z.string().min(1), buyerId: z.string().min(1).nullable(), query: z.string().min(1), normalisedQuery: z.string(),
  eligibleSourceIds: z.array(z.string()), candidateChunkIds: z.array(z.string()), selectedChunkIds: z.array(z.string()),
  ranking: z.enum(["live_ai", "recorded_ai", "code"]), status: z.enum(["found", "insufficient_evidence", "conflicting_evidence"]),
  createdAt: z.string().datetime({ offset: true }),
}).strict();

const confirmationSchema = z.object({
  id: z.string().min(1), retrievalRunId: z.string().min(1), field: z.string().min(1), claimId: z.string().min(1),
  decision: z.enum(["confirmed", "rejected"]), decidedBy: z.string().min(1), decidedAt: z.string().datetime({ offset: true }), reason: z.string().min(1).nullable(),
}).strict();

export type RetrievalRunRecord = z.infer<typeof retrievalRunSchema>;
export type EvidenceConfirmation = z.infer<typeof confirmationSchema>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const runFile = (id: string) => `retrieval/runs/${id}.json`;
const confirmationsFile = "retrieval/confirmations.json";

export function getRetrievalRun(id: string): Promise<RetrievalRunRecord | null> {
  return serialised(async () => {
    const value = await readJson<unknown>(runFile(id));
    return value === null ? null : retrievalRunSchema.parse(value);
  });
}

export function recordRetrievalRun(input: RetrievalRunRecord): Promise<RetrievalRunRecord> {
  return serialised(async () => {
    const record = retrievalRunSchema.parse(input);
    const existing = await readJson<unknown>(runFile(record.id));
    if (existing !== null) {
      const parsed = retrievalRunSchema.parse(existing);
      if (!same(parsed, record)) throw new Error(`Retrieval run ${record.id} already exists with different content`);
      return parsed;
    }
    await writeJsonAtomic(runFile(record.id), record);
    return record;
  });
}

export function listEvidenceConfirmations(retrievalRunId: string): Promise<EvidenceConfirmation[]> {
  return serialised(async () => {
    const value = await readJson<unknown>(confirmationsFile);
    const records = value === null ? [] : z.array(confirmationSchema).parse(value);
    return records.filter((record) => record.retrievalRunId === retrievalRunId);
  });
}

export function recordEvidenceConfirmation(input: EvidenceConfirmation): Promise<EvidenceConfirmation> {
  return serialised(async () => {
    const record = confirmationSchema.parse(input);
    const value = await readJson<unknown>(confirmationsFile);
    const records = value === null ? [] : z.array(confirmationSchema).parse(value);
    const existing = records.find((item) => item.id === record.id);
    if (existing) {
      if (!same(existing, record)) throw new Error(`Evidence confirmation ${record.id} already exists with different content`);
      return existing;
    }
    records.push(record);
    await writeJsonAtomic(confirmationsFile, records);
    return record;
  });
}
