import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { KNOWLEDGE_SOURCE_SCHEMA, type KnowledgeSource } from "./types";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const sourceSchema = z.object({
  schema: z.literal(KNOWLEDGE_SOURCE_SCHEMA),
  id: z.string().min(1),
  merchantId: z.string().min(1),
  buyerId: z.string().min(1).nullable(),
  title: z.string().min(1),
  kind: z.enum(["rate_card", "cost_sheet", "policy", "service_rules", "proposal", "buyer_history", "tone_guide"]),
  format: z.enum(["text", "csv"]),
  access: z.enum(["merchant_wide", "commercial", "finance_restricted", "buyer_specific"]),
  effectiveFrom: z.string().regex(isoDate),
  effectiveTo: z.string().regex(isoDate).nullable(),
  supersedes: z.string().min(1).nullable(),
  status: z.enum(["active", "superseded", "withdrawn"]),
  content: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  indexedAt: z.string().datetime({ offset: true }),
  origin: z.object({
    kind: z.enum(["upload_csv", "upload_text", "upload_pdf"]),
    fileName: z.string().max(120).nullable(),
    fileSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    pages: z.number().int().positive().nullable(),
    extractor: z.string().max(60).nullable(),
    uploadedAt: z.string().datetime({ offset: true }),
  }).strict().optional(),
}).strict().superRefine((source, context) => {
  if (source.access === "buyer_specific" && !source.buyerId) {
    context.addIssue({ code: "custom", path: ["buyerId"], message: "Buyer-specific sources require a buyer" });
  }
  if (source.effectiveTo && source.effectiveTo < source.effectiveFrom) {
    context.addIssue({ code: "custom", path: ["effectiveTo"], message: "The end date cannot precede the effective date" });
  }
  if (source.supersedes === source.id) {
    context.addIssue({ code: "custom", path: ["supersedes"], message: "A source cannot supersede itself" });
  }
});

export const knowledgeContentHash = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");

export function parseKnowledgeSource(input: unknown): KnowledgeSource {
  const source = sourceSchema.parse(input);
  if (knowledgeContentHash(source.content) !== source.contentHash) throw new Error(`Knowledge source ${source.id} content hash does not match`);
  return source;
}

export function loadBundledKnowledgeSources(root = process.cwd()): KnowledgeSource[] {
  const directory = path.join(root, "data/commercial-memory");
  const manifest = z.object({ schema: z.literal("adaptive-deals.knowledge-manifest.v1"), files: z.array(z.string().regex(/^[a-z0-9-]+\.json$/)).min(1) }).strict()
    .parse(JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8")));
  return manifest.files.map((file) => parseKnowledgeSource(JSON.parse(readFileSync(path.join(directory, file), "utf8"))));
}
