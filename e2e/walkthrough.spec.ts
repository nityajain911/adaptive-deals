import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { DemoState } from "@/lib/service";

const STORE = path.join(".data-e2e", "store.json");
const MOBILE = { width: 390, height: 844 };

const state = () => JSON.parse(readFileSync(STORE, "utf8")) as DemoState;

/** Reviewer tools (guide, audit trail) live in the presenter frame; open it only if it is closed. */
async function clickReviewer(page: Page, testId: "audit-details" | "walkthrough-launcher") {
  const menu = page.getByTestId("presenter-frame");
  if ((await menu.getAttribute("open")) === null) await page.getByTestId("presenter-frame-toggle").click();
  await page.getByTestId(testId).click();
}

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
  await clickReviewer(page, "walkthrough-launcher");
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
  // The guide opens on the merchant's own inputs: the business economics.
  await expect(page).toHaveURL(/\/economics$/);
  await expect(guide(page)).toContainText("STEP 1 OF 6");
  await expect(guide(page)).toContainText("Set your prices & costs");
  await guide(page).getByRole("button", { name: "Continue: choose a buyer situation" }).click();
  await expect(page).toHaveURL(/\/deals$/);
  await expect(guide(page)).toContainText("STEP 2 OF 6");
  await page.getByTestId("select-case-reduced-scope").click();
  await page.getByTestId("start-selected-case").click();
  await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
  await expect(guide(page)).toContainText("STEP 3 OF 6");
  await expect(guide(page)).toContainText("Understand the buyer");
});

test("guide completes the core journey while every merchant decision stays in the product", async ({ page }) => {
  await reset(page);
  await startCase(page);
  await page.goto("/deals/hero/understand");
  await openGuide(page);

  await expect(guide(page)).toContainText("Your turn");
  await productPrimary(page);
  await expect(guide(page).getByTestId("walkthrough-reply-choice")).toHaveAttribute("data-value", "clar-gst-yes");
  await guide(page).locator("[data-walkthrough-primary]").click();
  await expect(guide(page).getByTestId("walkthrough-reply-choice")).toHaveAttribute("data-value", "clar-approval-contract");
  await guide(page).locator("[data-walkthrough-primary]").click();
  await expect(page.getByTestId("primary-action")).toHaveText("Review offer");
  await productPrimary(page);

  await expect(page).toHaveURL(/\/offer$/);
  await expect(guide(page)).toContainText("STEP 4 OF 6");
  await productPrimary(page);
  await expect(page).toHaveURL(/\/offer\/preview$/);
  await expect(guide(page).getByTestId("walkthrough-your-turn")).toContainText("Send offer");
  await productPrimary(page);

  await expect(page).toHaveURL(/\/deals(\?sent=1)?$/);
  await expect(page.getByTestId("offer-sent-confirmation")).toContainText("Offer sent to");
  await expect(guide(page)).toContainText("STEP 5 OF 6");
  await expect(guide(page).locator("[data-walkthrough-primary]")).toContainText("Take me there");
  await guide(page).locator("[data-walkthrough-primary]").click();
  await expect(page).toHaveURL(/\/proposal\/agr-hero\/v1$/);
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("buyer-status")).toContainText("You accepted this version");
  await expect(guide(page)).toContainText("STEP 5 OF 6");
  // The buyer pays and sets up auto-pay on their own page; the guide points there and never performs it.
  await expect(guide(page).getByTestId("walkthrough-your-turn")).toContainText("Pay and set up auto-pay");
  await page.getByTestId("setup-pay").click();
  await expect(page.getByTestId("setup-done")).toBeVisible();
  await page.goto("/deals/hero/track");
  await guide(page).locator("[data-walkthrough-primary]").click();
  await expect(guide(page)).toContainText("STEP 6 OF 6");
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
  await clickReviewer(page, "walkthrough-launcher");
  await expect(guide(page)).toContainText("Simulated buyer action");
});

