import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { DemoState } from "@/lib/service";
import { defaultEconomicsContent } from "@/lib/economics-default";

const shot = (page: Page, name: string) => {
  if (process.env.ADAPTIVE_E2E_NO_SHOTS === "1") return Promise.resolve(Buffer.alloc(0));
  const prefix = process.env.ADAPTIVE_E2E_SHOT_PREFIX ?? "";
  return page.screenshot({ path: `artifacts/ui-review/${prefix}${name}.png`, fullPage: true });
};
const STORE = path.join(".data-e2e", "store.json");

async function api(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post("/api/actions", { data });
  const json = (await response.json()) as { ok: boolean; error?: string };
  expect(json.ok, JSON.stringify(json)).toBe(true);
}

const state = () => JSON.parse(readFileSync(STORE, "utf8")) as DemoState;
const clarification = (id: string) => state().conversation.find((m) => m.kind === "clarification" && m.refs?.questionId === id)!;

async function prepareOptions(page: Page) {
  await api(page, { action: "reset" });
  await api(page, { action: "start_case", caseId: "reduced-scope" });
  await api(page, { action: "send_questions" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-gst").id, scriptId: "clar-gst-yes" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-approval").id, scriptId: "clar-approval-contract" });
  await api(page, { action: "adopt_replies" });
  expect(state().status).toBe("options_ready");
}

test.describe.configure({ mode: "serial" });

test.afterAll(async ({ request }) => {
  await request.post("/api/actions", { data: { action: "reset_economics_for_tests" } });
});

test.beforeEach(async ({ page }) => {
  await api(page, { action: "reset_economics_for_tests" });
  await prepareOptions(page);
});

test("economics · a cost change is reviewed, activated as version 2, and offered to the open deal", async ({ page }) => {
  await page.goto("/economics");
  await expect(page.getByTestId("economics-version")).toContainText("Version 1");
  await page.getByTestId("service-row-website-fixes").getByTestId("cost").fill("15000");
  await page.getByTestId("economics-review-button").click();
  await expect(page.getByTestId("economics-review")).toContainText("Website fixes");
  await expect(page.getByTestId("economics-demo-effect")).toContainText("Website fixes · direct delivery cost: ₹12,000 → ₹15,000");
  await page.getByTestId("economics-activate").click();
  await expect(page.getByTestId("economics-version")).toContainText("Version 2");
  await page.goto("/deals/hero/offer");
  // The deal keeps its pinned economics until the merchant chooses to re-evaluate.
  await expect(page.getByTestId("offer-contribution")).toHaveText("about ₹19,330");
  await expect(page.getByTestId("reevaluate-banner")).toContainText("Your business economics have changed since this deal was evaluated.");
  await page.getByTestId("reevaluate-review").click();
  await expect(page.getByTestId("reevaluate-changes")).toContainText("Website fixes · direct delivery cost: ₹12,000 → ₹15,000");
  await expect(page.getByTestId("reevaluate-banner")).toContainText("1 input would change.");
  await expect(page.getByTestId("reevaluate-effects")).toContainText("The recommended offer");
  await expect(page.getByTestId("reevaluate-confirm")).toContainText("Re-evaluate with version 2");
  await page.getByTestId("reevaluate-confirm").click();
  await expect(page.getByTestId("reevaluate-banner")).toHaveCount(0);
  // The new cost reaches the figures; the quoted prices and the offer's total do not move.
  await expect(page.getByTestId("offer-contribution")).toHaveText("about ₹16,330");
  await expect(page.getByTestId("offer-total")).toContainText("₹46,020");
  expect(state().economics.pinned.version).toBe(2);
});

test("economics · a standard-price change alone does not touch an existing deal", async ({ page }) => {
  const before = state().economics.effectiveHash;
  await page.goto("/economics");
  await page.getByTestId("service-row-website-fixes").getByTestId("price").fill("30000");
  await page.getByTestId("economics-review-button").click();
  await page.getByTestId("economics-activate").click();
  await expect(page.getByTestId("economics-version")).toContainText("Version 2");
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("reevaluate-banner")).toHaveCount(0);
  expect(state().economics.effectiveHash).toBe(before);
  await expect(page.getByTestId("offer-total")).toContainText("₹46,020");
});

