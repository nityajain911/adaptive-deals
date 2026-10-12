import { describe, expect, it } from "vitest";
import { tokenizeJson } from "@/lib/json-tokens";

describe("tokenizeJson", () => {
  const sample = { id: "run-1", n: [1, -2.5, 300], ok: true, none: null, nested: { "k:ey": "a \"quoted\" value: x" } };
  const text = JSON.stringify(sample, null, 2);

  it("gives back exactly the text it was given", () => {
    expect(tokenizeJson(text).map((token) => token.text).join("")).toBe(text);
  });

  it("tells keys from string values, even when a value contains a colon", () => {
    const tokens = tokenizeJson(text);
    expect(tokens.filter((t) => t.kind === "key").map((t) => t.text)).toEqual(['"id"', '"n"', '"ok"', '"none"', '"nested"', '"k:ey"']);
    expect(tokens.filter((t) => t.kind === "string").map((t) => t.text)).toEqual(['"run-1"', '"a \\"quoted\\" value: x"']);
  });

  it("marks numbers and literals", () => {
    const tokens = tokenizeJson(text);
    expect(tokens.filter((t) => t.kind === "number").map((t) => t.text)).toEqual(["1", "-2.5", "300"]);
    expect(tokens.filter((t) => t.kind === "literal").map((t) => t.text)).toEqual(["true", "null"]);
  });
});
