import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { promptHash, PROMPTS } from "@/ai/prompts";
import { buildReviewReadRequest, verifyReviewReading, type ReviewReadingVerdict } from "./review-reading";
import type { ServicePackage } from "@/domain/types";
import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";

/** One recorded Cerebras reading of a buyer's answer at the review, as `scripts/record-review-readings.ts` kept it. */
interface RecordedReading {
  id: string;
  replyText: string;
  inputHash: string;
  promptVersion: string;
  promptHash: string;
  provider: string;
  model: string;
  rawOutput: unknown;
}

const DIR = () => path.join(/*turbopackIgnore: true*/ process.cwd(), "data/review-readings");

function recordings(): RecordedReading[] {
  try {
    return readdirSync(DIR()).filter((f) => f.startsWith("review-") && f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(DIR(), f), "utf8")) as RecordedReading);
  } catch {
    return [];
  }
}

export type ReviewReadingOutcome =
  | { read: true; verdict: Extract<ReviewReadingVerdict, { ok: true }>; model: string; provider: string; line: string }
  | { read: false; why: string };

/**
 * What the model recorded for exactly this reply, checked again by code now. A reply with no recording for it, whose recording
 * was made with a different prompt, or whose recorded reading code rejects, is not read: the merchant reads it, as for any typed reply.
 */
export function readReviewReply(replyText: string, replyTimestamp: string, timeZone: string, packages: Pick<ServicePackage, "id" | "name">[]): ReviewReadingOutcome {
  const request = buildReviewReadRequest(replyText);
  const recorded = recordings().find((r) => r.inputHash === request.inputHash);
  if (!recorded) return { read: false, why: "No model reading is recorded for this reply" };
  if (recorded.promptHash !== promptHash(PROMPTS.read_review)) return { read: false, why: "The recorded reading was made with an older prompt" };
  const verdict = verifyReviewReading(recorded.rawOutput, replyText, replyTimestamp, timeZone, packages);
  if (!verdict.ok) return { read: false, why: verdict.reason };
  const { reading } = verdict;
  const what = reading.decision === "proceed" ? "carry on as offered"
    : reading.decision === "stop" ? "stop here"
    : reading.change?.kind === "lower_price" ? `carry on, at ${formatINR(reading.change.targetPaise)} or less`
    : reading.change?.kind === "later_start" ? `carry on, starting ${formatDate(reading.change.startDate)}`
    : `carry on, leaving out ${packages.find((p) => p.id === (reading.change as { removePackageId: string }).removePackageId)?.name ?? "a service"}`;
  return { read: true, verdict, model: recorded.model, provider: recorded.provider, line: `“${reading.phrase}” → ${what}` };
}
