import { describe, expect, it } from "vitest";
import { buildConstraintProfile } from "@/domain/constraints";
import { heroMerchant, heroPackages, HERO_DEAL_ID } from "@/data/synthetic/hero";
import { extraction, field, msg, profileFrom } from "../helpers";

/**
 * A verified package field may name several packages. Every known package it names is kept,
 * each with the same evidence. Found through the case probes on 6 October 2026: the normaliser
 * used to keep only the first match.
 */
const two = "Website fixes and Search marketing are the pieces we need now. Social media can wait.";
const all = "We need the complete annual package—Website fixes, Search marketing, Social media and Monthly reporting.";

describe("package normalisation", () => {
  it("keeps a single named package, as before", () => {
    const p = profileFrom(extraction([field("required_package", "Website fixes", "Website fixes and Search marketing are the pieces we need now")]), [msg(two)]);
    expect(p.requiredPackages.value).toEqual(["website-fixes"]);
    expect(p.requiredPackages.evidence).toHaveLength(1);
    expect(p.rejectedFields).toEqual([]);
  });

  it("keeps both packages named in one field, each with the same evidence quote", () => {
    const quote = "Website fixes and Search marketing are the pieces we need now";
    const p = profileFrom(extraction([field("required_package", "Website fixes and Search marketing", quote), field("optional_package", "Social media", "Social media can wait")]), [msg(two)]);
    expect(p.requiredPackages).toMatchObject({ status: "stated", value: ["website-fixes", "search-marketing"] });
    expect(p.requiredPackages.evidence.map((e) => e.quote)).toEqual([quote, quote]);
    expect(p.optionalPackages.value).toEqual(["social-media"]);
    expect(p.rejectedFields).toEqual([]);
  });

  it("keeps all four packages named in one field", () => {
    const raw = "complete annual package—Website fixes, Search marketing, Social media and Monthly reporting";
    const p = profileFrom(extraction([field("required_package", raw, raw)]), [msg(all)]);
    expect(p.requiredPackages.value).toEqual(["website-fixes", "search-marketing", "social-media", "monthly-reporting"]);
    expect(p.requiredPackages.evidence).toHaveLength(4);
    expect(new Set(p.requiredPackages.evidence.map((e) => e.quote))).toEqual(new Set([raw]));
  });

  it("deduplicates a package repeated within a field and across fields", () => {
    const text = "Website fixes first. Website fixes and Search marketing are essential; Website fixes, Website fixes.";
    const p = profileFrom(
      extraction([
        field("required_package", "Website fixes", "Website fixes first"),
        field("required_package", "Website fixes and Search marketing", "Website fixes and Search marketing are essential"),
        field("required_package", "Website fixes, Website fixes", "Website fixes, Website fixes"),
      ]),
      [msg(text)],
    );
    expect(p.requiredPackages.value).toEqual(["website-fixes", "search-marketing"]);
    // One evidence entry per package: the first field that named it.
    expect(p.requiredPackages.evidence.map((e) => e.quote)).toEqual(["Website fixes first", "Website fixes and Search marketing are essential"]);
    expect(p.rejectedFields).toEqual([]);
  });

  it("rejects a field only when it names no known package", () => {
    const text = "We need brand strategy and Search marketing. Also podcast production.";
    const p = profileFrom(extraction([field("required_package", "brand strategy and Search marketing", "We need brand strategy and Search marketing"), field("required_package", "podcast production", "Also podcast production")]), [msg(text)]);
    expect(p.requiredPackages.value).toEqual(["search-marketing"]);
    expect(p.rejectedFields).toEqual([{ key: "required_package", reason: "does not match a deal package", rawText: "podcast production" }]);
  });

  it("still matches a shortened name to its one package", () => {
    const p = profileFrom(extraction([field("required_package", "search", "We need search now")]), [msg("We need search now")]);
    expect(p.requiredPackages.value).toEqual(["search-marketing"]);
  });

  it("does not let a package whose name sits inside another package's name match by accident", () => {
    const packages = [{ ...heroPackages[1], id: "search", name: "Search" }, heroPackages[1], { ...heroPackages[2], id: "search-marketing-audit", name: "Search marketing audit" }];
    const build = (raw: string, text: string) =>
      buildConstraintProfile({ dealId: HERO_DEAL_ID, extraction: extraction([field("required_package", raw, raw)]), messages: [msg(text)], packages, timeZone: heroMerchant.timeZone }).requiredPackages.value;
    // Only the longest name at each position counts.
    expect(build("Search marketing", "We need Search marketing.")).toEqual(["search-marketing"]);
    expect(build("Search marketing audit", "We need a Search marketing audit.".replace("a Search", "Search"))).toEqual(["search-marketing-audit"]);
    // A shorter name still matches where it appears on its own.
    expect(build("Search and Search marketing", "We need Search and Search marketing.")).toEqual(["search", "search-marketing"]);
  });
});
