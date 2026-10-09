import { createHash } from "node:crypto";
import type { AssistFailure, AssistMeta, AssistProvider } from "../provider";
import { ASSIST_PROMPTS, promptHash } from "../prompts";
import { NarrativeInputSchema, NarrativeOutputSchema, type NarrativeInput } from "./schema";
import { validateNarrative, type OfferVerdict } from "./validate";

export interface NarrativeRun {
  task: "strategy_narrative.v1";
  promptHash: string;
  inputHash: string;
  /** What happened to the call. A failure never blocks anything: every offer then keeps its code explanation. */
  status: "validated" | AssistFailure | "schema_rejected";
  meta: AssistMeta | null;
  verdicts: OfferVerdict[];
  /** The model's raw output, kept for the evaluation record only. */
  raw: unknown;
}

export const narrativeUserContent = (input: NarrativeInput): string => JSON.stringify(NarrativeInputSchema.parse(input));
export const narrativeInputHash = (input: NarrativeInput): string => createHash("sha256").update(`${ASSIST_PROMPTS.strategy_narrative.version}\n${narrativeUserContent(input)}`, "utf8").digest("hex");

/** One call, validated. Every failure path returns a run with no accepted sentence, and never throws. */
export async function runNarrative(input: NarrativeInput, provider: AssistProvider): Promise<NarrativeRun> {
  const prompt = ASSIST_PROMPTS.strategy_narrative;
  const base = { task: "strategy_narrative.v1" as const, promptHash: promptHash(prompt), inputHash: narrativeInputHash(input) };
  const none = (): OfferVerdict[] => input.offers.map((o) => ({ alias: o.alias, accepted: false, sentence: null, reasons: [] }));
  const result = await provider.generate({ system: prompt.system, user: narrativeUserContent(input), name: "adaptive_deals_strategy_narrative", schema: NarrativeOutputSchema });
  if (!result.ok) return { ...base, status: result.failure, meta: result.meta, verdicts: none(), raw: null };
  const parsed = NarrativeOutputSchema.safeParse(result.raw);
  if (!parsed.success) return { ...base, status: "schema_rejected", meta: result.meta, verdicts: none(), raw: result.raw };
  return { ...base, status: "validated", meta: result.meta, verdicts: validateNarrative(input, parsed.data), raw: result.raw };
}
