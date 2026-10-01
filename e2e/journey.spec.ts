import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const SHOTS = "artifacts/ui-review";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const STORE = path.join(".data-e2e", "store.json");
const demoRunId = JSON.parse(readFileSync("data/demo-run.json", "utf8")).runId as string;
const demoRun = JSON.parse(readFileSync(`data/live-runs/${demoRunId}.json`, "utf8"));

async function api(page: Page, data: Record<string, unknown>) {
  const r = await page.request.post("/api/actions", { data });
  const json = await r.json();
  expect(json.ok, JSON.stringify(json)).toBe(true);
  return json;
}
const reset = (page: Page) => api(page, { action: "reset" });
async function stepUntil(page: Page, done: (s: { status: string }) => boolean, max = 14) {
  for (let i = 0; i < max; i++) {
    const s = JSON.parse(readFileSync(STORE, "utf8"));
    if (done(s)) return;
    await api(page, { action: "demo_next" });
  }
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}
async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "horizontal page overflow").toBeLessThanOrEqual(1);
}
async function act(button: Locator, until: () => Promise<void>) {
  await button.click();
  await until();
}

test.describe.configure({ mode: "serial" });

test("connected journey: conversation → decision → buyer proposal → preventive restructuring", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);

  // 0–27 s · Conversation: evidence, AI drafts the merchant must send, simulated replies.
  await page.goto("/workspace");
  await expect(page.getByTestId("provenance")).toHaveText(`Replay of an actual run · run ID ${demoRunId}`);
  const conv = page.getByTestId("conversation");
  await expect(conv).toContainText("WhatsApp simulated · buyer replies selected by the demo operator");
  const msg = page.getByTestId("message-msg-2");
  await expect(msg).toContainText("Only ₹50K left this quarter; new budget in April; anything above ₹60K needs MD approval.");
  await expect(msg.locator("mark.evidence").first()).toContainText("Only ₹50K left this quarter");
  await expect(page.getByTestId("constraint-budgetNow")).toContainText("₹50,000 available 1 Oct 2026 – 31 Dec 2026");
  await expect(page.getByTestId("budget-gap")).toContainText("No additional budget from 1 Jan 2027 until Apr 2027");
  await expect(conv.locator('[data-kind="clarification"]')).toHaveCount(2);
  await expect(conv.locator('[data-kind="clarification"]').first()).toContainText("Suggested by AI");
  await expect(page.getByTestId("pending-actions")).toHaveText("2 pending actions");
  await expect(page.getByTestId("run-live")).toBeDisabled();
  await shot(page, "desktop-1-conversation");

  await act(page.getByTestId("pause-suggestions"), () => expect(conv).toContainText("Suggested replies are paused"));
  await act(page.getByTestId("pause-suggestions"), () => expect(conv).not.toContainText("Suggested replies are paused"));
  await expect(conv.locator('[data-kind="clarification"]')).toHaveCount(2);

  await act(page.getByTestId("send-clar-gst"), () => expect(page.getByTestId("send-clar-gst")).toHaveCount(0));
  await act(page.getByTestId("send-clar-approval"), () => expect(page.getByTestId("send-clar-approval")).toHaveCount(0));
  await expect(conv.locator('[data-kind="clarification"]').first()).toContainText("Approved and sent by merchant");
  await act(page.getByTestId("script-clar-gst-yes"), () => expect(conv).toContainText("Scripted answer value: yes"));
  await act(page.getByTestId("script-clar-approval-contract"), () => expect(conv).toContainText("Scripted answer value: per_contract"));
  await expect(conv.locator('[data-kind="buyer_reply"]').first()).toContainText("Received from buyer");
  await shot(page, "desktop-2-conversation-answered");
  await act(page.getByTestId("adopt-replies"), () => expect(page.getByText("Deal status: options ready")).toBeVisible());

  await page.goto("/clarification");
  await expect(page.getByTestId("recorded-clar-gst")).toContainText("Confirmed by buyer via WhatsApp");
  await expect(page.getByText("₹42,372.88")).toBeVisible();

  // 27–48 s · Recommended-first decision.
  await page.goto("/decision");
  const rec = page.getByTestId("recommendation");
  await expect(rec).toContainText("Recommended");
  await expect(rec).toContainText("Projected contribution");
  await expect(rec).toContainText("Peak funding requirement");
  await expect(rec).toContainText("Within buyer's approval limit");
  await expect(rec).toContainText("Not included");
  const attribution = demoRun.displayed.explanation.source.text === "ai" ? "Explanation written by AI · all figures calculated by the engine" : "Explanation written by code (AI wording did not pass validation) · all figures calculated by the engine";
  await expect(page.getByTestId("attribution")).toContainText(attribution);
  await expect(page.getByTestId("featured-buyer-rejection")).toContainText("fall before the buyer's next budget (Apr 2027)");
  await expect(page.getByTestId("featured-seller-rejection")).toContainText("above the ₹10,000 cash-at-risk limit");
  await expect(page.getByTestId("alternatives").locator(":scope > li")).toHaveCount(3);
  await expect(page.getByTestId("rejected-row").first()).toBeHidden(); // behind View details
  await shot(page, "desktop-3-decision");

  // Rules drawer from a seller-side rejection: opens at the binding rule; Escape closes it.
  await page.getByTestId("featured-seller-rejection").getByRole("button", { name: "Cash-at-risk limit" }).click();
  const drawer = page.getByTestId("rules-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('[data-rule="cash_at_risk"]')).toBeFocused();
  await expect(drawer).toContainText("₹10,000");
  await expect(drawer).toContainText("35% of the accepted price");
  await shot(page, "desktop-3b-rules-drawer");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  // Expanded/collapsed details.
  const alt = page.getByTestId("alternative-1").locator(":scope > details");
  await alt.locator(":scope > summary").click();
  await expect(alt).toHaveAttribute("open", "");
  await expect(alt).toContainText("Seller checks");
  await alt.locator(":scope > summary").click();
  await expect(alt).not.toHaveAttribute("open", "");
  await page.getByTestId("view-details").locator(":scope > summary").click();
  await expect(page.getByTestId("rejected-row")).toHaveCount(10);
  await expect(page.getByTestId("view-details")).toContainText("Rule:");

  await rec.getByRole("button", { name: "Approve and send" }).click();
  const hash = (await page.getByTestId("draft-hash").textContent())!.replace(/.*: /, "").trim();
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  await page.getByTestId("confirm-approve").click();
  await expect(page).toHaveURL(/\/agreement$/);
  await expect(page.getByTestId("version-1")).toContainText("sent");
  await expect(page.getByTestId("proposal-link-1")).toHaveText("/proposal/agr-hero/v1");

  // 48–62 s · Standalone buyer proposal: no merchant chrome inside the buyer frame.
  await page.getByTestId("open-buyer-view").click();
  await expect(page).toHaveURL(/\/proposal\/agr-hero\/v1$/);
  await expect(page.getByTestId("demo-bar")).toContainText("Demo control");
  const frame = page.getByTestId("buyer-frame");
  for (const t of ["demo-guide", "run-live", "reset", "provenance", "pending-actions"]) await expect(page.getByTestId(t)).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Products" })).toHaveCount(0);
  await expect(frame).not.toContainText(/Deal status|contribution|cash-at-risk|funding|run ID/i);
  await expect(page.getByTestId("buyer-total")).toHaveText("₹46,020");
  await expect(page.getByTestId("buyer-payments")).toContainText("1 Dec 2026");
  await expect(page.getByTestId("excluded")).toContainText("Social media");
  await expect(page.getByTestId("no-financing")).toHaveText("No additional financing charge added by the seller.");
  await expect(page.getByTestId("agreement-details")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("buyer-hash")).toBeHidden();
  await page.getByTestId("agreement-details").locator(":scope > summary").click();
  await expect(page.getByTestId("buyer-hash")).toHaveText(hash);
  await shot(page, "desktop-4-buyer-proposal");

  await page.getByTestId("request-change").click();
  await page.getByLabel("What would you like changed?").fill("Could the second payment move to 15 December?");
  await page.getByTestId("send-change-request").click();
  await expect(page.getByTestId("buyer-change-requests")).toContainText("Could the second payment move to 15 December?");
  await expect(page.getByTestId("buyer-total")).toHaveText("₹46,020"); // terms unchanged

  await expect(page.getByTestId("accept")).toBeDisabled();
  await page.getByTestId("authority").check();
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("buyer-status")).toContainText("Accepted");
  await expect(page.getByTestId("buyer-actions")).toHaveCount(0);

  await page.getByTestId("back-to-merchant").click();
  await expect(page.getByTestId("version-1")).toContainText("Approval and acceptance hashes match");
  await expect(page.getByTestId("payment-link")).toContainText("Simulated");
  await expect(page.getByTestId("mandate")).toContainText("₹23,010");

  // 62–82 s · Advance notice → buyer timing constraint → draft amendment → two approvals.
  await page.goto("/timeline");
  const events = page.getByTestId("events");
  await act(page.getByRole("button", { name: "Confirm mandate" }), () => expect(events).toContainText("Mandate registration confirmed"));
  await act(page.getByTestId("sim-advance-notice"), () => expect(events).toContainText("Advance notice sent for 2026-12-01"));
  const after = page.getByTestId("conversation-after");
  await expect(after.locator('[data-kind="notice"]')).toContainText("Written by code from verified state");
  await act(page.getByTestId("script-notice-cash-tight"), () => expect(page.getByTestId("change-request")).toHaveAttribute("data-state", "change_requested"));
  await expect(page.getByTestId("code-reading")).toContainText("unavailable through 20 Dec 2026 (inclusive) → earliest debit 21 Dec 2026");
  await expect(page.getByTestId("code-reading")).toContainText("not AI");
  await expect(page.getByTestId("restructuring")).not.toContainText(/AI interpreted|AI read/);
  await expect(page.getByTestId("pending-actions")).toHaveText("1 pending action");
  await shot(page, "desktop-5-change-requested");

  await act(page.getByTestId("propose-amendment"), () => expect(page.getByTestId("amendment-summary")).toContainText("from 1 Dec 2026 to 21 Dec 2026"));
  await expect(page.getByTestId("mandate-fit")).toContainText("Fits the existing mandate");
  await expect(page.getByTestId("amendment")).toContainText("Buyer checks (rechecked)");
  await expect(page.getByTestId("amendment")).toContainText("Projected contribution");
  await expect(page.getByTestId("collection-status")).toContainText("kept until the merchant and the buyer approve the same new terms hash");
  await act(page.getByTestId("approve-amendment"), () => expect(page.getByTestId("awaiting-buyer")).toBeVisible());
  await expect(page.getByTestId("collection-status")).toContainText("scheduled");
  await page.getByTestId("awaiting-buyer").click();
  await expect(page).toHaveURL(/\/proposal\/agr-hero\/v2$/);
  await expect(page.getByTestId("revision-summary")).toContainText("moves from 1 Dec 2026 to 21 Dec 2026");
  await expect(page.getByTestId("buyer-payments")).toContainText("21 Dec 2026");
  await expect(page.getByTestId("next-steps")).toContainText("debited on 21 Dec 2026 under your existing authorisation, instead of 1 Dec 2026");
  await expect(page.getByTestId("next-steps")).not.toContainText("payment link");
  await expect(page.getByTestId("decline")).toHaveCount(0);
  await page.getByTestId("authority").check();
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("buyer-status")).toContainText("Accepted");

  await page.goto("/timeline");
  await expect(page.getByTestId("change-request")).toHaveAttribute("data-state", "payment_rescheduled");
  await expect(page.getByTestId("payment-rescheduled")).toContainText("₹23,010 will now be debited on 21 Dec 2026 under version 2");
  await expect(page.getByTestId("collection-status")).toContainText("removed");
  await expect(page.getByTestId("version-history")).toContainText("superseded");
  await expect(page.getByTestId("pending-actions")).toHaveText("No pending actions");
  await shot(page, "desktop-6-payment-rescheduled");

  await page.goto("/proposal/agr-hero/v1");
  await expect(page.getByTestId("buyer-status")).toContainText("replaced by version 2");

  // 82–90 s · Other outcomes and close.
  await page.goto("/workspace");
  await page.getByTestId("scenario-no-feasible").click();
  await expect(page.getByTestId("scenario-result")).toContainText("Engine state: No feasible deal");
  await expect(page.getByTestId("next-action")).toContainText("binding checks");
  await shot(page, "desktop-7-other-outcomes");
  await page.goto("/timeline");
  await expect(page.getByTestId("no-feasible-example")).toContainText("none passes");
  await expect(page.getByTestId("close")).toContainText("Realised contribution within 90 days");
});

