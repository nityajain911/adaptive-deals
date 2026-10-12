import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { driveTo } from "../helpers/drive";

/**
 * A first-phase offer carries the rest of the year, held at today's rates, in the terms both sides approve. A revision of a payment date
 * keeps it exactly as the buyer accepted it.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-followon-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
type Svc = typeof import("@/lib/service");
let svc: Svc;
let presenter: typeof import("@/lib/presenter-store");
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
beforeAll(async () => {
  svc = await import("@/lib/service");
  presenter = await import("@/lib/presenter-store");
});
afterAll(() => fetchSpy.mockRestore());
beforeEach(async () => {
  await svc.resetToSeed();
  await presenter.setFailNextSend(false);
});

const HELD = {
  startDate: "2027-02-01",
  reviewDate: "2027-02-01",
  heldUntil: "2027-03-18",
  instalments: 3,
  approval: "requires_approval",
  pricing: { prePaise: 7_200_000, gstPaise: 1_296_000, totalPaise: 8_496_000 },
};

describe("the rest of the year, held", () => {
  it("is in the draft the merchant approves, and the message the buyer receives says so", async () => {
    await driveTo(svc, (s) => s.status === "options_ready");
    const draft = await svc.reviewBuyerProposal();
    expect(draft.terms.structure.scopeKind).toBe("phase_1");
    expect(draft.terms.followOn).toMatchObject(HELD);
    await svc.approveDraft(draft.version, draft.termsHash);
    await svc.sendProposal(draft.version);
    const message = (await svc.getState()).conversation.find((m) => m.kind === "proposal")!;
    expect(message.text).toContain("The rest of the year (₹84,960 including GST) stays open at today's rates until 18 Mar 2027.");
  });

  it("stays exactly as the buyer accepted it when a payment date moves", async () => {
    const s = await driveTo(svc, (x) => x.amendments.at(-1)?.state === "active");
    const [v1, v2] = s.agreements;
    expect(v2.version).toBe(2);
    expect(v1.terms.followOn).toMatchObject(HELD);
    expect(v2.terms.followOn).toEqual(v1.terms.followOn);
    expect(v2.termsHash).not.toBe(v1.termsHash);
  });
});
