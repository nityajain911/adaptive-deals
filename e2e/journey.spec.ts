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
const startCase = (page: Page) => api(page, { action: "start_case", caseId: "reduced-scope" });
const shot = (page: Page, name: string) => {
  if (process.env.ADAPTIVE_E2E_NO_SHOTS === "1") return Promise.resolve(Buffer.alloc(0));
  const prefix = process.env.ADAPTIVE_E2E_SHOT_PREFIX ?? "";
  return page.screenshot({ path: `${SHOTS}/${prefix}${name}.png`, fullPage: true });
};

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "horizontal page overflow").toBeLessThanOrEqual(1);
}

function clarification(id: string) {
  return state().conversation.find((m) => m.kind === "clarification" && m.refs?.questionId === id)!;
}

async function prepareOptions(page: Page) {
  await reset(page);
  await startCase(page);
  await api(page, { action: "send_questions" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-gst").id, scriptId: "clar-gst-yes" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-approval").id, scriptId: "clar-approval-contract" });
  await api(page, { action: "adopt_replies" });
  expect(state().status).toBe("options_ready");
}

async function openWalkthrough(page: Page) {
  if (await page.getByTestId("walkthrough").count()) return;
  await page.getByTestId("walkthrough-launcher").click();
  await expect(page.getByTestId("walkthrough")).toBeVisible();
}

const walkthroughPrimary = (page: Page) => page.getByTestId("walkthrough").locator("[data-walkthrough-primary]");

async function prepareClarificationCombination(page: Page, gstScript: "clar-gst-yes" | "clar-gst-no", approvalScript: "clar-approval-contract" | "clar-approval-payment") {
  await reset(page);
  await api(page, { action: "send_questions" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-gst").id, scriptId: gstScript });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-approval").id, scriptId: approvalScript });
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

test("P0 · every clarification combination produces its engine decision and truthful provenance after reload", async ({ page }) => {
  const cases = [
    { gst: "clar-gst-yes", approval: "clar-approval-contract", expected: "phased_scope:scope=web-search-report-3m,plan=two_monthly", gstCopy: "including GST", approvalCopy: "Contracts above", recorded: true },
    { gst: "clar-gst-no", approval: "clar-approval-contract", expected: "shorter_commitment:term_months=3,plan=upfront", gstCopy: "excluding GST", approvalCopy: "Contracts above", recorded: false },
    { gst: "clar-gst-yes", approval: "clar-approval-payment", expected: "deferred_start:start=2027-05-01,plan=monthly_12", gstCopy: "including GST", approvalCopy: "Payments above", recorded: false },
    { gst: "clar-gst-no", approval: "clar-approval-payment", expected: "deferred_start:start=2027-05-01,plan=monthly_12", gstCopy: "excluding GST", approvalCopy: "Payments above", recorded: false },
  ] as const;

  for (const c of cases) {
    await prepareClarificationCombination(page, c.gst, c.approval);
    await page.goto("/deals/hero/offer");
    await expect(page.getByTestId("recommendation")).toBeVisible();
    await expect(page.getByTestId("offer-context")).toContainText(c.gstCopy);
    await expect(page.getByTestId("offer-context")).toContainText(c.approvalCopy);
    await api(page, { action: "review_buyer_proposal" });
    expect(state().agreements.find((agreement) => agreement.status === "draft")?.structureId).toBe(c.expected);

    await page.goto("/deals/hero/offer");
    await page.reload();
    await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
    await page.getByTestId("audit-details").click();
    const drawer = page.getByTestId("audit-drawer");
    await expect(drawer).toBeVisible();
    if (c.recorded) {
      expect(state().decisionBranch).toBeNull();
      await expect(drawer).not.toContainText("did not cover the changed answers");
    } else {
      expect(state().decisionBranch).not.toBeNull();
      // The default case is a hand-written sample, so the branch never refers to a model run.
      await expect(drawer).toContainText("The hand-written parent sample did not cover the changed answers");
      await expect(drawer).not.toContainText("parent model run");
      await expect(drawer).toContainText("code_fallback");
      await expect(page.getByTestId("attribution")).toContainText("Recalculated by the engine after the buyer's answer");
      await expect(page.getByTestId("attribution")).not.toContainText(/AI ranked|AI explained/i);
    }
    await expect(drawer).toContainText("No model ran for this case.");
    await expect(drawer).toContainText("Sample output written by hand · no model ran");
    await expect(drawer).not.toContainText(/AI run|Recorded Groq output|Suggested the order/);
    await page.keyboard.press("Escape");
  }
});

