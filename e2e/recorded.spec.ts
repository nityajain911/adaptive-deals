import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { DemoState } from "@/lib/service";

/**
 * Journeys on the ordinary product: no run-source override, so every case starts from its committed
 * Groq recording. They check what a judge sees: genuine provenance, the required-services gate, the
 * merchant overriding the model's ranking, the code fallback, and a clean abstention.
 */
const STORE = path.join(".data-e2e-recorded", "store.json");
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const RUN = { "reduced-scope": "run-case-reduced-scope-8aef9d45", "preserve-scope": "run-case-preserve-scope-fe3de4cf", "no-fit": "run-case-no-fit-553afce3" } as const;
const SERVICES = ["website-fixes", "search-marketing", "social-media", "monthly-reporting"];

type Stored = DemoState & Record<string, unknown>;
const state = () => JSON.parse(readFileSync(STORE, "utf8")) as Stored;

async function api(page: Page, data: Record<string, unknown>, ok = true) {
  const response = await page.request.post("/api/actions", { data });
  const json = (await response.json()) as { ok: boolean; error?: string; result?: unknown };
  expect(json.ok, JSON.stringify(json)).toBe(ok);
  return json;
}

const start = async (page: Page, caseId: keyof typeof RUN) => {
  await api(page, { action: "reset" });
  await api(page, { action: "start_case", caseId });
};

const clarification = (questionId: string) => state().conversation.find((m) => m.kind === "clarification" && m.refs?.questionId === questionId)!;

/** Reduced scope, answered the way the recording was: GST included, limit per contract. */
async function reducedOptions(page: Page) {
  await start(page, "reduced-scope");
  await api(page, { action: "send_questions" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-gst").id, scriptId: "clar-gst-yes" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-approval").id, scriptId: "clar-approval-contract" });
  await api(page, { action: "adopt_replies" });
  expect(state().status).toBe("options_ready");
}

async function confirmAllServices(page: Page) {
  for (const id of SERVICES) await page.getByTestId(`service-${id}`).check();
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
}

async function openAudit(page: Page) {
  await page.getByTestId("audit-details").click();
  const drawer = page.getByTestId("audit-drawer");
  await expect(drawer).toBeVisible();
  return drawer;
}

async function clickPrimary(page: Page) {
  const before = (await page.getByTestId("status-headline").textContent()) ?? "";
  await page.getByTestId("primary-action").click();
  await page.waitForFunction((text) => (document.querySelector('[data-testid="status-headline"]')?.textContent ?? "") !== text || location.pathname.endsWith("/preview"), before);
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "horizontal page overflow").toBeLessThanOrEqual(1);
}

test.describe.configure({ mode: "serial" });

test("recorded · every case says its outputs are recorded Groq output, and the product shows it everywhere", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await api(page, { action: "reset" });
  await page.goto("/deals");
  for (const id of Object.keys(RUN)) await expect(page.getByTestId(`case-model-output-${id}`)).toHaveText("Recorded Groq output");

  await start(page, "reduced-scope");
  expect(state().run.record).toMatchObject({ runId: RUN["reduced-scope"], kind: "live", provider: "groq", model: "openai/gpt-oss-120b" });
  await page.goto("/deals/hero/understand");
  await expect(page.getByTestId("questions-card")).toContainText("Suggested by AI");
  await expect(page.getByTestId("thread-understand")).toContainText("Suggested by AI");
  await expect(page.locator("main")).not.toContainText(/Sample wording written by hand|no model ran/);

  const drawer = await openAudit(page);
  await expect(drawer).toContainText("AI · Recorded Groq output");
  await expect(drawer).toContainText(`Recorded Groq output · run ${RUN["reduced-scope"]} · extract.v2`);
  await expect(drawer).toContainText("Extracted the opening constraints (extract.v2)");
  await expect(drawer).not.toContainText(/Sample output written by hand|No model ran for this case/);
  await page.keyboard.press("Escape");

  await page.getByTestId("walkthrough-launcher").click();
  await expect(page.getByTestId("walkthrough-provenance")).toHaveText("Recorded Groq output");
  await expect(page.getByTestId("walkthrough")).toContainText("Groq structures the conversation");
  await expect(page.getByTestId("walkthrough")).not.toContainText("no model ran");
});