test("other outcomes give bounded next actions", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);
  await page.goto("/workspace");
  await page.getByTestId("scenario-insufficient").click();
  await expect(page.getByTestId("next-action")).toContainText("How much budget do you have available now");
  await page.getByTestId("scenario-outside").click();
  await expect(page.getByTestId("next-action")).toContainText("Hand over to the merchant");
  await page.getByTestId("scenario-no-feasible").click();
  await page.getByTestId("close-outcome").click();
  await expect(page.getByTestId("scenario-result")).toHaveCount(0);
});

test("typed and unsupported replies change nothing; a second qualifying reply opens no second request", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);
  await stepUntil(page, (s) => (s as unknown as { conversation: { kind: string }[] }).conversation.some((i) => i.kind === "notice"));
  await page.goto("/timeline");
  const ledgerBefore = await page.getByTestId("ledger").textContent();
  const typed = page.getByTestId("typed-reply");
  for (const [text, label] of [
    ["20 tak paisa nahi hai", "Merchant attention needed"],
    ["I paid", "Payment claimed — verification required"],
    ["Okay", "Acknowledgement only"],
    ["up to ₹10K this month", "Merchant attention needed"],
  ] as const) {
    await typed.getByLabel("Buyer message").fill(text);
    await typed.getByRole("button", { name: "Send as buyer" }).click();
    await expect(page.getByTestId("conversation-after").locator('[data-kind="buyer_reply"]').last()).toContainText(label);
  }
  await expect(page.getByTestId("ledger")).toHaveText(ledgerBefore!);
  await expect(page.getByTestId("restructuring")).toContainText("No change requested");

  await page.getByTestId("script-notice-cash-tight").click();
  await expect(page.getByTestId("change-request")).toHaveAttribute("data-state", "change_requested");
  await typed.getByLabel("Buyer message").fill("Actually till the 25th");
  await typed.getByRole("button", { name: "Send as buyer" }).click();
  const dupBubble = page.getByTestId("conversation-after").locator('[data-kind="buyer_reply"]').last();
  await expect(dupBubble.locator("[data-outcome]")).toHaveAttribute("data-outcome", "Merchant attention needed");
  await expect(dupBubble).toContainText("Change request chg-1 is already open"); // the reason recorded for this reply
  await expect(page.getByTestId("change-request-history").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("code-reading")).toContainText("20 Dec 2026");
  await expect(page.getByTestId("events")).toContainText("Merchant attention needed: a change request is already open");
});

