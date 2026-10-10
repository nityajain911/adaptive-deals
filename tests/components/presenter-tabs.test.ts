import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PresenterTabs } from "@/components/presenter/presenter-tabs";

describe("presenter tabs", () => {
  it("opens on focused demo controls and keeps integrity evidence in its own labelled panel", () => {
    const html = renderToStaticMarkup(createElement(PresenterTabs, {
      controls: createElement("p", null, "Run demo controls"),
      evidence: createElement("p", null, "Raw integrity evidence"),
    }));

    expect(html).toContain('role="tablist"');
    expect(html).toContain("Demo controls");
    expect(html).toContain("Evidence and integrity");
    expect(html).toContain('data-testid="presenter-demo-controls"');
    expect(html).toContain('data-testid="presenter-evidence"');
    expect(html).toMatch(/data-testid="presenter-demo-controls"[^>]*>/);
    expect(html).toMatch(/<section[^>]*hidden=""[^>]*data-testid="presenter-evidence"/);
  });
});