test("recorded · preserve scope holds at Understand until the merchant confirms the required services", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await start(page, "preserve-scope");
  await page.goto("/deals/hero");
  await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
  await expect(page.getByTestId("status-headline")).toHaveText("Confirm which services the buyer requires before we recommend an offer.");
  await expect(page.getByTestId("stage-tracker").locator('[data-stage="understand"]')).toHaveAttribute("aria-current", "step");
  await expect(page.getByTestId("scope-message")).toContainText("We couldn't map “complete annual package” to specific services.");
  await expect(page.getByTestId("scope-card")).toContainText("We need the complete annual package—Website fixes, Search marketing, Social media and Monthly reporting—for the admissions launch");
  await expect(page.getByTestId("scope-attribution")).toHaveText("Groq extracted the phrase · code could not map it to a service · you confirm the services.");
  await expect(page.getByTestId("uncaptured")).toContainText("The GST basis was not captured from the conversation. Every offer has the same outcome under either reading, so no question is needed.");

  // The offer cannot be reached by the page or by the endpoint.
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("status-headline")).toContainText("Confirm which services the buyer requires");
  await expect(page.getByTestId("recommendation")).toHaveCount(0);
  const refused = await api(page, { action: "review_buyer_proposal" }, false);
  expect(refused.error).toMatch(/Confirm the required services/);
  await api(page, { action: "select_option", structureId: "deferred_start:start=2027-05-01,plan=monthly_12" }, false);
  expect(state().agreements).toEqual([]);

  await page.goto("/deals/hero/understand");
  await expect(page.getByTestId("primary-action")).toBeDisabled();
  await confirmAllServices(page);
  await expect(page.getByTestId("status-headline")).toHaveText("Review this offer before sending it.");
  await expect(page.getByTestId("attribution")).toHaveText("Recalculated by the engine after the merchant confirmed the services · explanation written by code.");

  const branch = state().decisionBranch!;
  expect(branch).toMatchObject({ reason: "merchant_scope_confirmation", answersChanged: false, parentRunId: RUN["preserve-scope"] });
  expect(branch.scope!.packageIds).toEqual(SERVICES);
  expect(branch.scope!.sources[0]).toMatchObject({ rawText: "complete annual package", messageId: "preserve-2" });
  // The recorded run itself was not edited.
  expect(state().run.record.runId).toBe(RUN["preserve-scope"]);
  expect(state().run.record.steps.map((s) => s.task)).toEqual(["extract", "explain"]);

  await page.goto("/deals/hero/understand");
  await expect(page.getByTestId("scope-confirmed")).toContainText("Required services confirmed by you: Website fixes, Search marketing, Social media, Monthly reporting");
  await expect(page.getByTestId("scope-confirmed")).toContainText("Groq extracted the phrase · merchant confirmed the services · engine recalculated the options.");

  const drawer = await openAudit(page);
  await expect(drawer).toContainText("Required services (unmapped phrase)");
  await expect(drawer).toContainText("Required services (merchant confirmation)");
  await expect(drawer).toContainText("Merchant confirmation of an unmapped extraction");
  await expect(drawer).toContainText("Confirmed the required services (4 services)");
  await expect(drawer).toContainText("Extracted the opening constraints (extract.v2)");
});

test("recorded · the scope confirmation card fits a phone", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await start(page, "preserve-scope");
  await page.goto("/deals/hero/understand");
  await expect(page.getByTestId("scope-card")).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByTestId("service-website-fixes").check();
  await expect(page.getByTestId("primary-action")).toBeEnabled();
  await noHorizontalScroll(page);
});

test("recorded · the merchant overrides Groq's ranking, and the preventive restructuring continues from that choice", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reducedOptions(page);
  await page.goto("/deals/hero/offer");

  // Groq ranked the single upfront payment first and wrote its reason; code wrote the comparison.
  await expect(page.getByTestId("recommendation")).toContainText("Recommended offer");
  await expect(page.getByTestId("offer-headline")).toHaveText("Start with a standalone three-month package · paid upfront");
  await expect(page.getByTestId("offer-payments")).toContainText("One payment");
  await expect(page.getByTestId("attribution")).toHaveText("Groq ranked and wrote this reason · recorded Groq output · figures calculated by the engine. Full comparison written by code.");

  // The merchant chooses the two-payment alternative.
  await expect(page.getByTestId("compare-alternatives")).toBeVisible();
  await page.locator('[data-testid^="alternative-"]', { hasText: "two monthly payments" }).getByRole("button", { name: "Select this offer" }).click();
  await expect(page.getByTestId("recommendation")).toContainText("Selected by you");
  await expect(page.getByTestId("offer-headline")).toHaveText("Start with a standalone three-month package · two monthly payments");
  await expect(page.getByTestId("attribution")).toHaveText("Groq wrote this reason · you selected this option · recorded Groq output · figures calculated by the engine. Full comparison written by code.");
  await expect(page.getByTestId("attribution")).not.toContainText("ranked");
  expect(state().outcomes.some((o) => o.type === "option_selected" && o.actor === "merchant")).toBe(true);

  await clickPrimary(page);
  await expect(page).toHaveURL(/\/deals\/hero\/offer\/preview$/);
  await expect(page.locator("main")).toContainText("₹23,010");
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/deals\/hero\/track$/);
  await page.getByTestId("open-buyer-proposal").click();
  await page.getByTestId("authority").check();
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("buyer-status")).toContainText("Accepted");
  expect(state().agreements.find((a) => a.status === "active")!.structureId).toContain("plan=two_monthly");

  // Simulated system and buyer events, then the merchant's own decisions on the revision.
  for (const stepId of ["pay_upfront_link", "confirm_mandate", "advance_to_notice", "send_notice"]) await api(page, { action: "demo_system_step", stepId });
  const notice = state().conversation.find((i) => i.kind === "notice")!;
  await api(page, { action: "buyer_reply", inReplyTo: notice.id, scriptId: "notice-cash-tight" });
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("status-headline")).toContainText("can't pay until after 20 Dec 2026");
  await clickPrimary(page);
  await expect(page.getByTestId("status-headline")).toContainText("Review the revised terms");
  await page.getByTestId("primary-action").click();
  await page.getByTestId("approve-revised-terms").click();
  await expect(page.getByTestId("status-headline")).toContainText("Waiting for the buyer to accept the revised terms");
  await page.getByTestId("open-buyer-proposal").click();
  await page.getByTestId("authority").check();
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("buyer-status")).toContainText("Accepted");
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("amendment-settled")).toContainText("Payment rescheduled to 21 Dec 2026");
  await expect(page.getByTestId("status-headline")).toContainText("next payment ₹23,010 on 21 Dec 2026");
  expect(state().attempts.some((a) => a.status === "failed" || a.origin === "internal_retry")).toBe(false);
});

