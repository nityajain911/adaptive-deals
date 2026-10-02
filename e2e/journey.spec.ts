import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { DemoState } from "@/lib/service";

const SHOTS = "artifacts/ui-review";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const STORE = path.join(".data-e2e", "store.json");
const PRESENTER = path.join(".data-e2e", "presenter.json");

type StoredState = DemoState & Record<string, unknown>;

async function api(page: Page, data: Record<string, unknown>, ok = true) {
  const response = await page.request.post("/api/actions", { data });
  const json = (await response.json()) as { ok: boolean; error?: string; result?: unknown };
  expect(json.ok, JSON.stringify(json)).toBe(ok);
  return json;
}

const state = () => JSON.parse(readFileSync(STORE, "utf8")) as StoredState;
const save = (s: StoredState) => writeFileSync(STORE, JSON.stringify(s, null, 2) + "\n");
const reset = (page: Page) => api(page, { action: "reset" });
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "horizontal page overflow").toBeLessThanOrEqual(1);
}

function clarification(id: string) {
  return state().conversation.find((m) => m.kind === "clarification" && m.refs?.questionId === id)!;
}

async function prepareOptions(page: Page) {
  await reset(page);
  await api(page, { action: "send_questions" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-gst").id, scriptId: "clar-gst-yes" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-approval").id, scriptId: "clar-approval-contract" });
  await api(page, { action: "adopt_replies" });
  expect(state().status).toBe("options_ready");
}

async function prepareDraft(page: Page) {
  await prepareOptions(page);
  await api(page, { action: "review_buyer_proposal" });
  const draft = state().agreements.find((a) => a.status === "draft")!;
  expect(draft).toBeTruthy();
  return draft;
}

async function prepareSent(page: Page) {
  const draft = await prepareDraft(page);
  await api(page, { action: "approve_and_send_draft", version: draft.version, termsHash: draft.termsHash });
  expect(state().status).toBe("sent");
  return state().agreements.find((a) => a.version === draft.version)!;
}

async function prepareAccepted(page: Page) {
  const agreement = await prepareSent(page);
  await api(page, { action: "accept_agreement", version: agreement.version, termsHash: agreement.termsHash, authorityConfirmed: true });
  expect(state().status).toBe("active");
  return state().agreements.find((a) => a.version === agreement.version)!;
}

async function expectStage(page: Page, stage: "understand" | "offer" | "track", headline: RegExp | string, primary?: RegExp | string) {
  await expect(page.getByTestId("status-headline")).toContainText(headline);
  await expect(page.getByTestId("stage-tracker").locator(`[data-stage="${stage}"]`)).toHaveAttribute("aria-current", "step");
  const actions = page.getByTestId("primary-action");
  await expect(actions).toHaveCount(primary ? 1 : 0);
  if (primary) await expect(actions).toContainText(primary);
}

async function clickPrimary(page: Page) {
  const before = (await page.getByTestId("status-headline").textContent()) ?? "";
  await page.getByTestId("primary-action").click();
  await page.waitForFunction((text) => (document.querySelector('[data-testid="status-headline"]')?.textContent ?? "") !== text || location.pathname.endsWith("/preview"), before);
}

async function toggleDetails(page: Page, testIds: string[]) {
  for (const testId of testIds) {
    const details = page.getByTestId(testId);
    const summary = details.locator(":scope > summary");
    await expect(summary).toBeVisible();
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await page.keyboard.press("Space");
    await expect(details).not.toHaveAttribute("open", "");
  }
}

function asV1(s: StoredState) {
  const copy = structuredClone(s) as Record<string, unknown>;
  for (const key of ["schemaVersion", "eligibleAt", "selectedOption", "deliveries", "outcomes", "handledMessages", "interpretations", "reviewRequired"]) delete copy[key];
  return copy as StoredState;
}

test.describe.configure({ mode: "serial" });

