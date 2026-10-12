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

/** Reviewer tools (guide, audit trail) live in the presenter frame; open it only if it is closed. */
/** The alternatives and the strategy comparison live in one closed section; open it first. */
async function openOtherOptions(page: Page) {
  const section = page.getByTestId("other-options");
  if ((await section.getAttribute("open")) === null) await section.locator(":scope > summary").click();
}

async function clickReviewer(page: Page, testId: "audit-details" | "walkthrough-launcher") {
  const menu = page.getByTestId("presenter-frame");
  if ((await menu.getAttribute("open")) === null) await page.getByTestId("presenter-frame-toggle").click();
  await page.getByTestId(testId).click();
}

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
  await clickReviewer(page, "walkthrough-launcher");
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
    { gst: "clar-gst-yes", approval: "clar-approval-contract", expected: "phased_scope:scope=web-search-report-3m,plan=two_monthly", recorded: true },
    { gst: "clar-gst-no", approval: "clar-approval-contract", expected: "shorter_commitment:term_months=3,plan=upfront", recorded: false },
    { gst: "clar-gst-yes", approval: "clar-approval-payment", expected: "split_payment:plan=quarterly_4", recorded: false },
    { gst: "clar-gst-no", approval: "clar-approval-payment", expected: "split_payment:plan=quarterly_4", recorded: false },
  ] as const;

  for (const c of cases) {
    await prepareClarificationCombination(page, c.gst, c.approval);
    await page.goto("/deals/hero/offer");
    await expect(page.getByTestId("recommendation")).toBeVisible();
    await api(page, { action: "review_buyer_proposal" });
    expect(state().agreements.find((agreement) => agreement.status === "draft")?.structureId).toBe(c.expected);

    await page.goto("/deals/hero/offer");
    await page.reload();
    await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
    await clickReviewer(page, "audit-details");
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
      await expect(page.getByTestId("attribution")).toContainText("Worked out again after the buyer's answer");
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
    await expect(page.getByTestId("status-headline")).toContainText("Questions sent.");
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
  await expectStage(page, "understand", "Questions sent.", undefined);
  await expect(page.getByText("Waiting for buyer", { exact: true })).toHaveCount(1);
  // The questions have left the drafts; what is pending sits in slots on the facts they concern.
  await expect(page.getByTestId("clarification-drafts")).toHaveCount(0);
  await expect(page.getByTestId("slot-budget")).toHaveAttribute("data-state", "asked");
  await expect(page.getByTestId("slot-approval")).toHaveAttribute("data-state", "asked");

  // The simulated buyer's replies are choices, including honest uncertainty.
  await expect(page.getByTestId("walkthrough-reply-clar-gst-unclear")).toBeVisible();
  await expect(page.getByTestId("walkthrough-reply-__typed")).toBeVisible();
  await page.getByTestId("walkthrough-reply-clar-gst-yes").check();
  await expect(page.getByTestId("walkthrough-reply-clar-gst-yes")).toBeChecked();
  await walkthroughPrimary(page).click();
  await expect(page.getByTestId("walkthrough-reply-choice")).toHaveAttribute("data-value", "clar-approval-contract");
  await walkthroughPrimary(page).click();
  // Clear replies are applied as they arrive: the chips are under the replies and the next step is in the chat.
  await expect(page.getByTestId("answer-clar-gst")).toContainText("Includes GST");
  await expect(page.getByTestId("answer-clar-approval")).toContainText("Whole deal");
  await expect(page.getByTestId("primary-action")).toHaveText("Review offer");
  await page.getByTestId("primary-action").click();

  await expectStage(page, "offer", "Review this offer", "Review buyer proposal");
  await expect(page.getByTestId("recommendation")).toContainText("Suggested offer");
  // The first phase is the sale; the rest of the year is held at today's rates, as one more line of the same comparison.
  await expect(page.getByTestId("transformation-rows")).toContainText("Rest of the year₹84,960 held until 18 Mar 2027");
  await shot(page, "desktop-2-offer");
  await clickPrimary(page);
  await expect(page).toHaveURL(/\/deals\/hero\/offer\/preview$/);
  await expect(page.getByTestId("preview-frame")).toContainText("Not sent");
  await expect(page.getByTestId("buyer-message-preview")).toContainText("Here is our proposal");
  await expect(page.getByTestId("buyer-message-preview")).toContainText("The rest of the year (₹84,960 including GST) stays open at today's rates until 18 Mar 2027.");
  await expect(page.getByTestId("buyer-message-preview")).toContainText("Review and respond here");
  await expect(page.getByTestId("primary-action")).toHaveText("Send offer");
  await shot(page, "desktop-3-preview");
  await page.getByTestId("buyer-message-preview").click();
  await shot(page, "desktop-3b-preview-message");

  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/deals(\?sent=1)?$/);
  await page.goto("/deals/hero/track");
  await expectStage(page, "track", "Waiting for the buyer to review offer version 1", undefined);
  await shot(page, "desktop-5-track-waiting");
  await page.getByTestId("open-buyer-proposal").click();
  await expect(page.getByTestId("buyer-view")).toBeVisible();
  await expect(page.getByTestId("held-offer")).toHaveText("The rest of the year (₹84,960 including GST) stays open at today's rates until 18 Mar 2027.");
  await shot(page, "desktop-4-buyer-proposal");
  await page.getByTestId("accept").click();
  // One tap accepted and paid: the buyer is set up on this same page.
  await expect(page.getByTestId("setup-done")).toBeVisible();
  await page.getByTestId("back-to-merchant").click();

  await expect(page.getByTestId("payment-timeline")).toContainText("Buyer accepted the deal");
  await expect(walkthroughPrimary(page)).toContainText("Advance simulated date");
  await walkthroughPrimary(page).click();
  await expect(walkthroughPrimary(page)).toContainText("Send scheduled advance notice");
  await walkthroughPrimary(page).click();
  await expect(page.getByTestId("walkthrough-reply-choice")).toHaveAttribute("data-value", "notice-cash-tight");
  await walkthroughPrimary(page).click();
  await expectStage(page, "track", /can't pay until after 20 Dec 2026/, "Draft revised terms");
  await clickPrimary(page);
  await expectStage(page, "track", "Review the revised terms", "Review revised terms");
  await expect(page.getByTestId("amendment-card")).toContainText("They said “till the 20th”");
  await shot(page, "desktop-6-amendment");
  await page.getByTestId("primary-action").click();
  await expect(page.getByTestId("amendment-card")).toHaveAttribute("open", "");
  await page.getByTestId("approve-revised-terms").click();
  await expectStage(page, "track", "Waiting for the buyer to accept the revised terms", undefined);
  await page.getByTestId("open-buyer-proposal").click();
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("buyer-status")).toContainText(/Accepted|You accepted/);
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
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/offer$/);
  await clickPrimary(page);
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/deals(\?sent=1)?$/);
  await page.goto("/deals/hero/track");
  await page.getByTestId("open-buyer-proposal").click();
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("setup-done")).toBeVisible();
  await api(page, { action: "demo_system_step", stepId: "advance_to_notice" });
  await api(page, { action: "demo_system_step", stepId: "send_notice" });
  const notice = state().conversation.findLast((m) => m.kind === "notice")!;
  await api(page, { action: "buyer_reply", inReplyTo: notice.id, scriptId: "notice-cash-tight" });
  await page.goto("/deals/hero/track");
  await clickPrimary(page);
  await page.getByTestId("primary-action").click();
  await page.getByTestId("approve-revised-terms").click();
  await page.getByTestId("open-buyer-proposal").click();
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("buyer-status")).toContainText(/Accepted|You accepted/);
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("amendment-settled")).toBeVisible();
  await expect(page.getByTestId("walkthrough")).toHaveCount(0);
});

