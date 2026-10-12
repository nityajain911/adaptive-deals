import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { DemoState } from "@/lib/service";

/**
 * Scope confirmation journeys on the hand-written sample. The preserve-scope buyer asks for "the complete
 * annual package" without naming services, so the merchant confirms which services that means before any
 * offer is shown or can be sent.
 */
const STORE = path.join(".data-e2e", "store.json");
const SHOTS = "artifacts/ui-review";
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
type CaseId = "reduced-scope" | "preserve-scope" | "no-fit";
const SERVICES = ["website-fixes", "search-marketing", "social-media", "monthly-reporting"];

/** Review screenshots of recorded runs. Written only with a prefix, so existing files are never overwritten. */
const shot = (page: Page, name: string) => {
  const prefix = process.env.ADAPTIVE_E2E_SHOT_PREFIX;
  if (process.env.ADAPTIVE_E2E_NO_SHOTS === "1" || !prefix) return Promise.resolve(Buffer.alloc(0));
  return page.screenshot({ path: `${SHOTS}/${prefix}${name}.png`, fullPage: true });
};

type Stored = DemoState & Record<string, unknown>;
const state = () => JSON.parse(readFileSync(STORE, "utf8")) as Stored;

async function api(page: Page, data: Record<string, unknown>, ok = true) {
  const response = await page.request.post("/api/actions", { data });
  const json = (await response.json()) as { ok: boolean; error?: string; result?: unknown };
  expect(json.ok, JSON.stringify(json)).toBe(ok);
  return json;
}

const start = async (page: Page, caseId: CaseId) => {
  await api(page, { action: "reset" });
  await api(page, { action: "start_case", caseId });
};

async function confirmAllServices(page: Page) {
  for (const id of SERVICES) await page.getByTestId(`service-${id}`).check();
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
}

async function openAudit(page: Page) {
  await page.getByTestId("presenter-frame-toggle").click();
  await page.getByTestId("audit-details").click();
  const drawer = page.getByTestId("audit-drawer");
  await expect(drawer).toBeVisible();
  return drawer;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "horizontal page overflow").toBeLessThanOrEqual(1);
}

test.describe.configure({ mode: "serial" });

test("scope · preserve scope holds at Understand until the merchant confirms the required services", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await start(page, "preserve-scope");
  await page.goto("/deals/hero");
  await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
  await expect(page.getByTestId("status-headline")).toHaveText("Tell us which services they need before we suggest an offer.");
  await expect(page.getByTestId("stage-tracker").locator('[data-stage="understand"]')).toHaveAttribute("aria-current", "step");
  await expect(page.getByTestId("scope-message")).toContainText("They asked for “complete annual package” but did not say which services that means.");
  await expect(page.getByTestId("scope-attribution")).toHaveText("Tick the services they need. We will work out the offers from your answer.");
  await expect(page.getByTestId("blocking-card")).toContainText("₹10,000 excluding GST");
  await expect(page.getByTestId("uncaptured")).toHaveCount(0);

  // The offer cannot be reached by the page or by the endpoint.
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("status-headline")).toContainText("Tell us which services they need");
  await expect(page.getByTestId("recommendation")).toHaveCount(0);
  const refused = await api(page, { action: "review_buyer_proposal" }, false);
  expect(refused.error).toMatch(/Confirm the required services/);
  await api(page, { action: "select_option", structureId: "deferred_start:start=2027-05-01,plan=monthly_12" }, false);
  expect(state().agreements).toEqual([]);

  await page.goto("/deals/hero/understand");
  await expect(page.getByTestId("primary-action")).toBeDisabled();
  await confirmAllServices(page);
  await expect(page.getByTestId("recommendation")).toBeVisible();
  await expect(page.getByTestId("attribution")).toContainText("Worked out again after the merchant confirmed the services.");

  const branch = state().decisionBranch!;
  expect(branch).toMatchObject({ reason: "merchant_scope_confirmation", answersChanged: false, parentRunId: state().run.record.runId });
  expect(branch.scope!.packageIds).toEqual(SERVICES);
  expect(branch.scope!.sources[0]).toMatchObject({ rawText: "complete annual package", messageId: "preserve-2" });
  // The stored sample run itself was not edited.
  expect(state().run.record.kind).toBe("synthetic_replay");

  await page.goto("/deals/hero/understand");
  await expect(page.getByTestId("scope-confirmed")).toContainText("You confirmed they need: Website fixes, Search marketing, Social media, Monthly reporting");

  const drawer = await openAudit(page);
  await expect(drawer).toContainText("Required services (unmapped phrase)");
  await expect(drawer).toContainText("Required services (merchant confirmation)");
  await expect(drawer).toContainText("Merchant confirmation of an unmapped extraction");
  await expect(drawer).toContainText("Confirmed the required services (4 services)");
});

test("scope · the scope confirmation card fits a phone", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await start(page, "preserve-scope");
  await page.goto("/deals/hero/understand");
  await expect(page.getByTestId("scope-card")).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByTestId("service-website-fixes").check();
  await expect(page.getByTestId("primary-action")).toBeEnabled();
  await noHorizontalScroll(page);
});


test("scope · the chat is not painted; the phrase that matched no service lights up when you point at the question about it", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await start(page, "preserve-scope");
  await page.goto("/deals/hero/understand");
  const thread = page.getByTestId("thread-understand");
  await expect(thread.getByText("WhatsApp (simulated)")).toHaveCount(1);
  const rejected = thread.locator('[data-testid="chat-highlight"][data-kind="rejected"]');
  await expect(rejected).toHaveText("complete annual package");
  // Nothing is highlighted by default.
  await expect(rejected).not.toHaveAttribute("data-lit", "true");
  expect(await rejected.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  // Pointing at the services slot lights the words behind it, and leaving clears them.
  await page.getByTestId("slot-needs").hover();
  await expect(rejected).toHaveAttribute("data-lit", "true");
  await expect.poll(() => rejected.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await page.getByTestId("value-budget").hover();
  await expect(rejected).not.toHaveAttribute("data-lit", "true");
  await shot(page, "recorded-1-understand-preserve-scope");
});

test("scope · on a phone the chat is a fixed panel that scrolls inside itself, starting at the latest message", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await start(page, "preserve-scope");
  await page.goto("/deals/hero/understand");
  const chat = page.getByTestId("thread-understand").getByTestId("chat-scroll");
  await expect(chat).toBeVisible();
  const m = await chat.evaluate((el) => ({ overflowY: getComputedStyle(el).overflowY, client: el.clientHeight, scroll: el.scrollHeight, top: el.scrollTop, viewport: window.innerHeight }));
  expect(m.overflowY).toBe("auto");
  expect(m.client).toBeLessThanOrEqual(m.viewport * 0.6);
  expect(m.scroll).toBeGreaterThan(m.client);
  expect(m.top + m.client).toBeGreaterThanOrEqual(m.scroll - 2);
  // Scrolling the chat moves the chat, not the page.
  await chat.evaluate((el) => (el.scrollTop = 0));
  await chat.scrollIntoViewIfNeeded();
  const pageY = await page.evaluate(() => window.scrollY);
  await chat.hover();
  await page.mouse.wheel(0, 120);
  await expect.poll(() => chat.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
});