test("economics · an invalid ladder cannot be activated, and the page fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/economics");
  await page.getByTestId("discount-limit").fill("0");
  await page.getByTestId("discount-ladder").fill("0, 5");
  await page.getByTestId("economics-review-button").click();
  await expect(page.getByTestId("economics-issue-discountLadderBps")).toBeVisible();
  await expect(page.getByTestId("economics-activate")).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("economics · reviewing with nothing changed says so and offers no activation", async ({ page }) => {
  await page.goto("/economics");
  await page.getByTestId("economics-review-button").click();
  await expect(page.getByTestId("economics-unchanged")).toContainText("No changes");
  await expect(page.getByTestId("economics-activate")).toBeDisabled();
  await expect(page.getByTestId("economics-version")).toContainText("Version 1");
});

test("overrides · a deal override needs a reason, moves the figures, says which way it moves your rule, and leaves your business economics alone", async ({ page }) => {
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("offer-contribution")).toHaveText("about ₹19,330");
  await page.getByTestId("deal-overrides").locator(":scope > summary").click();
  await page.getByTestId("override-field").selectOption("direct_cost:website-fixes");
  await expect(page.getByTestId("override-account")).toContainText("₹12,000");
  await page.getByTestId("override-value").fill("15000");
  // No reason, no override.
  await expect(page.getByTestId("override-apply")).toBeDisabled();
  await page.getByTestId("override-reason").fill("Extra migration work");
  await expect(page.getByTestId("override-apply")).toBeEnabled();
  await page.getByTestId("override-apply").click();

  const row = page.getByTestId("override-direct_cost-website-fixes");
  await expect(row).toContainText("Website fixes · direct delivery cost: ₹12,000 → ₹15,000");
  await expect(row).toContainText("Tightens your account rule");
  await expect(row).toContainText("Reason: Extra migration work");
  await expect(page.getByTestId("offer-contribution")).toHaveText("about ₹16,330");
  await expect(page.getByTestId("offer-rules")).toContainText("1 deal override applied");
  await expect(page.getByTestId("offer-total")).toContainText("₹46,020");
  expect(state().economics.overrides).toHaveLength(1);

  // The account's business economics did not change.
  await page.goto("/economics");
  await expect(page.getByTestId("economics-version")).toContainText("Version 1");
  await expect(page.getByTestId("service-row-website-fixes").getByTestId("cost")).toHaveValue("12000");

  // Removing it brings the original figures back.
  await page.goto("/deals/hero/offer");
  await page.getByTestId("override-list").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("offer-contribution")).toHaveText("about ₹19,330");
  await expect(page.getByTestId("offer-rules")).not.toContainText("override");
  expect(state().economics.overrides).toEqual([]);
});

test("overrides · loosening a rule is labelled as loosening, and the panel fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/deals/hero/offer");
  await page.getByTestId("deal-overrides").locator(":scope > summary").click();
  await page.getByTestId("override-field").selectOption("cash_exposure");
  await page.getByTestId("override-value").fill("20000");
  await page.getByTestId("override-reason").fill("Client pays a deposit first");
  await page.getByTestId("override-apply").click();
  await expect(page.getByTestId("override-cash_exposure")).toContainText("Maximum cash exposure: ₹10,000 → ₹20,000");
  await expect(page.getByTestId("override-cash_exposure")).toContainText("Loosens your account rule");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("overrides · once the proposal is sent, overrides can no longer be changed", async ({ page }) => {
  await page.goto("/deals/hero/offer");
  await page.getByTestId("deal-overrides").locator(":scope > summary").click();
  await page.getByTestId("override-field").selectOption("cash_exposure");
  await page.getByTestId("override-value").fill("20000");
  await page.getByTestId("override-reason").fill("Client pays a deposit first");
  await page.getByTestId("override-apply").click();
  await expect(page.getByTestId("override-cash_exposure")).toBeVisible();
  await page.getByTestId("primary-action").click();
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/deals\/hero\/track$/);
  const refused = await page.request.post("/api/actions", { data: { action: "add_input_override", field: "cash_exposure", value: 0, reason: "Too late to change" } });
  expect((await refused.json()).ok).toBe(false);
  expect(state().agreements.find((a) => a.status === "sent")!.economics?.effectiveHash).toBe(state().economics.effectiveHash);
});