test("typed reply targets stay valid as messages appear (no reload, no dropdown change)", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);
  await page.goto("/workspace");
  await expect(page.getByTestId("typed-reply")).toHaveCount(0); // nothing has been sent yet
  await page.getByTestId("send-clar-gst").click();
  const form = page.getByTestId("typed-reply");
  await expect(form).toBeVisible();
  const select = form.getByLabel("In reply to");
  const shownLabel = (await select.locator("option:checked").textContent())!;
  const shownId = await select.inputValue();
  expect(shownId).not.toBe("");
  expect(shownLabel).toContain("Do the amounts");
  await form.getByLabel("Buyer message").fill("Yes, both are with GST");
  await form.getByRole("button", { name: "Send as buyer" }).click();
  const reply = page.getByTestId("conversation").locator('[data-kind="buyer_reply"]').last();
  await expect(reply).toContainText("Yes, both are with GST");
  await expect(reply).toContainText("Reply to clarification question");
  await expect(page.getByText("Unknown message")).toHaveCount(0);
  await expect(form.getByRole("alert")).toHaveCount(0); // the form's own error slot (Next.js also renders an empty route announcer)
  const s = JSON.parse(readFileSync(STORE, "utf8"));
  const stored = s.conversation.at(-1);
  const question = s.conversation.find((i: { id: string }) => i.id === stored.inReplyTo);
  expect(stored.inReplyTo).toBe(shownId);
  expect(question.refs.questionId).toBe("clar-gst");
  expect(shownLabel).toContain(question.text.slice(0, 20));
});

