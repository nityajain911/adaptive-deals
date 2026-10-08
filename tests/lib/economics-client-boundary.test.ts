import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Business economics client boundary", () => {
  it("keeps server hashing modules out of the client editor", () => {
    const source = readFileSync("components/economics/economics-editor.tsx", "utf8");
    expect(source).not.toMatch(/import\s*\{[^}]*economicsContentHash[^}]*\}\s*from\s*["']@\/domain\/business-economics["']/);
    expect(source).not.toMatch(/from\s*["']@\/lib\/economics-illustrative["']/);
  });
});
