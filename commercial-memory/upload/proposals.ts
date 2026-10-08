import { createHash } from "node:crypto";
import type { BusinessEconomics } from "@/domain/business-economics";
import { instructionSpans } from "@/assist/profile/verify";
import type { EconomicsEvidenceProposal } from "../economics-draft";
import type { KnowledgeSource } from "../types";
import { mapColumns, parseCsv, type CsvRow } from "./csv";
import { readLine, servicesIn, singleAmount, type ServiceRef } from "./lines";
import type { UploadNote } from "./limits";

const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const FORMULA = /^[=+\-@]/;

export interface UploadReading {
  proposals: EconomicsEvidenceProposal[];
  notes: UploadNote[];
  /** How many lines or rows were looked at (a header does not count). */
  considered: number;
}

type Reader = { service: ServiceRef | null; rupees: number | null; note: UploadNote | null };

function proposalFor(active: BusinessEconomics, source: KnowledgeSource, service: ServiceRef, rupees: number, start: number, end: number): EconomicsEvidenceProposal | null {
  const field = source.kind === "rate_card" ? `services.${service.id}.listPricePaise` : `services.${service.id}.directCostPaise`;
  const current = active.services.find((item) => item.id === service.id);
  if (!current) return null;
  const proposedValue = Math.round(rupees * 100);
  if (!Number.isSafeInteger(proposedValue) || proposedValue <= 0) return null;
  return {
    id: `claim-${sha(`${field}:${source.id}:${proposedValue}:${start}:${end}`).slice(0, 20)}`,
    field,
    serviceId: service.id,
    serviceName: service.name,
    proposedValue,
    currentValue: source.kind === "rate_card" ? current.listPricePaise : current.directCostPaise,
    sourceId: source.id,
    sourceTitle: source.title,
    sourceHash: source.contentHash,
    quote: source.content.slice(start, end),
    start,
    end,
    status: "supported",
  };
}

const overlaps = (spans: { start: number; end: number }[], start: number, end: number) => spans.some((span) => start < span.end && end > span.start);

function readCsv(active: BusinessEconomics, source: KnowledgeSource, services: ServiceRef[]): UploadReading {
  const { rows } = parseCsv(source.content);
  const spans = instructionSpans(source.content);
  const map = rows[0] ? mapColumns(rows[0]) : null;
  const wantsPrice = source.kind === "rate_card";
  const data: CsvRow[] = map ? rows.slice(1) : rows;
  const amountColumn = map ? (wantsPrice ? map.price : map.cost) : 1;
  const serviceColumn = map ? map.service : 0;
  const proposals: EconomicsEvidenceProposal[] = [];
  const notes: UploadNote[] = [];
  if (map && amountColumn === null) {
    notes.push({ line: rows[0]!.text, reason: wantsPrice ? "This rate card has no price column" : "This cost sheet has no cost column" });
    return { proposals, notes, considered: 0 };
  }
  for (const row of data) {
    const read = (): Reader => {
      if (overlaps(spans, row.start, row.end)) return { service: null, rupees: null, note: { line: row.text, reason: "This line looks like an instruction, so it was ignored" } };
      if (row.cells.some((cell) => FORMULA.test(cell.text))) return { service: null, rupees: null, note: { line: row.text, reason: "A cell starts with =, +, - or @ (a formula or negative value), so the row was ignored" } };
      const named = servicesIn(row.cells[serviceColumn]?.text ?? "", services);
      if (named.length !== 1) return { service: null, rupees: null, note: { line: row.text, reason: named.length ? "More than one service is named in this row" : "The service is not one of your services in Business economics" } };
      const rupees = singleAmount(row.cells[amountColumn!]?.text ?? "", named[0]!);
      return rupees === null ? { service: named[0]!, rupees: null, note: { line: row.text, reason: "The amount column must hold exactly one amount" } } : { service: named[0]!, rupees, note: null };
    };
    const result = read();
    if (result.note || !result.service || result.rupees === null) {
      if (result.note) notes.push(result.note);
      continue;
    }
    const proposal = proposalFor(active, source, result.service, result.rupees, row.start, row.end);
    if (proposal) proposals.push(proposal);
  }
  return { proposals, notes, considered: data.length };
}

function readText(active: BusinessEconomics, source: KnowledgeSource, services: ServiceRef[]): UploadReading {
  const spans = instructionSpans(source.content);
  const proposals: EconomicsEvidenceProposal[] = [];
  const notes: UploadNote[] = [];
  let considered = 0;
  let cursor = 0;
  for (const line of source.content.split("\n")) {
    const start = cursor;
    cursor += line.length + 1;
    if (!line.trim()) continue;
    const reading = readLine(line, start, services);
    // A line that names no service is a heading or prose: not a data line, and not worth a note.
    if (!reading.service && reading.note?.reason.startsWith("No service")) continue;
    considered += 1;
    if (overlaps(spans, start, start + line.length)) {
      notes.push({ line, reason: "This line looks like an instruction, so it was ignored" });
      continue;
    }
    if (FORMULA.test(line.trim())) {
      notes.push({ line, reason: "The line starts with =, +, - or @, so it was ignored" });
      continue;
    }
    if (reading.note || !reading.service || reading.rupees === null) {
      if (reading.note) notes.push(reading.note);
      continue;
    }
    const proposal = proposalFor(active, source, reading.service, reading.rupees, start, start + line.length);
    if (proposal) proposals.push(proposal);
  }
  return { proposals, notes, considered };
}

/** Proposed prices or costs from an uploaded source, each quoting the exact line or row it came from. Never guesses. */
export function readUploadedSource(active: BusinessEconomics, source: KnowledgeSource): UploadReading {
  const services = active.services.map((service) => ({ id: service.id, name: service.name }));
  return source.format === "csv" ? readCsv(active, source, services) : readText(active, source, services);
}
