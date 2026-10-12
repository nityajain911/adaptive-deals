import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));

const render = async (name: "accept" | "decline" | "setup" | "done" | "request", props: Record<string, unknown> = {}) => {
  const client = await import("@/components/client");
  const setup = await import("@/components/buyer/setup-panel");
  const request = await import("@/components/buyer/request-change-form");
  const component = { accept: client.AcceptForm, decline: client.DeclineButton, setup: setup.SetupPanel, done: setup.SetupDone, request: request.RequestChangeForm }[name] as never;
  return renderToStaticMarkup(createElement(component, props as never));
};

describe("acceptance", () => {
  it("has no checkbox: the attestation is a sentence beside the button, and only when the terms require one", async () => {
    const required = await render("accept", { action: "accept_agreement", version: 1, termsHash: "h", authorityReason: "required_approval", totalPaise: 14_160_000 });
    expect(required).not.toContain('type="checkbox"');
    expect(required).toContain("By accepting, you confirm your company has approved this ₹1,41,600 deal.");
    expect(required).toContain('data-testid="accept"');
    expect(required).not.toMatch(/disabled=""/);
    const none = await render("accept", { action: "accept_agreement", version: 1, termsHash: "h", authorityReason: null, totalPaise: 4_602_000 });
    expect(none).not.toContain("By accepting");
    expect(none).not.toContain("You are accepting this proposal exactly as shown");
  });
  it("declining is a quiet text link, not a button next to the negotiation actions", async () => {
    const html = await render("decline", { version: 1 });
    expect(html).toContain("I&#x27;m no longer interested");
    expect(html).not.toContain("Decline</button>");
  });
});

describe("setup after acceptance", () => {
  it("is one button that pays and sets up automatic payment, with no card or UPI fields", async () => {
    const html = await render("setup", { payNow: { amountPaise: 2_301_000 }, autopay: { amountPaise: 2_301_000, dateLabel: "1 Dec 2026", noticeDays: 3 }, realLinkUrl: null });
    expect(html).toContain("Pay ₹23,010 and set up auto-pay");
    expect(html).toContain("collected automatically on 1 Dec 2026");
    expect(html).not.toMatch(/<input|card number|UPI/i);
  });
  it("names only what is left", async () => {
    expect(await render("setup", { payNow: { amountPaise: 4_602_000 }, autopay: null, realLinkUrl: null })).toContain(">Pay ₹46,020<");
    expect(await render("setup", { payNow: null, autopay: { amountPaise: 2_301_000, dateLabel: "1 Dec 2026", noticeDays: 3 }, realLinkUrl: null })).toContain("Set up automatic payment");
  });
  it("points at the real Razorpay test link instead of simulating when there is one", async () => {
    const html = await render("setup", { payNow: { amountPaise: 2_301_000 }, autopay: null, realLinkUrl: "https://rzp.io/x" });
    expect(html).toContain('href="https://rzp.io/x"');
    expect(html).not.toContain('data-testid="setup-pay"');
  });
  it("says what happened once it is done", async () => {
    const html = await render("done", { paidPaise: 2_301_000, next: { amountPaise: 2_301_000, dateLabel: "1 Dec 2026" } });
    expect(html).toContain("All set");
    expect(html).toContain("₹23,010 paid. Next: ₹23,010 on 1 Dec 2026, collected automatically.");
  });
});

describe("the change-request form", () => {
  const context = {
    currentTotalPaise: 4_602_000,
    services: [{ id: "website-fixes", name: "Website fixes" }, { id: "social-media", name: "Social media" }],
    includedIds: ["website-fixes"],
    lines: [{ id: "pay-1", date: "2026-11-01", totalPaise: 2_301_000 }],
    today: "2026-10-01",
    gstRateBps: 1800,
  };
  it("starts closed, and opens to the guided kinds of request", async () => {
    const closed = await render("request", { version: 1, merchantName: "Pinecone Media Works", context });
    expect(closed).toContain("Request a change");
    expect(closed).not.toContain("Send to Pinecone Media Works");
  });
});

describe("one tap", () => {
  it("accepts and pays in one button, and says what the same tap authorises", async () => {
    const html = await render("accept", { action: "accept_agreement", version: 1, termsHash: "h", authorityReason: "phase_scope", totalPaise: 4_602_000, oneTap: { payNowPaise: 2_301_000, autopay: { perDebitLimitPaise: 2_301_000, endDate: "31 Jan 2027", noticeDays: 3 } } });
    expect(html).toContain("Accept and pay ₹23,010");
    expect(html).toContain("automatic payments of up to ₹23,010 each, until 31 Jan 2027");
    expect(html).toContain("By accepting, you confirm you can approve");
    expect(html).not.toContain('type="checkbox"');
  });
  it("stays a plain acceptance for a revision, and where the payment is a real test link", async () => {
    const revision = await render("accept", { action: "accept_amendment", version: 2, termsHash: "h", authorityReason: null, totalPaise: 4_602_000, oneTap: { payNowPaise: 2_301_000, autopay: null } });
    expect(revision).toContain("Accept revised proposal");
    const plain = await render("accept", { action: "accept_agreement", version: 1, termsHash: "h", authorityReason: null, totalPaise: 4_602_000 });
    expect(plain).toContain("Accept proposal");
  });
});
