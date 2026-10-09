import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { DemoState } from "@/lib/service";

const STORE = path.join(".data-e2e-cerebras", "store.json");
const FIXTURE = "http://127.0.0.1:4312";
const state = () => JSON.parse(readFileSync(STORE, "utf8")) as DemoState;

async function action(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post("/api/actions", { data });
  const json = await response.json() as { ok: boolean; error?: string };
  expect(json.ok, JSON.stringify(json)).toBe(true);
}

async function mode(request: APIRequestContext, value: "valid" | "rate_limit" | "malformed_rerank") {
  const response = await request.put(`${FIXTURE}/__mode`, { data: { mode: value } });
  expect(response.ok()).toBe(true);
}

async function expectNoProviderSelector(page: Page) {
  await expect(page.locator("select").filter({ hasText: /Cerebras|Groq|Anthropic/i })).toHaveCount(0);
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page, request }) => {
  await mode(request, "valid");
  await action(page, { action: "reset" });
});

test("Cerebras is configured in the presenter and a live run stores Cerebras steps", async ({ page }) => {
  await page.goto("/presenter");
  await expect(page.getByTestId("presenter-provider")).toContainText("Configured live provider: Cerebras · gpt-oss-120b · credential available");
  await expectNoProviderSelector(page);
  await page.getByTestId("presenter-run-live").click();
  await expect.poll(() => state().run.record.kind).toBe("live");
  expect(state().run.record.steps.length).toBeGreaterThan(0);
  expect(state().run.record.steps.every((step) => step.provider === "cerebras")).toBe(true);
  await page.goto("/deals/hero/understand");
  await expect(page.getByText("AI · Live Cerebras output", { exact: true })).toHaveCount(1);
  await expectNoProviderSelector(page);
});

test("merchant and buyer surfaces never expose a provider selector", async ({ page }) => {
  await action(page, { action: "start_case", caseId: "reduced-scope" });
  await action(page, { action: "send_questions" });
  for (const item of state().conversation.filter((message) => message.kind === "clarification")) {
    await action(page, { action: "buyer_reply", inReplyTo: item.id, scriptId: item.refs.questionId === "clar-gst" ? "clar-gst-yes" : "clar-approval-contract" });
  }
  await action(page, { action: "adopt_replies" });
  await action(page, { action: "review_buyer_proposal" });
  const draft = state().agreements.find((agreement) => agreement.status === "draft")!;
  await action(page, { action: "approve_and_send_draft", version: draft.version, termsHash: draft.termsHash });
  await page.goto("/deals/hero/track");
  await expectNoProviderSelector(page);
  await page.getByTestId("open-buyer-proposal").click();
  await expect(page.getByTestId("buyer-view")).toBeVisible();
  await expectNoProviderSelector(page);
});

test("a Cerebras 429 falls back deterministically and never claims Groq ran", async ({ page, request }) => {
  await mode(request, "rate_limit");
  await action(page, { action: "run_live" });
  expect(state().run.record.steps).toEqual(expect.arrayContaining([expect.objectContaining({ provider: "cerebras", outcome: "failed", failure: expect.objectContaining({ kind: "unavailable" }) })]));
  await page.goto("/presenter");
  await expect(page.getByTestId("presenter")).not.toContainText("Groq");
  await expect(page.getByTestId("presenter")).toContainText("cerebras · failed");
});

test("Commercial Memory credits Cerebras and rejects malformed duplicate IDs", async ({ page, request }) => {
  await page.goto("/presenter");
  await page.getByTestId("memory-proof-live").click();
  await expect(page.getByTestId("memory-proof-result")).toContainText("Reranked live by Cerebras");
  await expect(page.getByTestId("memory-proof-result")).not.toContainText("Groq");

  await mode(request, "malformed_rerank");
  await page.getByTestId("memory-proof-live").click();
  await expect(page.getByTestId("memory-proof-result")).toContainText("AI output rejected; lexical order kept");
  await expect(page.getByTestId("memory-proof-result")).toContainText("Code retrieval");
});
