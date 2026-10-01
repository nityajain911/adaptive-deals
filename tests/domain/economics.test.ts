import { describe, expect, it } from "vitest";
import { buildStructure } from "@/domain/structures";
import { computeEconomics } from "@/domain/economics";
import { rupees } from "@/domain/money";
import { heroMerchant } from "@/data/synthetic/hero";
import type { ServicePackage } from "@/domain/types";

const pkgs: ServicePackage[] = [
  { id: "setup", name: "Setup", kind: "one_time", listPricePaise: rupees(10_000), directCostPaise: rupees(6_000), costTiming: "start_of_delivery_month", deferrable: true, removable: true, hasIndependentValue: true },
  { id: "run", name: "Run", kind: "monthly", listPricePaise: rupees(5_000), directCostPaise: rupees(2_000), costTiming: "start_of_delivery_month", deferrable: true, removable: true, hasIndependentValue: true },
];
const policy = { ...heroMerchant.policy, paymentFeeBps: 200 };
const scope = [{ packageId: "setup", months: 1 }, { packageId: "run", months: 2 }];
const build = (offsets: number[], weights?: number[]) =>
  buildStructure({ template: "split_payment", params: {}, label: "t", scopeKind: "full", scope, fullScope: scope, startDate: "2027-01-01", plan: { id: "p", label: "p", offsetsMonths: offsets, weightsBps: weights }, discountBps: 0, packages: pkgs, gstRateBps: 1800 });

describe("seller economics, exact freeze-pack definitions", () => {
  // Price 20,000 = setup 10,000 + run 2 × 5,000. Costs 10,000 = 6,000 + 2 × 2,000.
  const s = build([0, 2], [2000, 8000]); // 4,000 on 1 Jan; 16,000 on 1 Mar
  const e = computeEconomics(s, policy);
  const at = (d: string) => e.series.find((p) => p.date === d)!;

  it("gross and net contribution", () => {
    expect(e.grossContributionPaise).toBe(rupees(10_000));
    // Fees: 2% of 4,720 = 94.40 and 2% of 18,880 = 377.60
    expect(e.expectedFeesPaise).toBe(rupees(472));
    expect(e.netContributionPaise).toBe(rupees(9_528));
    expect(e.netContributionBps).toBe(4764);
  });

  it("funding requirement = costs incurred − cash received excl. GST, floored at zero", () => {
    expect(at("2027-01-01")).toMatchObject({ costsIncurredPaise: rupees(8_000), cashReceivedPrePaise: rupees(4_000), fundingRequirementPaise: rupees(4_000) });
    expect(at("2027-02-01")).toMatchObject({ costsIncurredPaise: rupees(10_000), fundingRequirementPaise: rupees(6_000) });
    expect(at("2027-03-01").fundingRequirementPaise).toBe(0);
  });

  it("peak funding requirement is the maximum of the series (cash at risk over time)", () => {
    expect(e.peakFundingPaise).toBe(rupees(6_000));
    expect(e.peakFundingDate).toBe("2027-02-01");
    expect(Math.max(...e.series.map((p) => p.fundingRequirementPaise))).toBe(e.peakFundingPaise);
  });

  it("unpaid service value = value delivered − cash received excl. GST, floored at zero, tracked separately", () => {
    // By 31 Jan: setup 10,000 + Jan run 5,000 delivered; 4,000 received.
    expect(at("2027-01-31")).toMatchObject({ valueDeliveredPaise: rupees(15_000), unpaidServiceValuePaise: rupees(11_000), fundingRequirementPaise: rupees(4_000) });
    expect(at("2027-02-28").unpaidServiceValuePaise).toBe(rupees(16_000));
    expect(e.peakUnpaidServiceValuePaise).toBe(rupees(16_000));
    expect(at("2027-03-01").unpaidServiceValuePaise).toBe(0);
  });

  it("an upfront payment removes funding requirement entirely", () => {
    const up = computeEconomics(build([0]), policy);
    expect(up.peakFundingPaise).toBe(0);
    expect(up.peakUnpaidServiceValuePaise).toBe(0);
  });

  it("GST never enters contribution or funding", () => {
    expect(s.payments.reduce((a, p) => a + p.gstPaise, 0)).toBe(rupees(3_600));
    expect(e.series.at(-1)!.cashReceivedPrePaise).toBe(rupees(20_000));
  });
});