test("date replies that cannot reschedule show merchant attention with the recorded reason", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  // After rescheduling: a reply to the original notice, whose payment was removed.
  await reset(page);
  await stepUntil(page, (s) => (s as unknown as { amendments: { state: string }[] }).amendments.some((a) => a.state === "active"));
  await page.goto("/timeline");
  const collections = await page.getByTestId("collections").textContent();
  const form = page.getByTestId("typed-reply");
  await form.getByLabel("In reply to").selectOption({ label: (await form.getByLabel("In reply to").locator("option", { hasText: "Advance notice" }).first().textContent())! });
  await form.getByLabel("Buyer message").fill("Cash is tight till the 25th.");
  await form.getByRole("button", { name: "Send as buyer" }).click();
  let bubble = page.getByTestId("conversation-after").locator('[data-kind="buyer_reply"]').last();
  await expect(bubble).toContainText("Cash is tight till the 25th.");
  await expect(bubble.locator("[data-outcome]")).toHaveAttribute("data-outcome", "Merchant attention needed");
  await expect(bubble).toContainText("nothing to reschedule");
  await expect(bubble).not.toContainText("already open");
  await expect(page.getByTestId("collections")).toHaveText(collections!);

  // After the payment succeeded.
  await reset(page);
  await stepUntil(page, (s) => (s as unknown as { conversation: { kind: string }[] }).conversation.some((i) => i.kind === "notice"));
  await api(page, { action: "simulate", event: "debit_succeeded" });
  await page.goto("/timeline");
  const paid = await page.getByTestId("collections").textContent();
  const ledger = await page.getByTestId("ledger").textContent();
  await form.getByLabel("Buyer message").fill("Cash is tight till the 20th.");
  await form.getByRole("button", { name: "Send as buyer" }).click();
  bubble = page.getByTestId("conversation-after").locator('[data-kind="buyer_reply"]').last();
  await expect(bubble).toContainText("Cash is tight till the 20th.");
  await expect(bubble.locator("[data-outcome]")).toHaveAttribute("data-outcome", "Merchant attention needed");
  await expect(bubble).toContainText("already succeeded");
  await expect(bubble).not.toContainText("already open");
  await expect(page.getByTestId("collections")).toHaveText(paid!);
  await expect(page.getByTestId("ledger")).toHaveText(ledger!);
  await expect(page.getByTestId("restructuring")).toContainText("No change requested");
});