test("walkthrough navigation reaches merchant decisions but never approves them", async ({ page }) => {
  await prepareOptions(page);
  await page.goto("/deals/hero/understand");
  await openWalkthrough(page);
  await expect(walkthroughPrimary(page)).toContainText("Take me there");
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
  await expect(page).toHaveURL(/\/deals(\?sent=1)?$/);
  await page.goto("/deals/hero/track");
  await expectStage(page, "track", "Waiting for the buyer to review", undefined);
});

test("legacy routes redirect to the domain-derived current stage", async ({ page }) => {
  await reset(page);
  for (const route of ["/workspace", "/clarification", "/decision", "/agreement", "/timeline"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
  }
  await prepareOptions(page);
  // Until an offer is chosen, the deal opens on what the buyer said, however many times it has been read.
  await page.goto("/decision");
  await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
  await api(page, { action: "understand_reviewed" });
  await page.goto("/decision");
  await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
  await api(page, { action: "review_buyer_proposal" });
  await page.goto("/decision");
  await expect(page).toHaveURL(/\/deals\/hero\/offer\/preview$|\/deals\/hero\/offer$/);
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
  await clickReviewer(page, "audit-details");
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
  await expect(page.locator("main")).not.toContainText(/Suggested by AI|Groq|AI run/);
  await page.goto("/deals/hero/understand");
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

test("presenter keeps demo controls separate from records and integrity evidence", async ({ page }) => {
  await page.goto("/presenter");
  await expect(page.getByTestId("presenter-demo-controls")).toBeVisible();
  await expect(page.getByTestId("presenter-evidence")).toBeHidden();
  await expect(page.getByText("Run record and integrity", { exact: true })).toBeHidden();
  await page.getByRole("tab", { name: "Evidence and integrity" }).click();
  await expect(page.getByTestId("presenter-evidence")).toBeVisible();
  await expect(page.getByText("Run record and integrity", { exact: true })).toBeVisible();
  await expect(page.getByTestId("presenter-demo-controls")).toBeHidden();
});

test("390px layouts remain focused and free of horizontal overflow", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await reset(page);
  await page.goto("/deals/hero/understand");
  await noHorizontalScroll(page);
  await shot(page, "mobile-1-understand");
  await clickReviewer(page, "audit-details");
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
  await expect(page).toHaveURL(/\/deals(\?sent=1)?$/);
  await noHorizontalScroll(page);
  await page.goto("/deals/hero/track");
  await page.getByTestId("open-buyer-proposal").click();
  await noHorizontalScroll(page);
  await shot(page, "mobile-3-buyer-proposal");
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("setup-done")).toBeVisible();
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("status-banner")).toBeVisible();
  await expect(page.getByTestId("payment-timeline")).toBeVisible();
  await noHorizontalScroll(page);
  await shot(page, "mobile-4-track");
});

test("audit · evidence is a two-column table, identifiers sit behind copy buttons, and the pipeline names its model once", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  await clickReviewer(page, "audit-details");
  const drawer = page.getByTestId("audit-drawer");
  const table = drawer.getByTestId("audit-evidence-table");
  await expect(table).toContainText("Extracted value");
  await expect(table).toContainText("Source quote");
  // The source is named once, not on every row, and no offsets or message ids are shown beside a quote.
  await expect(drawer.getByText("Source: Simulated WhatsApp conversation")).toHaveCount(1);
  await expect(table).not.toContainText(/chars \d/);
  await expect(table).not.toContainText(/conv-\d|msg-\d/);
  await expect(table.locator("blockquote").first()).toContainText("₹");
  // One pipeline: the model is stated once, the lanes are labelled, and a sample is never called an AI run.
  const pipeline = drawer.getByTestId("audit-pipeline");
  await expect(drawer.getByTestId("audit-model-header")).toHaveText("Sample output written by hand · no model ran");
  await expect(pipeline.locator('[data-lane="code"]').first()).toContainText("Rules engine");
  await expect(pipeline.locator('[data-lane="ai"]').first()).toContainText("Hand-written sample");
  await expect(pipeline).not.toContainText(/AI run|gpt-oss/);
  await expect(drawer.getByTestId("reproduced-badge")).toContainText("Reproduced");
  await expect(drawer.getByText("Who did what")).toHaveCount(0);
  // Identifiers are one click from the clipboard, and say so.
  await pipeline.locator("summary", { hasText: "Advanced details" }).click();
  const copy = pipeline.getByTestId("copy-button").first();
  await copy.click();
  await expect(copy.getByRole("status")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(state().run.record.runId);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
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

  await page.getByTestId("presenter-frame-toggle").click();
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
  // A second Escape closes the presenter panel itself, so it is not left over the product.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("presenter-hub")).toBeHidden();

  await toggleDetails(page, ["see-economics"]);
  await page.getByTestId("primary-action").click();
  await toggleDetails(page, ["preview-agreement-details"]);
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/deals(\?sent=1)?$/);
  await page.goto("/deals/hero/track");
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
  await openOtherOptions(page);
  await expect(page.getByTestId("compare-alternatives")).toBeVisible();
  await expect(page.getByTestId("compare-alternatives")).toContainText("If their MD approves, you'd keep");
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
  await expectStage(page, "track", "The buyer asked for a change", "Review buyer request");
  await expect(page.getByTestId(`work-${request.id}`)).toContainText("Your offer stays as it is until you decide");
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
  await expect(page.getByTestId(`attention-${unsupported.id}`)).toContainText("agree what happens next");
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
  await expect(page.getByTestId("recommendation")).toContainText("You chose this");
  await expect(page.getByTestId("recommendation")).toContainText(/MD/);
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/offer\/preview$/);
  const draft = state().agreements.find((agreement) => agreement.status === "draft")!;
  await api(page, { action: "approve_and_send_draft", version: draft.version, termsHash: draft.termsHash });

  await page.goto(`/proposal/${draft.agreementId}/v${draft.version}`);
  // No checkbox: the attestation is a sentence beside the button, and Accept is ready to press.
  await expect(page.getByTestId("authority-notice")).toContainText("By accepting, you confirm your company has approved");
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
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
  // It names the rule that stopped the move and writes dates in words.
  await expect(page.getByTestId("buyer-work-card")).toContainText(/Moving the payment to \d+ \w+ 2027? does not pass:/);
  await expect(page.getByTestId("buyer-work-card")).not.toContainText(/20\d\d-\d\d-\d\d/);
  await expect(page.getByTestId("payment-timeline")).toContainText("1 Dec 2026");
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
  await expect(current).toContainText("Nothing beyond this is promised");
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
  await expect(page.getByTestId("current-agreement")).toContainText("Nothing was set up");
});