test("90-second storyboard follows the three-stage preventive journey", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);
  await page.goto("/deals/hero");

  await expectStage(page, "understand", "Confirm two details", "Send 2 questions to buyer");
  await shot(page, "desktop-1-understand");
  await clickPrimary(page);
  await expectStage(page, "understand", "Waiting for the buyer", undefined);

  await page.getByTestId("demo-reply-choice").selectOption("clar-gst-yes");
  await page.getByTestId("demo-reply-send").click();
  await expect(page.getByTestId("demo-reply-choice")).toHaveValue("clar-approval-contract");
  await page.getByTestId("demo-reply-send").click();
  await expectStage(page, "understand", "The buyer answered", "Use these answers");
  await clickPrimary(page);

  await expectStage(page, "offer", "Review this offer", "Review buyer proposal");
  await expect(page.getByTestId("recommendation")).toContainText("Recommended");
  await shot(page, "desktop-2-offer");
  await clickPrimary(page);
  await expect(page).toHaveURL(/\/deals\/hero\/offer\/preview$/);
  await expect(page.getByTestId("preview-frame")).toContainText("Not sent");
  await expect(page.getByTestId("primary-action")).toHaveText("Approve and send to buyer");
  await shot(page, "desktop-3-preview");

  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/deals\/hero\/track$/);
  await expectStage(page, "track", "Waiting for the buyer to review offer version 1", undefined);
  await shot(page, "desktop-5-track-waiting");
  await page.getByTestId("open-buyer-proposal").click();
  await expect(page.getByTestId("buyer-view")).toBeVisible();
  await shot(page, "desktop-4-buyer-proposal");
  await page.getByTestId("authority").check();
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("buyer-status")).toContainText("Accepted");
  await page.getByTestId("back-to-merchant").click();

  await expectStage(page, "track", /Waiting for the buyer to pay the upfront link and authorise/, undefined);
  await page.getByTestId("demo-next").click();
  await expect(page.getByTestId("demo-step")).toContainText("authorises the mandate");
  await page.getByTestId("demo-next").click();
  await expect(page.getByTestId("demo-step")).toContainText("Advance simulated date");
  await page.getByTestId("demo-next").click();
  await expect(page.getByTestId("demo-step")).toContainText("Send scheduled advance notice");
  await page.getByTestId("demo-next").click();
  await expect(page.getByTestId("demo-reply-choice")).toHaveValue("notice-cash-tight");
  await page.getByTestId("demo-reply-send").click();
  await expectStage(page, "track", /can't pay until after 20 Dec 2026/, "Draft revised terms");
  await clickPrimary(page);
  await expectStage(page, "track", "Review the revised terms", "Review revised terms");
  await expect(page.getByTestId("amendment-card")).toContainText("Read by code, not AI");
  await shot(page, "desktop-6-amendment");
  await page.getByTestId("primary-action").click();
  await expect(page.getByTestId("amendment-card")).toHaveAttribute("open", "");
  await page.getByTestId("approve-revised-terms").click();
  await expectStage(page, "track", "Waiting for the buyer to accept the revised terms", undefined);
  await page.getByTestId("open-buyer-proposal").click();
  await page.getByTestId("authority").check();
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("buyer-status")).toContainText("Accepted");
  await page.getByTestId("back-to-merchant").click();
  await expect(page.getByTestId("amendment-settled")).toContainText("Payment rescheduled to 21 Dec 2026");
  await expectStage(page, "track", /next payment ₹23,010 on 21 Dec 2026/, undefined);
  await shot(page, "desktop-7-rescheduled");
});

