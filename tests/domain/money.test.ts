import { describe, expect, it } from "vitest";
import { allocateByWeights, allocateEqually, derivePreGstFromInclusive, divRoundHalfUp, formatINR, gstForLine, lineWithGst, rupees } from "@/domain/money";

describe("GST per invoice line in integer paise, half-up", () => {
  it("rounds exactly-half paise up", () => {
    expect(gstForLine(25, 1800)).toBe(5); // 4.5 → 5
    expect(gstForLine(75, 1800)).toBe(14); // 13.5 → 14
  });
  it("rounds below half down and above half up", () => {
    expect(gstForLine(1, 1800)).toBe(0); // 0.18
    expect(gstForLine(3, 1800)).toBe(1); // 0.54
    expect(gstForLine(4237288, 1800)).toBe(762712); // 762711.84
  });
  it("computes each line independently, so per-line rounding can differ from rounding the sum", () => {
    const lines = [25, 25].map((p) => lineWithGst(p, 1800));
    expect(lines.reduce((a, l) => a + l.gstPaise, 0)).toBe(10); // 5 + 5
    expect(gstForLine(50, 1800)).toBe(9); // a single 50-paise line
  });
  it("matches the hero package figures", () => {
    expect(lineWithGst(rupees(19_500), 1800)).toEqual({ prePaise: 1_950_000, gstPaise: 351_000, totalPaise: 2_301_000 });
  });
  it("rejects non-integer and negative amounts", () => {
    expect(() => gstForLine(10.5, 1800)).toThrow();
    expect(() => gstForLine(-1, 1800)).toThrow();
  });
  it("divRoundHalfUp is integer-only", () => {
    expect(divRoundHalfUp(15, 10)).toBe(2);
    expect(divRoundHalfUp(14, 10)).toBe(1);
  });
});

describe("pre-GST amount from a GST-inclusive buyer amount", () => {
  it("derives ₹42,372.88 from ₹50,000 incl. 18% GST with zero reconciliation", () => {
    const d = derivePreGstFromInclusive(rupees(50_000), 1800);
    expect(d).toMatchObject({ prePaise: 4_237_288, gstPaise: 762_712, totalPaise: 5_000_000, reconciliationPaise: 0 });
  });
  it("exposes a one-paise reconciliation difference when no pre-GST amount reaches the total exactly", () => {
    const d = derivePreGstFromInclusive(rupees(50_014), 1800);
    expect(d).toMatchObject({ prePaise: 4_238_474, gstPaise: 762_925, totalPaise: 5_001_399, reconciliationPaise: 1 });
  });
  it("always returns the largest pre-GST amount that fits", () => {
    for (const incl of [1, 3, 118, 119, 99_999, 5_001_400, 12_345_678]) {
      const d = derivePreGstFromInclusive(incl, 1800);
      expect(d.totalPaise).toBeLessThanOrEqual(incl);
      expect(d.prePaise + 1 + gstForLine(d.prePaise + 1, 1800)).toBeGreaterThan(incl);
    }
  });
});

describe("allocation and formatting", () => {
  it("allocates without losing paise", () => {
    expect(allocateByWeights(12_000_000, [3000, 7000])).toEqual([3_600_000, 8_400_000]);
    expect(allocateEqually(100, 3)).toEqual([34, 33, 33]);
    expect(() => allocateByWeights(100, [5000, 4000])).toThrow();
  });
  it("formats Indian digit grouping", () => {
    expect(formatINR(rupees(120_000))).toBe("₹1,20,000");
    expect(formatINR(4_237_288)).toBe("₹42,372.88");
    expect(formatINR(0, { paise: true })).toBe("₹0.00");
  });
});