test("commercial case picker starts all three cases and isolates their buyer, run and outcomes", async ({ page }) => {
  // Deals set aside by earlier tests would be reopened where they were left; this one needs three fresh starts.
  await api(page, { action: "reset" });
  const cases = [
    {
      id: "reduced-scope",
      buyer: "Harbour Fresh Foods",
      message: "I would rather start small and see results",
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
      message: "The issue is timing",
      status: "no_feasible_structure",
    },
  ] as const;

  for (const item of cases) {
    await page.goto("/deals");
    await expect(page.getByTestId("case-picker")).toBeVisible();
    await page.getByTestId(`select-case-${item.id}`).click();
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
      const details = page.getByText("Details", { exact: true });
      if (await details.count()) await details.click();
      await expect(page.getByTestId("thread-understand")).toContainText(item.message);
      expect(state().conversation).toHaveLength(0);
      expect(state().run.record.inputs.messages.some((message) => message.text.includes("Harbour Fresh"))).toBe(false);
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
  // Once an offer has been chosen, Understand settles into a summary line.
  await api(page, { action: "review_buyer_proposal" });
  await page.goto("/deals/hero/understand");
  await expect(page.getByTestId("understand-summary")).toContainText("Budget ₹50,000 now including GST");
});

test("step 3 · Track confirms the send, offers a way back, and keeps analytics on the Performance tab", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareSent(page);
  await page.goto("/deals/hero/track");
  const headline = (await page.getByTestId("status-headline").innerText()).trim();
  await expect(page.getByTestId("now-card")).not.toContainText(headline);
  await expect(page.getByTestId("no-action")).toHaveCount(0);
  await expect(page.getByTestId("delivery-status")).toContainText(/Sent to .+ at /);
  await expect(page.getByTestId("return-to-deals")).toHaveText("Back to active deals");
  await expect(page.getByTestId("thread-track")).toBeVisible();
  await expect(page.getByTestId("outcome-card")).toHaveCount(0);
  // Nothing is collected before the buyer accepts, so no outcome and no payment timeline are shown.
  await expect(page.getByTestId("track-outcome-link")).toHaveCount(0);
  await expect(page.getByText("Agreement and payments")).toHaveCount(0);
  await page.getByTestId("return-to-deals").click();
  await expect(page).toHaveURL(/\/deals$/);
  await expect(page.getByTestId("deal-status-reduced-scope")).toContainText("Waiting on buyer");
  await page.goto("/deals/hero/track");
  await page.getByTestId("delivery-status").getByRole("button").click();
  await expect(page.getByTestId("delivery-status").getByRole("note")).toContainText("WhatsApp (simulated)");
});

test("active deals · an inbox: the deals on the left, and what is in the way, in their own words, on the right", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await api(page, { action: "reset" });
  await page.goto("/deals");
  await expect(page.getByText("Jump to")).toHaveCount(0);
  await expect(page.getByText(/clears the current/i)).toHaveCount(0);
  const panel = page.getByTestId("deal-panel");
  // The open deal is selected, and its situation is a few facts, each from the buyer's own words.
  await expect(panel.getByTestId("deal-panel-buyer")).toHaveText("Harbour Fresh Foods");
  await expect(panel.getByTestId("tile-budget")).toContainText("Short of your quote");
  await expect(panel.getByTestId("tile-budget")).toContainText("₹50,000 available now");
  await expect(panel.getByTestId("tile-budget")).toContainText("I only have ₹50,000 left in this quarter");
  await expect(panel.getByTestId("tile-timeline")).toContainText("No start date stated");
  await expect(panel.getByTestId("situation-source")).toContainText("Verdicts are worked out by code");
  await expect(panel.getByTestId("deal-conversation")).toContainText("I would rather start small and see results");
  // The action sits inside the selected deal's panel.
  await expect(panel.getByTestId("start-selected-case")).toBeVisible();
  // Choosing another deal changes the panel, not the page.
  await page.getByTestId("select-case-no-fit").click();
  await expect(panel.getByTestId("deal-panel-buyer")).toHaveText("Blue Harbor Foods");
  await expect(panel.getByTestId("tile-timeline")).toContainText("Needs a fast start");
  await expect(panel.getByTestId("tile-budget")).toContainText("Covers your quote");
  await expect(panel.getByTestId("deal-conversation")).toContainText("The issue is timing");
  await page.getByTestId("select-case-preserve-scope").click();
  await expect(panel.getByTestId("tile-scope")).toContainText("Services to confirm");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("active deals · all three deals are held at once, each with its own progress", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await api(page, { action: "reset" });
  await api(page, { action: "start_case", caseId: "reduced-scope" });
  await api(page, { action: "send_questions" });
  await page.goto("/deals");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Active deals");
  await expect(page.getByTestId("deal-status-reduced-scope")).toContainText("Waiting on buyer");
  await expect(page.getByTestId("deal-status-preserve-scope")).toContainText("Not started");
  await expect(page.getByTestId("deal-status-no-fit")).toContainText("Not started");
  // Starting another deal sets this one aside; it is not cleared.
  await page.getByTestId("select-case-no-fit").click();
  await expect(page.getByTestId("start-selected-case")).toHaveText(/Start deal/);
  await page.getByTestId("start-selected-case").click();
  await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
  expect(state().caseId).toBe("no-fit");
  await page.goto("/deals");
  await expect(page.getByTestId("deal-status-reduced-scope")).toContainText("Waiting on buyer");
  await expect(page.getByTestId("deal-status-no-fit")).toContainText("Open now");
  // Coming back finds exactly where it was.
  await page.getByTestId("select-case-reduced-scope").click();
  await expect(page.getByTestId("start-selected-case")).toHaveText(/Open deal/);
  await page.getByTestId("start-selected-case").click();
  await expect.poll(() => state().caseId).toBe("reduced-scope");
  expect(state().conversation.some((item) => item.kind === "clarification" && item.sentAt)).toBe(true);
  // A full reset forgets the deals that were set aside.
  await api(page, { action: "reset" });
  await api(page, { action: "open_deal", caseId: "no-fit" });
  expect(state().agreements).toHaveLength(0);
  expect(state().conversation.filter((item) => item.kind === "clarification" && item.sentAt)).toHaveLength(0);
});