test("the complete journey works with demo controls hidden", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);
  await page.goto("/deals/hero/understand");
  await page.getByTestId("demo-menu").click();
  await page.getByTestId("hide-demo-controls").click();
  await expect(page.getByTestId("demo-bar")).toHaveCount(0);

  await clickPrimary(page);
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-gst").id, scriptId: "clar-gst-yes" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-approval").id, scriptId: "clar-approval-contract" });
  await page.reload();
  await clickPrimary(page);
  await clickPrimary(page);
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/track$/);
  await page.getByTestId("open-buyer-proposal").click();
  await page.getByTestId("authority").check();
  await page.getByTestId("accept").click();
  await api(page, { action: "demo_system_step", stepId: "pay_upfront_link" });
  await api(page, { action: "demo_system_step", stepId: "confirm_mandate" });
  await api(page, { action: "demo_system_step", stepId: "advance_to_notice" });
  await api(page, { action: "demo_system_step", stepId: "send_notice" });
  const notice = state().conversation.findLast((m) => m.kind === "notice")!;
  await api(page, { action: "buyer_reply", inReplyTo: notice.id, scriptId: "notice-cash-tight" });
  await page.goto("/deals/hero/track");
  await clickPrimary(page);
  await page.getByTestId("primary-action").click();
  await page.getByTestId("approve-revised-terms").click();
  await page.getByTestId("open-buyer-proposal").click();
  await page.getByTestId("authority").check();
  await page.getByTestId("accept").click();
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("amendment-settled")).toBeVisible();
  await expect(page.getByTestId("demo-bar")).toHaveCount(0);
});

test("demo Next navigates to merchant decisions but never approves them", async ({ page }) => {
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("demo-next-link")).toHaveText("Go there");
  await page.getByTestId("demo-next-link").click();
  expect(state().agreements.filter((a) => a.merchantApproval)).toHaveLength(0);
  await expect(page.getByTestId("primary-action")).toHaveText("Review buyer proposal");
});

test("advance date and send notice are two explicit system steps", async ({ page }) => {
  await prepareAccepted(page);
  await api(page, { action: "demo_system_step", stepId: "pay_upfront_link" });
  await api(page, { action: "demo_system_step", stepId: "confirm_mandate" });
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("demo-next")).toContainText("Advance simulated date to 28 Nov 2026");
  const advancesBefore = state().clockAdvances.length;
  await page.getByTestId("demo-next").click();
  await expect(page.getByTestId("demo-next")).toContainText("Send scheduled advance notice");
  expect(state().clockAdvances).toHaveLength(advancesBefore + 1);
  expect(state().notices.filter((n) => n.sentAt)).toHaveLength(0);
  await page.getByTestId("demo-next").click();
  await expect(page.getByTestId("demo-reply")).toBeVisible();
  expect(state().notices.filter((n) => n.sentAt)).toHaveLength(1);
});

test("stale preview is blocked and a failed send remains retryable", async ({ page }) => {
  const draft = await prepareDraft(page);
  const stale = state();
  stale.selectedOption!.fingerprint = "stale-review";
  save(stale);
  const refused = await api(page, { action: "approve_and_send_draft", version: draft.version, termsHash: draft.termsHash }, false);
  expect(refused.error).toMatch(/changed|stale|review/i);
  expect(state().deliveries ?? []).toHaveLength(0);

  const fresh = await prepareDraft(page);
  writeFileSync(PRESENTER, JSON.stringify({ failNextSend: true }, null, 2) + "\n");
  await page.goto("/deals/hero/offer/preview");
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
  await expectStage(page, "offer", "Approved · not yet sent", "Retry sending");
  const hidden = await page.request.get(`/proposal/agr-hero/v${fresh.version}`);
  expect(hidden.status()).toBe(404);
  await clickPrimary(page);
  await expect(page).toHaveURL(/\/deals\/hero\/track$/);
  await expectStage(page, "track", "Waiting for the buyer to review", undefined);
});

