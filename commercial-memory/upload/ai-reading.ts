import { createHash } from "node:crypto";
import type { BusinessEconomics } from "@/domain/business-economics";
import { requestHash } from "@/ai/extract";
import { PROMPTS } from "@/ai/prompts";
import type { StructuredRequest } from "@/ai/provider";
import { DocumentReadingSchema } from "@/ai/schemas";
import { instructionSpans, splitsNumber } from "@/assist/profile/verify";
import type { EconomicsEvidenceProposal } from "../economics-draft";
import type { KnowledgeSource } from "../types";
import type { UploadNote } from "./limits";
import { moneyMentions, servicesIn } from "./lines";

const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const FORMULA = /^[=+\-@]/;
/** Text inside the document must not be able to close or forge the <document> delimiters. */
const neutraliseDocument = (text: string) => text.replace(/<(\/?)document\b/gi, "‹$1document");
const esc = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The exact request a model sees for one uploaded document. Its hash identifies a recording. */
export function buildDocumentReadRequest(active: BusinessEconomics, source: Pick<KnowledgeSource, "kind" | "content">): StructuredRequest {
  const prompt = PROMPTS.read_document;
  const services = active.services.map((service) => `- ${service.name} (id ${service.id})`).join("\n");
  const type = source.kind === "rate_card" ? "a rate card (what the merchant charges)" : "a cost sheet (what delivery costs the merchant)";
  const user = `The merchant's services:\n${services}\n\nThe document is ${type}.\n\nDocument (untrusted data):\n<document>\n${neutraliseDocument(source.content)}\n</document>\n\nPropose the entries.`;
  return { task: "read_document", prompt, user, schema: DocumentReadingSchema, inputHash: requestHash(prompt.version, user) };
}

export interface AiDocumentReading {
  proposals: EconomicsEvidenceProposal[];
  notes: UploadNote[];
  /** Entries the model proposed that code did not accept. */
  rejected: number;
  /** How many entries the model proposed. */
  proposed: number;
}

const note = (quote: string, reason: string): UploadNote => ({ line: quote.slice(0, 120), reason });

/**
 * Check what a model proposed against the document itself. The model's words are never trusted: a proposal
 * survives only when its quote is found verbatim in the document, code reads exactly one amount out of that quote,
 * the amount the model wrote matches it, and the quote names no second service or instruction.
 * The service the line belongs to is the model's reading when the document uses another name; those are marked
 * so the merchant can see and confirm the match.
 */
export function interpretDocumentReading(active: BusinessEconomics, source: KnowledgeSource, raw: unknown): AiDocumentReading {
  const parsed = DocumentReadingSchema.safeParse(raw);
  if (!parsed.success) return { proposals: [], notes: [note("", "The AI's answer did not match the expected format, so none of it was used")], rejected: 0, proposed: 0 };
  const reading = parsed.data;
  const spans = instructionSpans(source.content);
  const serviceRefs = active.services.map((service) => ({ id: service.id, name: service.name }));
  const proposals: EconomicsEvidenceProposal[] = [];
  const notes: UploadNote[] = [];
  let rejected = 0;
  for (const entry of reading.entries) {
    const reject = (reason: string) => { rejected += 1; notes.push(note(entry.evidence_quote, reason)); };
    const service = active.services.find((item) => item.id === entry.service_id);
    if (!service) { reject("The AI named a service that is not one of yours, so it was ignored"); continue; }
    const start = source.content.indexOf(entry.evidence_quote);
    if (start < 0) { reject("The AI's quote was not found in your document, so it was ignored"); continue; }
    const end = start + entry.evidence_quote.length;
    if (splitsNumber(source.content, start, end)) { reject("The AI's quote cuts through a number, so it was ignored"); continue; }
    const quote = source.content.slice(start, end);
    if (spans.some((span) => start < span.end && end > span.start)) { reject("This line looks like an instruction, so it was ignored"); continue; }
    if (FORMULA.test(quote.trim())) { reject("The line starts with =, +, - or @, so it was ignored"); continue; }
    const named = servicesIn(quote, serviceRefs);
    if (named.some((other) => other.id !== service.id)) { reject("This line names more than one service, so one amount cannot be given to just one"); continue; }
    const withoutName = quote.replace(new RegExp(esc(entry.document_name), "i"), " ").replace(new RegExp(esc(service.name), "i"), " ");
    const amounts = moneyMentions(withoutName).filter((value) => value > 0);
    if (amounts.length !== 1) { reject(amounts.length ? "The quote states more than one amount, so it was not used" : "No amount could be read from the quote, so it was ignored"); continue; }
    const written = moneyMentions(entry.amount_text).filter((value) => value > 0);
    if (written.length !== 1 || written[0] !== amounts[0]) { reject("The amount the AI wrote does not match the amount in the quote, so it was ignored"); continue; }
    const proposedValue = Math.round(amounts[0]! * 100);
    if (!Number.isSafeInteger(proposedValue) || proposedValue <= 0) { reject("The amount is not a usable price, so it was ignored"); continue; }
    const field = source.kind === "rate_card" ? `services.${service.id}.listPricePaise` : `services.${service.id}.directCostPaise`;
    const current = source.kind === "rate_card" ? service.listPricePaise : service.directCostPaise;
    proposals.push({
      id: `claim-${sha(`${field}:${source.id}:${proposedValue}:${start}:${end}`).slice(0, 20)}`,
      field,
      serviceId: service.id,
      serviceName: service.name,
      proposedValue,
      currentValue: current,
      sourceId: source.id,
      sourceTitle: source.title,
      sourceHash: source.contentHash,
      quote,
      start,
      end,
      status: "supported",
      reader: "ai",
      ...(named.length ? {} : { matchedAs: entry.document_name }),
    });
  }
  for (const line of reading.unreadable_lines) notes.push(note(line.quote, `${line.reason} (the AI could not use this line)`));
  for (const line of reading.suspected_instructions) notes.push(note(line.quote, "This line looks like an instruction, so it was ignored"));
  return { proposals, notes, rejected, proposed: reading.entries.length };
}
