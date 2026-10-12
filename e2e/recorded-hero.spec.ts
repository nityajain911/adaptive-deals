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
  expect(state().run).toMatchObject({ viewing: "replay", sourceRunId: "run-case-reduced-scope-ed5442a3" });
  expect(state().run.record).toMatchObject({ runId: "run-case-reduced-scope-ed5442a3", kind: "live", provider: "cerebras", model: "gpt-oss-120b" });
  expect(state().run.record.steps.map((step) => [step.task, step.provider, step.outcome])).toEqual([
    ["extract", "cerebras", "accepted_with_corrections"],
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
    ["extract", "cerebras", "accepted_with_corrections"],
    ["clarify", "cerebras", "accepted"],
    ["explain", "cerebras", "accepted_with_corrections"],
  ]);
  expect(state().status).toBe("options_ready");
});

test("cases without an exact current recording stay clearly labelled as hand-written samples", async ({ page }) => {
  await action(page, { action: "start_case", caseId: "preserve-scope" });
  expect(state().run.record.kind).toBe("synthetic_replay");
  await page.goto("/deals/hero/understand");
  await page.getByTestId("presenter-frame-toggle").click();
  await page.getByTestId("audit-details").click();
  await expect(page.getByTestId("audit-drawer")).toContainText("Sample output written by hand · no model ran");
});