test("understand · pointing at a fact lights its sentence, unknowns are slots that fill, and the questions are drafts in the chat", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await api(page, { action: "reset" });
  await api(page, { action: "start_case", caseId: "reduced-scope" });
  await page.goto("/deals/hero/understand");
  const list = page.getByTestId("constraint-list");
  await expect(list).toContainText("Budget this quarter");
  // The conversation is not painted; a value lights the sentence it came from, and leaving clears it.
  const sentence = page.locator('[data-testid="chat-highlight"]', { hasText: "I only have ₹50,000 left in this quarter" });
  await expect(sentence).toBeVisible();
  await expect(sentence).not.toHaveAttribute("data-lit", "true");
  expect(await sentence.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await page.getByTestId("value-budget").hover();
  await expect(sentence).toHaveAttribute("data-lit", "true");
  await page.getByTestId("value-approval").hover();
  await expect(sentence).not.toHaveAttribute("data-lit", "true");
  await expect(page.getByTestId("source-budget")).toHaveCount(0);
  // The unknowns are empty slots, not appended sentences.
  await expect(page.getByTestId("slot-budget")).toHaveAttribute("data-state", "empty");
  await expect(page.getByTestId("slot-budget")).toHaveText("GST included?");
  await expect(page.getByTestId("slot-approval")).toHaveText("Per payment or whole deal?");
  await expect(page.getByText("How this decision is grounded")).toHaveCount(0);
  // The questions are drafts at the foot of the chat, with the send button in it.
  const chat = page.getByTestId("thread-understand");
  const drafts = chat.getByTestId("clarification-drafts");
  await expect(drafts).toContainText("Suggested questions · not sent");
  await expect(drafts.locator("textarea")).toHaveCount(2);
  await expect(page.getByTestId("questions-card")).toHaveCount(0);
  // Reword one before sending: it goes as the merchant's own words, and is marked so.
  const first = drafts.locator("textarea").first();
  await first.fill("Just to be sure: do the ₹50,000 and ₹60,000 both include GST?");
  await expect(page.getByTestId("draft-wording")).toHaveText("Edited by you");
  await drafts.getByTestId("primary-action").click();
  await expect(page.getByTestId("slot-budget")).toHaveAttribute("data-state", "asked");
  await expect(page.getByTestId("slot-approval")).toHaveAttribute("data-state", "asked");
  await expect(chat).toContainText("Just to be sure: do the ₹50,000 and ₹60,000 both include GST?");
  await expect(chat).toContainText("Edited by you");
  const sent = state().conversation.filter((item) => item.kind === "clarification" && item.sentAt);
  expect(sent).toHaveLength(2);
  expect(sent.find((item) => item.refs.edited)).toMatchObject({ author: "merchant", state: "approved_and_sent_by_merchant", text: "Just to be sure: do the ₹50,000 and ₹60,000 both include GST?" });
  expect(sent.filter((item) => item.refs.edited)).toHaveLength(1);
  // The buyer replies in another place; the page picks it up by itself, and the slots fill.
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-gst").id, scriptId: "clar-gst-yes" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-approval").id, scriptId: "clar-approval-contract" });
  await expect(page.getByTestId("slot-budget")).toHaveAttribute("data-state", "filled", { timeout: 12000 });
  await expect(page.getByTestId("slot-budget")).toHaveAttribute("aria-label", "GST included? Includes GST");
  await expect(page.getByTestId("constraint-budget")).toContainText("including GST");
  await expect(page.getByTestId("thread-understand").getByTestId("primary-action")).toHaveText("Review offer");
  await expect(page.getByTestId("answer-clar-gst")).toContainText("Includes GST");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("understand · a reworded question cannot carry internal wording, and an empty one cannot be sent", async ({ page }) => {
  await api(page, { action: "reset" });
  await api(page, { action: "start_case", caseId: "reduced-scope" });
  const first = state().conversation.find((item) => item.kind === "clarification" && !item.sentAt)!;
  const refused = await page.request.post("/api/actions", { data: { action: "send_questions", edits: { [first.refs.questionId!]: "Our contribution floor is 35%, so can you pay more?" } } });
  expect((await refused.json()) as { ok: boolean }).toMatchObject({ ok: false });
  expect(state().conversation.filter((item) => item.kind === "clarification" && item.sentAt)).toHaveLength(0);
  const empty = await page.request.post("/api/actions", { data: { action: "send_questions", edits: { [first.refs.questionId!]: "  " } } });
  expect((await empty.json()) as { ok: boolean }).toMatchObject({ ok: false });
  await page.goto("/deals/hero/understand");
  await page.locator("textarea").first().fill("hi");
  await expect(page.getByTestId("primary-action")).toBeDisabled();
});

test("step 3 · alternatives are visible rows, not hidden behind a disclosure", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  await openOtherOptions(page);
  await expect(page.getByTestId("alternative-1")).toBeVisible();
  await expect(page.getByTestId("compare-alternatives").locator("summary")).toHaveCount(0);
});

test("step 4 · the buyer's page leads with a glance line, words the attestation from the terms, and offers change starters without an amount", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const agreement = await prepareSent(page);
  await page.goto(`/proposal/${agreement.agreementId}/v${agreement.version}`);
  await expect(page.getByTestId("proposal-glance")).toContainText("₹23,010 now, then ₹23,010 on 1 Dec 2026");
  await expect(page.getByTestId("recurring")).toContainText("next payment is collected automatically");
  await expect(page.getByTestId("recurring")).toContainText("remind you 3 days before");
  await page.getByTestId("request-change").click();
  for (const kind of ["price", "scope", "date", "other"]) await expect(page.getByTestId(`change-starter-${kind}`)).toBeVisible();
  await page.getByTestId("change-starter-price").click();
  await expect(page.getByTestId("change-amount")).toBeVisible();
  await expect(page.getByTestId("change-gst-including")).toBeChecked();
  await page.getByTestId("change-starter-scope").click();
  await expect(page.getByTestId("change-service-social-media")).not.toBeChecked();
  await expect(page.getByTestId("change-service-website-fixes")).toBeChecked();
  await page.getByTestId("change-starter-date").click();
  await expect(page.getByTestId("change-line")).toBeVisible();
  await expect(page.getByTestId("change-date")).toBeVisible();
  await page.getByTestId("change-starter-other").click();
  await expect(page.getByTestId("change-note")).toBeVisible();
  await noHorizontalScroll(page);
});

test("the buyer's decline is a quiet link at the very bottom, after a confirmation", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const agreement = await prepareSent(page);
  await page.goto(`/proposal/${agreement.agreementId}/v${agreement.version}`);
  const decline = page.getByTestId("decline");
  await expect(decline).toHaveText("I'm no longer interested");
  // It sits below the response actions, not beside them.
  const accept = await page.getByTestId("accept").boundingBox();
  const link = await decline.boundingBox();
  expect(link!.y).toBeGreaterThan(accept!.y + accept!.height);
  await decline.click();
  await expect(page.getByTestId("confirm-decline")).toBeVisible();
  expect(state().agreements.find((a) => a.version === agreement.version)!.status).toBe("sent");
});

test("accepted terms show truthful setup copy without delivery metadata or a technical payment-link ID", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const agreement = await prepareAccepted(page);
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("delivery-status")).toHaveCount(0);
  await expect(page.getByTestId("payment-timeline")).toContainText("Payment link · ₹23,010");
  await expect(page.getByTestId("payment-timeline")).toContainText("Automatic payment setup requested");

  await page.goto(`/proposal/${agreement.agreementId}/v${agreement.version}`);
  await expect(page.locator("body")).not.toContainText("plink_");
  await expect(page.getByTestId("buyer-status")).toContainText("You accepted this version");
  await expect(page.getByTestId("setup-panel")).toBeVisible();
});

test("step 4 · the draft is marked not sent, and the buyer view says it is what the buyer will see", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await api(page, { action: "review_buyer_proposal" });
  await page.goto("/deals/hero/offer/preview");
  await expect(page.getByTestId("preview-frame")).toContainText("Not sent yet");
  await page.getByTestId("preview-buyer-view").click();
  await expect(page.getByTestId("buyer-view-sheet")).toContainText("will see");
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
  await openOtherOptions(page);
  await expect(page.getByTestId("compare-alternatives")).toContainText("You'd keep about ₹19,330");
  await expect(page.locator("main")).not.toContainText(/permitted structures|merchant-approved template/i);
});