test("P0 · mixed and unsure clarification replies stay unresolved until the merchant asks again", async ({ page }) => {
  for (const uncertain of [
    { questionId: "clar-gst", scriptId: "clar-gst-unclear", otherId: "clar-approval", otherScript: "clar-approval-contract" },
    { questionId: "clar-approval", scriptId: "clar-approval-unclear", otherId: "clar-gst", otherScript: "clar-gst-yes" },
  ] as const) {
    await reset(page);
    await api(page, { action: "send_questions" });
    await api(page, { action: "buyer_reply", inReplyTo: clarification(uncertain.questionId).id, scriptId: uncertain.scriptId });
    await api(page, { action: "buyer_reply", inReplyTo: clarification(uncertain.otherId).id, scriptId: uncertain.otherScript });
    const before = state();
    const commercial = JSON.stringify({ agreements: before.agreements, attempts: before.attempts, paymentLinks: before.paymentLinks, mandate: before.mandate, amendments: before.amendments });

    await page.goto("/deals/hero/understand");
    await expect(page.getByTestId("status-headline")).toContainText("needs your interpretation");
    await page.locator('[data-testid^="ask-again-"]').click();
    await expect(page.getByTestId("status-headline")).toContainText("Waiting for the buyer");
    const after = state();
    expect(after.conversation.filter((message) => message.kind === "clarification" && message.refs.questionId === uncertain.questionId)).toHaveLength(2);
    expect(JSON.stringify({ agreements: after.agreements, attempts: after.attempts, paymentLinks: after.paymentLinks, mandate: after.mandate, amendments: after.amendments })).toBe(commercial);
    expect(after.interpretations).toHaveLength(0);

    await page.goto("/deals/hero/offer");
    await expect(page.getByTestId("stage-upcoming")).toBeVisible();
    await expect(page.getByTestId("recommendation")).toHaveCount(0);
  }
});

test("90-second storyboard follows the three-stage preventive journey", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);
  await startCase(page);
  await page.goto("/deals/hero");
  await openWalkthrough(page);

  await expectStage(page, "understand", "Confirm two details", "Send 2 questions to buyer");
  await shot(page, "desktop-1-understand");
  await clickPrimary(page);
  await expectStage(page, "understand", "Waiting for the buyer", undefined);

  // The simulated buyer's replies are choices, including honest uncertainty.
  await expect(page.getByTestId("walkthrough-reply-clar-gst-unclear")).toBeVisible();
  await expect(page.getByTestId("walkthrough-reply-__typed")).toBeVisible();
  await page.getByTestId("walkthrough-reply-clar-gst-yes").click();
  await expect(page.getByTestId("walkthrough-reply-clar-gst-yes")).toHaveAttribute("aria-checked", "true");
  await walkthroughPrimary(page).click();
  await expect(page.getByTestId("walkthrough-reply-choice")).toHaveAttribute("data-value", "clar-approval-contract");
  await walkthroughPrimary(page).click();
  await expectStage(page, "understand", "The buyer answered", "Use these answers");
  await clickPrimary(page);

  await expectStage(page, "offer", "Review this offer", "Review buyer proposal");
  await expect(page.getByTestId("recommendation")).toContainText("Recommended");
  await shot(page, "desktop-2-offer");
  await clickPrimary(page);
  await expect(page).toHaveURL(/\/deals\/hero\/offer\/preview$/);
  await expect(page.getByTestId("preview-frame")).toContainText("Not sent");
  await expect(page.getByTestId("buyer-message-preview")).toContainText("Here is our proposal");
  await expect(page.getByTestId("buyer-message-preview")).toContainText("Review and respond here");
  await expect(page.getByTestId("primary-action")).toHaveText("Approve and send to buyer");
  await shot(page, "desktop-3-preview");
  await page.getByTestId("buyer-message-preview").click();
  await shot(page, "desktop-3b-preview-message");

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
  await expect(page.getByTestId("payment-schedule")).toContainText("Amount still to collect before GST");
  await walkthroughPrimary(page).click();
  await expect(walkthroughPrimary(page)).toContainText("authorises the mandate");
  await walkthroughPrimary(page).click();
  await expect(walkthroughPrimary(page)).toContainText("Advance simulated date");
  await walkthroughPrimary(page).click();
  await expect(walkthroughPrimary(page)).toContainText("Send scheduled advance notice");
  await walkthroughPrimary(page).click();
  await expect(page.getByTestId("walkthrough-reply-choice")).toHaveAttribute("data-value", "notice-cash-tight");
  await walkthroughPrimary(page).click();
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
  await startCase(page);
  await page.goto("/deals/hero/understand");
  await openWalkthrough(page);
  await page.getByTestId("walkthrough").getByRole("button", { name: "Hide" }).click();
  await expect(page.getByTestId("walkthrough")).toHaveCount(0);

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
  await expect(page.getByTestId("buyer-status")).toContainText("Accepted");
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("amendment-settled")).toBeVisible();
  await expect(page.getByTestId("walkthrough")).toHaveCount(0);
});

