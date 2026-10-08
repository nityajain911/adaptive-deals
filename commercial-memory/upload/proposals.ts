import { createHash } from "node:crypto";
import type { BusinessEconomics } from "@/domain/business-economics";
import { instructionSpans } from "@/assist/profile/verify";
import type { EconomicsEvidenceProposal } from "../economics-draft";
import type { KnowledgeSource } from "../types";
import { mapColumns, parseCsv, type CsvRow } from "./csv";
import { moneyMentions, namesSeveralServices, readLine, serviceAtStart, servicesIn, singleAmount, type ServiceRef } from "./lines";
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
      if (named.length !== 1) return { service: null, rupees: null, note: { line: row.text, reason: named.length ? "More than one service is named in this row" : "The service is not one of your services in Prices & costs" } };
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

/** The most lines a service's description may run before its price. A price the line reader cannot reach is reported, never guessed. */
const MAX_BLOCK_LINES = 6;

/**
 * Plain text and PDF text. A line that starts with one of the merchant's services begins a block: the service's
 * own line and any wrapped description lines, up to the first line that states money. That line's single amount
 * is the price, and the quote runs from the service name to the end of that line. Services named only in a
 * description are ignored; a line that joins two services is refused.
 */
function readText(active: BusinessEconomics, source: KnowledgeSource, services: ServiceRef[]): UploadReading {
  const spans = instructionSpans(source.content);
  const proposals: EconomicsEvidenceProposal[] = [];
  const notes: UploadNote[] = [];
  const lines: { text: string; start: number; end: number }[] = [];
  let cursor = 0;
  for (const text of source.content.split("\n")) {
    lines.push({ text, start: cursor, end: cursor + text.length });
    cursor += text.length + 1;
  }
  let considered = 0;
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!;
    if (!line.text.trim()) { i += 1; continue; }
    const first = serviceAtStart(line.text, services);
    if (!first) {
      // Not the start of a service entry. A line that names exactly one service and one amount elsewhere ("Prices: Website fixes - Rs 26,000") is still read as one line.
      const reading = readLine(line.text, line.start, services);
      i += 1;
      if (!reading.service && reading.note?.reason.startsWith("No service")) continue;
      // Prose that merely mentions a service and states no money at all ("... except monthly reporting, which depends on ...") is not an entry.
      if (reading.service && moneyMentions(line.text).length === 0) continue;
      considered += 1;
      if (overlaps(spans, line.start, line.end)) notes.push({ line: line.text, reason: "This line looks like an instruction, so it was ignored" });
      else if (FORMULA.test(line.text.trim())) notes.push({ line: line.text, reason: "The line starts with =, +, - or @, so it was ignored" });
      else if (reading.note) notes.push(reading.note);
      else if (reading.service && reading.rupees !== null) {
        const proposal = proposalFor(active, source, reading.service, reading.rupees, line.start, line.end);
        if (proposal) proposals.push(proposal);
      }
      continue;
    }
    considered += 1;
    if (FORMULA.test(line.text.trim())) { notes.push({ line: line.text, reason: "The line starts with =, +, - or @, so it was ignored" }); i += 1; continue; }
    if (namesSeveralServices(line.text, first, services)) { notes.push({ line: line.text, reason: "More than one service is named on this line" }); i += 1; continue; }
    // Find the first line, from this one, that states money; stop at a blank line, the next service entry, or the limit.
    let k = i;
    let found = -1;
    for (; k < Math.min(lines.length, i + MAX_BLOCK_LINES); k += 1) {
      const candidate = lines[k]!;
      if (k > i && (!candidate.text.trim() || serviceAtStart(candidate.text, services))) break;
      const text = k === i ? candidate.text.replace(LEAD_NAME(first), " ") : candidate.text;
      if (moneyMentions(text).length) { found = k; break; }
    }
    if (found < 0) {
      notes.push({ line: line.text, reason: `No amount was found for ${first.name} on this line or the lines after it` });
      i = Math.max(i + 1, k);
      continue;
    }
    const end = lines[found]!.end;
    const amountText = found === i ? line.text.replace(LEAD_NAME(first), " ") : lines[found]!.text;
    const rupees = singleAmount(amountText);
    const quoteText = source.content.slice(line.start, end);
    if (overlaps(spans, line.start, end)) notes.push({ line: quoteText.split("\n")[0]!, reason: "This entry looks like an instruction, so it was ignored" });
    else if (rupees === null) notes.push({ line: line.text, reason: `The line with ${first.name}'s amount must state exactly one amount` });
    else {
      const proposal = proposalFor(active, source, first, rupees, line.start, end);
      if (proposal) proposals.push(proposal);
    }
    i = found + 1;
  }
  return { proposals, notes, considered };
}

/** A matcher for the service's own name, so digits inside it are never read as money. */
const LEAD_NAME = (service: ServiceRef) => new RegExp(esc(service.name), "i");
const esc = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Proposed prices or costs from an uploaded source, each quoting the exact line or row it came from. Never guesses. */
export function readUploadedSource(active: BusinessEconomics, source: KnowledgeSource): UploadReading {
  const services = active.services.map((service) => ({ id: service.id, name: service.name }));
  return source.format === "csv" ? readCsv(active, source, services) : readText(active, source, services);
}