/** Activate a 10% maximum discount with 0/5/10% approved, then start a fresh deal under it and send the proposal. */
async function sentUnderIllustrativeLadder(page: Page) {
  const content = defaultEconomicsContent();
  content.guardrails.discountLimitBps = 1000;
  content.discountLadderBps = [0, 500, 1000];
  await api(page, { action: "save_economics_draft", content });
  await api(page, { action: "activate_economics" });
  await prepareOptions(page);
  expect(state().economics.pinned.version).toBe(2);
  await api(page, { action: "review_buyer_proposal" });
  const draft = state().agreements.find((a) => a.status === "draft")!;
  await api(page, { action: "approve_and_send_draft", version: draft.version, termsHash: draft.termsHash });
  const sent = state().agreements.find((a) => a.status === "sent")!;
  await api(page, { action: "request_change", version: sent.version, text: "Could you do a little better on price?", topic: "price" });
  await page.goto("/deals/hero/track");
  return sent;
}

test("corridor · the ladder is shown, and the 5% row prepares an offer that passes with no override", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await sentUnderIllustrativeLadder(page);
  const corridor = page.getByTestId("negotiation-corridor");
  await expect(corridor).toBeVisible();
  await expect(corridor.getByTestId("corridor-lowest")).toContainText("meets every rule");
  await expect(corridor.getByTestId("ladder-0")).toBeVisible();
  await expect(corridor.getByTestId("ladder-500")).toBeVisible();
  await expect(corridor.getByTestId("ladder-1000")).toBeVisible();
  await shot(page, "corridor-1-desktop");
  const offerButton = corridor.getByTestId("ladder-500").locator("[data-testid^='offer-this-']");
  await offerButton.click();
  await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
  const counter = state().counterOffers.at(-1)!;
  expect(counter.source).toBe("listed_offer");
  expect(counter.override).toBeNull();
  // A deal started under the example is labelled as such in its audit.
  await page.getByTestId("audit-details").click();
  await expect(page.locator("body")).toContainText("business economics, version 2 (illustrative example)", { ignoreCase: true });
});

test("corridor · the buyer's page never shows the merchant's limits, and the corridor fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const sent = await sentUnderIllustrativeLadder(page);
  await expect(page.getByTestId("negotiation-corridor")).toBeVisible();
  await expect(page.getByTestId("corridor-private")).toContainText("Your limits are never sent");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await shot(page, "corridor-2-mobile");
  await page.goto(`/proposal/${sent.agreementId}/v${sent.version}`);
  await expect(page.getByTestId("buyer-view")).toBeVisible();
  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const leak of ["contribution", "floor", "lowest", "cash exposure", "direct delivery cost"]) expect(text).not.toContain(leak);
});

test("corridor · with no discount permitted the ladder says so", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const sent = await (async () => {
    await api(page, { action: "review_buyer_proposal" });
    const draft = state().agreements.find((a) => a.status === "draft")!;
    await api(page, { action: "approve_and_send_draft", version: draft.version, termsHash: draft.termsHash });
    return state().agreements.find((a) => a.status === "sent")!;
  })();
  await api(page, { action: "request_change", version: sent.version, text: "Could you do a little better on price?", topic: "price" });
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("corridor-ladder")).toContainText("Your business economics permit no discount.");
});

test("preset · the illustrative example fills the draft, activates as an Illustrative version, and leaves the open deal's recommendation alone", async ({ page }) => {
  await page.goto("/deals/hero/offer");
  const before = await page.getByTestId("offer-total").textContent();
  await page.goto("/economics");
  await expect(page.getByTestId("economics-version")).not.toContainText("Illustrative");
  await page.getByTestId("economics-illustrative-preset").click();
  // Loading only fills the draft: nothing is activated until the merchant reviews and activates.
  await expect(page.getByTestId("economics-version")).toContainText("Version 1");
  await page.getByTestId("economics-review-button").click();
  await expect(page.getByTestId("economics-review")).toBeVisible();
  await page.getByTestId("economics-activate").click();
  await expect(page.getByTestId("economics-version")).toContainText("Version 2 · Illustrative");
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("offer-total")).toHaveText(before ?? "");
  // The open deal stays pinned to version 1, so its audit does not claim to use the example.
  await page.getByTestId("audit-details").click();
  await expect(page.locator("body")).not.toContainText("illustrative example");
});