test("walkthrough navigation reaches merchant decisions but never approves them", async ({ page }) => {
  await prepareOptions(page);
  await page.goto("/deals/hero/understand");
  await openWalkthrough(page);
  await expect(walkthroughPrimary(page)).toHaveText("Take me there");
  await walkthroughPrimary(page).click();
  expect(state().agreements.filter((a) => a.merchantApproval)).toHaveLength(0);
  await expect(page.getByTestId("primary-action")).toHaveText("Review buyer proposal");
});

test("advance date and send notice are two explicit system steps", async ({ page }) => {
  await prepareAccepted(page);
  await api(page, { action: "demo_system_step", stepId: "pay_upfront_link" });
  await api(page, { action: "demo_system_step", stepId: "confirm_mandate" });
  await page.goto("/deals/hero/track");
  await openWalkthrough(page);
  await expect(walkthroughPrimary(page)).toContainText("Advance simulated date to 28 Nov 2026");
  const advancesBefore = state().clockAdvances.length;
  await walkthroughPrimary(page).click();
  await expect(walkthroughPrimary(page)).toContainText("Send scheduled advance notice");
  expect(state().clockAdvances).toHaveLength(advancesBefore + 1);
  expect(state().notices.filter((n) => n.sentAt)).toHaveLength(0);
  await walkthroughPrimary(page).click();
  await expect(page.getByTestId("walkthrough-reply-choice")).toBeVisible();
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

test("a hand-written sample case never presents its outputs as AI output", async ({ page }) => {
  await reset(page);
  await page.goto("/deals");
  for (const id of ["reduced-scope", "preserve-scope", "no-fit"]) {
    await expect(page.getByTestId(`case-model-output-${id}`)).toHaveText("Sample output written by hand · no model ran");
  }
  await page.goto("/deals/hero/understand");
  await expect(page.getByTestId("questions-card")).toContainText("Sample wording written by hand");
  await expect(page.getByTestId("thread-understand")).toContainText("Sample wording written by hand");
  await expect(page.locator("main")).not.toContainText(/Suggested by AI|Groq|AI run/);
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
  await page.goto("/deals/hero/track");
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

  await toggleDetails(page, ["see-economics", "why-not-others"]);
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
  await expect(page.getByTestId("recommendation")).toContainText("two monthly payments");
  await expect(page.getByText(/structures across .* templates evaluated/i)).toHaveCount(0);
  await expect(page.getByTestId("featured-buyer-rejection")).toBeHidden();
  await expect(page.getByTestId("featured-seller-rejection")).toBeHidden();
  await expect(page.getByTestId("compare-alternatives")).toBeVisible();
  await expect(page.getByTestId("compare-alternatives")).toContainText("If the buyer secures MD approval: projected contribution");
  const fundingLabels = page.getByText("Peak funding requirement", { exact: false });
  let visibleFundingLabels = 0;
  for (let i = 0; i < (await fundingLabels.count()); i++) {
    if (await fundingLabels.nth(i).isVisible()) visibleFundingLabels++;
  }
  expect(visibleFundingLabels).toBe(0);
});

test("P0 · buyer change request transfers ownership until the merchant makes an explicit disposition", async ({ page }) => {
  const agreement = await prepareSent(page);
  await api(page, { action: "request_change", version: agreement.version, text: "Could we start with a smaller first phase?" });

  await page.goto(`/proposal/${agreement.agreementId}/v${agreement.version}`);
  await expect(page.getByTestId("buyer-status")).toContainText("Waiting for Pinecone Media Works");
  await expect(page.getByTestId("buyer-actions")).toHaveCount(0);

  const request = state().conversation.findLast((item) => item.kind === "change_request")!;
  await page.goto("/deals/hero/track");
  await expectStage(page, "track", "The buyer requested a change", "Review buyer request");
  await expect(page.getByTestId(`work-${request.id}`)).toContainText("current proposal remains unchanged");
  await page.getByTestId(`keep-current-${request.id}`).click();
  await expectStage(page, "track", "Waiting for the buyer to review offer version 1", undefined);

  await page.goto(`/proposal/${agreement.agreementId}/v${agreement.version}`);
  await expect(page.getByTestId("buyer-status")).toContainText("Review and respond");
  await expect(page.getByTestId("buyer-actions")).toBeVisible();
});

test("P0 · resolved notice corrections leave the attention queue and unsupported non-date replies get generic guidance", async ({ page }) => {
  await prepareAccepted(page);
  await api(page, { action: "demo_system_step", stepId: "pay_upfront_link" });
  await api(page, { action: "demo_system_step", stepId: "confirm_mandate" });
  await api(page, { action: "demo_system_step", stepId: "advance_to_notice" });
  await api(page, { action: "demo_system_step", stepId: "send_notice" });
  const notice = state().conversation.findLast((item) => item.kind === "notice")!;
  await api(page, { action: "buyer_reply", inReplyTo: notice.id, text: "Cash is tight till the 20th." });
  await api(page, { action: "propose_amendment" });
  await api(page, { action: "buyer_reply", inReplyTo: notice.id, text: "Actually, cash is tight till the 25th." });
  const correction = state().conversation.at(-1)!;

  await page.goto("/deals/hero/track");
  await page.getByTestId("buyer-work-card").locator("summary").click();
  await expect(page.getByTestId(`work-${correction.id}`)).toBeVisible();
  await page.getByTestId(`keep-current-${correction.id}`).click();
  await expect(page.getByTestId(`work-${correction.id}`)).toHaveCount(0);
  await expect(page.getByTestId(`attention-${correction.id}`)).toHaveCount(0);

  await api(page, { action: "buyer_reply", inReplyTo: notice.id, text: "Please call me" });
  const unsupported = state().conversation.at(-1)!;
  await page.reload();
  await expect(page.getByTestId(`attention-${unsupported.id}`)).toContainText("agree the next step");
  await expect(page.getByTestId(`attention-${unsupported.id}`)).not.toContainText("one exact date");
});

test("P0 · late buyer evidence blocks preview and delivery until it is reviewed", async ({ page }) => {
  const draft = await prepareDraft(page);
  await api(page, {
    action: "buyer_reply",
    inReplyTo: clarification("clar-gst").id,
    text: "Correction: our available budget is now only ₹20,000 including GST. Please do not send the ₹46,020 proposal.",
  });
  const correction = state().conversation.at(-1)!;
  const blocked = await api(page, { action: "approve_and_send_draft", version: draft.version, termsHash: draft.termsHash }, false);
  expect(blocked.error).toMatch(/buyer evidence|review/i);
  expect(state().deliveries).toHaveLength(0);

  await page.goto("/deals/hero/offer");
  await expectStage(page, "offer", /newer buyer evidence/i, undefined);
  await expect(page.getByTestId("evidence-review")).toBeVisible();
  await expect(page.getByTestId(`evidence-${correction.id}`)).toContainText("₹20,000");
  await page.getByTestId(`keep-current-${correction.id}`).click();
  await expect(page.getByTestId("primary-action")).toContainText(/Review/);
  expect(state().deliveries).toHaveLength(0);
});

test("P0 · a merchant-selected annual offer keeps its attribution and MD approval condition", async ({ page }) => {
  await prepareOptions(page);
  await api(page, { action: "select_option", structureId: "split_payment:plan=deposit_30" });
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("recommendation")).toContainText("Selected by you");
  await expect(page.getByTestId("recommendation")).toContainText(/MD approval|required internal approval/i);
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/offer\/preview$/);
  const draft = state().agreements.find((agreement) => agreement.status === "draft")!;
  await api(page, { action: "approve_and_send_draft", version: draft.version, termsHash: draft.termsHash });

  await page.goto(`/proposal/${draft.agreementId}/v${draft.version}`);
  await expect(page.getByTestId("authority-requirement")).toContainText("required internal approval");
  await expect(page.getByTestId("accept")).toBeDisabled();
  await page.getByTestId("authority").check();
  await expect(page.getByTestId("accept")).toBeEnabled();
});

