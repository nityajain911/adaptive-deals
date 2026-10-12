import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const withHeader = (value: string | null) => vi.doMock("next/headers", () => ({ headers: async () => new Headers(value ? { "x-ad-session": value } : {}) }));

describe("a visitor's own copy of the state", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("next/headers");
  });

  it("uses the shared directory when sessions are off, whatever header arrives", async () => {
    vi.stubEnv("ADAPTIVE_DEALS_DATA_DIR", ".data-sessions-test");
    withHeader("a".repeat(32));
    const store = await import("@/lib/store");
    expect(await store.currentDataDir()).toBe(".data-sessions-test");
  });

  it("gives each visitor their own folder when sessions are on", async () => {
    vi.stubEnv("ADAPTIVE_DEALS_DATA_DIR", ".data-sessions-test");
    vi.stubEnv("ADAPTIVE_DEALS_SESSIONS", "1");
    withHeader("a".repeat(32));
    const store = await import("@/lib/store");
    expect(await store.currentDataDir()).toBe(path.join(".data-sessions-test", "sessions", "a".repeat(32)));
  });

  it("never lets a malformed id choose a path", async () => {
    vi.stubEnv("ADAPTIVE_DEALS_DATA_DIR", ".data-sessions-test");
    vi.stubEnv("ADAPTIVE_DEALS_SESSIONS", "1");
    for (const bad of ["../../etc", "A".repeat(32), "a".repeat(31), "a".repeat(33), ""]) {
      vi.resetModules();
      withHeader(bad);
      const store = await import("@/lib/store");
      expect(await store.currentDataDir()).toBe(".data-sessions-test");
    }
  });
});
