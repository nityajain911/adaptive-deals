import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { DemoState } from "@/lib/service";

const STORE = path.join(".data-e2e-recorded", "store.json");
const state = () => JSON.parse(readFileSync(STORE, "utf8")) as DemoState;

async function action(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post("/api/actions", { data });
  const json = await response.json() as { ok: boolean; error?: string };
  expect(json.ok, JSON.stringify(json)).toBe(true);
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await action(page, { action: "reset" });
});

test("the default hero replays the exact Cerebras recording without a provider credential", async ({ page }) => {
  await action(page, { action: "start_case", caseId: "reduced-scope" });
  expect(state().run).toMatchObject({ viewing: "replay", sourceRunId: "run-case-reduced-scope-4e94d36d" });
  expect(state().run.record).toMatchObject({ runId: "run-case-reduced-scope-4e94d36d", kind: "live", provider: "cerebras", model: "gpt-oss-120b" });
  expect(state().run.record.steps.map((step) => [step.task, step.provider, step.outcome])).toEqual([
    ["extract", "cerebras", "accepted"],
    ["clarify", "cerebras", "accepted"],
  ]);

  await page.goto("/deals/hero/understand");
  await expect(page.getByTestId("audit-model-header")).toHaveCount(1);
  await expect(page.getByTestId("thread-understand")).toContainText("I only have ₹50,000 left in this quarter.");
  await page.getByTestId("presenter-frame-toggle").click();
  await page.getByTestId("audit-details").click();
  await expect(page.getByTestId("audit-drawer")).toContainText("Recorded Cerebras output");
  await expect(page.getByTestId("audit-model-header")).toHaveText("Recorded Cerebras output · cerebras / gpt-oss-120b");
  await expect(page.getByTestId("audit-pipeline")).toContainText("Extracted the opening constraints (extract.v2)");
  await expect(page.getByTestId("reproduced-badge")).toContainText("Reproduced");

  await action(page, { action: "send_questions" });
  for (const item of state().conversation.filter((message) => message.kind === "clarification")) {
    await action(page, { action: "buyer_reply", inReplyTo: item.id, scriptId: item.refs.questionId === "clar-gst" ? "clar-gst-yes" : "clar-approval-contract" });
  }
  await action(page, { action: "adopt_replies" });
  expect(state().run.record.steps.map((step) => [step.task, step.provider, step.outcome])).toEqual([
    ["extract", "cerebras", "accepted"],
    ["clarify", "cerebras", "accepted"],
    ["explain", "cerebras", "accepted_with_corrections"],
  ]);
  expect(state().status).toBe("options_ready");
});

test("the discount case replays its own recorded Cerebras run, asks one question, and offers only the discount against an advance", async ({ page }) => {
  await action(page, { action: "start_case", caseId: "preserve-scope" });
  expect(state().run.record).toMatchObject({ runId: "run-case-preserve-scope-9fe9e42b", kind: "live", provider: "cerebras", model: "gpt-oss-120b" });
  expect(state().run.record.steps.map((step) => [step.task, step.provider, step.outcome])).toEqual([
    ["extract", "cerebras", "accepted"],
    ["clarify", "cerebras", "accepted"],
  ]);
  expect(state().status).toBe("clarifying");
  await action(page, { action: "send_questions" });
  const questions = state().conversation.filter((message) => message.kind === "clarification");
  expect(questions.map((q) => q.refs.questionId)).toEqual(["clar-gst"]);
  await action(page, { action: "buyer_reply", inReplyTo: questions[0].id, scriptId: "clar-gst-yes" });
  await action(page, { action: "adopt_replies" });
  // The answer is the one the recording was made with, so nothing is worked out again.
  expect(state().decisionBranch).toBeNull();
  expect(state().run.record.steps.map((step) => [step.task, step.provider, step.outcome])).toEqual([
    ["extract", "cerebras", "accepted"],
    ["clarify", "cerebras", "accepted"],
    ["explain", "cerebras", "accepted_with_corrections"],
  ]);
  expect(state().status).toBe("options_ready");
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("no-standard-offer")).toContainText("No offer fits at your normal prices.");
  await expect(page.getByTestId("discount-only-offers")).toContainText("40% on signing, the rest a month later");
  await expect(page.getByTestId("discount-only-offers")).toContainText("₹70,092");
  await page.getByTestId("presenter-frame-toggle").click();
  await page.getByTestId("audit-details").click();
  await expect(page.getByTestId("audit-model-header")).toHaveText("Recorded Cerebras output · cerebras / gpt-oss-120b");
  await expect(page.getByTestId("reproduced-badge")).toContainText("Reproduced");
});

test("the competitor case starts from the labelled hand-written sample until it has a recording of its own", async ({ page }) => {
  await action(page, { action: "start_case", caseId: "no-fit" });
  expect(state().run.record.kind).toBe("synthetic_replay");
  expect(state().run.record.runId).toBe("run-synthetic-no-fit-0001");
  expect(state().status).toBe("clarifying");
  await page.goto("/deals/hero/understand");
  await page.getByTestId("presenter-frame-toggle").click();
  await page.getByTestId("audit-details").click();
  await expect(page.getByTestId("audit-drawer")).toContainText("Sample output written by hand · no model ran");
});