test("counter-offer · a price request shows its answers under the chat, and a smaller scope that the rules pass is offered with how far it still is from the ask", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const sent = await prepareSent(page);
  await api(page, { action: "request_change", version: sent.version, text: "Could you do a lower total: 40000?", topic: "price", detail: { kind: "price", targetPaise: 4_000_000, gstBasis: "including" } });
  await page.goto("/deals/hero/track");
  const corridor = page.getByTestId("negotiation-corridor");
  await expect(corridor.getByTestId("path-hold-firm")).toBeVisible();
  await expect(corridor.getByTestId("path-own-amount")).toBeVisible();
  await expect(page.getByText(/AI counter-offer/i)).toHaveCount(0);
  // No total at or below the ask passes the rules, so there is no discount suggestion; the closest smaller scope is offered instead, honestly.
  await expect(corridor.getByTestId("offer-safe-minimum")).toHaveCount(0);
  await expect(corridor.getByTestId("path-suggested")).toHaveCount(0);
  const scope = corridor.getByTestId("path-scope-change");
  await expect(scope).toContainText("Remove Monthly reporting");
  await expect(scope).toContainText("₹42,480");
  await expect(scope).toContainText("still ₹2,480 above their ask");
  await expect(scope).toContainText("Checked against your limits");
  // The buyer's request is shown once, in the chat.
  await expect(page.getByTestId("buyer-work-card")).toHaveCount(0);
  // The buyer's message sits above the three paths, and the rarer answers wait behind "More options".
  const chat = await page.getByTestId("thread-track").boundingBox();
  const decision = await corridor.boundingBox();
  expect(chat!.y).toBeLessThan(decision!.y);
  await expect(corridor.getByTestId("handle-outside")).toBeHidden();
  await corridor.getByTestId("corridor-more").locator("summary").click();
  await expect(corridor.getByTestId("handle-outside")).toBeVisible();
  // Holding firm answers the request without sending anything new.
  await corridor.getByTestId("keep-current-offer").click();
  await expect(page.getByTestId("negotiation-corridor")).toHaveCount(0);
});

test("counter-offer · the merchant answers a buyer's request for a lower amount, overriding a failed rule on the record", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const sent = await prepareSent(page);
  await api(page, { action: "request_change", version: sent.version, text: "Could you do ₹40,000 instead?", topic: "price" });
  await page.goto("/deals/hero/track");
  // A pending price request is answered under the buyer's message, in the chat.
  await expect(page.getByTestId("chat-footer").getByTestId("negotiation-corridor")).toContainText("Hold firm");
  await page.getByTestId("check-buyer-amount").click();
  const form = page.getByTestId("counter-form");

  // The engine rechecks, names the failed rule, and the merchant cannot proceed without the override.
  await form.getByTestId("counter-total").fill("40000");
  await form.getByTestId("corridor-basis-including").check();
  await form.getByTestId("counter-check").click();
  await expect(form.getByTestId("counter-fails")).toContainText("Outside your rules");
  await expect(form.getByTestId("review-exception")).toBeVisible();
  // An answer belongs to the amount it was checked for: editing the amount removes it.
  await form.getByTestId("counter-total").fill("6000");
  await expect(form.getByTestId("counter-result")).toHaveCount(0);
  await form.getByTestId("counter-total").fill("40000");
  await form.getByTestId("counter-check").click();
  await expect(form.getByTestId("counter-fails")).toBeVisible();
  await shot(page, "counter-1-check-and-override");
  // Sending an amount that fails a rule needs a reason, and nothing else.
  await form.getByTestId("review-exception").click();
  await expect(form.getByTestId("counter-make")).toBeDisabled();
  await form.getByTestId("counter-reason").fill("The buyer orders often and pays on time");
  await expect(form.getByTestId("counter-make")).toBeEnabled();
  await form.getByTestId("counter-make").click();

  // Back at Offer with the counter selected, attributed to the merchant and flagged as overridden.
  await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
  await expect(page.getByTestId("recommendation")).toContainText("Your counter-offer");
  await expect(page.getByTestId("attribution")).toContainText("you chose to go ahead anyway");
  await expect(page.getByTestId("counter-override-note")).toBeVisible();
  await expect(page.getByTestId("offer-total")).toContainText("₹40,0");
  await shot(page, "counter-2-offer");
  expect(state().counterOffers.at(-1)!.override).not.toBeNull();

  // The usual preview, approval and send; the buyer's page now shows the new version.
  await clickPrimary(page);
  await expect(page).toHaveURL(/\/deals\/hero\/offer\/preview$/);
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/deals(\?sent=1)?$/);
  await page.goto("/deals/hero/track");
  await expectStage(page, "track", "Waiting for the buyer to review offer version 2", undefined);
  await page.goto(`/proposal/${sent.agreementId}/v1`);
  await expect(page.getByTestId("buyer-status")).toContainText("replaced");
  await page.goto(`/proposal/${sent.agreementId}/v2`);
  await expect(page.getByTestId("buyer-total")).toContainText("₹40,0");
  await shot(page, "counter-3-buyer-version-2");
});

test("counter-offer · a request about a payment date is not offered a different-total answer", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const sent = await prepareSent(page);
  await api(page, { action: "request_change", version: sent.version, text: "Could we pay on 15 November?", topic: "date" });
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("buyer-work-card")).toBeVisible();
  await expect(page.getByTestId("counter-form")).toHaveCount(0);
  const refused = await api(page, { action: "counter_offer", totalPaise: 4_000_000, overrideConfirmed: true, acknowledgedChecks: ["DISCOUNT_ABOVE_LIMIT"] }, false);
  expect(JSON.stringify(refused)).toMatch(/not about the price/);
});

test("counter-offer · only a request the buyer marked as about the price is answered with a different total", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const sent = await prepareSent(page);
  // Typed without choosing a starter: recorded as "something else", so no price counter.
  await page.goto(`/proposal/${sent.agreementId}/v${sent.version}`);
  await page.getByTestId("request-change").click();
  await page.getByTestId("change-starter-other").click();
  await page.getByTestId("change-note").fill("Could you do 40000?");
  await page.getByTestId("send-change-request").click();
  await expect(page.getByTestId("buyer-change-requests")).toBeVisible();
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("buyer-work-card")).toBeVisible();
  await expect(page.getByTestId("counter-form")).toHaveCount(0);
  expect(state().conversation.find((m) => m.kind === "change_request")!.refs.topic).toBe("other");
});