test("a hidden walkthrough has a visible resume button at desktop, tablet and phone widths", async ({ page }) => {
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await reset(page);
    await startCase(page);
    await page.goto("/deals/hero/understand");
    await openGuide(page);
    const menu = page.getByTestId("presenter-frame");
    if (await menu.getAttribute("open") !== null) await page.getByTestId("presenter-frame-toggle").click();
    if (width === 390) await page.getByTestId("walkthrough-mobile-toggle").click();
    await guide(page).getByRole("button", { name: "Hide" }).click();
    await expect(guide(page)).toHaveCount(0);
    await expect(page.getByTestId("walkthrough-resume")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("walkthrough-resume")).toBeVisible();
    const before = JSON.stringify(state());
    await page.getByTestId("walkthrough-resume").click();
    await expect(guide(page)).toBeVisible();
    await expect(guide(page)).toContainText("STEP 3 OF 6");
    await expect(page.getByTestId("walkthrough-resume")).toHaveCount(0);
    expect(JSON.stringify(state())).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
});

test("restart warns and atomically returns to case selection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await reset(page);
  await startCase(page);
  await api(page, { action: "send_questions" });
  await page.goto("/deals/hero/understand");
  await openGuide(page);
  page.once("dialog", (dialog) => dialog.accept());
  await guide(page).getByRole("button", { name: "Restart" }).click();
  await expect(page).toHaveURL(/\/economics$/);
  await expect(guide(page)).toContainText("STEP 1 OF 6");
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
  await page.getByTestId("presenter-frame-toggle").focus();
  await page.keyboard.press("Enter");
  await page.getByTestId("walkthrough-launcher").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#walkthrough-heading")).toBeFocused();
  await guide(page).locator("[data-walkthrough-show]").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("primary-action")).toBeFocused();
});

test("390 px uses a compact bottom sheet without covering the product action or overflowing", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await reset(page);
  await page.goto("/deals");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId("start-walkthrough").click();
  await expect(page).toHaveURL(/\/economics$/);
  await page.goto("/deals");
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

test("a merchant step has no guide button: it names the product's button and Show me points at it", async ({ page }) => {
  await reset(page);
  await startCase(page);
  await page.goto("/deals/hero/understand");
  await openGuide(page);
  await expect(guide(page).getByTestId("walkthrough-your-turn")).toContainText("Your turn");
  await expect(guide(page).getByTestId("walkthrough-your-turn")).toContainText("“Send 2 questions to buyer”");
  await expect(guide(page)).not.toContainText("Complete this in the product");
  await expect(guide(page).locator("[data-walkthrough-primary]")).toHaveCount(0);
  await guide(page).locator("[data-walkthrough-show]").click();
  await expect(page.getByTestId("primary-action")).toHaveAttribute("data-walkthrough-pulse", "true");
  await expect(page.getByTestId("primary-action")).toBeFocused();
  // The guide did not do the merchant's job.
  expect(state().conversation.some((item) => item.kind === "clarification" && item.sentAt)).toBe(false);
});

test("simulated buyer and system controls are violet and labelled, and the buyer's own button is named on the buyer's page", async ({ page }) => {
  await reset(page);
  const sent = await prepareSent(page);
  await page.goto("/deals/hero/track");
  await openGuide(page);
  await guide(page).locator("[data-walkthrough-primary]").click();
  await expect(page).toHaveURL(/\/proposal\/agr-hero\/v1$/);
  await expect(guide(page).getByTestId("walkthrough-your-turn")).toContainText("Play the buyer");
  await expect(guide(page).getByTestId("walkthrough-your-turn")).toContainText("“Accept proposal”");
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("buyer-status")).toContainText("You accepted this version");
  expect(state().agreements.find((a) => a.version === sent.version)!.status).toBe("active");
  await page.getByTestId("setup-pay").click();
  await expect(page.getByTestId("setup-done")).toBeVisible();
  await page.goto("/deals/hero/track");
  await expect(guide(page).locator("[data-walkthrough-primary]")).toHaveClass(/bg-violet-weak/);
  await expect(guide(page).getByTestId("walkthrough-consequence")).toContainText("Simulated system event");
});

