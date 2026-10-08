import { createHash } from "node:crypto";
import { z } from "zod";
import type { BusinessEconomics } from "@/domain/business-economics";
import { knowledgeContentHash, parseKnowledgeSource } from "../source-schema";
import { KNOWLEDGE_SOURCE_SCHEMA, type KnowledgeSource } from "../types";
import { MAX_UPLOAD_CHARS, MAX_UPLOAD_LINES, UploadError, type UploadNote } from "./limits";
import { extractPdfText, PDF_EXTRACTOR } from "./pdf";
import { readUploadedSource } from "./proposals";

export const MERCHANT_ID = "merchant-pinecone";

export const uploadRequestSchema = z.object({
  title: z.string().trim().min(1).max(80),
  kind: z.enum(["rate_card", "cost_sheet"]),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(["csv", "text", "pdf"]),
  fileName: z.string().trim().max(120).nullable().default(null),
  text: z.string().max(MAX_UPLOAD_CHARS * 2).optional(),
  pdfBase64: z.string().max(2_200_000).optional(),
  /** The id of an active source this one replaces, so the older one stops counting. */
  supersedes: z.string().min(1).max(80).nullable().default(null),
}).strict();
export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export interface UploadResult {
  source: KnowledgeSource;
  proposalCount: number;
  considered: number;
  notes: UploadNote[];
  /** What was read from a PDF, shown to the merchant so they can see exactly what the product saw. */
  extractedText: string | null;
}

const ACCESS = { rate_card: "commercial", cost_sheet: "finance_restricted" } as const;
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** One standard form: no byte-order mark, \n line ends, no trailing blank lines. Citations are offsets into this text. */
export function normaliseUploadedText(raw: string): string {
  return raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Turn an upload into a knowledge source, or refuse it whole. Nothing is stored here. A document that yields no
 * price or cost for any of the merchant's own services is refused with the reason for every line it could not use.
 */
export async function ingestUpload(input: unknown, active: BusinessEconomics, now: string): Promise<UploadResult> {
  const request = uploadRequestSchema.parse(input);
  let content: string;
  let origin: NonNullable<KnowledgeSource["origin"]>;
  let extractedText: string | null = null;
  if (request.format === "pdf") {
    if (!request.pdfBase64) throw new UploadError("Choose a PDF file");
    const extracted = await extractPdfText(Buffer.from(request.pdfBase64, "base64"));
    content = normaliseUploadedText(extracted.text);
    extractedText = content;
    origin = { kind: "upload_pdf", fileName: request.fileName, fileSha256: extracted.fileSha256, pages: extracted.pages, extractor: PDF_EXTRACTOR, uploadedAt: now };
  } else {
    if (!request.text?.trim()) throw new UploadError("The document is empty");
    content = normaliseUploadedText(request.text);
    origin = { kind: request.format === "csv" ? "upload_csv" : "upload_text", fileName: request.fileName, fileSha256: null, pages: null, extractor: null, uploadedAt: now };
  }
  if (!content) throw new UploadError("The document is empty");
  if (content.length > MAX_UPLOAD_CHARS) throw new UploadError(`The document is longer than ${MAX_UPLOAD_CHARS} characters`);
  if (content.split("\n").length > MAX_UPLOAD_LINES) throw new UploadError(`The document has more than ${MAX_UPLOAD_LINES} lines`);

  const contentHash = knowledgeContentHash(content);
  const source = parseKnowledgeSource({
    schema: KNOWLEDGE_SOURCE_SCHEMA,
    id: `upload-${sha(`${request.kind}:${request.title}:${contentHash}`).slice(0, 16)}`,
    merchantId: MERCHANT_ID,
    buyerId: null,
    title: request.title,
    kind: request.kind,
    format: request.format === "csv" ? "csv" : "text",
    access: ACCESS[request.kind],
    effectiveFrom: request.effectiveFrom,
    effectiveTo: null,
    supersedes: request.supersedes,
    status: "active",
    content,
    contentHash,
    indexedAt: now,
    origin,
  });
  const reading = readUploadedSource(active, source);
  if (reading.proposals.length === 0) {
    throw new UploadError(`No ${request.kind === "rate_card" ? "prices" : "costs"} for your services were found. Each line or row must name one of your services and give exactly one amount.`, reading.notes.slice(0, 20));
  }
  return { source, proposalCount: reading.proposals.length, considered: reading.considered, notes: reading.notes.slice(0, 20), extractedText };
}
