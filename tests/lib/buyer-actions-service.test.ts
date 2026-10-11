import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let svc: typeof import("@/lib/service");

beforeAll(async () => {
  process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-buyer-"));
  process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
  delete process.env.GROQ_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CEREBRAS_API_KEY;
  svc = await import("@/lib/service");
});

async function sent() {
  const { driveTo } = await import("../helpers/drive");
  await svc.startCase("reduced-scope");
  return driveTo(svc, (s) => s.agreements.some((a) => a.status === "sent"), 30);
}

describe("a structured change request", () => {
  it("is checked against the sent terms and becomes the merchant's message, with the request kept beside it", async () => {
    const s = await sent();
    const v = s.agreements.find((a) => a.status === "sent")!;
    const out = await svc.requestChange(v.version, "", "price", { kind: "price", targetPaise: 4_000_000, gstBasis: "including" });
    const item = out.conversation.findLast((i) => i.kind === "change_request")!;
    expect(item.text).toBe("Could you do ₹40,000 including GST?");
    expect(item.refs).toMatchObject({ topic: "price", request: { kind: "price", targetPaise: 4_000_000, gstBasis: "including" } });
  });

  it("refuses a price that is not lower, a scope that did not change, and a date in the past, changing nothing", async () => {
    const s = await sent();
    const v = s.agreements.find((a) => a.status === "sent")!;
    const before = (await svc.getState()).conversation.length;
    await expect(svc.requestChange(v.version, "", "price", { kind: "price", targetPaise: 9_000_000, gstBasis: "including" })).rejects.toThrow(/lower than the current/);
    await expect(svc.requestChange(v.version, "", "scope", { kind: "scope", packageIds: v.terms.scope.map((x) => x.packageId) })).rejects.toThrow(/Change at least one/);
    await expect(svc.requestChange(v.version, "", "date", { kind: "date", lineId: v.terms.paymentSchedule[1].id, date: "2020-01-01" })).rejects.toThrow(/after today/);
    expect((await svc.getState()).conversation.length).toBe(before);
  });

  it("still accepts a plain written request", async () => {
    const s = await sent();
    const v = s.agreements.find((a) => a.status === "sent")!;
    const out = await svc.requestChange(v.version, "Could we talk about timing?", "other");
    expect(out.conversation.findLast((i) => i.kind === "change_request")!.text).toBe("Could we talk about timing?");
    await expect(svc.requestChange(v.version, "", "other")).rejects.toThrow(/what you would like changed/);
  });
});

describe("the buyer completing setup on the proposal page", () => {
  it("is refused before acceptance, then pays and authorises in one call, and a repeat changes nothing", async () => {
    const s = await sent();
    const v = s.agreements.find((a) => a.status === "sent")!;
    await expect(svc.buyerCompleteSetup()).rejects.toThrow(/Accept the proposal/);
    await svc.acceptAgreement(v.version, v.termsHash, true);
    const done = await svc.buyerCompleteSetup();
    expect(done.attempts.find((a) => a.method === "payment_link")!.status).toBe("succeeded");
    expect(done.mandate?.status).toBe("confirmed");
    expect(done.events.at(-1)).toMatchObject({ kind: "buyer_setup_completed", provenance: "buyer_demo" });
    const again = await svc.buyerCompleteSetup();
    expect(again.events.length).toBe(done.events.length);
  });

  it("completes only what is left when the link is already paid", async () => {
    const s = await sent();
    const v = s.agreements.find((a) => a.status === "sent")!;
    await svc.acceptAgreement(v.version, v.termsHash, true);
    await svc.simulate("payment_link_paid");
    const done = await svc.buyerCompleteSetup();
    expect(done.mandate?.status).toBe("confirmed");
  });
});