test("the guide keeps the current buyer action focused instead of repeating a stage checklist", async ({ page }) => {
  await reset(page);
  await startCase(page);
  await page.goto("/deals/hero/understand");
  await openGuide(page);
  await expect(guide(page).getByTestId("walkthrough-substeps")).toHaveCount(0);
  await expect(guide(page).getByTestId("walkthrough-your-turn")).toContainText("Send 2 questions to buyer");
  await api(page, { action: "send_questions" });
  await page.reload();
  await expect(guide(page).getByTestId("walkthrough-reply-choice")).toBeVisible();
});

test("tablet and desktop dock the walkthrough beside the product instead of covering it", async ({ page }) => {
  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await reset(page);
    await startCase(page);
    await page.goto("/deals/hero/understand");
    await openGuide(page);
    const box = (await guide(page).boundingBox())!;
    expect(box.width).toBe(width >= 1280 ? 360 : 320);
    const product = (await page.locator("main").boundingBox())!;
    expect(product.x + product.width).toBeLessThanOrEqual(box.x);
    const action = page.getByTestId("primary-action");
    await action.scrollIntoViewIfNeeded();
    const actionBox = (await action.boundingBox())!;
    expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(box.x);
    await expect(action).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
});

test("Show me collapses the phone guide and reveals the product action", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await reset(page);
  await startCase(page);
  await page.goto("/deals/hero/understand");
  await openGuide(page);
  await page.getByTestId("walkthrough-mobile-toggle").click();
  await guide(page).locator("[data-walkthrough-show]").click();
  await expect(page.getByTestId("walkthrough-mobile-toggle")).toHaveAttribute("aria-expanded", "false");
  const action = page.getByTestId("primary-action");
  await expect(action).toBeFocused();
  await expect.poll(async () => {
    const a = (await action.boundingBox())!;
    const g = (await guide(page).boundingBox())!;
    return a.y + a.height <= g.y;
  }).toBe(true);
});

test("the walkthrough ends with a summary and a way to try another case", async ({ page }) => {
  await reset(page);
  const v1 = await prepareSent(page);
  await api(page, { action: "accept_agreement", version: v1.version, termsHash: v1.termsHash, authorityConfirmed: true });
  for (const stepId of ["pay_upfront_link", "confirm_mandate", "advance_to_notice", "send_notice"]) await api(page, { action: "demo_system_step", stepId });
  const notice = state().conversation.find((item) => item.kind === "notice")!;
  await api(page, { action: "buyer_reply", inReplyTo: notice.id, scriptId: "notice-cash-tight" });
  await api(page, { action: "propose_amendment" });
  const v2 = state().agreements.find((a) => a.version === 2)!;
  await api(page, { action: "approve_amendment", termsHash: v2.termsHash });
  await api(page, { action: "accept_amendment", termsHash: v2.termsHash, authorityConfirmed: true });
  await page.goto("/deals/hero/track");
  await openGuide(page);
  const finish = guide(page).getByTestId("walkthrough-finish");
  await expect(finish).toContainText("Walkthrough complete");
  await expect(finish).toContainText("You walked through: They only need the website and search for now.");
  await expect(finish).toContainText("Your decisions: approved version 1, approved version 2.");
  await expect(finish).toContainText("A payment was moved to a later date after both sides approved version 2.");
  await expect(guide(page).getByTestId("walkthrough-your-turn")).toHaveCount(0);
  await finish.getByTestId("walkthrough-try-another").click();
  await expect(page).toHaveURL(/\/deals$/);
});

test("the first screen opens with the problem, not the product", async ({ page }) => {
  await reset(page);
  await page.goto("/deals");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("walkthrough-welcome-title")).toHaveText("A client says your quote doesn't fit their budget. What now?");
  await expect(page.getByTestId("walkthrough-welcome-body")).toContainText("you decide every step");
  // The SIMULATED pill already says the buyer and payments are simulated; the welcome does not repeat it.
  await expect(page.getByTestId("simulated-pill")).toBeVisible();
});



