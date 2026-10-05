import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { DemoState } from "@/lib/service";

const STORE = path.join(".data-e2e", "store.json");
const MOBILE = { width: 390, height: 844 };

const state = () => JSON.parse(readFileSync(STORE, "utf8")) as DemoState;

async function api(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post("/api/actions", { data });
  const json = (await response.json()) as { ok: boolean; error?: string };
  expect(json.ok, JSON.stringify(json)).toBe(true);
}

const reset = (page: Page) => api(page, { action: "reset" });
const startCase = (page: Page, caseId = "reduced-scope") => api(page, { action: "start_case", caseId });
const guide = (page: Page) => page.getByTestId("walkthrough");

async function openGuide(page: Page) {
  if (await guide(page).count()) return;
  await page.getByTestId("walkthrough-launcher").click();
  await expect(guide(page)).toBeVisible();
}

async function productPrimary(page: Page) {
  await page.getByTestId("primary-action").click();
}

function clarification(questionId: string) {
  return state().conversation.find((item) => item.kind === "clarification" && item.refs.questionId === questionId)!;
}

async function prepareSent(page: Page) {
  await startCase(page);
  await api(page, { action: "send_questions" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-gst").id, scriptId: "clar-gst-yes" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-approval").id, scriptId: "clar-approval-contract" });
  await api(page, { action: "adopt_replies" });
  await api(page, { action: "review_buyer_proposal" });
  const draft = state().agreements.find((agreement) => agreement.status === "draft")!;
  await api(page, { action: "approve_and_send_draft", version: draft.version, termsHash: draft.termsHash });
  return state().agreements.find((agreement) => agreement.version === draft.version)!;
}

test.describe.configure({ mode: "serial" });

test("first visit starts at case selection and deliberate selection advances to Understand", async ({ page }) => {
  await reset(page);
  await page.goto("/deals");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("walkthrough-welcome")).toBeVisible();
  await page.getByTestId("start-walkthrough").click();
  await expect(guide(page)).toContainText("STEP 1 OF 4");
  await page.getByTestId("select-case-reduced-scope").click();
  await page.getByTestId("start-selected-case").click();
  await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
  await expect(guide(page)).toContainText("STEP 2 OF 4");
  await expect(guide(page)).toContainText("Understand the buyer");
});

test("guide completes the core journey while every merchant decision stays in the product", async ({ page }) => {
  await reset(page);
  await startCase(page);
  await page.goto("/deals/hero/understand");
  await openGuide(page);

  await expect(guide(page)).toContainText("Merchant action");
  await productPrimary(page);
  await expect(guide(page).getByTestId("walkthrough-reply-choice")).toHaveValue("clar-gst-yes");
  await guide(page).locator("[data-walkthrough-primary]").click();
  await expect(guide(page).getByTestId("walkthrough-reply-choice")).toHaveValue("clar-approval-contract");
  await guide(page).locator("[data-walkthrough-primary]").click();
  await expect(page.getByTestId("primary-action")).toContainText("Use these answers");
  await productPrimary(page);

  await expect(page).toHaveURL(/\/offer$/);
  await expect(guide(page)).toContainText("STEP 3 OF 4");
  await productPrimary(page);
  await expect(page).toHaveURL(/\/offer\/preview$/);
  await expect(guide(page).getByTestId("walkthrough-consequence")).toContainText("approve and send");
  await productPrimary(page);

  await expect(page).toHaveURL(/\/track$/);
  await expect(guide(page)).toContainText("STEP 4 OF 4");
  await expect(guide(page).locator("[data-walkthrough-primary]")).toContainText("Take me there");
  await guide(page).locator("[data-walkthrough-primary]").click();
  await expect(page).toHaveURL(/\/proposal\/agr-hero\/v1$/);
  await page.getByTestId("authority").check();
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("buyer-status")).toContainText("Accepted");
  await expect(guide(page)).toContainText(/Explore another product capability/i);
});