test("recorded · a rejected explanation and a rejected comparison fall back to code, and the audit says so", async ({ page }) => {
  await page.setViewportSize(DESKTOP);

  // Reduced scope: the model's reasons passed validation; its comparison did not.
  await reducedOptions(page);
  await page.goto("/deals/hero/offer");
  let drawer = await openAudit(page);
  await expect(drawer).toContainText("Wrote 3 per-offer reasons that passed validation (explain.v3)");
  await expect(drawer).toContainText("Wrote the full comparison, because the AI comparison did not pass validation");
  await expect(drawer).toContainText("Suggested the order of eligible options (explain.v3)");
  await page.keyboard.press("Escape");

  // Preserve scope: the model's explanation broke its schema twice, so code writes the explanation.
  await start(page, "preserve-scope");
  expect(state().run.record.steps.find((s) => s.task === "explain")).toMatchObject({ outcome: "rejected", issues: ["schema: Too big: expected string to have <=240 characters"] });
  await page.goto("/deals/hero/understand");
  await confirmAllServices(page);
  await expect(page.getByTestId("attribution")).not.toContainText(/Groq|AI/);
  await expect(page.getByTestId("why-offer")).not.toContainText("Groq");
  drawer = await openAudit(page);
  await expect(drawer).toContainText("The parent model run did not process the merchant-confirmed services. The engine recalculated the decision and code wrote the explanation.");
  await expect(drawer).toContainText("Wrote the recommendation explanation because the parent model did not process the merchant-confirmed services");
  await expect(drawer.getByTestId("branch-scope")).toContainText("merchant confirmed Website fixes, Search marketing, Social media, Monthly reporting");
  await expect(drawer).not.toContainText("Suggested the order of eligible options");
});

test("recorded · no fit: Groq's extraction is clean and the engine rejects every structure", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await start(page, "no-fit");
  expect(state().run.record.steps.map((s) => [s.task, s.outcome])).toEqual([["extract", "accepted"]]);
  await page.goto("/deals/hero");
  await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
  await expect(page.getByTestId("status-headline")).toHaveText("No offer fits both the buyer's confirmed limits and your current rules.");
  await expect(page.getByTestId("recommendation")).toHaveCount(0);
  await expect(page.getByTestId("primary-action")).toHaveText("Close in Adaptive Deals");
  await expect(page.locator("main")).toContainText("What blocks every one");
  await expect(page.locator("main")).not.toContainText(/Groq ranked|Suggested by AI/);

  const drawer = await openAudit(page);
  await expect(drawer).toContainText("AI · Recorded Groq output");
  await expect(drawer).toContainText("Extracted the opening constraints (extract.v2)");
  await expect(drawer).toContainText("Required packages");
  await expect(drawer).not.toContainText(/Suggested the order|Wrote the recommendation|Required services \(/);
});

test("recorded · the chat marks the buyer's own words, and the rejected phrase stands out until you confirm it", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await start(page, "preserve-scope");
  await page.goto("/deals/hero/understand");
  const thread = page.getByTestId("thread-understand");
  await expect(thread.getByText("Simulated conversation")).toHaveCount(1);
  const rejected = thread.locator('[data-testid="chat-highlight"][data-kind="rejected"]');
  await expect(rejected).toHaveText("complete annual package");
  await expect(thread.locator('[data-testid="chat-highlight"][data-kind="evidence"]').first()).toBeVisible();
  await rejected.click();
  await expect(thread.getByTestId("chat-highlight-note")).toContainText("Not matched to a service");
  await rejected.click();
  await expect(thread.getByTestId("chat-highlight-note")).toHaveCount(0);
});