test("decline records the buyer's rejection and creates no payment setup", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await reset(page);
  await stepUntil(page, (s) => s.status === "sent");
  await page.goto("/proposal/agr-hero/v1");
  await page.getByTestId("decline").click();
  await page.getByTestId("confirm-decline").click();
  await expect(page.getByTestId("buyer-status")).toContainText("No payment has been set up");
  await noHorizontalScroll(page);
  await shot(page, "mobile-6-buyer-declined");
  await page.goto("/agreement");
  await expect(page.getByTestId("version-1")).toContainText("Declined by the buyer");
  await expect(page.getByTestId("payment-link")).toContainText("Created after the buyer accepts");
});

test("a stale change request from an earlier version is shown as superseded and is not actionable", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);
  await stepUntil(page, (s) => (s as unknown as { amendments: { state: string }[] }).amendments.some((a) => a.state === "active"));
  const s = JSON.parse(readFileSync(STORE, "utf8"));
  const done = s.changeRequests[0];
  s.changeRequests.unshift({ ...done, id: "chg-stale", state: "change_requested", amendmentId: null, agreementVersion: 1, history: [done.history[0]] });
  writeFileSync(STORE, JSON.stringify(s));
  await page.goto("/timeline");
  const history = page.getByTestId("change-request-history");
  await expect(history.locator("li", { hasText: "chg-stale" })).toContainText("Superseded by agreement version 2");
  await expect(page.getByTestId("pending-actions")).toHaveText("No pending actions");
  await expect(page.getByTestId("propose-amendment")).toHaveCount(0);
  await expect(page.getByTestId("change-request")).toHaveAttribute("data-state", "payment_rescheduled");
});