test("prices & costs is the first tab, the guide's first step, and is tied to the recommendation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await reset(page);
  await page.goto("/economics");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const tabs = page.getByRole("navigation", { name: "Main" }).getByRole("link");
  await expect(tabs.nth(0)).toContainText(/Deal settings|Settings/);
  await expect(tabs.nth(1)).toContainText(/Active deals|Deals/);
  await expect(tabs).toHaveCount(2);
  // Settings stay apart from action: the settings page carries no "start a deal" and no deal results, before or after a deal is ready.
  await expect(page.getByRole("link", { name: "Start a deal" })).toHaveCount(0);
  await expect(page.getByTestId("rules-in-action")).toHaveCount(0);
  await startCase(page);
  await api(page, { action: "send_questions" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-gst").id, scriptId: "clar-gst-yes" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-approval").id, scriptId: "clar-approval-contract" });
  await api(page, { action: "adopt_replies" });
  await page.goto("/economics");
  await expect(page.getByTestId("rules-in-action")).toHaveCount(0);
  await page.goto("/deals/hero/offer");
  await page.getByTestId("see-economics").locator(":scope > summary").click();
  await page.getByTestId("offer-economics-link").click();
  await expect(page).toHaveURL(/\/economics$/);
  await page.goto("/deals");
  await page.getByTestId("nav-prices").click();
  await expect(page).toHaveURL(/\/economics$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

// ---- The presentation layer: presenter frame, guide pane, presenter page ----

test("the merchant's header carries no reviewer tools, and the SIMULATED pill is always there", async ({ page }) => {
  await reset(page);
  for (const viewport of [{ width: 1280, height: 900 }, MOBILE]) {
    await page.setViewportSize(viewport);
    for (const url of ["/deals", "/economics"]) {
      await page.goto(url);
      await expect(page.getByRole("banner")).not.toContainText("For reviewers");
      await expect(page.getByRole("banner")).not.toContainText("Presenter page");
      await expect(page.getByTestId("simulated-pill")).toBeVisible();
      await expect(page.getByTestId("simulated-pill")).toContainText("SIMULATED");
      await expect(page.locator("footer")).toContainText("Synthetic data");
    }
  }
});

test("the presenter frame holds the tools, closes by itself, and can start the deal again", async ({ page }) => {
  await startCase(page);
  await page.goto("/deals/hero/understand");
  await page.getByTestId("presenter-frame-toggle").click();
  const hub = page.getByTestId("presenter-hub");
  await expect(hub).toBeVisible();
  await expect(hub).toContainText("Not part of the product");
  await expect(hub.getByTestId("walkthrough-launcher")).toBeVisible();
  await expect(hub.getByTestId("audit-details")).toBeVisible();
  await expect(hub.getByTestId("nav-presenter")).toBeVisible();
  // It gets out of the way: a click elsewhere closes it, and so does Escape.
  await page.getByRole("heading", { level: 1 }).click();
  await expect(hub).toBeHidden();
  await page.getByTestId("presenter-frame-toggle").click();
  await page.keyboard.press("Escape");
  await expect(hub).toBeHidden();
  // Reset to step 1 after the deal has moved on.
  await api(page, { action: "send_questions" });
  expect(state().conversation.some((item) => item.kind === "clarification" && item.sentAt)).toBe(true);
  await page.goto("/deals/hero/understand");
  await page.getByTestId("presenter-frame-toggle").click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("presenter-reset-deal").click();
  await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
  await expect.poll(() => state().conversation.some((item) => item.kind === "clarification" && item.sentAt)).toBe(false);
});

test("the guide is a dark pane with one big Next step button, and quiet Hide and Restart links", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await reset(page);
  await page.goto("/deals");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId("start-walkthrough").click();
  await expect(guide(page)).toBeVisible();
  // Dark slate-blue, clearly apart from the white product.
  await expect.poll(() => guide(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/^(rgb\(11, 27, 63\)|oklab|color\()/);
  expect(await guide(page).evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(255, 255, 255)");
  const button = guide(page).locator("[data-walkthrough-primary]");
  await expect(button).toContainText("Next step");
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  for (const name of ["Hide", "Restart"]) {
    const link = guide(page).getByRole("button", { name });
    await expect(link).toBeVisible();
    expect(await link.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
  }
  await expect(guide(page).getByRole("button", { name: "Take me there" })).toHaveCount(0);
  await guide(page).getByTestId("walkthrough-under-the-hood").locator("summary").click();
  await expect(guide(page).getByTestId("walkthrough-under-the-hood")).toContainText("You decide. Nothing is sent or saved until you approve the exact terms.");
  await expect(guide(page)).not.toContainText("How this step is sourced");
});

test("presenter page · scenario cards, an honest cached-runs notice, and the rate-card Q&A with exact quotes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await reset(page);
  await page.goto("/presenter");
  await expect(page.getByTestId("presenter-using-cached")).toContainText("Using recorded runs");
  await expect(page.getByTestId("presenter")).not.toContainText("_API_KEY");
  await expect(page.getByTestId("scenario-cards").locator("li")).toHaveCount(3);
  for (const tone of ["blue", "green", "red"]) await expect(page.getByTestId(`scenario-card-${tone}`)).toBeVisible();
  const proof = page.getByTestId("commercial-memory-proof");
  await expect(proof.getByTestId("qa-claim")).toContainText("Code retrieves exact quotes; an AI re-ranker only reorders them; every answer cites its source line");
  await proof.getByRole("button", { name: "What is our discount policy?" }).click();
  const result = proof.getByTestId("memory-proof-result");
  await expect(result).toContainText("Source: Commercial guardrails");
  await expect(result).toContainText("Code retrieval");
  await expect(proof.getByTestId("memory-proof-live")).toBeDisabled();
  await proof.getByTestId("qa-unsupported").click();
  await expect(result).toContainText("Insufficient evidence");
  // The same question over a different set of documents is a new run, not an error.
  const upload = await page.request.post("/api/commercial-memory/actions", { data: { action: "upload_memory_source", title: "Qa probe", kind: "rate_card", effectiveFrom: "2026-10-08", format: "csv", fileName: "qa.csv", text: "Service,Price\nWebsite fixes,26001", supersedes: null } });
  const uploaded = (await upload.json()) as { ok: boolean; result?: { sourceId: string } };
  expect(uploaded.ok).toBe(true);
  await page.reload();
  await proof.getByTestId("qa-unsupported").click();
  await expect(result).toContainText("Insufficient evidence");
  await expect(proof).not.toContainText("did not work just now");
  await page.request.post("/api/commercial-memory/actions", { data: { action: "withdraw_memory_source", sourceId: uploaded.result!.sourceId } });
  await expect(page.locator("body")).not.toContainText(/vector/i);
  await page.setViewportSize(MOBILE);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("presenter evidence · raw records are dark JSON blocks with a Copy JSON button, and the run is marked Reproduced", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await startCase(page);
  await page.goto("/presenter");
  await page.getByRole("tab", { name: "Evidence and integrity" }).click();
  await expect(page.getByTestId("presenter-integrity")).toContainText("Reproduced");
  const blocks = page.getByTestId("presenter-evidence").locator("figure");
  await expect(blocks).toHaveCount(4);
  await expect(blocks.first().locator("pre")).toHaveCSS("overflow-x", "auto");
  expect(await blocks.first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(30, 30, 30)");
  const first = blocks.first();
  await first.getByTestId("copy-json").click();
  await expect(first.getByTestId("copy-json")).toContainText("Copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(() => JSON.parse(copied)).not.toThrow();
});
