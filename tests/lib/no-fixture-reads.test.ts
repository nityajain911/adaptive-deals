import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((file) => {
  const candidate = path.join(dir, file);
  return statSync(candidate).isDirectory() ? walk(candidate) : [candidate];
});
const ALLOWED = new Set(["lib/economics-default.ts"]);

describe("product code reads a deal's own economics", () => {
  it("imports no merchant, service or offer-type fixture outside the default economics", () => {
    const offenders = ["lib", "app", "components", "domain"]
      .flatMap(walk)
      .filter((file) => /\.(ts|tsx)$/.test(file) && !ALLOWED.has(file))
      .filter((file) => /\bhero(Merchant|Packages|Templates)\b/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