test("legacy routes redirect to the domain-derived current stage", async ({ page }) => {
  await reset(page);
  for (const route of ["/workspace", "/clarification", "/decision", "/agreement", "/timeline"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
  }
  await prepareOptions(page);
  await page.goto("/decision");
  await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
});

test("v1 stores migrate only when delivery evidence supports the saved state", async ({ page }) => {
  await prepareAccepted(page);
  const accepted = asV1(state());
  save(accepted);
  await page.goto("/deals/hero");
  await expect(page).toHaveURL(/\/deals\/hero\/track$/);
  await expectStage(page, "track", /Buyer accepted/, undefined);

  const inconsistent = asV1(state());
  inconsistent.status = "sent";
  inconsistent.agreements = inconsistent.agreements.map((a) => ({ ...a, status: "sent", buyerAcceptance: null }));
  inconsistent.conversation = inconsistent.conversation.filter((m) => m.kind !== "proposal");
  save(inconsistent);
  await page.goto("/deals/hero");
  await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
  await expect(page.getByTestId("status-headline")).toContainText("Saved deal records need review");
  await expect(page.getByTestId("primary-action")).toHaveText("Inspect records");
  await page.getByTestId("primary-action").click();
  await expect(page.getByTestId("audit-drawer")).toBeVisible();
  const blocked = await api(page, { action: "approve_and_send_draft", version: 1, termsHash: inconsistent.agreements[0].termsHash }, false);
  expect(blocked.error).toContain("need review");
});

test("merchant audit shows sources and attribution without presenter controls", async ({ page }) => {
  await reset(page);
  await page.goto("/deals/hero/understand");
  await page.getByTestId("audit-details").click();
  const drawer = page.getByTestId("audit-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(/Source|Evidence/);
  await expect(drawer).toContainText(/AI|code fallback|engine/i);
  await expect(page.getByText("Run live", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Fail next send", { exact: false })).toHaveCount(0);
});

test("Other outcomes live on the presenter page only", async ({ page }) => {
  await reset(page);
  await page.goto("/deals/hero/understand");
  await expect(page.getByTestId("other-outcomes")).toHaveCount(0);
  await expect(page.getByText("Other outcomes", { exact: true })).toHaveCount(0);
  await page.goto("/presenter");
  await expect(page.getByTestId("other-outcomes")).toBeVisible();
});

test("390px layouts remain focused and free of horizontal overflow", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await reset(page);
  await page.goto("/deals/hero/understand");
  await noHorizontalScroll(page);
  await shot(page, "mobile-1-understand");
  await page.getByTestId("audit-details").click();
  const drawerBox = await page.getByTestId("audit-drawer").boundingBox();
  expect(drawerBox?.width).toBe(390);
  await page.keyboard.press("Escape");

  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  await noHorizontalScroll(page);
  await shot(page, "mobile-2-offer");
  await page.getByTestId("primary-action").click();
  await noHorizontalScroll(page);
  await page.getByTestId("primary-action").click();
  await page.getByTestId("open-buyer-proposal").click();
  await noHorizontalScroll(page);
  await shot(page, "mobile-3-buyer-proposal");
  await page.getByTestId("authority").check();
  await page.getByTestId("accept").click();
  await page.getByTestId("back-to-merchant").click();
  await expect(page.getByTestId("status-banner")).toBeVisible();
  await expect(page.getByTestId("payment-schedule")).toBeVisible();
  await noHorizontalScroll(page);
  await shot(page, "mobile-4-track");
});

test("stage links, audit drawer and disclosures work from the keyboard", async ({ page }) => {
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  const understand = page.getByTestId("stage-tracker").locator('[data-stage="understand"]');
  await understand.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/understand$/);
  await page.getByTestId("go-to-current").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/offer$/);

  const opener = page.getByTestId("audit-details");
  await opener.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByTestId("audit-drawer");
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.querySelector('[data-testid="audit-drawer"]')?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();

  await toggleDetails(page, ["see-economics", "compare-alternatives", "why-not-others"]);
  await page.getByTestId("primary-action").click();
  await toggleDetails(page, ["preview-agreement-details"]);
  await page.getByTestId("primary-action").click();
  await page.getByTestId("open-buyer-proposal").click();
  await toggleDetails(page, ["agreement-details"]);
});

test("initial Offer viewport keeps rejections and funding detail collapsed", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("recommendation")).toBeVisible();
  await expect(page.getByTestId("featured-buyer-rejection")).toBeHidden();
  await expect(page.getByTestId("featured-seller-rejection")).toBeHidden();
  const fundingLabels = page.getByText("Peak funding requirement", { exact: false });
  let visibleFundingLabels = 0;
  for (let i = 0; i < (await fundingLabels.count()); i++) {
    if (await fundingLabels.nth(i).isVisible()) visibleFundingLabels++;
  }
  expect(visibleFundingLabels).toBe(0);
});
