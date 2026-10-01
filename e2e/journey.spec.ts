import { expect, test, type Page } from "@playwright/test";

const SHOTS = "artifacts/ui-review";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function reset(page: Page) {
  const r = await page.request.post("/api/actions", { data: { action: "reset" } });
  expect((await r.json()).ok).toBe(true);
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}
async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "horizontal page overflow").toBeLessThanOrEqual(1);
}
/** Click an action button and wait for the server-rendered state to change. */
async function act(page: Page, button: ReturnType<Page["getByRole"]> | ReturnType<Page["getByTestId"]>, until: () => Promise<void>) {
  await button.click();
  await until();
}

test.describe.configure({ mode: "serial" });

test("five-view hero journey through the UI", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);

  // 1. Deal workspace
  await page.goto("/workspace");
  await expect(page.getByTestId("provenance")).toHaveText("Synthetic replay · run ID run-synthetic-hero-0001");
  const msg = page.getByTestId("message-msg-2");
  await expect(msg).toContainText("Only ₹50K left this quarter; new budget in April; anything above ₹60K needs MD approval.");
  await expect(msg.locator("mark.evidence").first()).toHaveText("Only ₹50K left this quarter");
  await expect(msg).toContainText("1 Oct 2026, 08:47 IST");
  await expect(page.getByTestId("constraint-budgetNow")).toContainText("₹50,000 available 1 Oct 2026 – 31 Dec 2026");
  await expect(page.getByTestId("constraint-amountsIncludeGst")).toContainText("Ambiguous");
  await expect(page.getByTestId("budget-gap")).toContainText("No additional budget from 1 Jan 2027 until Apr 2027");
  await expect(page.getByTestId("ambiguity-amountsIncludeGst")).toContainText("Changes the decision");
  await expect(page.getByTestId("run-live")).toBeDisabled();
  await shot(page, "desktop-1-workspace");

  // 2. Clarification — answers entered through the form
  await page.getByRole("link", { name: /Clarification/ }).first().click();
  await expect(page.getByTestId("question-clar-gst")).toContainText("Do both ₹50,000 and ₹60,000 include GST?");
  await expect(page.getByTestId("why-clar-gst")).toContainText("options are feasible");
  await expect(page.getByTestId("question-clar-approval")).toContainText("Is ₹60,000 the limit per payment or for the full contract?");
  await shot(page, "desktop-2-clarification-before");
  const gst = page.getByTestId("answer-clar-gst");
  await gst.getByLabel("Yes, both include GST").check();
  await gst.getByLabel("Confirmed by buyer via").selectOption("whatsapp");
  const ap = page.getByTestId("answer-clar-approval");
  await ap.getByLabel("Per contract").check();
  await ap.getByLabel("Confirmed by buyer via").selectOption("whatsapp");
  await page.getByTestId("record-answers").click();
  await expect(page.getByTestId("recorded-clar-gst")).toContainText("Yes, both amounts include GST.");
  await expect(page.getByTestId("recorded-clar-gst")).toContainText("Confirmed by buyer via WhatsApp");
  await expect(page.getByText("₹42,372.88")).toBeVisible();
  await expect(page.getByText("₹50,847.46")).toBeVisible();
  await shot(page, "desktop-2-clarification-answered");

  // 3. Decision
  await page.goto("/decision");
  await expect(page.getByTestId("ai-comparison")).toContainText("₹46,020");
  await expect(page.getByTestId("featured-buyer-rejection")).toContainText("fall before the buyer's next budget (Apr 2027)");
  await expect(page.getByTestId("featured-seller-rejection")).toContainText("above the ₹10,000 cash-at-risk limit");
  await expect(page.getByTestId("feasible-1")).toContainText("Within buyer's approval limit");
  await expect(page.getByTestId("feasible-1")).toContainText("Peak unpaid service value");
  await expect(page.getByTestId("feasible-3")).toContainText("Needs buyer's MD approval");
  await expect(page.getByTestId("rejected-row")).toHaveCount(10);
  await shot(page, "desktop-3-decision");
  await page.getByTestId("feasible-1").getByRole("button", { name: "Approve and send" }).click();
  const hash = (await page.getByTestId("draft-hash").textContent())!.replace(/.*: /, "").trim();
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  await page.getByTestId("confirm-approve").click();

  // 4. Agreement — merchant then Demo buyer view
  await expect(page).toHaveURL(/\/agreement$/);
  await expect(page.getByTestId("version-1")).toContainText("sent");
  await page.getByTestId("role-buyer").click();
  await expect(page.getByTestId("buyer-view")).toContainText("Demo buyer view · no login");
  await expect(page.getByTestId("no-financing")).toHaveText("No additional financing charge added by the seller.");
  await expect(page.getByTestId("buyer-hash")).toHaveText(hash);
  await expect(page.getByTestId("buyer-view")).toContainText("₹23,010");
  await shot(page, "desktop-4-agreement-buyer");
  await expect(page.getByTestId("accept")).toBeDisabled();
  await page.getByTestId("authority").check();
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("buyer-view")).toContainText("You accepted version 1");
  await page.getByTestId("role-merchant").click();
  await expect(page.getByTestId("version-1")).toContainText("Approval and acceptance hashes match");
  await expect(page.getByTestId("payment-link")).toContainText("Simulated");
  await expect(page.getByTestId("mandate")).toContainText("₹23,010");
  await expect(page.getByTestId("mandate")).toContainText("31 Jan 2027");
  await shot(page, "desktop-4-agreement-merchant");

  // 5. Deal timeline — simulated events through the same domain transitions
  await page.goto("/timeline");
  const events = page.getByTestId("events");
  await act(page, page.getByRole("button", { name: "Buyer pays link" }), () => expect(events).toContainText("Upfront payment received"));
  await act(page, page.getByRole("button", { name: "Confirm mandate" }), () => expect(events).toContainText("Mandate registration confirmed"));
  await act(page, page.getByRole("button", { name: "Send advance notice" }), () => expect(events).toContainText("Advance notice sent for 2026-12-01"));
  await act(page, page.getByTestId("sim-failed-debit"), () => expect(events).toContainText("Recurring debit of 2026-12-01 failed"));
  await act(page, page.getByRole("button", { name: "Buyer replies" }), () => expect(events).toContainText("cash tight till the 20th"));
  await expect(page.getByText("Simulated date: 2026-12-01").first()).toBeVisible();
  await act(page, page.getByRole("button", { name: "Propose revision" }), () => expect(page.getByTestId("amendment")).toContainText("from 1 Dec 2026 to 21 Dec 2026"));
  await expect(page.getByTestId("mandate-fit")).toContainText("Fits the existing mandate");
  await act(page, page.getByTestId("approve-amendment"), () => expect(page.getByTestId("amendment")).toContainText("merchant approved"));
  await page.goto("/agreement?role=buyer");
  await expect(page.getByTestId("buyer-view")).toContainText("moves from 1 Dec 2026 to 21 Dec 2026");
  await page.getByTestId("authority").check();
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("buyer-view")).toContainText("You accepted version 2");
  await page.goto("/timeline");
  await expect(page.getByText("Adaptive Deals retry removed; revised payment scheduled.").first()).toBeVisible();
  await expect(page.getByTestId("amendment")).toContainText("collection updated");
  await expect(page.getByTestId("version-history")).toContainText("superseded");
  await expect(page.getByTestId("collections")).toContainText("failed");
  await expect(page.getByTestId("collections")).toContainText("removed");
  await expect(page.getByTestId("ledger")).toContainText("Unpaid service value");
  await act(page, page.getByRole("button", { name: "Show the no-feasible-deal example" }), () => expect(page.getByTestId("no-feasible-example")).toContainText("none passes"));
  await shot(page, "desktop-5-timeline");
});