test("P0 · a failed restructure stays actionable and leaves the original payment visible", async ({ page }) => {
  await prepareAccepted(page);
  await api(page, { action: "demo_system_step", stepId: "pay_upfront_link" });
  await api(page, { action: "demo_system_step", stepId: "confirm_mandate" });
  await api(page, { action: "demo_system_step", stepId: "advance_to_notice" });
  await api(page, { action: "demo_system_step", stepId: "send_notice" });
  const notice = state().conversation.findLast((item) => item.kind === "notice")!;
  await api(page, { action: "buyer_reply", inReplyTo: notice.id, text: "Cash is tight till the 31st." });
  await api(page, { action: "propose_amendment" });

  await page.goto("/deals/hero/track");
  await expectStage(page, "track", /requested date does not fit/i, "Review with buyer");
  await expect(page.getByTestId("buyer-work-card")).toContainText("original payment remains scheduled");
  await expect(page.getByTestId("payment-schedule")).toContainText("1 Dec 2026");
  await expect(page.getByTestId("amendment-settled")).toHaveCount(0);
});

test("P0 · current agreement summary keeps phase, annual, deferred and declined financial scopes distinct", async ({ page }) => {
  await prepareAccepted(page);
  await api(page, { action: "demo_system_step", stepId: "pay_upfront_link" });
  await api(page, { action: "demo_system_step", stepId: "confirm_mandate" });
  await api(page, { action: "demo_system_step", stepId: "advance_to_notice" });
  await api(page, { action: "demo_system_step", stepId: "send_notice" });
  const notice = state().conversation.findLast((item) => item.kind === "notice")!;
  await api(page, { action: "buyer_reply", inReplyTo: notice.id, scriptId: "notice-cash-tight" });
  await api(page, { action: "propose_amendment" });
  const revision = state().agreements.find((agreement) => agreement.version === 2)!;
  await api(page, { action: "approve_amendment", termsHash: revision.termsHash });
  await api(page, { action: "accept_amendment", termsHash: revision.termsHash, authorityConfirmed: true });
  await page.goto("/deals/hero/track");
  const current = page.getByTestId("current-agreement");
  await expect(current).toContainText("Standalone three-month package");
  await expect(current).toContainText("Nov 2026–Jan 2027");
  await expect(current).toContainText("No later phase is agreed");
  await expect(current).toContainText("₹23,010");

  for (const [structureId, expectedTitle] of [
    ["split_payment:plan=deposit_30", "Annual digital marketing agreement"],
    ["deferred_start:start=2027-05-01,plan=monthly_12", "Annual digital marketing from May 2027"],
  ] as const) {
    await prepareOptions(page);
    await api(page, { action: "select_option", structureId });
    await api(page, { action: "review_buyer_proposal" });
    const draft = state().agreements.find((agreement) => agreement.status === "draft")!;
    await api(page, { action: "approve_and_send_draft", version: draft.version, termsHash: draft.termsHash });
    await api(page, { action: "accept_agreement", version: draft.version, termsHash: draft.termsHash, authorityConfirmed: true });
    await page.goto("/deals/hero/track");
    await expect(page.getByTestId("current-agreement")).toContainText(expectedTitle);
    await expect(page.getByTestId("current-agreement")).toContainText("Accepted");
  }

  const declined = await prepareSent(page);
  await api(page, { action: "decline", version: declined.version, reason: "budget" });
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("current-agreement")).toContainText("Declined");
  await expect(page.getByTestId("current-agreement")).toContainText("not shown as money owed");
});