test("counter-offer · choosing 'A lower price' makes the counter available", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const sent = await prepareSent(page);
  await page.goto(`/proposal/${sent.agreementId}/v${sent.version}`);
  await page.getByTestId("request-change").click();
  await page.getByTestId("change-starter-price").click();
  // The send button waits for a valid amount that is really lower, and shows the message the merchant will read.
  await expect(page.getByTestId("send-change-request")).toBeDisabled();
  await page.getByTestId("change-amount").fill("90000");
  await expect(page.getByTestId("change-problem")).toContainText("lower than the current ₹46,020");
  await expect(page.getByTestId("send-change-request")).toBeDisabled();
  await page.getByTestId("change-amount").fill("40000");
  await expect(page.getByTestId("change-preview")).toHaveText("Could you do ₹40,000 including GST?");
  await expect(page.getByTestId("send-change-request")).toHaveText("Reply to Pinecone Media Works");
  await expect(page.getByTestId("change-request-form")).toContainText("will see this and may send an updated version");
  await expect(page.getByTestId("cancel-change-request")).toBeVisible();
  expect(await page.getByTestId("cancel-change-request").evaluate((el) => el.tagName)).toBe("BUTTON");
  await page.getByTestId("send-change-request").click();
  await expect(page.getByTestId("buyer-change-requests")).toContainText("Sent. Pinecone Media Works will review your request. This current offer remains valid until a new one is agreed upon.");
  const request = state().conversation.findLast((m) => m.kind === "change_request")!;
  expect(request.text).toBe("Could you do ₹40,000 including GST?");
  expect(request.refs).toMatchObject({ topic: "price", request: { kind: "price", targetPaise: 4_000_000, gstBasis: "including" } });
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("check-buyer-amount")).toBeVisible();
  // The merchant's amount form starts with what the buyer asked for.
  await page.getByTestId("check-buyer-amount").click();
  await expect(page.getByTestId("counter-total")).toHaveValue("40000");
  await expect(page.getByTestId("corridor-basis-including")).toBeChecked();
});

test("a buyer asks for a different scope and a different date with guided inputs, and the merchant reads plain sentences", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const sent = await prepareSent(page);
  await page.goto(`/proposal/${sent.agreementId}/v${sent.version}`);
  await page.getByTestId("request-change").click();
  await page.getByTestId("change-starter-scope").click();
  await expect(page.getByTestId("send-change-request")).toBeDisabled(); // nothing changed yet
  await page.getByTestId("change-service-monthly-reporting").uncheck();
  await expect(page.getByTestId("change-preview")).toHaveText("Could we change what's included to Website fixes and Search marketing?");
  await page.getByTestId("send-change-request").click();
  await expect(page.getByTestId("buyer-change-requests")).toBeVisible();
  expect(state().conversation.findLast((m) => m.kind === "change_request")!.refs).toMatchObject({ topic: "scope", request: { kind: "scope", packageIds: ["website-fixes", "search-marketing"] } });
});

test("one tap accepts, pays and sets up auto-pay on the same page, with the authorisation written above the button", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const sent = await prepareSent(page);
  await page.goto(`/proposal/${sent.agreementId}/v${sent.version}`);
  await page.evaluate(() => ((window as unknown as { __kept: number }).__kept = 1));
  await expect(page.getByTestId("accept")).toHaveText("Accept and pay ₹23,010");
  await expect(page.getByTestId("autopay-notice")).toContainText("automatic payments of up to ₹23,010");
  await expect(page.getByTestId("authority-notice")).toContainText("you can approve this");
  await expect(page.locator("body")).not.toContainText(/card number|UPI ID/i);
  await noHorizontalScroll(page);
  await page.getByTestId("accept").click();
  // Same document, no navigation: the page turns into the confirmation in place.
  await expect(page.getByTestId("setup-done")).toContainText("₹23,010 paid. Next: ₹23,010 on 1 Dec 2026, collected automatically.");
  expect(await page.evaluate(() => (window as unknown as { __kept?: number }).__kept)).toBe(1);
  const final = state();
  expect(final.attempts.find((a) => a.method === "payment_link")!.status).toBe("succeeded");
  expect(final.mandate?.status).toBe("confirmed");
  expect(final.agreements.find((a) => a.version === sent.version)!.buyerAcceptance?.authorityConfirmed).toBe(true);
  await page.goto("/deals/hero/track");
  await expect(page.getByTestId("status-headline")).not.toContainText("Waiting for the buyer to pay");
});

test("step 5 · the Offer screen leads with the merchant's strategy, and each strategy's leader is computed by code", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("strategy-control")).toHaveAttribute("data-value", "protect_contribution");
  await expect(page.getByTestId("offer-headline")).toContainText("two monthly payments");
  await expect(page.getByTestId("attribution")).toHaveText("Suggested for the default priority: earning the most.");
  await expect(page.getByTestId("offer-rules")).toContainText("your prices & costs");
  await expect(page.getByTestId("offer-cash")).toContainText("₹0");
  await openOtherOptions(page);

  // What each strategy would recommend, one row each, from the same feasible offers.
  const rows = page.getByTestId("strategy-comparison");
  await expect(rows.getByTestId("strategy-row-protect_contribution")).toContainText("two monthly payments");
  await expect(rows.getByTestId("strategy-row-preserve_scope")).toContainText("Keep the full project and split the payments");
  await expect(rows.getByTestId("strategy-row-preserve_scope")).toContainText("Needs their MD");
  await expect(rows.getByTestId("strategy-row-minimise_cash_exposure")).toContainText("Needs their MD");
  await expect(rows.getByTestId("strategy-row-lower_buyer_commitment")).toContainText("two monthly payments");

  // The merchant's screen never mentions a model or a recording.
  await expect(page.getByTestId("recommendation")).not.toContainText(/Groq|recorded|no model ran/i);
});

test("step 5 · a strategy that leads with an offer needing MD approval says so and offers the best one without it", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  await page.getByTestId("strategy-minimise_cash_exposure").check();
  await expect(page.getByTestId("strategy-control")).toHaveAttribute("data-value", "minimise_cash_exposure");
  await expect(page.getByTestId("offer-approval")).toContainText("Needs buyer approval");
  await expect(page.getByTestId("within-approval-alternative")).toContainText("two monthly payments");
  await page.getByTestId("select-within-approval").click();
  // The merchant's own choice is credited to them, and the strategy now recommends something else.
  await expect(page.getByTestId("recommendation")).toContainText("You chose this");
  await expect(page.getByTestId("offer-headline")).toContainText("two monthly payments");
  await expect(page.getByTestId("attribution")).toHaveText("You chose this offer.");
  await expect(page.getByTestId("strategy-differs")).toContainText("We'd suggest: Keep the full project and split the payments");
  await page.getByTestId("use-recommended").click();
  await expect(page.getByTestId("offer-headline")).toHaveText("Keep the full project and split the payments");
  expect(state().economics.strategy).toBe("minimise_cash_exposure");
});

test("step 5 · the strategy control works from the keyboard, and a sent version keeps its strategy", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  await page.getByTestId("strategy-protect_contribution").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("strategy-preserve_scope")).toBeChecked();
  await expect(page.getByTestId("strategy-control")).toHaveAttribute("data-value", "preserve_scope");
  await page.getByTestId("strategy-protect_contribution").check();
  await expect(page.getByTestId("strategy-control")).toHaveAttribute("data-value", "protect_contribution");
  await clickPrimary(page);
  await expect(page).toHaveURL(/\/deals\/hero\/offer\/preview$/);
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/deals(\?sent=1)?$/);
  await page.goto("/deals/hero/track");
  expect(state().agreements.find((a) => a.status === "sent")!.economics?.strategy).toBe("protect_contribution");
  const refused = await page.request.post("/api/actions", { data: { action: "set_strategy", strategy: "preserve_scope" } });
  expect((await refused.json()).ok).toBe(false);
});