test("route changes and reload preserve the domain-derived objective and Take me there restores focus", async ({ page }) => {
  await reset(page);
  await startCase(page);
  await api(page, { action: "send_questions" });
  await page.goto("/deals");
  await openGuide(page);
  await expect(guide(page)).toContainText("Understand the buyer");
  await page.reload();
  await expect(guide(page)).toContainText("Understand the buyer");
  await expect(guide(page).locator("[data-walkthrough-primary]")).toContainText("Take me there");
  await guide(page).locator("[data-walkthrough-primary]").click();
  await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
  await expect(page.locator('[data-walkthrough="buyer-conversation"]')).toBeFocused();
});

test("hide leaves the product usable and the header resumes the updated objective", async ({ page }) => {
  await reset(page);
  await startCase(page);
  await page.goto("/deals/hero/understand");
  await openGuide(page);
  await guide(page).getByRole("button", { name: "Hide" }).click();
  await expect(guide(page)).toHaveCount(0);
  await productPrimary(page);
  await page.getByTestId("walkthrough-launcher").click();
  await expect(guide(page)).toContainText("Buyer action");
});

test("restart warns and atomically returns to case selection", async ({ page }) => {
  await reset(page);
  await startCase(page);
  await api(page, { action: "send_questions" });
  await page.goto("/deals/hero/understand");
  await openGuide(page);
  page.once("dialog", (dialog) => dialog.accept());
  await guide(page).getByRole("button", { name: "Restart" }).click();
  await expect(page).toHaveURL(/\/deals$/);
  await expect(guide(page)).toContainText("STEP 1 OF 4");
  expect(state().events.some((event) => event.kind === "case_started")).toBe(false);
});

test("no-fit and buyer-declined outcomes end honestly without an invoice action", async ({ page }) => {
  await reset(page);
  await startCase(page, "no-fit");
  await page.goto("/deals/hero");
  await openGuide(page);
  await expect(guide(page)).toContainText(/No offer fits|custom arrangement/i);
  await expect(guide(page)).not.toContainText(/invoice/i);

  await reset(page);
  const sent = await prepareSent(page);
  await api(page, { action: "decline", version: sent.version });
  await page.goto("/deals/hero/track");
  await openGuide(page);
  await expect(guide(page)).toContainText("Buyer declined the offer");
  await expect(guide(page)).not.toContainText(/invoice/i);
  await expect(guide(page).locator("[data-walkthrough-primary]")).toHaveCount(0);
});

test("keyboard users can open the guide and move focus to the product target", async ({ page }) => {
  await reset(page);
  await startCase(page);
  await page.goto("/deals/hero/understand");
  await page.getByTestId("walkthrough-launcher").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#walkthrough-heading")).toBeFocused();
  await guide(page).locator("[data-walkthrough-primary]").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-walkthrough="buyer-conversation"]')).toBeFocused();
});

test("390 px uses a compact bottom sheet without covering the product action or overflowing", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await reset(page);
  await page.goto("/deals");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId("start-walkthrough").click();
  const sheet = guide(page);
  await expect(sheet.getByTestId("walkthrough-mobile-toggle")).toBeFocused();
  await expect(sheet.getByTestId("walkthrough-mobile-toggle")).toHaveAttribute("aria-expanded", "false");
  const collapsed = await sheet.boundingBox();
  expect(collapsed!.height).toBeLessThan(90);
  const action = page.getByTestId("start-selected-case");
  await action.scrollIntoViewIfNeeded();
  const actionBox = await action.boundingBox();
  const sheetBox = await sheet.boundingBox();
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(sheetBox!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await sheet.getByTestId("walkthrough-mobile-toggle").click();
  await expect(sheet.getByTestId("walkthrough-mobile-toggle")).toHaveAttribute("aria-expanded", "true");
  expect((await sheet.boundingBox())!.height).toBeGreaterThan(200);
});