test("guided demo runs the storyboard deterministically", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);
  await page.goto("/workspace");
  for (let i = 0; i < 12; i++) {
    await expect(page.getByTestId("demo-next")).toBeEnabled();
    const before = (await page.getByTestId("demo-step").textContent())!;
    await page.getByTestId("demo-next").click();
    // Buyer steps open the standalone proposal; merchant steps move the guide to the next step.
    await page.waitForFunction(
      (prev) => location.pathname.startsWith("/proposal/") || (document.querySelector('[data-testid="demo-step"]')?.textContent ?? "") !== prev,
      before,
    );
    if (page.url().includes("/proposal/")) {
      await expect(page.getByTestId("buyer-status")).toContainText("Accepted");
      await page.getByTestId("back-to-merchant").click();
      await expect(page.getByTestId("demo-guide")).toBeVisible();
    }
    if (i < 11) await expect(page.getByTestId("demo-step")).not.toHaveText(before);
  }
  await expect(page.getByTestId("demo-guide")).toContainText("Storyboard complete");
});

test("keyboard: drawer, details and buyer actions are reachable and operable", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);
  await stepUntil(page, (s) => s.status === "options_ready");
  await page.goto("/decision");
  await page.getByTestId("open-rules").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("rules-drawer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("rules-drawer")).toBeHidden();
  await expect(page.getByTestId("open-rules")).toBeFocused();
  const details = page.getByTestId("view-details");
  await details.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(details).not.toHaveAttribute("open", "");
  const alt = page.getByTestId("alternative-1").locator(":scope > details");
  await alt.locator(":scope > summary").focus();
  await page.keyboard.press("Space");
  await expect(alt).toHaveAttribute("open", "");

  await stepUntil(page, (s) => s.status === "sent");
  await page.goto("/proposal/agr-hero/v1");
  const ad = page.getByTestId("agreement-details");
  await ad.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(ad).toHaveAttribute("open", "");
  await page.getByTestId("authority").focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("authority")).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("accept")).toBeFocused();
});

test("mobile 390×844: merchant views and the buyer proposal without horizontal scroll", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await reset(page);
  await page.goto("/workspace");
  await noHorizontalScroll(page);
  await shot(page, "mobile-1-conversation");
  await stepUntil(page, (s) => s.status === "sent");
  for (const [p, name] of [
    ["/decision", "mobile-2-decision"],
    ["/agreement", "mobile-3-agreement-merchant"],
    ["/proposal/agr-hero/v1", "mobile-4-buyer-proposal"],
  ] as const) {
    await page.goto(p);
    await expect(page.locator("h1")).toBeVisible();
    await noHorizontalScroll(page);
    await shot(page, name);
  }
  await expect(page.getByTestId("accept")).toBeVisible();
  const box = await page.getByTestId("accept").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44); // comfortable touch target
  await stepUntil(page, (s) => (s as unknown as { amendments: { state: string }[] }).amendments.some((a) => a.state === "merchant_approved"));
  await page.goto("/proposal/agr-hero/v2");
  await noHorizontalScroll(page);
  await shot(page, "mobile-5-buyer-revision");
  await stepUntil(page, (s) => (s as unknown as { amendments: { state: string }[] }).amendments.some((a) => a.state === "active"));
  await page.goto("/timeline");
  await noHorizontalScroll(page);
  await expect(page.getByTestId("payment-rescheduled")).toBeVisible();
  await shot(page, "mobile-7-timeline-rescheduled");
});
