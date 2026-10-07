/**
 * Writes or checks the manifest of SHA-256 hashes of the hold-out files, which stay out of version
 * control until the final run. The hashes show the files were not changed after the prompts were
 * written. They do not show the cases were written independently of the prompts' author.
 *
 *   npx tsx evaluation-assist/generators/hash-holdout.ts write
 *   npx tsx evaluation-assist/generators/hash-holdout.ts check
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join("evaluation-assist", "holdout-private");
const MANIFEST = path.join("evaluation-assist", "holdout-manifest.json");
const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith(".json") ? [path.join(dir, e.name)] : []));
}
const entries = () => Object.fromEntries(files(ROOT).sort().map((f) => [path.relative(ROOT, f), sha(readFileSync(f))]));
const overall = (e: Record<string, string>) => sha(JSON.stringify(e));

const mode = process.argv[2];
if (mode === "write") {
  const e = entries();
  writeFileSync(MANIFEST, JSON.stringify({ writtenAt: new Date().toISOString(), fileCount: Object.keys(e).length, manifestSha256: overall(e), files: e }, null, 2) + "\n");
  console.log(`wrote ${Object.keys(e).length} hashes`);
} else if (mode === "check") {
  const saved = JSON.parse(readFileSync(MANIFEST, "utf8")) as { files: Record<string, string>; manifestSha256: string };
  const now = entries();
  const changed = [...new Set([...Object.keys(saved.files), ...Object.keys(now)])].filter((k) => saved.files[k] !== now[k]);
  if (changed.length || overall(now) !== saved.manifestSha256) {
    console.error(`HOLD-OUT CHANGED: ${changed.join(", ") || "manifest"}`);
    process.exit(1);
  }
  console.log(`hold-out matches the manifest (${Object.keys(now).length} files)`);
} else {
  console.error("usage: hash-holdout.ts write|check");
  process.exit(2);
}
