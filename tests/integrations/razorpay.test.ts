import { describe, expect, it } from "vitest";
import { assertTestKey, checkRazorpayKey, LiveKeyRefusedError, paymentAdapters, RECURRING_SIMULATION_NOTE } from "@/integrations/razorpay";
import { RazorpayTestPaymentLinks, SimulatedPaymentLinks } from "@/integrations/razorpay/payment-links";

describe("Razorpay key guard", () => {
  it("accepts only rzp_test_ keys", () => {
    expect(checkRazorpayKey("rzp_test_AbC123xyz", "secret")).toEqual({ ok: true, keyId: "rzp_test_AbC123xyz" });
  });
  it.each([
    ["rzp_live_AbC123xyz", "live_key_refused"],
    ["rzp_AbC123xyz", "unrecognised_key"],
    ["sk_test_123456", "unrecognised_key"],
    ["rzp_test_", "unrecognised_key"],
    ["", "missing"],
  ])("refuses %s (%s)", (key, reason) => {
    expect(checkRazorpayKey(key, "secret")).toEqual({ ok: false, reason });
  });
  it("requires a secret with a test key", () => {
    expect(checkRazorpayKey("rzp_test_AbC123xyz", "")).toEqual({ ok: false, reason: "missing_secret" });
  });
  it("cannot construct a real client with a live key", () => {
    expect(() => assertTestKey("rzp_live_AbC123xyz")).toThrow(LiveKeyRefusedError);
    expect(() => new RazorpayTestPaymentLinks("rzp_live_AbC123xyz", "s")).toThrow(LiveKeyRefusedError);
  });
});

describe("adapter selection", () => {
  it("defaults to simulation without credentials", () => {
    const a = paymentAdapters({});
    expect(a.links.mode).toBe("simulated");
    expect(a.recurring.mode).toBe("simulated");
  });
  it("never uses a live key, even with RAZORPAY_MODE=test", () => {
    const a = paymentAdapters({ RAZORPAY_MODE: "test", RAZORPAY_KEY_ID: "rzp_live_AbC123xyz", RAZORPAY_KEY_SECRET: "s" });
    expect(a.links.mode).toBe("simulated");
    expect(a.keyCheck).toEqual({ ok: false, reason: "live_key_refused" });
  });
  it("uses Razorpay test mode for payment links only with a valid test key and explicit opt-in", () => {
    expect(paymentAdapters({ RAZORPAY_KEY_ID: "rzp_test_AbC123xyz", RAZORPAY_KEY_SECRET: "s" }).links.mode).toBe("simulated");
    const a = paymentAdapters({ RAZORPAY_MODE: "test", RAZORPAY_KEY_ID: "rzp_test_AbC123xyz", RAZORPAY_KEY_SECRET: "s" });
    expect(a.links.mode).toBe("real_test");
    expect(a.recurring.mode).toBe("simulated");
  });
});

describe("Razorpay test-mode payment links (fake transport)", () => {
  it("sends paise, INR, our reference and no notifications; maps the response", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "plink_Test123", short_url: "https://rzp.io/i/test", status: "created", amount: 2301000, amount_paid: 0, reference_id: "ad_agr_v1_pay-1_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new RazorpayTestPaymentLinks("rzp_test_AbC123xyz", "secret", fake);
    const link = await client.createPaymentLink({ referenceId: "ad_agr_v1_pay-1_1", amountPaise: 2301000, description: "x", customerName: "Kestrel Lane Clinics", notes: {} });
    expect(calls[0].url).toBe("https://api.razorpay.com/v1/payment_links");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ amount: 2301000, currency: "INR", accept_partial: false, reference_id: "ad_agr_v1_pay-1_1", notify: { sms: false, email: false }, reminder_enable: false });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Basic " + Buffer.from("rzp_test_AbC123xyz:secret").toString("base64"));
    expect(link).toEqual({ id: "plink_Test123", shortUrl: "https://rzp.io/i/test", status: "created", amountPaise: 2301000, amountPaidPaise: 0, referenceId: "ad_agr_v1_pay-1_1", mode: "real_test" });
  });
  it("surfaces API errors instead of pretending success", async () => {
    const fake = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    await expect(new RazorpayTestPaymentLinks("rzp_test_AbC123xyz", "bad", fake).fetchPaymentLink("plink_x")).rejects.toThrow(/401/);
  });
});

describe("simulated adapters", () => {
  it("payment links are idempotent on our reference and clearly simulated", async () => {
    const sim = new SimulatedPaymentLinks();
    const a = await sim.createPaymentLink({ referenceId: "ad_agr_v1_pay-1_1", amountPaise: 100, description: "x", customerName: "c", notes: {} });
    const b = await sim.createPaymentLink({ referenceId: "ad_agr_v1_pay-1_1", amountPaise: 100, description: "x", customerName: "c", notes: {} });
    expect(b.id).toBe(a.id);
    expect(a.shortUrl).toMatch(/\.invalid\//);
    expect(a.mode).toBe("simulated");
  });
  it("recurring registration starts pending and states what could not be verified", async () => {
    const m = await paymentAdapters({}).recurring.registerMandate({ referenceId: "agr_v1", perDebitLimitPaise: 2301000, endDate: "2027-01-31", customerName: "c" });
    expect(m).toMatchObject({ status: "pending", mode: "simulated", note: RECURRING_SIMULATION_NOTE });
  });
});
