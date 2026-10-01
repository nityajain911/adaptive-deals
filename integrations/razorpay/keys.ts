/**
 * Razorpay credential guard. Only test-mode key IDs (`rzp_test_…`) are accepted. Live keys and
 * any unrecognised form are refused outright.
 */
export type KeyCheck = { ok: true; keyId: string } | { ok: false; reason: "missing" | "live_key_refused" | "unrecognised_key" | "missing_secret" };

const TEST_KEY = /^rzp_test_[A-Za-z0-9]{6,}$/;

export function checkRazorpayKey(keyId: string | undefined, keySecret: string | undefined): KeyCheck {
  const id = keyId?.trim();
  if (!id) return { ok: false, reason: "missing" };
  if (id.startsWith("rzp_live_")) return { ok: false, reason: "live_key_refused" };
  if (!TEST_KEY.test(id)) return { ok: false, reason: "unrecognised_key" };
  if (!keySecret?.trim()) return { ok: false, reason: "missing_secret" };
  return { ok: true, keyId: id };
}

export class LiveKeyRefusedError extends Error {}

export function assertTestKey(keyId: string): void {
  const c = checkRazorpayKey(keyId, "x");
  if (!c.ok) throw new LiveKeyRefusedError(c.reason === "live_key_refused" ? "Live Razorpay keys are refused; use a rzp_test_ key" : "Unrecognised Razorpay key; only rzp_test_ keys are accepted");
}
