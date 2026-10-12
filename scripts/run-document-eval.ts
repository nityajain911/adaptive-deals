/**
 * Scores the recorded AI readings of the four evaluation documents. Makes no model call: it replays the stored
 * answers through the same code checks the product uses, and compares what survives with what a careful person
 * would accept. Also corrupts a recorded answer in five ways to show the checks catching each.
 *
 *   npx tsx --conditions=react-server scripts/run-document-eval.ts            (prints the report)
 *   npx tsx --conditions=react-server scripts/run-document-eval.ts --write    (writes docs/DOCUMENT_READING_EVAL.md)
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defaultEconomics } from "@/lib/economics-default";
import { DocumentReadingSchema, type DocumentReading } from "@/ai/schemas";
import { interpretDocumentReading, buildDocumentReadRequest } from "@/commercial-memory/upload/ai-reading";
import { readUploadedSource } from "@/commercial-memory/upload/proposals";
import { mergeDocumentReadings } from "@/commercial-memory/economics-draft";
import { readManifest, sourceOf } from "./document-eval-shared";

const active = defaultEconomics();
const name = (id: string) => active.services.find((service) => service.id === id)?.name ?? id;
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;
const byService = (proposals: { serviceId: string; proposedValue: number }[]) => new Map(proposals.map((p) => [p.serviceId, p.proposedValue]));

interface Recording { id: string; inputHash: string; promptVersion: string; model: string; provider: string; usage?: { inputTokens: number; outputTokens: number } | null; rawOutput: unknown }

function score(accepted: Map<string, number>, expected: Record<string, number>, acceptable: Record<string, number> = {}) {
  let correct = 0;
  const missed: string[] = [];
  const wrong: string[] = [];
  for (const [id, value] of Object.entries(expected)) {
    if (accepted.get(id) === value) correct += 1; else if (accepted.has(id)) wrong.push(`${name(id)} ${rupees(accepted.get(id)!)}`); else missed.push(name(id));
  }
  for (const [id, value] of accepted) {
    if (id in expected) continue;
    if (acceptable[id] === value) { correct += 1; continue; }
    wrong.push(`${name(id)} ${rupees(value)}`);
  }
  return { correct, missed, wrong };
}

async function main() {
  const lines: string[] = [];
  const out = (line = "") => lines.push(line);
  out("# Reading rate cards: how the AI reader was checked");
  out();
  out("Four documents, each read once by Cerebras `gpt-oss-120b` (prompt `read_document.v1`), recorded as it came and then scored here with **no further model call**. The model's answer is never used directly: code checks every proposed value against the document (the quote must be in it, exactly one amount must be readable from the quote, it must match the amount the AI wrote, and the quote must not name a second service or contain an instruction).");
  out();
  out("Expected values are what a careful person would accept. A value is *wrong* if it was accepted and is not the expected one. These are four documents, so this shows the checks working, not a measured accuracy rate.");
  out();
  out("| Document | AI proposed | Passed the code checks | Correct | Missed | Wrong value accepted | Built-in line reader alone |");
  out("| --- | ---: | ---: | ---: | --- | --- | ---: |");
  const detail: string[] = [];
  let tamperBase: { raw: DocumentReading; source: Awaited<ReturnType<typeof sourceOf>> } | null = null;
  let tokens = 0;
  for (const doc of readManifest()) {
    const source = await sourceOf(doc);
    const recording = JSON.parse(readFileSync(path.join(process.cwd(), `data/document-readings/${doc.id}.json`), "utf8")) as Recording;
    if (recording.inputHash !== buildDocumentReadRequest(active, source).inputHash) throw new Error(`${doc.id}: the recording is for a different request than the document now produces`);
    tokens += (recording.usage?.inputTokens ?? 0) + (recording.usage?.outputTokens ?? 0);
    const parsed = DocumentReadingSchema.safeParse(recording.rawOutput);
    if (!parsed.success) throw new Error(`${doc.id}: the recorded answer does not match the schema`);
    if (doc.id === "clean-rate-card") tamperBase = { raw: parsed.data, source };
    const ai = interpretDocumentReading(active, source, recording.rawOutput);
    const rules = readUploadedSource(active, source);
    const merged = mergeDocumentReadings(rules, ai);
    const aiScore = score(byService(ai.proposals), doc.expected, doc.acceptable);
    const rulesScore = score(byService(rules.proposals), doc.expected, doc.acceptable);
    const bothScore = score(byService(merged.proposals), doc.expected, doc.acceptable);
    out(`| ${doc.role} | ${ai.proposed} | ${ai.proposals.length} | ${aiScore.correct}/${Object.keys(doc.expected).length} | ${aiScore.missed.join(", ") || "none"} | ${aiScore.wrong.join(", ") || "none"} | ${rulesScore.correct}/${Object.keys(doc.expected).length} |`);
    detail.push(`### ${doc.role} (\`${doc.id}\`)`, "", "```", readFileSync(path.join(process.cwd(), doc.file), "utf8").trimEnd(), "```", "");
    detail.push(`- The AI proposed ${ai.proposed} line${ai.proposed === 1 ? "" : "s"}; ${ai.proposals.length} passed the checks${ai.rejected ? ` and ${ai.rejected} did not` : ""}.`);
    for (const p of ai.proposals) detail.push(`  - kept: ${p.serviceName} ${rupees(p.proposedValue)}${p.matchedAs ? ` (document says “${p.matchedAs}”, matched by the AI)` : ""}`);
    for (const note of ai.notes) detail.push(`  - not used: “${note.line.slice(0, 70)}” · ${note.reason}`);
    detail.push(`- Built-in line reader alone: ${rules.proposals.length} value${rules.proposals.length === 1 ? "" : "s"}${rulesScore.missed.length ? `; missed ${rulesScore.missed.join(", ")}` : ""}.`);
    detail.push(`- Both readers together (what the merchant sees): ${bothScore.correct}/${Object.keys(doc.expected).length} correct${bothScore.wrong.length ? `; wrong: ${bothScore.wrong.join(", ")}` : "; nothing wrong accepted"}.`, "");
  }
  out();
  out(`Recorded tokens across the four requests: ${tokens.toLocaleString("en-IN")}.`);
  out();
  out("## Document by document");
  out();
  lines.push(...detail);

  out("## Does the check catch a wrong AI answer?");
  out();
  out("In these four runs the model made no mistake the checks had to catch, so they were not exercised by the model itself. A live model may make a given mistake some other day, so five mistakes were put into a recorded answer on purpose (the clean rate card's). Each must be dropped.");
  out();
  out("| Mistake put in | Result |");
  out("| --- | --- |");
  if (!tamperBase) throw new Error("no clean recording");
  const { raw, source } = tamperBase;
  const first = raw.entries[0]!;
  const cases: [string, DocumentReading][] = [
    ["A quote that is not in the document", { ...raw, entries: [{ ...first, evidence_quote: first.evidence_quote.replace("26,000", "24,000") }] }],
    ["An amount that is not the amount in the quote", { ...raw, entries: [{ ...first, amount_text: "Rs 2,600" }] }],
    ["A made-up line for a service not in the document", { ...raw, entries: [{ service_id: "website-fixes", document_name: "Website fixes", amount_text: "Rs 1", evidence_quote: "Website fixes,1,One time" }] }],
    ["A price given to a service not on the merchant's list", { ...raw, entries: [{ ...first, service_id: "podcast" }] }],
    ["A bundle given to a single service", { ...raw, entries: [{ ...first, evidence_quote: "Website fixes,\"26,000\",One time\nSearch marketing,\"4,500\",Per month" }] }],
  ];
  for (const [label, tampered] of cases) {
    const result = interpretDocumentReading(active, source, tampered);
    out(`| ${label} | ${result.proposals.length === 0 ? "dropped: " + (result.notes[0]?.reason ?? "") : "**accepted (a gap)**"} |`);
  }
  out();
  out("## What the checks cannot do");
  out();
  out("- They cannot tell whether an amount that is really in the document is the *price* of that service (for example a discount example beside a price). The merchant sees the exact quote beside every value before anything is applied.");
  out("- When the document uses another name for a service, the match comes from the AI. It is marked “matched by the AI” in the review and the merchant confirms it.");
  out("- Four documents are a demonstration of the design, not a measurement of accuracy.");
  const text = lines.join("\n") + "\n";
  if (process.argv.includes("--write")) { writeFileSync(path.join(process.cwd(), "docs/DOCUMENT_READING_EVAL.md"), text); console.log("written docs/DOCUMENT_READING_EVAL.md"); } else console.log(text);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "failed"); process.exit(1); });
