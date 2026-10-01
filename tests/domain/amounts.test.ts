import { describe, expect, it } from "vitest";
import { normaliseAmount } from "@/domain/amounts";

const paise = (raw: string) => {
  const r = normaliseAmount(raw);
  if (!r.ok) throw new Error(r.reason);
  return r.paise;
};

describe("amount normalisation", () => {
  it.each([
    ["₹50K", 5_000_000],
    ["50k", 5_000_000],
    ["fifty thousand", 5_000_000],
    ["1.2 lakh", 12_000_000],
    ["₹1,20,000", 12_000_000],
    ["Rs. 60,000", 6_000_000],
    ["60000", 6_000_000],
    ["one lakh twenty thousand", 12_000_000],
    ["2 crore", 2_000_000_000],
    ["1.5L", 15_000_000],
    ["₹ 499.50", 49_950],
  ])("%s → %d paise", (raw, expected) => {
    expect(paise(raw)).toBe(expected);
  });

  it("uses exact decimal arithmetic (no float drift on 1.2 lakh)", () => {
    expect(paise("1.2 lakh")).toBe(12_000_000);
    expect(paise("0.3 lakh")).toBe(3_000_000);
  });

  it.each(["", "a lot", "50 bucks", "approximately some money", "50-60k"])("refuses to guess: %s", (raw) => {
    expect(normaliseAmount(raw).ok).toBe(false);
  });
});