test("all four failure states are available in the product", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);
  await page.goto("/workspace");
  await expect(page.getByTestId("constraint-profile").or(page.getByText("Engine state: Ambiguous — clarification needed"))).toBeVisible();
  for (const [id, text] of [
    ["scenario-insufficient", "Insufficient information"],
    ["scenario-outside", "Outside supported templates"],
    ["scenario-no-feasible", "No feasible deal"],
  ] as const) {
    await page.getByTestId(id).click();
    await expect(page.getByTestId("scenario-result")).toContainText(`Engine state: ${text}`);
  }
  await shot(page, "desktop-6-failure-state-no-feasible");
});

test("guided demo runs the storyboard deterministically", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);
  await page.goto("/workspace");
  for (let i = 0; i < 12; i++) {
    const before = await page.getByTestId("demo-guide").textContent();
    await page.getByTestId("demo-next").click();
    await expect(page.getByTestId("demo-guide")).not.toHaveText(before!);
  }
  await expect(page.getByTestId("demo-guide")).toContainText("Storyboard complete");
});

test("mobile layout: every view at 390×844 without horizontal scroll", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await reset(page);
  for (let i = 0; i < 6; i++) await page.request.post("/api/actions", { data: { action: "demo_next" } });
  for (const [path, name] of [
    ["/workspace", "mobile-1-workspace"],
    ["/clarification", "mobile-2-clarification"],
    ["/decision", "mobile-3-decision"],
    ["/agreement", "mobile-4-agreement-merchant"],
    ["/agreement?role=buyer", "mobile-4-agreement-buyer"],
    ["/timeline", "mobile-5-timeline"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await noHorizontalScroll(page);
    await shot(page, name);
  }
});