test("commercial case picker starts all three cases and isolates their buyer, run and outcomes", async ({ page }) => {
  const cases = [
    {
      id: "reduced-scope",
      buyer: "Kestrel Lane Clinics",
      message: "The broken booking page is costing us enquiries",
      status: "clarifying",
    },
    {
      id: "preserve-scope",
      buyer: "Northstar Learning Centres",
      message: "We need the complete annual package",
      status: "options_ready",
    },
    {
      id: "no-fit",
      buyer: "Blue Harbor Foods",
      message: "The retail launch cannot move",
      status: "no_feasible_structure",
    },
  ] as const;

  for (const item of cases) {
    await page.goto("/deals");
    await expect(page.getByTestId("case-picker")).toBeVisible();
    await page.getByTestId(`select-case-${item.id}`).click();
    await expect(page.getByTestId("case-switch-warning")).toHaveText("Starting another case resets unfinished demo progress.");
    await page.getByTestId("start-selected-case").click();
    await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(item.buyer);
    expect(state().caseId).toBe(item.id);
    expect(state().status).toBe(item.status);
    expect(state().run.record.inputs.messages.some((message) => message.text.includes(item.message))).toBe(true);
    expect(state().agreements).toHaveLength(0);
    expect(state().outcomes).toHaveLength(0);

    if (item.id === "reduced-scope") {
      await expect(page.getByTestId("thread-understand")).toContainText(item.message);
      await api(page, { action: "send_questions" });
      expect(state().conversation.length).toBeGreaterThan(0);
    } else {
      await page.getByText("Details", { exact: true }).click();
      await expect(page.getByTestId("thread-understand")).toContainText(item.message);
      expect(state().conversation).toHaveLength(0);
      expect(state().run.record.inputs.messages.some((message) => message.text.includes("Kestrel"))).toBe(false);
    }
  }

  // Leave the existing hero journey as the selected case for subsequent manual testing.
  await api(page, { action: "start_case", caseId: "reduced-scope" });
});

