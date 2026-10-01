import { assertTestKey } from "./keys";
import type { PaymentLinkAdapter, PaymentLinkRequest, PaymentLinkState } from "./types";

const API = "https://api.razorpay.com/v1/payment_links";

type RazorpayLink = { id: string; short_url: string; status: PaymentLinkState["status"]; amount: number; amount_paid?: number; reference_id?: string };

/**
 * Razorpay Payment Links in TEST MODE. Notifications are disabled so test links never message
 * a real person. The key is checked again on construction: a live key cannot reach this client.
 */
export class RazorpayTestPaymentLinks implements PaymentLinkAdapter {
  readonly mode = "real_test" as const;
  private readonly auth: string;

  constructor(
    keyId: string,
    keySecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    assertTestKey(keyId);
    this.auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  }

  async createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkState> {
    const body = {
      amount: req.amountPaise,
      currency: "INR",
      accept_partial: false,
      reference_id: req.referenceId.slice(0, 40),
      description: req.description.slice(0, 2048),
      ...(req.expireByUnix ? { expire_by: req.expireByUnix } : {}),
      customer: { name: req.customerName },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: req.notes,
    };
    const res = await this.fetchImpl(API, { method: "POST", headers: { Authorization: this.auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Razorpay test payment link failed (${res.status})`);
    return this.map((await res.json()) as RazorpayLink, req.referenceId);
  }

  async fetchPaymentLink(id: string): Promise<PaymentLinkState> {
    const res = await this.fetchImpl(`${API}/${encodeURIComponent(id)}`, { headers: { Authorization: this.auth } });
    if (!res.ok) throw new Error(`Razorpay test payment link fetch failed (${res.status})`);
    return this.map((await res.json()) as RazorpayLink);
  }

  private map(l: RazorpayLink, referenceId?: string): PaymentLinkState {
    return { id: l.id, shortUrl: l.short_url, status: l.status, amountPaise: l.amount, amountPaidPaise: l.amount_paid ?? 0, referenceId: l.reference_id ?? referenceId ?? "", mode: this.mode };
  }
}

/** Local stand-in used whenever test credentials are absent. Clearly labelled as simulated. */
export class SimulatedPaymentLinks implements PaymentLinkAdapter {
  readonly mode = "simulated" as const;
  private readonly links = new Map<string, PaymentLinkState>();

  constructor(existing: PaymentLinkState[] = []) {
    for (const l of existing) this.links.set(l.id, l);
  }

  async createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkState> {
    const existing = [...this.links.values()].find((l) => l.referenceId === req.referenceId);
    if (existing) return existing; // idempotent on our reference
    const id = `plink_sim_${req.referenceId.replace(/[^A-Za-z0-9]/g, "").slice(-14)}`;
    const link: PaymentLinkState = { id, shortUrl: `https://simulated.invalid/pl/${id}`, status: "created", amountPaise: req.amountPaise, amountPaidPaise: 0, referenceId: req.referenceId, mode: this.mode };
    this.links.set(id, link);
    return link;
  }

  async fetchPaymentLink(id: string): Promise<PaymentLinkState> {
    const l = this.links.get(id);
    if (!l) throw new Error(`Unknown simulated payment link ${id}`);
    return l;
  }
}
