import { createHash } from "node:crypto";
import type { AssistFailure, AssistMeta, AssistProvider } from "../provider";
import { ASSIST_PROMPTS, promptHash } from "../prompts";
import { ProfileInputSchema, ProfileOutputSchema, type ProfileInput } from "./schema";
import { verifyProfile, type VerifiedProfile } from "./verify";

export interface ProfileRun {
  task: "profile_extract.v1";
  promptHash: string;
  inputHash: string;
  status: "verified" | AssistFailure | "schema_rejected";
  meta: AssistMeta | null;
  /** Empty when the call failed: the merchant then enters values by hand, as before. */
  profile: VerifiedProfile;
  /** The model's raw output, kept for the evaluation record only. */
  raw: unknown;
}

const EMPTY: VerifiedProfile = { services: [], dropped: [], instructionSpans: [], modelFlagged: [] };

/** The document goes in as data inside delimiters, so it can never be read as the task. */
export const profileUserContent = (input: ProfileInput): string => `<document kind="${input.kind}">\n${ProfileInputSchema.parse(input).source}\n</document>`;
export const profileInputHash = (input: ProfileInput): string => createHash("sha256").update(`${ASSIST_PROMPTS.profile_extract.version}\n${profileUserContent(input)}`, "utf8").digest("hex");

/** One call, verified by code. Never throws; every failure returns no proposed value. */
export async function runProfile(input: ProfileInput, provider: AssistProvider): Promise<ProfileRun> {
  const prompt = ASSIST_PROMPTS.profile_extract;
  const base = { task: "profile_extract.v1" as const, promptHash: promptHash(prompt), inputHash: profileInputHash(input) };
  const result = await provider.generate({ system: prompt.system, user: profileUserContent(input), name: "adaptive_deals_profile_extract", schema: ProfileOutputSchema });
  if (!result.ok) return { ...base, status: result.failure, meta: result.meta, profile: { ...EMPTY, instructionSpans: verifyProfile(input, { services: [], suspected_instructions: [] }).instructionSpans }, raw: null };
  const parsed = ProfileOutputSchema.safeParse(result.raw);
  if (!parsed.success) return { ...base, status: "schema_rejected", meta: result.meta, profile: EMPTY, raw: result.raw };
  return { ...base, status: "verified", meta: result.meta, profile: verifyProfile(input, parsed.data), raw: result.raw };
}
