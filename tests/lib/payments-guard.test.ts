import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-pay-"));
type Svc = typeof import("@/lib/service");
let svc: Svc;
beforeAll(async () => {
  svc = await import("@/lib/service");
});

async function toSent() {
  await svc.resetToSeed();
  await svc.demoNext(); // answers
  await svc.demoNext(); // approve and send
  return (await svc.getState()).agreements[0];
}

describe("payment actions sit behind matching hashes and duplicate guards", () => {
  it("creates no payment link or mandate when acceptance presents a different hash", async () => {
    await toSent();
    await expect(svc.acceptAgreement(1, "a".repeat(64), true)).rejects.toThrow(/does not match/);
    const s = await svc.getState();
    expect(s.paymentLinks).toEqual([]);
    expect(s.mandate).toBeNull();
    expect(s.attempts).toEqual([]);
    expect(s.status).toBe("sent");
  });

  it("refuses simulated payment events before an agreement is active", async () => {
    await toSent();
    await expect(svc.simulate("payment_link_paid")).rejects.toThrow(/No active agreement/);
  });

  it("never pays the same link twice and never debits before the mandate is confirmed", async () => {
    const v = await toSent();
    await svc.acceptAgreement(1, v.termsHash, true);
    await svc.simulate("payment_link_paid");
    await expect(svc.simulate("payment_link_paid")).rejects.toThrow(/No unpaid payment link/);
    await expect(svc.simulate("debit_succeeded")).rejects.toThrow(/mandate must be confirmed/);
  });

  it("blocks any further collection once the agreement is fully paid", async () => {
    const v = await toSent();
    await svc.acceptAgreement(1, v.termsHash, true);
    await svc.simulate("payment_link_paid");
    await svc.simulate("mandate_confirmed");
    await svc.simulate("advance_notice");
    const s = await svc.simulate("debit_succeeded");
    expect(s.attempts.every((a) => a.status === "succeeded")).toBe(true);
    await expect(svc.simulate("debit_succeeded")).rejects.toThrow(/No recurring debit is scheduled/);
    await expect(svc.proposeAmendment()).rejects.toThrow(/No failed debit/);
  });

  it("records each simulated time advance in the state and the run record, labelled", async () => {
    const s = await svc.getState();
    expect(s.clockAdvances.length).toBeGreaterThan(0);
    expect(s.run.record.clockAdvances).toEqual(s.clockAdvances);
    expect(s.clockAdvances.every((a) => a.simulated)).toBe(true);
    expect(s.events.filter((e) => e.kind === "clock_advanced").every((e) => e.title.startsWith("Simulated date: ") && e.provenance === "simulated")).toBe(true);
  });
});