test("exceptions · an amount below direct costs needs only a reason, and the audit records the decision with it", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const sent = await prepareSent(page);
  await api(page, { action: "request_change", version: sent.version, text: "Could you do ₹5,000 instead?", topic: "price" });
  await page.goto("/deals/hero/track");
  await page.getByTestId("check-buyer-amount").click();
  const form = page.getByTestId("counter-form");
  await form.getByTestId("counter-total").fill("5000");
  await form.getByTestId("corridor-basis-including").check();
  await form.getByTestId("counter-check").click();
  await expect(form.getByTestId("counter-loss")).toContainText("less than it costs you to deliver");
  // A loss is shown in red and needs only a reason.
  await form.getByTestId("review-exception").click();
  await expect(form.getByTestId("counter-make")).toBeDisabled();
  await form.getByTestId("counter-reason").fill("Loss leader to win the annual contract");
  await expect(form.getByTestId("counter-make")).toBeEnabled();
  await shot(page, "exceptions-1-loss-confirmation");
  await form.getByTestId("counter-make").click();
  await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
  // The loss is shown plainly on the offer, in red, and the split bar covers it.
  await expect(page.getByTestId("offer-contribution")).toContainText("a loss of about");
  await expect(page.getByTestId("money-split")).toHaveAttribute("data-loss", "true");
  await expect(page.getByTestId("money-split")).toContainText("You lose");
  expect(state().counterOffers.at(-1)!.override).toMatchObject({ negativeContribution: true, reason: "Loss leader to win the annual contract" });
  expect(state().counterOffers.at(-1)!.evaluated.approvable).toBe(false);

  await clickReviewer(page, "audit-details");
  const audit = page.getByTestId("audit-exceptions");
  await expect(audit.getByTestId("audit-failed-rule-exceptions")).toContainText("below direct costs");
  await expect(audit.getByTestId("audit-failed-rule-exceptions")).toContainText("Reason: Loss leader to win the annual contract");
  await expect(audit.getByTestId("audit-failed-rule-exceptions")).toContainText("Merchant (Pinecone Media Works)");
  await shot(page, "exceptions-2-audit");
});

test("exceptions · the audit lists an input override separately from a failed-rule exception", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await api(page, { action: "add_input_override", field: "cash_exposure", value: 2_000_000, reason: "Client pays a deposit first" });
  await page.goto("/deals/hero/offer");
  await clickReviewer(page, "audit-details");
  const audit = page.getByTestId("audit-exceptions");
  await expect(audit.getByTestId("audit-input-overrides")).toContainText("Most I'll spend before I'm paid: ₹10,000 → ₹20,000");
  await expect(audit.getByTestId("audit-input-overrides")).toContainText("Loosens your account rule · reason: Client pays a deposit first");
  await expect(audit.getByTestId("audit-failed-rule-exceptions")).toContainText("None.");
  await expect(page.getByTestId("audit-drawer")).toContainText("Your prices & costs, version 1, with 1 deal override");
});


test("a new deal opens on Understand even when nothing needs asking, and the offer follows from one button", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await reset(page);
  await api(page, { action: "start_case", caseId: "no-fit" });
  // Blue Harbor needs nothing asked: the engine already knows no offer fits. The merchant still sees what the buyer said first.
  await page.goto("/deals/hero");
  await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
  await expect(page.getByTestId("blocking-card")).toContainText("Budget this quarter");
  await expect(page.getByTestId("thread-understand")).toContainText("The issue is timing");
  // The proof table is not on this screen; the facts carry their own sources.
  await expect(page.getByTestId("see-evidence")).toHaveCount(0);
  await expect(page.getByText("How this decision is grounded")).toHaveCount(0);
  await page.getByTestId("primary-action").click();
  await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
  await expect(page.getByTestId("offer-no-fit")).toBeVisible();
  await expect(page.getByTestId("primary-action")).toHaveText("Close this deal");
  await page.getByTestId("primary-action").click();
  await expect(page.getByTestId("close-reason-cannot_meet_start_date")).toContainText("Suggested");
  await expect(page.getByTestId("close-reason-cannot_meet_start_date").locator("input")).not.toBeChecked();
  await expect(page.getByTestId("confirm-close")).toBeDisabled();
  // Read once, it still opens on what the buyer said until an offer is chosen.
  await page.goto("/deals/hero");
  await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
});


test("the outcome card records what the deal taught, and proposes nothing from a single deal", async ({ page }) => {
  await prepareAccepted(page);
  await page.goto("/deals/hero/track");
  await page.getByTestId("track-outcome-link").click();
  await expect(page).toHaveURL(/\/deals\/hero\/performance$/);
  await expect(page.getByTestId("learning-recorded")).toContainText("Suggested offer followed · no pricing exception · buyer accepted");
  await expect(page.getByTestId("learning-decision")).toContainText("No policy change proposed.");
  await expect(page.getByTestId("learning-path")).toContainText("You approve it");
});

test("understand · an applied answer can be changed before an offer is chosen, and the offer follows it", async ({ page }) => {
  await api(page, { action: "reset" });
  await api(page, { action: "start_case", caseId: "reduced-scope" });
  await api(page, { action: "send_questions" });
  const clarification = (id: string) => state().conversation.find((item) => item.kind === "clarification" && item.refs.questionId === id)!;
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-gst").id, scriptId: "clar-gst-yes" });
  await api(page, { action: "buyer_reply", inReplyTo: clarification("clar-approval").id, scriptId: "clar-approval-contract" });
  expect(state().status).toBe("options_ready");
  expect(state().events.some((event) => event.kind === "answers_applied")).toBe(true);
  await page.goto("/deals/hero/understand");
  await page.getByTestId("change-clar-approval").click();
  await page.getByTestId("change-clar-approval-per_payment").click();
  await expect(page.getByTestId("answer-clar-approval")).toContainText("Per payment");
  await expect(page.getByTestId("slot-approval")).toHaveAttribute("aria-label", "Per payment or whole deal? Per payment");
  expect(state().events.some((event) => event.kind === "answer_changed")).toBe(true);
  // Asking for the answers again changes nothing.
  expect((await page.request.post("/api/actions", { data: { action: "adopt_replies" } })).ok()).toBe(true);
  await expect(page.getByTestId("answer-clar-approval")).toContainText("Per payment");
});

test("offer · the quote and the offer are one list, the alternatives are at most two cards, and ruled-out offers live in the audit", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  const rows = page.getByTestId("transformation-rows");
  await expect(page.getByTestId("deal-transformation")).toBeVisible();
  await expect(rows.locator('[data-change="removed"]')).toContainText("Social media");
  await expect(rows.locator('[data-change="removed"]')).toContainText("They said it can wait");
  await expect(rows.locator('[data-change="changed"]').first()).toContainText("3 months");
  await expect(page.getByTestId("offer-was")).toContainText("₹1,41,600");
  await expect(page.getByTestId("money-split")).toBeVisible();
  expect(await page.locator('[data-testid^="alternative-"]').count()).toBeLessThanOrEqual(2);
  await expect(page.getByTestId("recommendation-evidence")).toBeHidden();
  await page.waitForTimeout(1500);
  await shot(page, "offer-redesign-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/deals/hero/offer");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await shot(page, "offer-redesign-mobile");
  await page.getByTestId("presenter-frame-toggle").click();
  await page.getByTestId("audit-details").click();
  await expect(page.getByTestId("audit-ruled-out")).toBeAttached();
});

