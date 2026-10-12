import { describe, expect, it } from "vitest";
import type { DealBaseline } from "@/domain/deal-baseline";
import type { EvaluatedStructure } from "@/domain/engine";
import { dealTransformation } from "@/lib/deal-transformation";

const baseline: DealBaseline = {
  servicePrices: [{ packageId: "website", kind: "one_time", listPricePaise: 2_600_000 }, { packageId: "search", kind: "monthly", listPricePaise: 3_000_000 }],
  quotedScope: [{ packageId: "website", months: 1 }, { packageId: "search", months: 3 }], quotedPrePaise: 11_600_000, quotedGstPaise: 2_088_000, quotedTotalPaise: 13_688_000, gstRateBps: 1800, economicsVersionAtStart: 1,
};
const packages = [{ id: "website", name: "Website fixes" }, { id: "search", name: "Search marketing" }];
const offer = (scope = baseline.quotedScope, payments = 1, approval: "within_limit" | "requires_approval" = "within_limit", startDate = "2026-10-01") => ({
  approval,
  structure: { scope, startDate, payments: Array.from({ length: payments }, () => ({ totalPaise: 2_301_000 })) },
}) as unknown as EvaluatedStructure;

describe("deal transformation", () => {
  it("uses the stored quote and selected evaluation for a reduced-scope hero offer", () => {
    const view = dealTransformation({ baseline, offer: offer([{ packageId: "website", months: 1 }, { packageId: "search", months: 1 }], 2), packages, originalApprovalLabel: "Needs buyer approval", originalStartDate: "2026-10-01" });
    expect(view.original.totalPaise).toBe(baseline.quotedTotalPaise);
    expect(view.adaptive.totalPaise).toBe(4_602_000);
    expect(view.changes).toEqual(expect.arrayContaining(["scope", "payment_split", "approval"]));
  });

  it("reports only actual changes for a same-scope offer", () => {
    const view = dealTransformation({ baseline, offer: offer(), packages, originalApprovalLabel: "Buyer can approve", originalStartDate: "2026-10-01" });
    expect(view.changes).toEqual([]);
  });

  it("keeps a cost-only update inside economics state unless the offer changes", () => {
    const view = dealTransformation({ baseline, offer: offer(), packages, originalApprovalLabel: "Buyer can approve", economicsChanged: { fromVersion: 1, toVersion: 2, contributionDeltaPaise: -400_000 } });
    expect(view.changes).toEqual([]);
    expect(view.economicsChanged).toEqual({ fromVersion: 1, toVersion: 2, contributionDeltaPaise: -400_000 });
  });

  it("shows the actual start dates when adapting timing without changing scope", () => {
    const view = dealTransformation({ baseline, offer: offer(undefined, 12, "within_limit", "2027-05-01"), packages, originalApprovalLabel: "Buyer can approve", originalStartDate: "2026-11-01" });
    expect(view.original.durationLabel).toContain("1 Nov 2026");
    expect(view.adaptive.durationLabel).toContain("1 May 2027");
    expect(view.changes).toContain("timing");
  });

  it("builds one row per service, marking a dropped one and why", () => {
    const view = dealTransformation({ baseline, offer: offer([{ packageId: "website", months: 1 }]), packages, originalApprovalLabel: "Needs buyer approval", canWaitIds: ["search"] });
    expect(view.rows?.find((r) => r.id === "website")).toMatchObject({ was: "1 month", now: "1 month" });
    expect(view.rows?.find((r) => r.id === "search")).toMatchObject({ was: "3 months", now: null, note: "They said it can wait" });
    expect(view.rows?.find((r) => r.id === "approval")).toMatchObject({ was: "Needs buyer approval", now: "Buyer can approve" });
  });
  it("shows the rest of the year, held, as one more line and leaves the offer's own changes alone", () => {
    const plain = dealTransformation({ baseline, offer: offer(), packages, originalApprovalLabel: "Buyer can approve", originalStartDate: "2026-10-01" });
    const held = dealTransformation({ baseline, offer: offer(), packages, originalApprovalLabel: "Buyer can approve", originalStartDate: "2026-10-01", followOn: { totalPaise: 8_496_000, heldUntil: "2027-03-18" } });
    expect(plain.rows!.some((row) => row.id === "follow_on")).toBe(false);
    const row = held.rows!.find((r) => r.id === "follow_on");
    expect(row).toMatchObject({ label: "Rest of the year", was: null, now: "₹84,960 held until 18 Mar 2027" });
    expect(held.changes).toEqual(plain.changes);
    expect(held.adaptive.totalPaise).toBe(plain.adaptive.totalPaise);
  });
});