test("step 3 · info buttons open on click and close on Escape, and the settled Understand stage carries a summary line", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);
  await startCase(page);
  await page.goto("/deals/hero/understand");
  const why = page.getByTestId("why-clar-gst");
  await expect(page.getByTestId("why-clar-gst-note")).toHaveCount(0);
  await why.click();
  await expect(why).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("why-clar-gst-note")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("why-clar-gst-note")).toHaveCount(0);

  await prepareOptions(page);
  await page.goto("/deals/hero/understand");
  await expect(page.getByTestId("understand-summary")).toContainText("Budget ₹50,000 now including GST");
});

test("step 3 · Track leads with the next step, collapses the rest, and does not repeat the headline", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareSent(page);
  await page.goto("/deals/hero/track");
  const headline = (await page.getByTestId("status-headline").innerText()).trim();
  await expect(page.getByTestId("now-card")).not.toContainText(headline);
  await expect(page.getByTestId("now-card")).toContainText("Your next step");
  await expect(page.getByTestId("track-outcome-details")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("track-conversation-details")).not.toHaveAttribute("open", "");
  await page.getByTestId("delivery-status").getByRole("button").click();
  await expect(page.getByTestId("delivery-status").getByRole("note")).toContainText("simulated channel");
});

test("step 3 · alternatives are visible rows, not hidden behind a disclosure", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("alternative-1")).toBeVisible();
  await expect(page.getByTestId("compare-alternatives").locator("summary")).toHaveCount(0);
});