test("send · a short summary and the drafted message come first, and the buyer's page is a sheet that Escape closes", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  await clickPrimary(page);
  await expect(page).toHaveURL(/\/offer\/preview$/);
  const summary = page.getByTestId("send-summary");
  await expect(summary).toContainText("Website fixes");
  await expect(page.getByTestId("summary-you-keep")).toContainText("about ₹19,330");
  await expect(page.getByTestId("summary-you-keep")).not.toContainText("about about");
  await expect(page.getByTestId("summary-approval")).toContainText("Buyer can approve");
  await expect(page.getByTestId("summary-you-keep")).toContainText("50% of the price");
  await expect(page.getByTestId("buyer-message-preview")).toContainText("Here is our proposal");
  await expect(page.getByTestId("proposal-card")).toContainText("₹46,020");
  // The buyer's page, with its boilerplate, is not on the screen until asked for.
  await expect(page.getByText("After you accept")).toHaveCount(0);
  await shot(page, "send-desktop");
  await page.getByTestId("preview-buyer-view").click();
  const sheet = page.getByTestId("buyer-view-sheet");
  await expect(sheet).toContainText("After you accept");
  await expect(sheet).toContainText("not sent");
  await expect(page.getByTestId("primary-action")).toBeVisible();
  await shot(page, "send-sheet");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("preview-buyer-view")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/deals/hero/offer/preview");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await shot(page, "send-mobile");
});


test("counter-offer · sending the smaller scope withdraws the sent offer, prepares it for approval and records that every rule passed", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const sent = await prepareSent(page);
  await api(page, { action: "request_change", version: sent.version, text: "Could you do a lower total: 40000?", topic: "price", detail: { kind: "price", targetPaise: 4_000_000, gstBasis: "including" } });
  await page.goto("/deals/hero/track");
  await shot(page, "counter-0-answers");
  await page.getByTestId("offer-scope-change").click();
  await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
  const offer = state().counterOffers.at(-1)!;
  expect(offer.source).toBe("scope_change");
  expect(offer.override).toBeNull();
  expect(offer.evaluated.structure.excludedPackageIds).toContain("monthly-reporting");
  expect(offer.evaluated.approvable).toBe(true);
  await expect(page.getByTestId("offer-headline")).toContainText("without Monthly reporting");
  await expect(page.getByTestId("offer-total")).toContainText("₹42,480");
  await expect(page.getByTestId("recommendation")).not.toContainText("Your counter-offer");
  expect(state().agreements.find((a) => a.version === sent.version)!.status).toBe("superseded");
  // It is previewed and sent like any proposal; the engine, not the page, refuses a change that does not pass.
  const refused = await api(page, { action: "answer_with_scope_change", packageId: "website-fixes" }, false);
  expect(refused.error).toBeTruthy();
});

test("presenter · on a desktop the tools are a bar along the bottom edge that the page makes room for, and never cover the product", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  const bar = page.getByTestId("presenter-frame");
  const box = await bar.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(DESKTOP.height - 1);
  expect(box!.height).toBeLessThanOrEqual(40);
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom))).toBeGreaterThanOrEqual(36);
  // The last thing on the page can be scrolled clear of the bar.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const footer = await page.locator("footer").last().boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(box!.y + 1);
});

test("audit · services are named in words, and Commercial Memory is one row per service with a summary", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await prepareOptions(page);
  await page.goto("/deals/hero/offer");
  await clickReviewer(page, "audit-details");
  const drawer = page.getByTestId("audit-drawer");
  const table = drawer.getByTestId("audit-evidence-table");
  await expect(table).toContainText("Website fixes, Search marketing");
  await expect(table).not.toContainText("website-fixes");
  const memory = drawer.getByTestId("audit-commercial-memory");
  await expect(memory.getByTestId("memory-summary")).toContainText("Prices and delivery costs retrieved for 4 services");
  await expect(memory.locator('[data-testid^="memory-service-"]')).toHaveCount(4);
  await expect(memory.getByTestId("memory-service-website-fixes")).toContainText("Website fixes,24000,one time");
  await expect(memory.getByTestId("memory-service-website-fixes")).toContainText("Website fixes,12000,start of delivery month");
  await expect(memory).toContainText("exact quote, retrieved by code");
});

test("presenter · any buyer situation opens in one tap, and no earlier case is offered", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/presenter");
  await expect(page.getByTestId("situation-buttons")).toBeVisible();
  await expect(page.getByTestId("presenter-using-cached")).toBeVisible();
  await expect(page.getByTestId("situation-reduced-scope")).toContainText("Start small");
  await expect(page.getByTestId("earlier-runs")).toHaveCount(0);
  await page.getByTestId("situation-no-fit").click();
  await expect(page).toHaveURL(/\/deals\/hero\//);
  expect(state().caseId).toBe("no-fit");
  await page.goto("/presenter");
  await page.getByTestId("situation-reduced-scope").click();
  await expect(page).toHaveURL(/\/deals\/hero\//);
  expect(state().caseId).toBe("reduced-scope");
});

test("bugs · a deal opened from the inbox always lands on what the buyer said until an offer is chosen", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await api(page, { action: "reset" });
  for (const caseId of ["no-fit", "reduced-scope", "no-fit"]) {
    await api(page, { action: "open_deal", caseId });
    await page.goto("/deals");
    await page.getByTestId(`select-case-${caseId}`).click();
    await page.getByTestId("start-selected-case").click();
    await expect(page).toHaveURL(/\/deals\/hero\/understand$/);
    if (caseId === "no-fit") {
      await expect(page.getByTestId("primary-action")).toHaveText("See why nothing fits");
      await page.getByTestId("primary-action").click();
      await expect(page).toHaveURL(/\/deals\/hero\/offer$/);
    }
  }
});

test("bugs · I'll follow up later shows that the follow-up is recorded, and the question drafts are plainly editable", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  // Question drafts: a visible field with a pencil, and a typed edit goes out as the merchant's own words.
  await api(page, { action: "reset" });
  await api(page, { action: "start_case", caseId: "reduced-scope" });
  await page.goto("/deals/hero/understand");
  const first = page.locator('[data-testid^="draft-text-"]').first();
  await expect(first).toBeEditable();
  await page.locator('[data-testid^="edit-draft-text-"]').first().click();
  await expect(first).toBeFocused();
  await page.keyboard.type(" Thank you.");
  await expect(first).toHaveValue(/Thank you\.$/);
  // The follow-up button.
  const sent = await prepareSent(page);
  await api(page, { action: "request_change", version: sent.version, text: "Can we talk on a call first?", topic: "other", detail: { kind: "other" } });
  await page.goto("/deals/hero/track");
  const work = page.getByTestId("buyer-work-card");
  await page.locator('[data-testid^="follow-up-"]').first().click();
  await expect(page.locator('[data-testid^="following-up-"]').first()).toHaveText("You'll follow up");
  await expect(page.locator('[data-testid^="follow-up-note-"]').first()).toContainText("Follow-up pending since");
  await expect(work).toContainText("You said you would follow up with the buyer");
  expect(state().workDispositions.some((d) => d.kind === "follow_up_pending")).toBe(true);
});
