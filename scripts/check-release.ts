import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ReleaseMode = "build" | "submission";

export interface ReleaseIssue {
  file: string;
  line: number;
  text: string;
}

export interface ReleaseResult {
  ok: boolean;
  applicantPlaceholders: ReleaseIssue[];
  bannedClaims: ReleaseIssue[];
  futureFrozenWork: ReleaseIssue[];
  walkthroughLeaks: ReleaseIssue[];
  failures: string[];
}

const BANNED = /\b(revenue recovered|cash recovered|guaranteed contribution|confirmed via WhatsApp)\b/i;
const FUTURE_FROZEN = /\b(?:obtain|create|write|label|run)\b[^\n]{0,80}\bfrozen (?:evaluation|set|test set)\b/i;
const WALKTHROUGH_LEAK = /₹\s*\d|\bStandalone three-month package\b|invoice_[A-Za-z0-9_]+|\bmodel confidence\b|\bRun live\b|\bFail next send\b|\braw prompt hash\b|\bfrozen evaluation\b/i;

const linesWith = (root: string, file: string, pattern: RegExp): ReleaseIssue[] => {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) return [];
  return readFileSync(absolute, "utf8")
    .split(/\r?\n/)
    .flatMap((text, index) => (pattern.test(text) ? [{ file, line: index + 1, text: text.trim() }] : []));
};

function codeFiles(root: string, relative: string): string[] {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  if (statSync(absolute).isFile()) return [relative];
  return readdirSync(absolute).flatMap((name) => codeFiles(root, path.join(relative, name))).filter((file) => /\.(?:ts|tsx)$/.test(file));
}

export function checkRelease({ root, mode }: { root: string; mode: ReleaseMode }): ReleaseResult {
  const placeholderFiles = ["ONE_PAGE_PRODUCT_NOTE.md", "AI_BUILD_LOG.md"];
  const applicantPlaceholders = placeholderFiles.flatMap((file) => linesWith(root, file, /\[APPLICANT\]/));
  const merchantFacing = [
    "DEMO_SCRIPT.md",
    ...codeFiles(root, "app/deals"),
    ...["components/deal", "components/understand", "components/offer", "components/track"].flatMap((directory) => codeFiles(root, directory)),
    ...["components/outcome-card.tsx", "components/proposal-content.tsx"].flatMap((file) => codeFiles(root, file)),
  ];
  const bannedClaims = [...new Set(merchantFacing)].flatMap((file) => linesWith(root, file, BANNED));
  const futureFrozenWork = linesWith(root, "ONE_PAGE_PRODUCT_NOTE.md", FUTURE_FROZEN);
  const walkthroughFiles = [...codeFiles(root, "components/walkthrough"), "lib/walkthrough.ts"].filter((file) => existsSync(path.join(root, file)));
  const walkthroughLeaks = walkthroughFiles.flatMap((file) => linesWith(root, file, WALKTHROUGH_LEAK));
  const failures: string[] = [];
  if (mode === "submission" && applicantPlaceholders.length) failures.push("Applicant-owned sections are still incomplete.");
  if (bannedClaims.length) failures.push("Banned outcome claims remain in merchant-facing content.");
  if (futureFrozenWork.length) failures.push("The product note still describes the frozen evaluation as future work.");
  if (walkthroughLeaks.length) failures.push("The walkthrough contains hardcoded commercial output or presenter-only copy.");
  return { ok: failures.length === 0, applicantPlaceholders, bannedClaims, futureFrozenWork, walkthroughLeaks, failures };
}

function print(result: ReleaseResult, mode: ReleaseMode) {
  console.log(`Release check (${mode})`);
  if (result.applicantPlaceholders.length) {
    console.log(`Awaiting applicant: ${result.applicantPlaceholders.length} placeholder line(s)`);
    for (const issue of result.applicantPlaceholders) console.log(`- ${issue.file}:${issue.line} ${issue.text}`);
  }
  for (const issue of [...result.bannedClaims, ...result.futureFrozenWork, ...result.walkthroughLeaks]) console.log(`- ${issue.file}:${issue.line} ${issue.text}`);
  if (result.ok) console.log("PASS");
  else for (const failure of result.failures) console.error(`FAIL: ${failure}`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (invoked) {
  const modeArg = process.argv.find((argument) => argument === "--build" || argument === "--submission");
  if (!modeArg) {
    console.error("Usage: npm run check:release -- --build|--submission");
    process.exit(2);
  }
  const mode = modeArg === "--submission" ? "submission" : "build";
  const result = checkRelease({ root: process.cwd(), mode });
  print(result, mode);
  if (!result.ok) process.exit(1);
}
