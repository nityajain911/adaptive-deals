import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROMPTS, promptHash } from "@/ai/prompts";
import { demoCase, scriptedReplyText } from "@/data/synthetic/cases";
import { heroScriptedReplies } from "@/data/synthetic/hero";
import { readReviewReply } from "@/lib/review-readings";

/**
 * The buyer's five answers at the month-three review were read once by Cerebras, under a pass rule committed before the call.
 * The product replays that reading and checks it again with code; the scripts' own metadata is only what was expected.
 */
const freeze = JSON.parse(readFileSync("data/synthetic/REVIEW_READING_FREEZE_BATCH8.json", "utf8"));
const report = JSON.parse(readFileSync("data/review-readings/RECORDING_REPORT.json", "utf8"));
const item = demoCase("reduced-scope")!;
const scripts = heroScriptedReplies.filter((s) => s.context === "review");
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const AT = "2027-02-01T10:05:00+05:30";

describe("the recording of the buyer's answers at the review", () => {
  it("followed a pass rule that was written first, for this prompt and these exact words", () => {
    expect(freeze.prompt.sha256).toBe(promptHash(PROMPTS.read_review));
    expect(freeze.networkCallsMade).toBe(0);
    expect(Object.keys(freeze.replies).sort()).toEqual(scripts.map((s) => s.id).sort());
    for (const s of scripts) expect(freeze.replies[s.id].textSha256).toBe(sha(scriptedReplyText("reduced-scope", s)));
    expect(Date.parse(freeze.frozenAt)).toBeLessThan(Date.parse(report.recordedAt));
  });

  it("was made with Cerebras gpt-oss-120b, in five requests with no retry, and every reading matched the pass rule", () => {
    expect(report.requestsMade).toBe(5);
    expect(report.requestsMade).toBeLessThanOrEqual(freeze.maximumProviderRequests);
    for (const r of report.replies) {
      expect(r.attempts).toHaveLength(1);
      expect(r.codeVerdict).toBe("accepted");
      expect(r.matchesPassRule).toBe(true);
    }
    for (const s of scripts) {
      const rec = JSON.parse(readFileSync(`data/review-readings/${s.id}.json`, "utf8"));
      expect(rec.provider).toBe("cerebras");
      expect(rec.model).toBe("gpt-oss-120b");
    }
  });

  it("is what the product uses: each reply is read as its script expects, and the words are checked again by code", () => {
    for (const s of scripts) {
      const out = readReviewReply(scriptedReplyText("reduced-scope", s), AT, item.deal.merchant.timeZone, item.deal.packages);
      expect(out.read, s.id).toBe(true);
      if (!out.read) continue;
      expect(out.verdict.reading.decision).toBe((s as { reviewDecision: string }).reviewDecision);
      expect(out.verdict.reading.change).toEqual((s as { reviewChange?: unknown }).reviewChange ?? null);
    }
  });

  it("is not used for any other words: a typed answer is left for the merchant", () => {
    const out = readReviewReply("Kabir: Yes, go ahead with everything.", AT, item.deal.merchant.timeZone, item.deal.packages);
    expect(out).toEqual({ read: false, why: "No model reading is recorded for this reply" });
  });
});
