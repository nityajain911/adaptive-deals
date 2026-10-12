import { describe, expect, it } from "vitest";
import type { EconomicsContent } from "@/domain/business-economics";
import { serviceStatus } from "@/lib/service-status";
import { whatIf } from "@/lib/what-if";

const rupees = (n: number) => n * 100;
const guardrails = (over: Partial<EconomicsContent["guardrails"]> = {}): EconomicsContent["guardrails"] => ({
  contributionFloor: { minPercentBps: 3_500, minPaise: null, combine: "both" },
  cashAtRiskLimitPaise: rupees(50_000),
  maxTenureMonths: 6,
  smallestInstalmentPaise: rupees(5_000),
  discountLimitBps: 0,
  paymentFeeBps: 0,
  ...over,
} as EconomicsContent["guardrails"]);
const service = (price: number, cost: number) => ({ id: "s", name: "S", kind: "one_time" as const, listPricePaise: rupees(price), directCostPaise: rupees(cost), costTiming: "start_of_delivery_month" as const, deferrable: false, removable: false, hasIndependentValue: true });

describe("whatIf", () => {
  it("the lowest price keeps exactly the profit limit when fees are zero", () => {
    const result = whatIf({ fixed: { gstRateBps: 1_800 }, services: [service(26_000, 13_500)], guardrails: guardrails({ discountLimitBps: 5_000 }) });
    // cost 13,500 at a 35% limit → price ≥ 13,500 / 0.65
    expect(result.rows[0]!.lowestPaise).toBe(Math.ceil((rupees(13_500) * 10_000) / 6_500));
    expect(result.rows[0]!.setBy).toBe("profit");
  });

  it("with a 0% discount limit nothing goes below the standard price", () => {
    const result = whatIf({ fixed: { gstRateBps: 1_800 }, services: [service(26_000, 13_500)], guardrails: guardrails() });
    expect(result.rows[0]!.lowestPaise).toBe(rupees(26_000));
    expect(result.rows[0]!.setBy).toBe("discount");
  });

  it("payment fees raise the lowest price", () => {
    const noFee = whatIf({ fixed: { gstRateBps: 1_800 }, services: [service(26_000, 13_500)], guardrails: guardrails({ discountLimitBps: 5_000 }) }).rows[0]!.lowestPaise!;
    const fee = whatIf({ fixed: { gstRateBps: 1_800 }, services: [service(26_000, 13_500)], guardrails: guardrails({ discountLimitBps: 5_000, paymentFeeBps: 200 }) }).rows[0]!.lowestPaise!;
    expect(fee).toBeGreaterThan(noFee);
  });

  it("says no price can reach a profit limit that fees and the percentage use up", () => {
    const result = whatIf({ fixed: { gstRateBps: 1_800 }, services: [service(26_000, 13_500)], guardrails: guardrails({ contributionFloor: { minPercentBps: 9_900, minPaise: null, combine: "both" }, paymentFeeBps: 300 }) });
    expect(result.unreachable).toBe(true);
    expect(result.rows[0]!.lowestPaise).toBeNull();
  });
});

describe("serviceStatus", () => {
  const g = guardrails();
  it("is Ready when the service keeps at least the limit", () => {
    expect(serviceStatus(service(26_000, 13_500), g)).toMatchObject({ label: "Ready", tone: "green", keepPercent: 48 });
  });
  it("flags a missing cost, a loss and a margin below the limit", () => {
    expect(serviceStatus(service(26_000, 0), g).label).toBe("Add a cost");
    expect(serviceStatus(service(10_000, 12_000), g)).toMatchObject({ label: "Costs more than you charge", tone: "red" });
    expect(serviceStatus(service(10_000, 8_000), g).label).toBe("Below your lowest profit");
  });
});
