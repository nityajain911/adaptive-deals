import { rmSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { defaultEconomicsContent } from "@/lib/economics-default";

// The reset action requires a directory named like the e2e ones, so this one is relative and removed afterwards.
const DATA_DIR = `.data-e2e-economics-actions-${process.pid}`;
process.env.ADAPTIVE_DEALS_DATA_DIR = DATA_DIR;

const { POST } = await import("@/app/api/actions/route");
const store = await import("@/lib/economics-store");

const post = async (body: unknown) => {
  const response = await POST(
    new Request("http://localhost/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { response, body: await response.json() as { ok: boolean; result?: unknown; error?: string } };
};

beforeEach(async () => {
  await store.resetEconomicsStore();
});

afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }));

describe("business economics actions", () => {
  it("validates and saves a draft, previews it, activates it, discards it and restores defaults", async () => {
    const content = defaultEconomicsContent();
    content.services[0]!.directCostPaise += 300_000;

    const saved = await post({ action: "save_economics_draft", content });
    expect(saved.response.status).toBe(200);
    expect(saved.body).toMatchObject({ ok: true, result: { issues: [] } });

    const preview = await post({ action: "preview_economics_activation" });
    expect(preview.response.status).toBe(200);
    expect(preview.body).toMatchObject({
      ok: true,
      result: {
        issues: [],
        serviceEconomics: expect.arrayContaining([
          expect.objectContaining({ id: content.services[0]!.id, pricePaise: content.services[0]!.listPricePaise, costPaise: content.services[0]!.directCostPaise }),
        ]),
        unreachableFloor: expect.any(Boolean),
      },
    });

    const activated = await post({ action: "activate_economics" });
    expect(activated.body).toMatchObject({
      ok: true,
      result: {
        version: 2,
        hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        activatedAt: expect.any(String),
        label: null,
      },
    });

    const another = structuredClone(content);
    another.services[1]!.directCostPaise += 10_000;
    await post({ action: "save_economics_draft", content: another });
    expect((await store.getEconomicsStore()).draft).not.toBeNull();
    expect((await post({ action: "discard_economics_draft" })).body).toMatchObject({ ok: true });
    expect((await store.getEconomicsStore()).draft).toBeNull();

    const restored = await post({ action: "restore_default_economics" });
    expect(restored.body).toMatchObject({ ok: true, result: { version: 3 } });
  });

  it.each([
    { action: "save_economics_draft" },
    { action: "save_economics_draft", content: { services: "not an array" } },
    { action: "activate_economics", extra: true },
    { action: "restore_default_economics", version: 2 },
  ])("rejects an invalid payload: $action", async (payload) => {
    const result = await post(payload);
    expect(result.response.status).toBe(400);
    expect(result.body.ok).toBe(false);
  });

  it("accepts the reset only in an explicitly isolated e2e data directory", async () => {
    const accepted = await post({ action: "reset_economics_for_tests" });
    expect(accepted.body).toMatchObject({ ok: true });

    const isolated = process.env.ADAPTIVE_DEALS_DATA_DIR;
    delete process.env.ADAPTIVE_DEALS_DATA_DIR;
    const refused = await post({ action: "reset_economics_for_tests" });
    process.env.ADAPTIVE_DEALS_DATA_DIR = isolated;
    expect(refused.response.status).toBe(409);
    expect(refused.body.error).toMatch(/test data directory/i);
  });
});

describe("the activation preview says when nothing changed", () => {
  it("marks a draft identical to the active version as unchanged, and a real change as changed", async () => {
    await post({ action: "save_economics_draft", content: defaultEconomicsContent() });
    const same = await post({ action: "preview_economics_activation" });
    expect(same.body.result).toMatchObject({ unchanged: true });

    const changed = defaultEconomicsContent();
    changed.services[0]!.directCostPaise += 100;
    await post({ action: "save_economics_draft", content: changed });
    const different = await post({ action: "preview_economics_activation" });
    expect(different.body.result).toMatchObject({ unchanged: false });
  });
});
