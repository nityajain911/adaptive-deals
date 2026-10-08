import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { chunkSource } from "./chunker";
import { retrieveCommercialEvidence, validateCitation } from "./retrieval";
import { loadBundledKnowledgeSources } from "./source-schema";
import type { KnowledgeAccess } from "./types";

const accessSchema = z.enum(["merchant_wide", "commercial", "finance_restricted", "buyer_specific"]);

const caseSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  access: z.array(accessSchema).min(1),
  buyerId: z.string().min(1).nullable(),
  expectedSourceId: z.string().min(1).nullable(),
  abstain: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.abstain === (value.expectedSourceId !== null)) {
    context.addIssue({ code: "custom", path: ["expectedSourceId"], message: "Abstention cases cannot name an expected source" });
  }
});

const datasetSchema = z.object({
  schema: z.literal("adaptive-deals.commercial-memory-eval.v1"),
  authorship: z.string().min(1),
  cases: z.array(caseSchema).min(1),
}).strict();

const freezeSchema = z.object({
  schema: z.literal("adaptive-deals.commercial-memory-freeze.v1"),
  frozenAt: z.string().min(1),
  caseFile: z.literal("cases.json"),
  caseSetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  promptVersion: z.string().min(1),
  status: z.string().min(1),
}).strict();

export type CommercialMemoryEvaluationCase = z.infer<typeof caseSchema> & { access: KnowledgeAccess[] };
export type CommercialMemoryFreeze = z.infer<typeof freezeSchema>;

export interface CountResult { correct: number; total: number }

export interface CommercialMemoryEvaluationReport {
  cases: number;
  expectedSourceTop3: CountResult;
  expectedSourceTop5: CountResult;
  abstentions: CountResult;
  crossMerchantChunks: number;
  supersededSourcesUsed: number;
  validCitations: CountResult;
  misses: Array<{ caseId: string; reason: string }>;
}

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export function loadCommercialMemoryEvaluation(root = process.cwd()): {
  cases: CommercialMemoryEvaluationCase[];
  authorship: string;
  hash: string;
  freeze: CommercialMemoryFreeze;
} {
  const directory = path.join(root, "evaluation/commercial-memory");
  const rawCases = readFileSync(path.join(directory, "cases.json"), "utf8");
  const dataset = datasetSchema.parse(JSON.parse(rawCases));
  return {
    cases: dataset.cases,
    authorship: dataset.authorship,
    hash: digest(rawCases),
    freeze: freezeSchema.parse(JSON.parse(readFileSync(path.join(directory, "FREEZE.json"), "utf8"))),
  };
}

export function runLexicalCommercialMemoryEvaluation(cases: CommercialMemoryEvaluationCase[], root = process.cwd()): CommercialMemoryEvaluationReport {
  const sources = loadBundledKnowledgeSources(root);
  const chunks = sources.flatMap(chunkSource);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const report: CommercialMemoryEvaluationReport = {
    cases: cases.length,
    expectedSourceTop3: { correct: 0, total: 0 },
    expectedSourceTop5: { correct: 0, total: 0 },
    abstentions: { correct: 0, total: 0 },
    crossMerchantChunks: 0,
    supersededSourcesUsed: 0,
    validCitations: { correct: 0, total: 0 },
    misses: [],
  };

  for (const evaluationCase of cases) {
    const result = retrieveCommercialEvidence(evaluationCase.query, {
      merchantId: "merchant-pinecone",
      buyerId: evaluationCase.buyerId,
      asOf: "2026-10-08",
      allowedAccess: evaluationCase.access,
      limit: 8,
    }, sources, chunks);

    if (evaluationCase.abstain) {
      report.abstentions.total += 1;
      if (result.status === "insufficient_evidence") report.abstentions.correct += 1;
      else report.misses.push({ caseId: evaluationCase.id, reason: "expected abstention" });
    } else {
      report.expectedSourceTop3.total += 1;
      report.expectedSourceTop5.total += 1;
      if (result.candidates.slice(0, 3).some((candidate) => candidate.sourceId === evaluationCase.expectedSourceId)) report.expectedSourceTop3.correct += 1;
      else report.misses.push({ caseId: evaluationCase.id, reason: "expected source absent from top 3" });
      if (result.candidates.slice(0, 5).some((candidate) => candidate.sourceId === evaluationCase.expectedSourceId)) report.expectedSourceTop5.correct += 1;
    }

    for (const candidate of result.candidates) {
      const source = sourceById.get(candidate.sourceId);
      if (!source) continue;
      if (candidate.merchantId !== "merchant-pinecone") report.crossMerchantChunks += 1;
      if (source.status !== "active") report.supersededSourcesUsed += 1;
      report.validCitations.total += 1;
      const citation = { start: candidate.start, end: candidate.end, quote: candidate.text };
      if (validateCitation(source, candidate, citation).ok) report.validCitations.correct += 1;
    }
  }
  return report;
}
