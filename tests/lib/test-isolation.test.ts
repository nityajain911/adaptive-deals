import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Suites that set their own ADAPTIVE_DEALS_DATA_DIR must not statically import a module that reads
 * the store: static imports run before the assignment, so the store would resolve to the developer's
 * real `.data/` and the suite would overwrite the running demo.
 */
const STORE_READERS = /^import [^;]*from "@\/lib\/(store|service|presenter-store|delivery|deal-page|page-data)";?$/m;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("test isolation", () => {
  it("no suite with its own data directory statically imports a store reader", () => {
    const offenders = files("tests").filter((f) => {
      const src = readFileSync(f, "utf8");
      return src.includes("ADAPTIVE_DEALS_DATA_DIR") && STORE_READERS.test(src.replace(/^import type .*$/gm, ""));
    });
    expect(offenders).toEqual([]);
  });
});
