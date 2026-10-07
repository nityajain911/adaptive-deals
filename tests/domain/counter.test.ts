import { describe, expect, it } from "vitest";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate, evaluateStructure } from "@/domain/engine";
import { sum } from "@/domain/money";
import { counterStructure, CounterError, failingCounterChecks } from "@/domain/counter";
import { clarifiedHeroProfile, heroInput } from "../helpers";

const input = heroInput();
const constraints = interpretations(clarifiedHeroProfile())[0].constraints;
const GST = input.merchant.policy.gstRateBps;
const base = () => enumerateAndEvaluate(constraints, input).feasible.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!.structure;
const total = (s: ReturnType<typeof base>) => sum(s.payments.map((p) => p.totalPaise));

describe("a counter-offer at a different total", () => {
  it("keeps scope, dates and method, and lands within a paise of the requested total", () => {
    const b = base();
    const c = counterStructure(b, 4_000_000, GST);
    expect(c.scope).toEqual(b.scope);
    expect(c.payments.map((p) => [p.dueDate, p.method])).toEqual(b.payments.map((p) => [p.dueDate, p.method]));
    expect(Math.abs(total(c) - 4_000_000)).toBeLessThanOrEqual(2);
    expect(total(c)).toBeLessThan(total(b));
  });

  it("lands exactly on a round total whenever per-line GST rounding allows it", () => {
    for (const target of [4_000_000, 3_800_000, 3_500_000, 4_200_000, 3_000_000]) expect(total(counterStructure(base(), target, GST))).toBe(target);
  });

  it("never lands above the total that was asked for, and within two paise of it, at any amount", () => {
    for (let rupees = 500; rupees < 46_000; rupees += 137) {
      const target = rupees * 100;
      const t = total(counterStructure(base(), target, GST));
      expect(t, `₹${rupees}`).toBeLessThanOrEqual(target);
      expect(target - t, `₹${rupees}`).toBeLessThanOrEqual(2);
    }
    expect(total(counterStructure(base(), 500_000, GST))).toBeLessThanOrEqual(500_000);
  });

  it("splits money exactly: every line's GST is per line, invoices match payments, deliveries sum to the price", () => {
    const c = counterStructure(base(), 3_999_999, GST);
    for (const p of c.payments) expect(p.totalPaise).toBe(p.prePaise + p.gstPaise);
    expect(sum(c.payments.map((p) => p.prePaise))).toBe(c.pricePaise);
    for (const p of c.payments) {
      const inv = c.invoices.find((i) => i.paymentLineId === p.id)!;
      expect([inv.prePaise, inv.gstPaise, inv.totalPaise]).toEqual([p.prePaise, p.gstPaise, p.totalPaise]);
    }
    expect(sum(c.deliveries.map((d) => d.valuePaise))).toBe(c.pricePaise);
  });

  it("records the discount against list price and keeps the direct cost, so the engine sees the real contribution", () => {
    const b = base();
    const c = counterStructure(b, 3_500_000, GST);
    expect(c.discountBps).toBeGreaterThan(b.discountBps);
    expect(c.listPricePaise).toBe(b.listPricePaise);
    expect(c.directCostPaise).toBe(b.directCostPaise);
    expect(c.id).not.toBe(b.id);
    expect(c.params).toMatchObject({ counter_total_paise: 3_500_000 });
  });

  it("is rechecked by the engine, which can reject it, and failing checks are named", () => {
    const low = evaluateStructure(counterStructure(base(), 600_000, GST), constraints, input);
    expect(low.approvable).toBe(false);
    expect(failingCounterChecks(low).length).toBeGreaterThan(0);
    // This merchant allows no discount, so even a small price cut fails exactly that rule and nothing else.
    const small = evaluateStructure(counterStructure(base(), total(base()) - 100_000, GST), constraints, input);
    expect(failingCounterChecks(small).map((c) => c.id)).toEqual(["discount_limit"]);
  });

  it.each([
    ["not a whole number of paise", 4_000_000.5],
    ["zero", 0],
    ["negative", -5],
    ["not lower than the current offer", 99_999_999],
  ])("refuses a total that is %s", (_n, value) => {
    expect(() => counterStructure(base(), value, GST)).toThrow(CounterError);
  });
});
