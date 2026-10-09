import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkRelease } from "@/scripts/check-release";

function fixture(args: { note?: string; log?: string; demo?: string; merchant?: string; walkthrough?: string; environment?: string; storedRun?: string } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "adaptive-release-"));
  mkdirSync(path.join(root, "app", "deals"), { recursive: true });
  mkdirSync(path.join(root, "components", "offer"), { recursive: true });
  mkdirSync(path.join(root, "components", "walkthrough"), { recursive: true });
  writeFileSync(path.join(root, "ONE_PAGE_PRODUCT_NOTE.md"), args.note ?? "The frozen evaluation ran once.\n[APPLICANT] Add your judgement.");
  writeFileSync(path.join(root, "AI_BUILD_LOG.md"), args.log ?? "[APPLICANT] Record your decision.");
  writeFileSync(path.join(root, "DEMO_SCRIPT.md"), args.demo ?? "A truthful demo.");
  writeFileSync(path.join(root, "app", "deals", "page.tsx"), args.merchant ?? "export default function Page() { return null }");
  writeFileSync(path.join(root, "components", "offer", "card.tsx"), "export const Card = () => null");
  writeFileSync(path.join(root, "components", "walkthrough", "guide.tsx"), args.walkthrough ?? "export const Guide = 'No copied commercial output'");
  writeFileSync(path.join(root, ".env.example"), args.environment ?? "CEREBRAS_API_KEY=\n");
  mkdirSync(path.join(root, "data", "live-runs"), { recursive: true });
  writeFileSync(path.join(root, "data", "live-runs", "run.json"), args.storedRun ?? "{}");
  return root;
}

describe("release checks", () => {
  it("lets the build gate pass while listing applicant-owned placeholders", () => {
    const result = checkRelease({ root: fixture(), mode: "build" });
    expect(result.ok).toBe(true);
    expect(result.applicantPlaceholders).toHaveLength(2);
  });

  it("keeps the submission gate closed until applicant sections are complete", () => {
    const result = checkRelease({ root: fixture(), mode: "submission" });
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(["Applicant-owned sections are still incomplete."]);
  });

  it("fails either gate for banned claims or a future frozen-evaluation task", () => {
    const root = fixture({ note: "We will run the frozen evaluation next.", merchant: "export const claim = 'revenue recovered'" });
    const result = checkRelease({ root, mode: "build" });
    expect(result.ok).toBe(false);
    expect(result.bannedClaims).toHaveLength(1);
    expect(result.futureFrozenWork).toHaveLength(1);
  });

  it.each([
    "The recommendation is Standalone three-month package",
    "Show ₹50,000 in the guide",
    "invoice_demo_123",
    "Model confidence: 92%",
    "Run live",
    "Fail next send",
    "raw prompt hash",
    "open the frozen evaluation",
  ])("rejects walkthrough-only output or presenter copy: %s", (walkthrough) => {
    const result = checkRelease({ root: fixture({ walkthrough }), mode: "build" });
    expect(result.ok).toBe(false);
    expect(result.walkthroughLeaks).toHaveLength(1);
  });

  it("rejects non-empty Cerebras credentials without printing the secret", () => {
    const secret = "csk-1234567890abcdefghijklmnop";
    for (const root of [fixture({ environment: `CEREBRAS_API_KEY=${secret}\n` }), fixture({ storedRun: JSON.stringify({ accidental: secret }) })]) {
      const result = checkRelease({ root, mode: "build" });
      expect(result.ok).toBe(false);
      expect(result.secretLeaks).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain(secret);
      expect(result.secretLeaks[0]?.text).toBe("[redacted]");
    }
  });

  it("allows the empty Cerebras variable in the example environment", () => {
    const result = checkRelease({ root: fixture({ environment: "ADAPTIVE_DEALS_PROVIDER=cerebras\nCEREBRAS_API_KEY=\n" }), mode: "build" });
    expect(result.ok).toBe(true);
    expect(result.secretLeaks).toHaveLength(0);
  });
});