test("step 4 · the buyer's page leads with a glance line, words the attestation from the terms, and offers change starters without an amount", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const agreement = await prepareSent(page);
  await page.goto(`/proposal/${agreement.agreementId}/v${agreement.version}`);
  await expect(page.getByTestId("proposal-glance")).toContainText("including GST · 2 payments ·");
  await expect(page.getByTestId("recurring")).toContainText("You authorise Pinecone Media Works to collect the scheduled payments above");
  await expect(page.getByTestId("recurring")).toContainText("only if you both accept a revised proposal");
  await page.getByTestId("request-change").click();
  await expect(page.getByTestId("change-starter-date")).toBeVisible();
  await expect(page.getByTestId("change-starter-scope")).toBeVisible();
  await expect(page.getByTestId("change-starter-other")).toBeVisible();
  await expect(page.getByText(/different amount/i)).toHaveCount(0);
  await page.getByTestId("change-starter-date").click();
  await expect(page.getByLabel("What would you like changed?")).toHaveValue(/^I'd like a different payment date: /);
});

test("step 4 · the merchant preview says it is what the buyer will see, and the simulated buyer reply is a set of choices", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await api(page, { action: "review_buyer_proposal" });
  await page.goto("/deals/hero/offer/preview");
  await expect(page.getByTestId("preview-frame")).toContainText("You're seeing what");
  await expect(page.getByTestId("preview-frame")).toContainText("will see");
});

test("step 5 · on a phone a bar points at the one real action when it is off-screen, and never performs it; on desktop it is hidden", async ({ page }) => {
  await prepareOptions(page);
  await page.setViewportSize(DESKTOP);
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("sticky-next")).toBeHidden();

  await page.setViewportSize(MOBILE);
  await page.goto("/deals/hero/offer");
  const bar = page.getByTestId("sticky-next");
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("Review buyer proposal");
  const before = state().status;
  await bar.getByRole("button").click();
  await expect(page.getByTestId("primary-action")).toBeFocused();
  await expect(bar).toHaveCount(0);
  expect(state().status).toBe(before);
  await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
});

test("step 5 · plain terms and rounded forecasts on the offer", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("offer-contribution")).toHaveText("about ₹19,330");
  await expect(page.getByTestId("compare-alternatives")).toContainText("Projected contribution about ₹19,330");
  await expect(page.locator("main")).not.toContainText(/permitted structures|merchant-approved template/i);
});

test("counter-offer · the merchant answers a buyer's request for a lower amount, overriding a failed rule on the record", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const sent = await prepareSent(page);
  await api(page, { action: "request_change", version: sent.version, text: "Could you do ₹40,000 instead?" });
  await page.goto("/deals/hero/track");
  // A pending buyer request opens its card by itself.
  await expect(page.getByTestId("buyer-work-card")).toHaveAttribute("open", "");
  const form = page.getByTestId("counter-form");
  await expect(form).toContainText("Current offer: ₹46,020 including GST");

  // The engine rechecks, names the failed rule, and the merchant cannot proceed without the override.
  await form.getByTestId("counter-total").fill("40000");
  await form.getByTestId("counter-check").click();
  await expect(form.getByTestId("counter-fails")).toContainText("does not meet your rules");
  await expect(form.getByTestId("counter-make")).toBeDisabled();
  await form.getByTestId("counter-override").check();
  await expect(form.getByTestId("counter-make")).toBeEnabled();
  await form.getByTestId("counter-make").click();

  // Back at Offer with the counter selected, attributed to the merchant and flagged as overridden.
  await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
  await expect(page.getByTestId("recommendation")).toContainText("Your counter-offer");
  await expect(page.getByTestId("attribution")).toContainText("you chose to send it anyway");
  await expect(page.getByTestId("counter-override-note")).toBeVisible();
  await expect(page.getByTestId("offer-total")).toContainText("₹40,0");
  expect(state().counterOffers.at(-1)!.override).not.toBeNull();

  // The usual preview, approval and send; the buyer's page now shows the new version.
  await clickPrimary(page);
  await expect(page).toHaveURL(/\/deals\/hero\/offer\/preview$/);
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/deals\/hero\/track$/);
  await expectStage(page, "track", "Waiting for the buyer to review offer version 2", undefined);
  await page.goto(`/proposal/${sent.agreementId}/v1`);
  await expect(page.getByTestId("buyer-status")).toContainText("replaced");
  await page.goto(`/proposal/${sent.agreementId}/v2`);
  await expect(page.getByTestId("buyer-total")).toContainText("₹40,0");
});
