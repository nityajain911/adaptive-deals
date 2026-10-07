# Merchant Profit Strategy (Phases 1–7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the merchant's business economics editable, versioned and pinned per deal, rank offers by a deterministic merchant-chosen strategy, and show a negotiation corridor, with no new model call.

**Architecture:** Pure domain modules hold the new rules (economics, baseline, strategy, corridor). One function, `engineInputFor`, builds the unchanged engine's input from a deal's baseline and pinned economics, and its hash decides whether a recorded run may be replayed or the decision is derived through the existing `DecisionBranch` path. Screens read ranked offers from the strategy module, never from a model's order.

**Tech Stack:** Next.js 16.3.8 App Router, React 19, TypeScript, Zod 4, Vitest 5, Playwright. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-07-merchant-profit-strategy-design.md` (approved at `4a73973`). Read it first; this plan argues from it.

## Global Constraints

- **Frozen, never edited:** every file under `ai/` and `evaluation/`, `data/live-runs/`, `data/demo-run.json`, `domain/engine.ts`, `domain/checks.ts`, `domain/economics.ts`, `domain/replies.ts`. Verify after every task: `git diff --stat c907d1d -- ai evaluation data/live-runs data/demo-run.json domain/engine.ts domain/checks.ts domain/economics.ts domain/replies.ts | wc -l` prints `0`.
- **Never rewritten:** `data/case-recorded-runs/*`, and the two owner screenshots `artifacts/ui-review/desktop-5-change-requested.png`, `artifacts/ui-review/desktop-7-other-outcomes.png`.
- **No model call.** No task in this plan calls Groq or any provider. Do not read `.env.local`. Do not print or store a key.
- **No new dependency.** Property tests use the seeded generator in Task 3.1.
- **Naming:** never use bare "profile" for the merchant's settings (it means the buyer's constraints in this code). On screen: "Business economics". In code: `BusinessEconomics`, `DealEconomics`, `economics…`.
- **Money:** integer paise everywhere. Reuse `domain/money.ts`.
- **Copy:** forecasts read "about ₹19,330" (`approxINR`); merchant-facing words are "offer" and "approved offer type", never "structure" or "template".
- **TDD:** each task writes the failing test first, sees it fail for the stated reason, then implements. Do not weaken an existing assertion; where section 12 of the spec requires a change, change it deliberately and say so in the commit.
- **Suites at the start:** 762 unit tests (82 files), 54 browser tests. Run `npx tsc --noEmit`, `npm run lint` (read the whole output; warnings count), `npx vitest run` after every task; run `ADAPTIVE_E2E_NO_SHOTS=1 npx playwright test` at the end of every phase. The browser suite rebuilds `.next`, so stop any running product server first and rebuild afterwards.
- **Commits:** one per task, on `codex/merchant-profit-strategy`. Do not merge, push, rebase or switch branch. End each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Docs:** record each product decision in `PRODUCT_DECISIONS.md` and each AI-boundary implication in `AI_BUILD_LOG.md` in the task that introduces it. Never write an `[APPLICANT]` section.

## File Structure

New files:

| File | Responsibility |
|---|---|
| `domain/business-economics.ts` | `BusinessEconomics` type, content hash, validation. Pure. |
| `domain/deal-baseline.ts` | `DealBaseline` type, capture, list value of a scope. Pure. |
| `domain/strategy-id.ts` | `STRATEGY_IDS` and `StrategyId` only, so state types can name a strategy without importing the ranker. |
| `domain/strategy.ts` | Orderings, proactive ranking, fact ids, code explanation. Pure. |
| `domain/corridor.ts` | Lowest compliant total by bounded engine evaluation. Pure. |
| `lib/economics-default.ts` | Version 1, built from the hero fixtures. |
| `lib/economics-store.ts` | Account store: versions, draft, activate, restore. Server only. |
| `lib/deal-economics.ts` | `DealEconomics`, `InputOverride`, `engineInputFor`, `effectiveHashOf`, pin conflicts. Pure. |
| `lib/deal-context.ts` | The one place screens and services get a deal's merchant, services, offer types and baseline. |
| `lib/reevaluation.ts` | Re-evaluation preview (what changes) as pure data. |
| `app/economics/page.tsx` | Business economics page. |
| `components/economics/*.tsx` | Services table, guardrails form, review panel. |
| `components/offer/strategy-control.tsx` | Strategy selector and "what changes under another strategy". |
| `components/offer/deal-overrides.tsx` | Input override form and list. |
| `components/track/negotiation-corridor.tsx` | Corridor panel (replaces the body of `counter-form.tsx`). |
| `tests/helpers/gen.ts` | Seeded generator for property tests. |

Modified (not exhaustive; each task lists its own): `lib/service.ts`, `lib/migrate.ts`, `lib/decision-branch.ts`, `lib/deal-records.ts`, `lib/offer-copy.ts`, `lib/audit.ts`, `lib/views.ts`, `lib/walkthrough.ts`, `lib/deal-page.ts`, `lib/page-data.ts`, `lib/demo-steps.ts`, `domain/agreement.ts`, `domain/amendment.ts`, `app/api/actions/route.ts`, the Offer, Track, preview and buyer pages, `components/offer/recommendation.tsx`, `components/audit/sections.tsx`, `components/proposal-content.tsx`, `components/merchant-header.tsx`.

---

# Phase 1 — Business economics model

### Task 1.1: The economics type, its hash and its validation

**Files:**
- Create: `domain/business-economics.ts`
- Test: `tests/domain/business-economics.test.ts`

**Interfaces:**
- Produces:
  - `BUSINESS_ECONOMICS_SCHEMA = "adaptive-deals.business-economics.v1"`
  - `interface EconomicsContent { services: ServicePackage[]; guardrails: EconomicsGuardrails; discountLadderBps: number[]; fixed: EconomicsFixed }`
  - `interface BusinessEconomics extends EconomicsContent { schema; version: number; activatedAt: string; activatedBy: string; hash: string }`
  - `economicsContentHash(content: EconomicsContent): string`
  - `validateEconomics(content: EconomicsContent): EconomicsIssue[]` where `EconomicsIssue = { level: "error" | "warning"; field: string; message: string }`
  - `activate(content, meta: { version; activatedAt; activatedBy }): BusinessEconomics` (throws `EconomicsError` if any error-level issue)

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/business-economics.test.ts
import { describe, expect, it } from "vitest";
import { activate, economicsContentHash, EconomicsError, validateEconomics, type EconomicsContent } from "@/domain/business-economics";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";

const { discountsBps, ...offerTypes } = heroTemplates;
const content = (): EconomicsContent =>
  structuredClone({
    services: heroPackages,
    guardrails: {
      contributionFloor: heroMerchant.policy.contributionFloor,
      discountLimitBps: heroMerchant.policy.discountLimitBps,
      cashAtRiskLimitPaise: heroMerchant.policy.cashAtRiskLimitPaise,
      smallestInstalmentPaise: heroMerchant.policy.smallestInstalmentPaise,
      maxTenureMonths: heroMerchant.policy.maxTenureMonths,
      paymentFeeBps: heroMerchant.policy.paymentFeeBps,
    },
    discountLadderBps: discountsBps,
    fixed: {
      gstRateBps: heroMerchant.policy.gstRateBps,
      advanceNoticeDays: heroMerchant.policy.advanceNoticeDays,
      internalRetryAfterDays: heroMerchant.policy.internalRetryAfterDays,
      mandateEndBufferMonths: heroMerchant.policy.mandateEndBufferMonths,
      offerTypes,
    },
  });
const errors = (c: EconomicsContent) => validateEconomics(c).filter((i) => i.level === "error").map((i) => i.field);

describe("the content hash", () => {
  it("is stable under key order and service order, and changes with any engine-relevant value", () => {
    const a = content();
    const reordered = { fixed: a.fixed, discountLadderBps: a.discountLadderBps, guardrails: a.guardrails, services: [...a.services].reverse() };
    expect(economicsContentHash(reordered)).toBe(economicsContentHash(a));
    const cost = content();
    cost.services[0].directCostPaise += 100;
    expect(economicsContentHash(cost)).not.toBe(economicsContentHash(a));
    const ladder = content();
    ladder.guardrails.discountLimitBps = 1000;
    ladder.discountLadderBps = [0, 500, 1000];
    expect(economicsContentHash(ladder)).not.toBe(economicsContentHash(a));
  });
});

describe("validation", () => {
  it("accepts the default demo economics with no error", () => {
    expect(errors(content())).toEqual([]);
  });
  it.each([
    ["a ladder level above the ceiling", (c: EconomicsContent) => { c.discountLadderBps = [0, 500]; }, "discountLadderBps"],
    ["a ladder without 0%", (c: EconomicsContent) => { c.guardrails.discountLimitBps = 500; c.discountLadderBps = [500]; }, "discountLadderBps"],
    ["a negative cost", (c: EconomicsContent) => { c.services[0].directCostPaise = -1; }, "services.website-fixes.directCostPaise"],
    ["a zero price", (c: EconomicsContent) => { c.services[0].listPricePaise = 0; }, "services.website-fixes.listPricePaise"],
    ["a discount ceiling above 100%", (c: EconomicsContent) => { c.guardrails.discountLimitBps = 10_001; }, "guardrails.discountLimitBps"],
    ["a zero minimum payment", (c: EconomicsContent) => { c.guardrails.smallestInstalmentPaise = 0; }, "guardrails.smallestInstalmentPaise"],
    ["a zero duration", (c: EconomicsContent) => { c.guardrails.maxTenureMonths = 0; }, "guardrails.maxTenureMonths"],
    ["a duplicate service id", (c: EconomicsContent) => { c.services[1].id = c.services[0].id; }, "services"],
    ["a dependency on an unknown service", (c: EconomicsContent) => { c.services[0].dependsOnAny = ["nope"]; }, "services.website-fixes.dependsOnAny"],
  ])("rejects %s", (_n, mutate, field) => {
    const c = content();
    mutate(c);
    expect(errors(c)).toContain(field);
  });
  it("warns, without blocking, when a service costs more than its price", () => {
    const c = content();
    c.services[0].directCostPaise = c.services[0].listPricePaise + 1;
    const issues = validateEconomics(c);
    expect(issues.some((i) => i.level === "warning" && i.field === "services.website-fixes.directCostPaise")).toBe(true);
    expect(issues.some((i) => i.level === "error")).toBe(false);
  });
});

describe("activation", () => {
  it("stamps a version and the content hash", () => {
    const e = activate(content(), { version: 1, activatedAt: "2026-10-01T09:00:00+05:30", activatedBy: "Merchant (Pinecone Media Works)" });
    expect(e).toMatchObject({ version: 1, hash: economicsContentHash(content()) });
  });
  it("refuses content with an error", () => {
    const c = content();
    c.discountLadderBps = [0, 500];
    expect(() => activate(c, { version: 2, activatedAt: "x", activatedBy: "m" })).toThrow(EconomicsError);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/domain/business-economics.test.ts`
Expected: FAIL, "Cannot find package '@/domain/business-economics'".

- [ ] **Step 3: Implement**

```ts
// domain/business-economics.ts
import { createHash } from "node:crypto";
import { canonicalJson } from "./agreement";
import type { ContributionFloor, ServicePackage, TemplateConfig } from "./types";

export const BUSINESS_ECONOMICS_SCHEMA = "adaptive-deals.business-economics.v1" as const;

export interface EconomicsGuardrails {
  contributionFloor: ContributionFloor;
  /** Maximum discount the merchant permits (the ceiling the engine checks). */
  discountLimitBps: number;
  /** Maximum cash the merchant will have paid out before being paid. */
  cashAtRiskLimitPaise: number;
  /** Minimum payment, before GST. */
  smallestInstalmentPaise: number;
  maxTenureMonths: number;
  paymentFeeBps: number;
}

/** Not editable in this work: statutory and operational values, and the approved offer types. */
export interface EconomicsFixed {
  gstRateBps: number;
  advanceNoticeDays: number;
  internalRetryAfterDays: number;
  mandateEndBufferMonths: number;
  offerTypes: Omit<TemplateConfig, "discountsBps">;
}

export interface EconomicsContent {
  services: ServicePackage[];
  guardrails: EconomicsGuardrails;
  /** Discount levels the engine may generate. Each is at or below the ceiling; 0 is always present. */
  discountLadderBps: number[];
  fixed: EconomicsFixed;
}

export interface BusinessEconomics extends EconomicsContent {
  schema: typeof BUSINESS_ECONOMICS_SCHEMA;
  version: number;
  activatedAt: string;
  activatedBy: string;
  hash: string;
}

export interface EconomicsIssue {
  level: "error" | "warning";
  field: string;
  message: string;
}

export class EconomicsError extends Error {}

/** Identity of the content, independent of key order, service order and ladder order. */
export function economicsContentHash(c: EconomicsContent): string {
  const canonical = {
    services: [...c.services].sort((a, b) => a.id.localeCompare(b.id)),
    guardrails: c.guardrails,
    discountLadderBps: [...c.discountLadderBps].sort((a, b) => a - b),
    fixed: c.fixed,
  };
  return createHash("sha256").update(canonicalJson(canonical), "utf8").digest("hex");
}

const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

export function validateEconomics(c: EconomicsContent): EconomicsIssue[] {
  const issues: EconomicsIssue[] = [];
  const err = (field: string, message: string) => issues.push({ level: "error", field, message });
  const warn = (field: string, message: string) => issues.push({ level: "warning", field, message });
  const ids = c.services.map((s) => s.id);
  if (!c.services.length) err("services", "Add at least one service.");
  if (new Set(ids).size !== ids.length) err("services", "Each service needs its own id.");
  for (const s of c.services) {
    const at = `services.${s.id}`;
    if (!whole(s.listPricePaise) || s.listPricePaise <= 0) err(`${at}.listPricePaise`, "The standard price must be more than zero.");
    if (!whole(s.directCostPaise) || s.directCostPaise < 0) err(`${at}.directCostPaise`, "The direct cost cannot be negative.");
    else if (whole(s.listPricePaise) && s.directCostPaise > s.listPricePaise) warn(`${at}.directCostPaise`, "This service costs more to deliver than its standard price.");
    for (const dep of s.dependsOnAny ?? []) if (!ids.includes(dep)) err(`${at}.dependsOnAny`, `Depends on "${dep}", which is not one of your services.`);
  }
  const g = c.guardrails;
  if (!whole(g.discountLimitBps) || g.discountLimitBps < 0 || g.discountLimitBps > 10_000) err("guardrails.discountLimitBps", "The maximum discount must be between 0% and 100%.");
  if (!whole(g.cashAtRiskLimitPaise) || g.cashAtRiskLimitPaise < 0) err("guardrails.cashAtRiskLimitPaise", "The maximum cash exposure cannot be negative.");
  if (!whole(g.smallestInstalmentPaise) || g.smallestInstalmentPaise <= 0) err("guardrails.smallestInstalmentPaise", "The minimum payment must be more than zero.");
  if (!whole(g.maxTenureMonths) || g.maxTenureMonths < 1) err("guardrails.maxTenureMonths", "The maximum payment duration must be at least one month.");
  if (!whole(g.paymentFeeBps) || g.paymentFeeBps < 0 || g.paymentFeeBps > 10_000) err("guardrails.paymentFeeBps", "The expected payment fee must be between 0% and 100%.");
  const floor = g.contributionFloor;
  if (floor.minPercentBps !== null && (!whole(floor.minPercentBps) || floor.minPercentBps < 0 || floor.minPercentBps > 10_000)) err("guardrails.contributionFloor", "The minimum contribution percentage must be between 0% and 100%.");
  if (floor.minPaise !== null && (!whole(floor.minPaise) || floor.minPaise < 0)) err("guardrails.contributionFloor", "The minimum contribution amount cannot be negative.");
  const ladder = c.discountLadderBps;
  if (!ladder.includes(0)) err("discountLadderBps", "The approved ladder must include 0% (no discount).");
  if (ladder.some((l) => !whole(l) || l < 0 || l > g.discountLimitBps)) err("discountLadderBps", "Every approved discount must be at or below your maximum discount.");
  if (new Set(ladder).size !== ladder.length) err("discountLadderBps", "Each approved discount may appear once.");
  return issues;
}

export function activate(content: EconomicsContent, meta: { version: number; activatedAt: string; activatedBy: string }): BusinessEconomics {
  const errors = validateEconomics(content).filter((i) => i.level === "error");
  if (errors.length) throw new EconomicsError(errors.map((e) => e.message).join(" "));
  return { schema: BUSINESS_ECONOMICS_SCHEMA, ...structuredClone(content), ...meta, hash: economicsContentHash(content) };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run tests/domain/business-economics.test.ts` → all pass. Then `npx tsc --noEmit` and `npm run lint` clean.

- [ ] **Step 5: Commit**

```bash
git add domain/business-economics.ts tests/domain/business-economics.test.ts
git commit -m "feat: business economics type, content hash and validation"
```

### Task 1.2: Version 1, the default demo economics

**Files:**
- Create: `lib/economics-default.ts`
- Test: `tests/lib/economics-default.test.ts`

**Interfaces:**
- Consumes: `activate`, `EconomicsContent` (Task 1.1).
- Produces: `defaultEconomicsContent(): EconomicsContent`, `defaultEconomics(): BusinessEconomics` (version 1, `activatedAt = DEMO_ANCHOR`, `activatedBy = "Default demo economics"`).

- [ ] **Step 1: Failing test**

```ts
// tests/lib/economics-default.test.ts
import { describe, expect, it } from "vitest";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";
import { validateEconomics } from "@/domain/business-economics";
import { defaultEconomics, defaultEconomicsContent } from "@/lib/economics-default";

describe("the default demo economics", () => {
  it("is version 1, valid, and carries the fixture values unchanged", () => {
    const e = defaultEconomics();
    expect(e.version).toBe(1);
    expect(validateEconomics(defaultEconomicsContent()).filter((i) => i.level === "error")).toEqual([]);
    expect(e.services).toEqual(heroPackages);
    expect(e.discountLadderBps).toEqual(heroTemplates.discountsBps);
    expect(e.guardrails.discountLimitBps).toBe(heroMerchant.policy.discountLimitBps);
    expect({ ...e.fixed.offerTypes, discountsBps: e.discountLadderBps }).toEqual(heroTemplates);
  });
  it("does not share objects with the fixtures", () => {
    const e = defaultEconomics();
    e.services[0].directCostPaise += 1;
    expect(heroPackages[0].directCostPaise).not.toBe(e.services[0].directCostPaise);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/lib/economics-default.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// lib/economics-default.ts
import { activate, type BusinessEconomics, type EconomicsContent } from "@/domain/business-economics";
import { DEMO_ANCHOR } from "@/domain/clock";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";

/** Version 1: the fixture values, copied so nothing can edit the fixtures through it. */
export function defaultEconomicsContent(): EconomicsContent {
  const p = heroMerchant.policy;
  const { discountsBps, ...offerTypes } = heroTemplates;
  return structuredClone({
    services: heroPackages,
    guardrails: {
      contributionFloor: p.contributionFloor,
      discountLimitBps: p.discountLimitBps,
      cashAtRiskLimitPaise: p.cashAtRiskLimitPaise,
      smallestInstalmentPaise: p.smallestInstalmentPaise,
      maxTenureMonths: p.maxTenureMonths,
      paymentFeeBps: p.paymentFeeBps,
    },
    discountLadderBps: discountsBps,
    fixed: { gstRateBps: p.gstRateBps, advanceNoticeDays: p.advanceNoticeDays, internalRetryAfterDays: p.internalRetryAfterDays, mandateEndBufferMonths: p.mandateEndBufferMonths, offerTypes },
  });
}

export const defaultEconomics = (): BusinessEconomics => activate(defaultEconomicsContent(), { version: 1, activatedAt: DEMO_ANCHOR, activatedBy: "Default demo economics" });
```

- [ ] **Step 4:** tests pass; typecheck and lint clean.
- [ ] **Step 5: Commit** `feat: default demo economics (version 1) from the fixtures`

### Task 1.3: The account store

**Files:**
- Create: `lib/economics-store.ts`
- Test: `tests/lib/economics-store.test.ts`

**Interfaces:**
- Consumes: `readJson`, `writeJsonAtomic`, `serialised` from `lib/store.ts`; Tasks 1.1, 1.2.
- Produces (all async, server only):
  - `ECONOMICS_FILE = "economics.json"` (inside `DATA_DIR`, so each environment has its own)
  - `interface EconomicsStore { schema: "adaptive-deals.economics-store.v1"; versions: BusinessEconomics[]; draft: EconomicsContent | null }`
  - `getEconomicsStore(): Promise<EconomicsStore>` (creates `{ versions: [defaultEconomics()], draft: null }` when the file is missing)
  - `activeEconomics(): Promise<BusinessEconomics>` (the highest version)
  - `economicsVersion(version: number): Promise<BusinessEconomics | null>`
  - `saveEconomicsDraft(content: EconomicsContent): Promise<EconomicsIssue[]>` (stores the draft even with issues; returns them)
  - `discardEconomicsDraft(): Promise<void>`
  - `activateEconomicsDraft(by: string, at: string): Promise<BusinessEconomics>` (throws `EconomicsError` on an error-level issue, or when the content hash equals the active version's)
  - `restoreDefaultEconomics(by: string, at: string): Promise<BusinessEconomics>` (activates version 1's content as a new version; a no-op returning the active version when the content already matches)
  - `resetEconomicsStore(): Promise<void>` (test harness only: back to version 1 alone)

- [ ] **Step 1: Failing test**

```ts
// tests/lib/economics-store.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-economics-"));
const store = await import("@/lib/economics-store");
const { defaultEconomicsContent } = await import("@/lib/economics-default");
const { EconomicsError } = await import("@/domain/business-economics");
const AT = "2026-10-06T10:00:00+05:30";

beforeEach(() => store.resetEconomicsStore());

describe("the account economics store", () => {
  it("starts with version 1 and no draft", async () => {
    const s = await store.getEconomicsStore();
    expect(s.versions.map((v) => v.version)).toEqual([1]);
    expect(s.draft).toBeNull();
    expect((await store.activeEconomics()).version).toBe(1);
  });

  it("keeps a draft separate from the active version until it is activated", async () => {
    const draft = defaultEconomicsContent();
    draft.services[0].directCostPaise += 50_000;
    expect(await store.saveEconomicsDraft(draft)).toEqual([]);
    expect((await store.activeEconomics()).services[0].directCostPaise).not.toBe(draft.services[0].directCostPaise);
    const v2 = await store.activateEconomicsDraft("Merchant (Pinecone Media Works)", AT);
    expect(v2.version).toBe(2);
    expect((await store.activeEconomics()).hash).toBe(v2.hash);
    expect((await store.getEconomicsStore()).draft).toBeNull();
    expect((await store.economicsVersion(1))!.version).toBe(1);
  });

  it("refuses to activate an invalid draft, or one identical to the active version", async () => {
    const bad = defaultEconomicsContent();
    bad.discountLadderBps = [0, 500];
    expect((await store.saveEconomicsDraft(bad)).some((i) => i.level === "error")).toBe(true);
    await expect(store.activateEconomicsDraft("m", AT)).rejects.toThrow(EconomicsError);
    await store.saveEconomicsDraft(defaultEconomicsContent());
    await expect(store.activateEconomicsDraft("m", AT)).rejects.toThrow(/no change/i);
    expect((await store.getEconomicsStore()).versions).toHaveLength(1);
  });

  it("restores the demo defaults as a new version, and does nothing when they already apply", async () => {
    expect((await store.restoreDefaultEconomics("m", AT)).version).toBe(1);
    const draft = defaultEconomicsContent();
    draft.guardrails.cashAtRiskLimitPaise += 100;
    await store.saveEconomicsDraft(draft);
    await store.activateEconomicsDraft("m", AT);
    const restored = await store.restoreDefaultEconomics("m", AT);
    expect(restored.version).toBe(3);
    expect(restored.hash).toBe((await store.economicsVersion(1))!.hash);
  });
});
```

- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** `lib/economics-store.ts` with the signatures above. Every write goes through `serialised` and `writeJsonAtomic(ECONOMICS_FILE, …)`. The "no change" error message is exactly `"There is no change to activate"`.
- [ ] **Step 4:** tests pass; typecheck and lint clean; protected-file check prints `0`.
- [ ] **Step 5: Commit** `feat: account economics store with versions, a draft and restore`

**Phase 1 exit:** full unit suite green (expected 762 + new), browser suite green and unchanged (no screen reads the store yet).

---

# Phase 2 — Baseline, pinning, engine inputs and derived decisions

### Task 2.1: The deal baseline

**Files:**
- Create: `domain/deal-baseline.ts`
- Test: `tests/domain/deal-baseline.test.ts`

**Interfaces:**
- Produces:
  - `interface BaselinePrice { packageId: string; kind: "one_time" | "monthly"; listPricePaise: number }`
  - `interface DealBaseline { servicePrices: BaselinePrice[]; quotedScope: ScopeItem[]; quotedPrePaise: number; quotedGstPaise: number; quotedTotalPaise: number; gstRateBps: number; economicsVersionAtStart: number }`
  - `listValueOf(prices: BaselinePrice[], scope: ScopeItem[]): number` (monthly: price × months; one-time: price; throws `BaselineError` for a service not in `prices`)
  - `captureBaseline(args: { services: Pick<ServicePackage, "id" | "kind" | "listPricePaise">[]; quotedScope: ScopeItem[]; quotedPrePaise: number; gstRateBps: number; economicsVersion: number }): DealBaseline` (throws `BaselineError` when `quotedPrePaise !== listValueOf(...)`)

- [ ] **Step 1: Failing test**

```ts
// tests/domain/deal-baseline.test.ts
import { describe, expect, it } from "vitest";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";
import { BaselineError, captureBaseline, listValueOf } from "@/domain/deal-baseline";

const args = () => ({ services: heroPackages, quotedScope: heroTemplates.fullScope, quotedPrePaise: 12_000_000, gstRateBps: heroMerchant.policy.gstRateBps, economicsVersion: 1 });

describe("the deal baseline", () => {
  it("snapshots every service price and the quote: ₹1,20,000 + 18% GST = ₹1,41,600", () => {
    const b = captureBaseline(args());
    expect(b.servicePrices).toEqual(heroPackages.map((p) => ({ packageId: p.id, kind: p.kind, listPricePaise: p.listPricePaise })));
    expect([b.quotedPrePaise, b.quotedGstPaise, b.quotedTotalPaise]).toEqual([12_000_000, 2_160_000, 14_160_000]);
    expect(b.economicsVersionAtStart).toBe(1);
  });
  it("refuses a quote that does not equal its own price snapshot", () => {
    expect(() => captureBaseline({ ...args(), quotedPrePaise: 12_000_001 })).toThrow(BaselineError);
  });
  it("values a scope from the snapshot, and refuses a service that is not in it", () => {
    const b = captureBaseline(args());
    const phase = heroTemplates.phased_scope.phase1Scopes[0].items;
    expect(listValueOf(b.servicePrices, phase)).toBe(3_900_000);
    expect(() => listValueOf(b.servicePrices, [{ packageId: "nope", months: 1 }])).toThrow(BaselineError);
  });
  it("is unaffected by later edits to the services it was captured from", () => {
    const services = structuredClone(heroPackages);
    const b = captureBaseline({ ...args(), services });
    services[0].listPricePaise += 500_000;
    expect(b.servicePrices[0].listPricePaise).toBe(heroPackages[0].listPricePaise);
  });
});
```

The fixture values behind these numbers (checked on `4a73973`): Website fixes ₹24,000 one-time; Search marketing ₹4,000, Social media ₹3,000 and Monthly reporting ₹1,000 per month. The full annual scope is 24,000 + 12 × 8,000 = ₹1,20,000. Phase 1 (`web-search-report-3m`) is 24,000 + 3 × 4,000 + 3 × 1,000 = ₹39,000.

- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement.** GST uses `lineWithGst(quotedPrePaise, gstRateBps)` from `domain/money.ts`, the same rule `originalProposal()` uses today.
- [ ] **Step 4:** tests pass.
- [ ] **Step 5: Commit** `feat: immutable deal baseline with a per-service price snapshot`

### Task 2.2: Engine inputs, the effective hash and pin conflicts

**Files:**
- Create: `lib/deal-economics.ts`, `domain/strategy-id.ts`
- Test: `tests/lib/deal-economics.test.ts`

**Interfaces:**
- Consumes: Tasks 1.1, 2.1; `EngineInput` from `domain/engine.ts` (type import only); `Merchant` from `domain/types.ts`.
- Produces:
  - `type OverrideField = "direct_cost" | "contribution_floor" | "cash_exposure" | "discount_limit"`
  - `interface InputOverride { id: string; field: OverrideField; packageId?: string; value: number | ContributionFloor; accountValue: number | ContributionFloor; direction: "tightens" | "loosens" | "neutral"; reason: string; by: string; at: string }`
  - `interface DealEconomics { pinned: { version: number; hash: string }; overrides: InputOverride[]; strategy: StrategyId; effectiveHash: string }` (`StrategyId` comes from `domain/strategy-id.ts`, created in this task: `export const STRATEGY_IDS = ["protect_contribution", "preserve_scope", "minimise_cash_exposure", "lower_buyer_commitment"] as const; export type StrategyId = (typeof STRATEGY_IDS)[number];`)
  - `pinConflicts(baseline: DealBaseline, version: BusinessEconomics): string[]` (plain-language reasons; empty when the version can be applied)
  - `engineInputFor(args: { merchant: Merchant; baseline: DealBaseline; version: BusinessEconomics; overrides: InputOverride[] }): EngineInput` (throws `EconomicsConflictError` when `pinConflicts` is non-empty)
  - `effectiveHashOf(input: EngineInput): string` (sha256 of `canonicalJson({ policy: input.merchant.policy, packages: input.packages, templates: input.templates })`)
  - `overrideDirection(field, accountValue, value): "tightens" | "loosens" | "neutral"`

**Rules `engineInputFor` implements (spec section 5):**
- `packages`: one per `baseline.servicePrices` entry, in that order. `listPricePaise` and `kind` from the baseline. Every other field from the version's service with the same id, then a `direct_cost` override for that `packageId`.
- `merchant.policy`: `gstRateBps` from the baseline; the six guardrails from the version, then overrides; `advanceNoticeDays`, `internalRetryAfterDays`, `mandateEndBufferMonths` from `version.fixed`.
- `templates`: `version.fixed.offerTypes` with `fullScope` replaced by `baseline.quotedScope`, and `discountsBps` set to the version's ladder sorted ascending. A `discount_limit` override below a ladder level removes that level from `discountsBps` for this deal.
- `pinConflicts` reports: a baseline service missing from the version; a baseline service whose `dependsOnAny` names a service outside the baseline; a phase scope or full scope in the offer types naming a service outside the baseline.

- [ ] **Step 1: Failing test**

```ts
// tests/lib/deal-economics.test.ts
import { describe, expect, it } from "vitest";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";
import { activate } from "@/domain/business-economics";
import { captureBaseline } from "@/domain/deal-baseline";
import { defaultEconomics, defaultEconomicsContent } from "@/lib/economics-default";
import { EconomicsConflictError, effectiveHashOf, engineInputFor, overrideDirection, pinConflicts } from "@/lib/deal-economics";

const baseline = () => captureBaseline({ services: heroPackages, quotedScope: heroTemplates.fullScope, quotedPrePaise: 12_000_000, gstRateBps: 1800, economicsVersion: 1 });
const v = (mutate: (c: ReturnType<typeof defaultEconomicsContent>) => void, version = 2) => {
  const c = defaultEconomicsContent();
  mutate(c);
  return activate(c, { version, activatedAt: "2026-10-06T10:00:00+05:30", activatedBy: "m" });
};
const inputs = (version = defaultEconomics(), overrides = []) => engineInputFor({ merchant: heroMerchant, baseline: baseline(), version, overrides });

describe("engine inputs for a deal", () => {
  it("under version 1 are exactly the fixtures the recordings were made with", () => {
    const i = inputs();
    expect(i.packages).toEqual(heroPackages);
    expect(i.templates).toEqual(heroTemplates);
    expect(i.merchant.policy).toEqual(heroMerchant.policy);
    expect(effectiveHashOf(i)).toBe(effectiveHashOf({ merchant: heroMerchant, packages: heroPackages, templates: heroTemplates }));
  });

  it("never take a price from a newer version: only costs, guardrails and the ladder move", () => {
    const next = v((c) => {
      c.services[0].listPricePaise += 900_000;
      c.services[0].directCostPaise += 100_000;
      c.guardrails.discountLimitBps = 1000;
      c.discountLadderBps = [0, 500, 1000];
    });
    const i = inputs(next);
    expect(i.packages.map((p) => p.listPricePaise)).toEqual(heroPackages.map((p) => p.listPricePaise));
    expect(i.packages[0].directCostPaise).toBe(heroPackages[0].directCostPaise + 100_000);
    expect(i.templates.discountsBps).toEqual([0, 500, 1000]);
    expect(i.merchant.policy.discountLimitBps).toBe(1000);
  });

  it("have the same hash when a version changes standard prices only", () => {
    const priceOnly = v((c) => { for (const s of c.services) s.listPricePaise += 100_000; });
    expect(effectiveHashOf(inputs(priceOnly))).toBe(effectiveHashOf(inputs()));
    const cost = v((c) => { c.services[0].directCostPaise += 1; });
    expect(effectiveHashOf(inputs(cost))).not.toBe(effectiveHashOf(inputs()));
  });

  it("apply input overrides on top of the pinned version", () => {
    const o = [{ id: "ovr-1", field: "direct_cost" as const, packageId: heroPackages[0].id, value: 1_500_000, accountValue: heroPackages[0].directCostPaise, direction: "tightens" as const, reason: "Extra migration work", by: "m", at: "x" }];
    expect(inputs(defaultEconomics(), o as never).packages[0].directCostPaise).toBe(1_500_000);
  });

  it("keep exactly the baseline's services, and refuse a version that leaves that set", () => {
    const added = v((c) => { c.services.push({ ...c.services[0], id: "analytics", name: "Analytics setup" }); });
    expect(inputs(added).packages.map((p) => p.id)).toEqual(heroPackages.map((p) => p.id));
    const dependsOutside = v((c) => { c.services.push({ ...c.services[0], id: "analytics", name: "Analytics setup" }); c.services[1].dependsOnAny = ["analytics"]; });
    expect(pinConflicts(baseline(), dependsOutside).join(" ")).toMatch(/Analytics setup, which was not part of this deal/);
    expect(() => inputs(dependsOutside)).toThrow(EconomicsConflictError);
    const removed = v((c) => { c.services = c.services.slice(1); c.fixed.offerTypes.fullScope = c.fixed.offerTypes.fullScope.filter((i) => i.packageId !== heroPackages[0].id); });
    expect(pinConflicts(baseline(), removed).join(" ")).toMatch(/is no longer one of your services/);
  });
});

describe("the direction of an override", () => {
  it.each([
    ["direct_cost", 100, 200, "tightens"],
    ["direct_cost", 200, 100, "loosens"],
    ["cash_exposure", 1000, 500, "tightens"],
    ["cash_exposure", 500, 1000, "loosens"],
    ["discount_limit", 0, 500, "loosens"],
    ["discount_limit", 500, 500, "neutral"],
  ] as const)("%s from %i to %i %s the account rule", (field, account, value, expected) => {
    expect(overrideDirection(field, account, value)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per the rules above. `removed` in the test also drops the service from the phase scopes if the fixture's phase scope names it; adjust the mutation so only the "no longer one of your services" conflict is the subject.
- [ ] **Step 4:** tests pass.
- [ ] **Step 5: Commit** `feat: build engine inputs from a deal's baseline and pinned economics`

### Task 2.3: State, seed and migration

**Files:**
- Modify: `lib/service.ts` (`DemoState`, `seedState`), `lib/migrate.ts` (`STORE_SCHEMA_VERSION` 5 → 6)
- Test: `tests/lib/migrate.test.ts`, new `tests/lib/deal-economics-state.test.ts`

**Interfaces:**
- Produces: `DemoState.baseline: DealBaseline`, `DemoState.economics: DealEconomics`.
- **Starting a demo case is not making a new quote.** Each case is an existing deal that was quoted earlier, and its conversation states that quote. `DemoCase` (in `data/synthetic/cases.ts`, not frozen) gains `quote: { prePaise: number }` (12_000_000 for all three). `seedState` captures the baseline from **the case's own quoted prices** (`item.deal.packages`) and scope (`item.deal.templates.fullScope`) with `quotedPrePaise: item.quote.prePaise`, never from the active version's standard prices. `captureBaseline` then enforces that the snapshot equals the stated quote.
- `seedState` pins the **active** account version (for costs, guardrails, ladder, flags), sets `strategy: "protect_contribution"`, `overrides: []`, and `effectiveHash`. If `pinConflicts` is non-empty for the active version, it pins the newest version without conflicts and records an event saying so.
- Migration for a store without them: baseline from version 1 and the case fixture, `pinned` = version 1, labelled by an event `economics_defaulted` ("Default demo economics applied to a deal saved before business economics existed").

- [ ] **Step 1: Failing tests**

```ts
// tests/lib/deal-economics-state.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CASE_IDS } from "@/data/synthetic/cases";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-deal-econ-"));
let svc: typeof import("@/lib/service");
beforeAll(async () => { svc = await import("@/lib/service"); });

describe("a new deal", () => {
  it.each(CASE_IDS)("%s: pins version 1, snapshots prices, and starts on Protect contribution", async (id) => {
    const s = await svc.startCase(id);
    expect(s.economics).toMatchObject({ pinned: { version: 1 }, overrides: [], strategy: "protect_contribution" });
    expect(s.baseline.quotedTotalPaise).toBe(14_160_000);
    expect(s.baseline.servicePrices).toHaveLength(4);
    expect(s.economics.effectiveHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("keeps the quoted prices when a newer version with other standard prices is active, and takes that version's costs", async () => {
    const economics = await import("@/lib/economics-store");
    const { defaultEconomicsContent } = await import("@/lib/economics-default");
    const draft = defaultEconomicsContent();
    draft.services[0].listPricePaise += 600_000;
    draft.services[0].directCostPaise += 100_000;
    await economics.saveEconomicsDraft(draft);
    await economics.activateEconomicsDraft("Merchant (Pinecone Media Works)", "2026-10-06T10:00:00+05:30");
    const s = await svc.startCase("reduced-scope");
    expect(s.economics.pinned.version).toBe(2);
    expect(s.baseline.servicePrices[0].listPricePaise).toBe(2_400_000);
    expect(s.baseline.quotedTotalPaise).toBe(14_160_000);
    await economics.resetEconomicsStore();
  });
  it("has the same effective hash in every case, because they share one merchant, services and offer types", async () => {
    const hashes = [];
    for (const id of CASE_IDS) hashes.push((await svc.startCase(id)).economics.effectiveHash);
    expect(new Set(hashes).size).toBe(1);
  });
});
```

Add to `tests/lib/migrate.test.ts`:

```ts
  it("gives a store saved before business economics a baseline and a pinned version 1", () => {
    const s = migrateState(base({ schemaVersion: STORE_SCHEMA_VERSION - 1, caseId: DEFAULT_CASE_ID }));
    expect(s.economics).toMatchObject({ pinned: { version: 1 }, overrides: [], strategy: "protect_contribution" });
    expect(s.baseline.quotedTotalPaise).toBe(14_160_000);
    expect(s.events.some((e) => e.kind === "economics_defaulted")).toBe(true);
  });
```

- [ ] **Step 2: Run** → FAIL (`economics` undefined).
- [ ] **Step 3: Implement.** `migrateState` is synchronous and must not read the account store; it uses `defaultEconomics()` directly. `seedState` is async and reads `activeEconomics()`.
- [ ] **Step 4:** new tests pass; the full unit suite passes (state shape is additive).
- [ ] **Step 5: Commit** `feat: every deal carries its baseline and pinned economics`

### Task 2.4: One deal context; no direct fixture reads

**Files:**
- Create: `lib/deal-context.ts`
- Modify: the 12 files that import `heroMerchant`, `heroPackages` or `heroTemplates` outside `data/` and `tests/` (`app/deals/[dealId]/offer/preview/page.tsx`, `app/deals/[dealId]/track/page.tsx`, `app/proposal/[agreementId]/[version]/page.tsx`, `components/audit/sections.tsx`, `components/offer/recommendation.tsx`, `components/proposal-content.tsx`, `lib/audit.ts`, `lib/deal-page.ts`, `lib/demo-steps.ts`, `lib/offer-copy.ts`, `lib/page-data.ts`, `lib/service.ts`); `scripts/hero-report.ts` is a fixture report and keeps its imports.
- Test: `tests/lib/deal-context.test.ts`, `tests/lib/no-fixture-reads.test.ts`

**Interfaces:**
- Produces:
  - `dealContextFor(s: DemoState, version: BusinessEconomics): DealContext` (`{ dealId, messages, merchant: { ...identity, policy }, packages, templates }` from `engineInputFor`)
  - `pinnedEconomicsOf(s: DemoState): Promise<BusinessEconomics>` (reads the account store for `s.economics.pinned.version`; throws `ActionError` if it is missing)
  - `originalProposalOf(baseline: DealBaseline): { prePaise; gstPaise; totalPaise; gstRateBps }`
  - `packageName(packages: ServicePackage[], id: string): string`
- `lib/offer-copy.ts`: `originalProposal()` is replaced by `originalProposalOf(baseline)`; `offerSummary`, `headlineFor`, `whyOffer`, `blockingLines` callers pass the baseline and the deal's packages.
- `loadDeal` and `loadPage` return `deal: DealContext` and `baseline`, and every page reads policy, packages and offer types from `deal`.

- [ ] **Step 1: Failing tests**

```ts
// tests/lib/no-fixture-reads.test.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const ALLOWED = new Set(["lib/economics-default.ts"]);

describe("product code reads a deal's own economics", () => {
  it("imports no merchant, service or offer-type fixture outside the default economics", () => {
    const offenders = ["lib", "app", "components", "domain"].flatMap(walk).filter((f) => /\.(ts|tsx)$/.test(f) && !ALLOWED.has(f)).filter((f) => /\bhero(Merchant|Packages|Templates)\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
```

`tests/lib/deal-context.test.ts` asserts: for a started case, `dealContextFor(s, version1)` equals the case fixture's `deal` (`toEqual`), and `originalProposalOf(s.baseline)` equals `{ prePaise: 12_000_000, gstPaise: 2_160_000, totalPaise: 14_160_000, gstRateBps: 1800 }`.

- [ ] **Step 2: Run** → the fixture test lists 12 files.
- [ ] **Step 3: Implement**, file by file. `heroMerchant.name`, `.id` and `.timeZone` (identity, not economics) are read from `deal.merchant`. `heroDemoEvents`, `heroScriptedReplies`, `heroClarificationAnswers`, `HERO_DEAL_ID` are not economics and stay.
- [ ] **Step 4:** both tests pass; the whole unit suite passes; `npm run build` succeeds.
- [ ] **Step 5: Commit** `refactor: read merchant economics from the deal, not from fixtures`

### Task 2.5: Replay or derive, by the effective hash

**Files:**
- Modify: `lib/decision-branch.ts`, `lib/service.ts` (`currentOutcome`, `dealForState`, `recordAnswers`, `confirmRequiredServices`), `lib/migrate.ts` (`validDecisionBranch`)
- Test: `tests/lib/derived-decision.test.ts`; extend `tests/lib/decision-branch.test.ts`

**Interfaces:**
- `DECISION_BRANCH_SCHEMA_V2 = "adaptive-deals.decision-branch.v2"`; `deriveBranchOutcome` and `validDecisionBranch` accept `v1` and `v2`.
- `DecisionBranch.reason` adds `"economics_changed"`; `DecisionBranch.economics?: { version: number; effectiveHash: string }`.
- `recordingInputHash(s: DemoState): string` = `effectiveHashOf` of the case fixture's own inputs.
- `economicsMatchRecording(s): boolean` = `s.economics.effectiveHash === recordingInputHash(s)`.
- `currentOutcome(s)`:
  - no branch and `economicsMatchRecording(s)` → `replayRun(s.run.record, fixtureDeal)` exactly as today;
  - otherwise → `deriveBranchOutcome({ initial, branch, deal: dealContextFor(s, pinned) })`, where `initial` still comes from `initialOutcomeForBranch(s)` with the **fixture** deal (the recorded extraction and clarification do not depend on merchant economics).
- `deriveBranchOutcome` recomputes the questions for a derived decision: `interpretClarification(null, profile, evaluation.ambiguities)` gives the code-worded set for the effective economics; a question whose `id` exists in `initial.questions` keeps the recorded wording and `wording`.
- `recordAnswers` takes the recorded-continuation path only when `answersMatchRecorded(...) && !branch?.scope && economicsMatchRecording(s)`.
- A helper `syncEconomicsBranch(s)` is called whenever `s.economics` changes: it creates or updates the branch's `economics`, and removes a branch whose only cause was economics once the hash matches the recording again.

- [ ] **Step 1: Failing test** (`tests/lib/derived-decision.test.ts`). Uses the recorded preserve-scope and reduced-scope helpers in `tests/helpers/recorded-case.ts`. It must assert, with an economics version whose first service cost is higher:
  1. Under version 1 `currentOutcome` returns the recorded explanation (`source.ranking === "ai"` for reduced scope) and `decisionBranch` is null.
  2. After pinning the changed version, `currentOutcome(s).explanation.source` is `{ ranking: "code", text: "code_fallback" }`, every `netContributionPaise` differs from the recorded value by the cost change, and `s.run.record` is deep-equal to before.
  3. Re-pinning version 1 removes the economics-only branch and the recorded explanation is back.
  4. With a scope-confirmation branch present, the branch keeps `reason: "merchant_scope_confirmation"` and gains `economics`.
  5. A guardrail-only change (cash exposure limit lowered to ₹0) makes at least one previously feasible offer infeasible. This is the case the frozen replay would silently ignore.
  6. Recording answers that match the recording, while economics differ, yields a derived decision and never calls the replay provider for `explain`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** new and existing branch tests pass. `tests/data/case-recordings.test.ts` still passes unchanged: version 1 reproduces all three recordings.
- [ ] **Step 5: Commit** `feat: replay a recording only under the economics it was recorded with`

### Task 2.6: Pin references and the fingerprint

**Files:**
- Modify: `domain/agreement.ts` (`AgreementVersion.economics?`, `createAgreementVersion` arg), `domain/amendment.ts` (`Amendment.economics?`), `lib/deal-records.ts` (`CounterOffer.economics?`, `decisionFingerprint`), `lib/service.ts`
- Test: `tests/lib/economics-pinning.test.ts`

**Interfaces:**
- `interface EconomicsRef { version: number; effectiveHash: string; strategy: StrategyId }`
- `createAgreementVersion({ …, economics?: EconomicsRef })` stores it beside, not inside, `terms`.
- `decisionFingerprint(eligibleIds, selectedTerms, effectiveHash)`; the two call sites in `lib/service.ts` pass `s.economics.effectiveHash`.
- `proposeAmendment` and `buildCounter` evaluate with `dealContextFor(s, pinned)` and store the ref.

- [ ] **Step 1: Failing test.** Asserts: a draft carries the ref and its `termsHash` equals the hash of terms that do not mention economics; activating a newer account version changes no stored ref and no `effectiveHash`; changing the pinned version of an open deal makes `isDraftStale(s)` true; a sent version's ref is identical before and after a later re-evaluation of a withdrawn deal.
- [ ] **Step 2–4:** red, implement, green. The buyer page test in `tests/` that snapshots buyer-visible terms must not gain any economics field.
- [ ] **Step 5: Commit** `feat: pin the economics behind every draft, agreement, amendment and counter-offer`

### Task 2.7: Explicit re-evaluation

**Files:**
- Create: `lib/reevaluation.ts`
- Modify: `lib/service.ts`, `app/api/actions/route.ts`
- Test: `tests/lib/reevaluation.test.ts`

**Interfaces:**
- `interface ReevaluationPreview { fromVersion: number; toVersion: number; blocked: string[]; changesInputs: boolean; inputChanges: { field: string; from: string; to: string }[]; pricesNote: "Service prices are unchanged for this deal."; becomesFeasible: string[]; becomesInfeasible: string[]; recommendationChanges: boolean; staleDraftVersion: number | null }`
- `previewReevaluation(toVersion?: number): Promise<ReevaluationPreview>` (read only)
- `reevaluateDeal(toVersion: number): Promise<DemoState>`
- `reevaluationAvailable(s): Promise<boolean>` true only when the active version differs from the pinned one **and** its prospective effective hash differs.
- Actions: `preview_reevaluation`, `reevaluate_deal { toVersion }`.
- **Allowed only before a proposal is live:** status in `stalled`, `clarifying`, `options_ready`, `needs_information`, `no_feasible_structure`, `outside_templates`. Otherwise `ActionError("This deal's sent or accepted version keeps the economics it was made with")`.

- [ ] **Step 1: Failing test.** Asserts: a price-only version gives `reevaluationAvailable === false` and a preview with `changesInputs: false`; a cost change lists exactly that input and no price; the preview mutates nothing (`getState()` deep-equal before and after); a version with an outside dependency returns `blocked` with the plain-language reason and `reevaluateDeal` rejects with it and changes nothing; after a successful re-evaluation every `packages[i].listPricePaise` the engine received equals the baseline; a re-evaluation at `sent` is refused.
- [ ] **Step 2–4:** red, implement, green.
- [ ] **Step 5: Commit** `feat: explicit re-evaluation of an open deal, with a preview`

**Phase 2 exit:** unit and browser suites green. No screen has changed, so the browser suite passes without edits. Add a `PRODUCT_DECISIONS.md` section "A deal keeps the prices it was quoted at" and an `AI_BUILD_LOG.md` entry stating that no prompt, recording or model call changed.

---

# Phase 3 — Deterministic strategies

### Task 3.1: A seeded generator for property tests

**Files:**
- Create: `tests/helpers/gen.ts`
- Test: `tests/helpers/gen.test.ts`

**Interfaces:**
- `rng(seed: number): () => number` (mulberry32; returns a float in [0, 1))
- `genEconomics(next: () => number): EconomicsContent` (starts from `defaultEconomicsContent()`; varies each cost within 0–120% of its price, the floor 0–60%, cash exposure ₹0–₹50,000, ceiling one of 0/5/10/20%, ladder a subset of {0, 5%, 10%, 20%} at or below the ceiling and always containing 0, minimum payment ₹1,000–₹20,000, duration 3–18 months, fee 0–5%)
- `SEEDS = Array.from({ length: 200 }, (_, i) => i + 1)`

- [ ] **Steps:** test that the same seed yields deep-equal content and that every generated content has no error-level issue across `SEEDS`; implement; commit `test: seeded generator for economics property tests`.

### Task 3.2: Strategies, proactive ranking and fact ids

**Files:**
- Create: `domain/strategy.ts`
- Test: `tests/domain/strategy.test.ts`, `tests/domain/strategy-properties.test.ts`

**Interfaces:**
- Consumes `STRATEGY_IDS`, `StrategyId` from `domain/strategy-id.ts` (Task 2.2) and re-exports them.
- `STRATEGY_LABEL: Record<StrategyId, string>` = Protect contribution, Preserve scope, Minimise cash exposure, Lower buyer commitment
- `rankByStrategy(offers: EvaluatedStructure[], strategy: StrategyId, baseline: DealBaseline): EvaluatedStructure[]`
- `type FactId = "highest_contribution" | "lowest_cash_exposure" | "most_scope_retained" | "smallest_largest_payment" | "lowest_total" | "earliest_start" | "no_discount" | "lowest_discount" | "within_buyer_approval" | "needs_buyer_approval" | \`tied_on:${string}\``
- `factsFor(offer, among: EvaluatedStructure[], baseline): FactId[]`
- `interface StrategyView { strategy: StrategyId; mode: "standard" | "discount_only" | "none"; ranked: EvaluatedStructure[]; leader: EvaluatedStructure | null; withinApprovalAlternative: EvaluatedStructure | null; discounted: EvaluatedStructure[]; facts: Record<string, FactId[]> }`
- `strategyView(feasible: EvaluatedStructure[], strategy: StrategyId, baseline: DealBaseline): StrategyView`
- `explainLeader(view: StrategyView, format: { inr(paise: number): string }): string`

**Orderings (spec section 7, decisions 20, 28, 29):**

```ts
const approval = (x: EvaluatedStructure) => (x.approval === "requires_approval" ? 1 : 0);
const largest = (x: EvaluatedStructure) => Math.max(...x.structure.payments.map((p) => p.totalPaise));
const total = (x: EvaluatedStructure) => sum(x.structure.payments.map((p) => p.totalPaise));
const KEYS = {
  approval: (a, b) => approval(a) - approval(b),
  contribution: (a, b) => b.economics.netContributionPaise - a.economics.netContributionPaise,
  cash: (a, b) => a.economics.peakFundingPaise - b.economics.peakFundingPaise,
  largest: (a, b) => largest(a) - largest(b),
  total: (a, b) => total(a) - total(b),
  discount: (a, b) => a.structure.discountBps - b.structure.discountBps,
  start: (a, b) => a.structure.startDate.localeCompare(b.structure.startDate),
  id: (a, b) => a.structure.id.localeCompare(b.structure.id),
} satisfies Record<string, (a: EvaluatedStructure, b: EvaluatedStructure) => number>;
// scope(baseline): (a, b) => listValueOf(baseline.servicePrices, b.structure.scope) - listValueOf(baseline.servicePrices, a.structure.scope)
const ORDER: Record<StrategyId, string[]> = {
  protect_contribution: ["approval", "contribution", "cash", "largest", "id"],
  preserve_scope: ["scope", "contribution", "cash", "largest", "id"],
  minimise_cash_exposure: ["cash", "contribution", "largest", "id"],
  lower_buyer_commitment: ["approval", "discount", "largest", "total", "start", "id"],
};
```

- `rankByStrategy("protect_contribution", …)` returns `rankFeasible(offers)` (imported from the frozen engine), so identity is guaranteed and tested.
- `strategyView`:
  - `undiscounted = feasible.filter((x) => x.structure.discountBps === 0)`.
  - If `undiscounted.length`: `mode: "standard"`, `ranked = rankByStrategy(undiscounted)`, `leader = ranked[0]`, `withinApprovalAlternative` = the first within-limit offer in `ranked` when the leader needs approval, else `null`.
  - Else if `feasible.length`: `mode: "discount_only"`, `ranked = []`, `leader = null`.
  - Else `mode: "none"`.
  - `discounted` = feasible offers with `discountBps > 0`, sorted by `discount`, then the strategy's own keys.
  - `facts` are computed among `ranked` (or among `discounted` in `discount_only`).
- `explainLeader` writes, from the leader's facts and the strategy's keys only, one sentence such as: "Best for Protect contribution: it is within the buyer's approval limit and keeps about ₹19,330, the highest among the offers the buyer can approve. It ties with the single-payment offer and has the smaller largest payment." Every comparative comes from a fact id.

- [ ] **Step 1: Failing example tests** (`tests/domain/strategy.test.ts`), on the clarified hero evaluation from `tests/helpers.ts`:

```ts
const feasible = () => enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible;
const top = (s: StrategyId) => strategyView(feasible(), s, baseline()).leader!.structure.id;

it("recommends the two-payment phase for Protect contribution and Lower buyer commitment", () => {
  expect(top("protect_contribution")).toBe("phased_scope:scope=web-search-report-3m,plan=two_monthly");
  expect(top("lower_buyer_commitment")).toBe("phased_scope:scope=web-search-report-3m,plan=two_monthly");
});
it("recommends the full annual scope, which needs MD approval, for Preserve scope and Minimise cash exposure, and names the best within-approval alternative", () => {
  for (const s of ["preserve_scope", "minimise_cash_exposure"] as const) {
    const v = strategyView(feasible(), s, baseline());
    expect(v.leader!.structure.id).toBe("split_payment:plan=deposit_30");
    expect(v.leader!.approval).toBe("requires_approval");
    expect(v.withinApprovalAlternative!.structure.id).toBe("phased_scope:scope=web-search-report-3m,plan=two_monthly");
  }
});
it("shows no within-approval alternative when the leader is already within the limit", () => {
  expect(strategyView(feasible(), "protect_contribution", baseline()).withinApprovalAlternative).toBeNull();
});
it("gives the leader only facts that are true of it", () => { /* assert each fact against the numbers */ });
it("explains the leader without any claim outside its facts", () => { /* the sentence contains "highest" only when highest_contribution is a fact, etc. */ });
```

Plus, with a ladder of 0/5/10% (engine input built by `engineInputFor` from an economics with that ladder):
```ts
it("never leads with a discounted offer while an undiscounted one is feasible, under any strategy", …);
it("lists discounted offers lower discount first, and marks the view discount_only when nothing fits undiscounted", …);
```

- [ ] **Step 2: Failing property tests** (`tests/domain/strategy-properties.test.ts`), over `SEEDS` and all three case constraint sets:
  - `rankByStrategy` returns a permutation of its input for every strategy, and is identical on a second call and on a shuffled input.
  - `rankByStrategy(x, "protect_contribution")` deep-equals `rankFeasible(x)`.
  - `strategyView(...).ranked` contains no offer with `discountBps > 0` whenever any feasible offer has `discountBps === 0`.
  - **Guardrail monotonicity:** for a generated economics `E` and `E'` that only loosens one guardrail (lower floor, higher cash limit, higher ceiling with the same ladder, lower minimum payment, longer duration), `feasibleIds(E) ⊆ feasibleIds(E')`; tightening gives the reverse inclusion.
  - The services the engine receives are exactly the baseline's, for every generated version.
- [ ] **Step 3: Implement** `domain/strategy.ts`.
- [ ] **Step 4:** all pass. If a monotonicity seed fails, do not adjust the test: report the seed and the offer, because it means a guardrail interacts in a way the spec did not expect.
- [ ] **Step 5: Commit** `feat: deterministic strategies, proactive ranking and fact ids`

**Phase 3 exit:** unit and browser suites fully green. This phase creates and verifies the pure strategy modules only. It does not switch the recommendation used by the live service; that integration lands atomically with the Offer interface and its browser expectations in Phase 5.

---

# Phase 4 — Business economics page

### Task 4.1: Actions

**Files:** Modify `app/api/actions/route.ts`, `lib/walkthrough-actions.ts`. Test `tests/lib/economics-actions.test.ts`.

**Interfaces (Zod, all amounts integer paise, all percentages integer bps):**
- `save_economics_draft { content: EconomicsContent }` → `{ issues }`
- `discard_economics_draft`
- `preview_economics_activation` → `{ issues, serviceEconomics: { id, name, pricePaise, costPaise, contributionPaise, marginBps }[], demoDeal: ReevaluationPreview | null, unreachableFloor: boolean }`
- `activate_economics` → `{ version }`
- `restore_default_economics` → `{ version }`
- `reset_economics_for_tests` (accepted only when `process.env.ADAPTIVE_DEALS_DATA_DIR` is set and starts with `.data-e2e`)

- [ ] **Steps:** failing test that each action validates, that the guide's allowlist in `lib/walkthrough-actions.ts` rejects every one of them, and that `reset_economics_for_tests` is refused in the default data directory; implement; commit `feat: business economics actions`.

### Task 4.2: The page

**Files:** Create `app/economics/page.tsx`, `components/economics/services-table.tsx`, `components/economics/guardrails-form.tsx`, `components/economics/review-panel.tsx`. Modify `components/merchant-header.tsx` (a third link, "Business economics", `current === "economics"`).

**Contract (test ids and copy are exact):**
- `data-testid="economics-page"`, heading "Business economics", sub-line "Version {n} · activated {date}" (`economics-version`).
- **Services** (`economics-services`): one row per service (`service-row-{id}`) with fields `price`, `cost`, `costTiming` (read-only "Start of each delivery month"), `removable`, `deferrable`, `independent`, `dependsOn`. The price field carries the label "Standard price · applies to new quotes" and the note under the table: "Existing deals keep the prices they were quoted at."
- **Commercial guardrails** (`economics-guardrails`): `floor-percent`, `floor-amount`, `discount-limit`, `discount-ladder` (comma-separated percentages, shown as chips), `cash-exposure` with the helper "The most you would have paid out before being paid.", `min-payment` ("before GST"), `max-duration`, `payment-fee` ("Expected processing fee · configured estimate"). GST is shown read-only: "GST 18% · from your tax configuration".
- **Review and activate** (`economics-review`): appears after "Review changes" (`economics-review-button`). Shows issues (`economics-issue-{field}`), the per-service table (price, cost, contribution, margin), the demo-deal preview when one applies, and `economics-activate` ("Activate version {n+1}"), disabled while any error exists. A floor no offer can meet shows `economics-unreachable-floor`: "No offer can meet this floor, even at your standard prices."
- `economics-restore` ("Restore demo defaults") with a confirm step.
- Amount inputs take rupees and convert with the same `toPaise` rule as `components/track/counter-form.tsx`; move that function to `lib/money-input.ts` and import it in both.

- [ ] **Step 1: Failing browser test** (new `e2e/economics.spec.ts`, added to the `sample` project in `playwright.config.ts`):

```ts
test("economics · a cost change is reviewed, activated as version 2, and offered to the open deal", async ({ page }) => {
  await api(page, { action: "reset_economics_for_tests" });
  await prepareOptions(page);
  await page.goto("/economics");
  await expect(page.getByTestId("economics-version")).toContainText("Version 1");
  await page.getByTestId("service-row-website-fixes").getByTestId("cost").fill("15000");
  await page.getByTestId("economics-review-button").click();
  await expect(page.getByTestId("economics-review")).toContainText("Website fixes");
  await page.getByTestId("economics-activate").click();
  await expect(page.getByTestId("economics-version")).toContainText("Version 2");
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("reevaluate-banner")).toContainText("Your business economics have changed since this deal was evaluated.");
});

test("economics · a standard-price change alone does not touch an existing deal", async ({ page }) => {
  await api(page, { action: "reset_economics_for_tests" });
  await prepareOptions(page);
  const before = state().economics.effectiveHash;
  await page.goto("/economics");
  await page.getByTestId("service-row-website-fixes").getByTestId("price").fill("30000");
  await page.getByTestId("economics-review-button").click();
  await page.getByTestId("economics-activate").click();
  await page.goto("/deals/hero/offer");
  await expect(page.getByTestId("reevaluate-banner")).toHaveCount(0);
  expect(state().economics.effectiveHash).toBe(before);
  await expect(page.getByTestId("offer-total")).toContainText("₹46,020");
});

test("economics · an invalid ladder cannot be activated, and the page fits a phone", async ({ page }) => { /* ladder "0, 5" with ceiling 0 → issue shown, activate disabled; 390px: no horizontal scroll */ });
```

`reevaluate-banner` is rendered by `components/deal/stage-shell.tsx` when `reevaluationAvailable(s)`; it holds "Review the change" (`reevaluate-review`), which shows the `ReevaluationPreview` and "Re-evaluate with version {n}" (`reevaluate-confirm`).

- [ ] **Step 2–4:** red, build the page and banner, green. Run the whole browser suite.
- [ ] **Step 5: Commit** `feat: Business economics page with review, activation and re-evaluation`

**Phase 4 exit:** unit and browser suites fully green. `PRODUCT_DECISIONS.md` gains "Business economics are the merchant's, versioned, and never change an existing deal's prices".

---

# Phase 5 — Strategy-led Offer screen (spec section 12 lands here)

### Task 5.0: Strategy in the service

**Files:**
- Modify: `lib/service.ts`, `app/api/actions/route.ts`
- Test: `tests/lib/strategy-service.test.ts`

**Interfaces:**
- `strategyViewOf(s: DemoState, out: RunOutcome): StrategyView` (feasible = `eligibleStructures` minus any counter-offer structure)
- `setStrategy(strategy: StrategyId): Promise<DemoState>`; action `set_strategy { strategy }`
- `reviewBuyerProposal` and the audit default to `strategyViewOf(...).leader`, not `explanation.order[0]`.
- `SelectedOption.explicit: boolean` (migration: `true` when an `option_selected` outcome with an action source exists for it, else `false`).

**Rules:** explicit selection survives a strategy change; an implicit selection and its unsent draft are cleared; `setStrategy` is refused once a proposal is live (same statuses as Task 2.7); the strategy is not part of `effectiveHash`.

- [ ] **Step 1: Failing test.** On the sample reduced-scope case: default leader is the two-payment phase; `setStrategy("preserve_scope")` with no explicit selection clears the draft and the next `reviewBuyerProposal()` drafts the full annual offer with `buyer_attests_required_approval` in its conditions; after `selectOption(twoPayment)` a strategy change keeps `selectedOption.structureId` and its draft; `setStrategy` at `sent` is refused; a version sent under Preserve scope keeps `economics.strategy === "preserve_scope"` after the deal's strategy is later changed on a withdrawn deal.
- [ ] **Step 2–4:** red, implement, green. Change the service, Offer integration, attribution, visible journey and affected expectations within Phase 5 so no phase boundary knowingly carries a failing browser test. `tests/lib/offer-stage.test.ts` and `tests/lib/counter-offer-service.test.ts` assertions that depended on `explanation.order[0]` are updated to the strategy leader; list each changed assertion in the commit body.
- [ ] **Step 5: Commit** `feat: the merchant's strategy decides the recommended offer`

### Task 5.1: Attribution and audit wording

**Files:** Modify `lib/views.ts` (`explanationAttribution`), `lib/audit.ts`, `lib/walkthrough.ts`. Tests: `tests/lib/views.test.ts`, `tests/lib/audit.test.ts`, `tests/lib/sample-attribution-surfaces.test.ts`, `tests/lib/walkthrough.test.ts`.

**New strings (exact):**
- Offer card attribution, code explanation shown: `Strategy selected by you · offers ranked by code · explained by code · figures calculated by the engine.`
- Default strategy never chosen by the merchant: starts `Default strategy · offers ranked by code · …`
- Behind the information control (`recorded-evidence`), only when `economicsMatchRecording(s)` and a recorded explanation exists: `Historical evidence from the recorded Groq run. It does not drive the current recommendation.` followed by "Recorded Groq order: {labels}" and the recorded per-offer reason. For a hand-written sample the label is `Sample order and reason written by hand · no model ran. It does not drive the current recommendation.`
- Audit: task label "Recorded option order and reasons (not used for the recommendation)"; the credit line "Suggested the order of eligible options" is removed from "who did what" and replaced under code: "Ranked the feasible offers by the strategy {label}".
- Walkthrough notice for the decision step: `You choose the strategy; deterministic code ranks the feasible offers and calculates every figure.`

- [ ] **Steps:** change the tests listed in spec section 12 first (red), then the strings (green). In `tests/lib/sample-attribution-surfaces.test.ts` the rule "no surface credits AI for a hand-written sample" must still hold with the new labels. Commit `feat: attribute the recommendation to the merchant's strategy and code`.

### Task 5.2: The Offer screen

**Files:** Create `components/offer/strategy-control.tsx`. Modify `app/deals/[dealId]/offer/page.tsx`, `components/offer/recommendation.tsx`, `components/audit/sections.tsx`.

**Contract:**
- `strategy-control`: a radio group of the four strategies (native inputs), `data-value` = current id. Above the card: "Best offer for: {label}" (`strategy-heading`).
- The card for the leader. When the leader needs approval: `leader-approval` "Needs the buyer's MD approval" inside the card header, and `within-approval-alternative`: "Best offer the buyer can approve without it: {headline} · {total} · about {contribution}" with "Select this offer".
- `offer-keeps`: "You keep about ₹19,330 after configured costs and expected fees." `offer-cash`: "Cash exposure: ₹0." `offer-rules`: "Based on version {n} of your business economics" plus "{k} deal override(s) applied" when present.
- `strategy-comparison` replaces the "What this offer achieves / What changes" two-column text: four rows, "Strategy · leading offer · total · you keep · buyer approval", the current one marked.
- `mode: "discount_only"`: no recommended card; `no-standard-offer`: "No offer fits at the quoted prices. Your approved discounts would allow these:" then the discounted list, lower discount first, none called recommended.
- "Other offers you could send" lists `view.ranked` after the leader. A live counter-offer is rendered above the list as "Your counter-offer" and is not in it.
- With an explicit selection that is not the leader: `strategy-differs` "Under {label} the recommended offer is {headline}." with "Use the recommended offer".

- [ ] **Step 1: Failing browser tests** (in `e2e/journey.spec.ts`, sample project):
  - default: `strategy-heading` "Best offer for: Protect contribution"; headline "…two monthly payments"; attribution starts "Default strategy · offers ranked by code".
  - choosing Preserve scope: headline "Keep the annual scope and split the payments"; `leader-approval` visible; `within-approval-alternative` names the two-payment phase; back to Protect contribution restores the two-payment phase.
  - `strategy-comparison` has four rows with the leaders from spec 3.5.
  - explicit selection then a strategy change shows `strategy-differs` and keeps the selection.
- [ ] **Step 2–4:** red, build, green.
- [ ] **Step 5: Commit** `feat: strategy-led Offer screen with the leader and the within-approval alternative`

### Task 5.3: The recorded hero journey and documents

**Files:** Modify `e2e/recorded.spec.ts`, `tests/data/case-recordings.test.ts`, `README.md`, `DEMO_SCRIPT.md`, `PRODUCT_DECISIONS.md`, `AI_BUILD_LOG.md`.

- `e2e/recorded.spec.ts`: the test "the merchant overrides Groq's ranking…" becomes "the merchant's strategy decides the recommendation, and Groq's recorded order stays as evidence": Protect contribution recommends the two-payment phase; the information control shows the historical-evidence label and "Recorded Groq order: … paid upfront" first; Preserve scope shows the annual offer with MD approval and the within-approval alternative; back to Protect contribution; then the existing preview, send, accept and reschedule path continues from the two-payment phase (its later assertions are unchanged).
- `tests/data/case-recordings.test.ts` keeps asserting what the recording contains (Groq ranked upfront first). It is evidence about the recording, not about the recommendation. Add one assertion that the strategy leader under version 1 is the two-payment phase.
- `DEMO_SCRIPT.md` 25–45 s row and the recording guidance; `README.md` case table; `PRODUCT_DECISIONS.md`: replace "structures needing buyer approval always rank below" with the strategy rule and record decisions 20, 21, 24, 28.

- [ ] **Steps:** change tests (red), then code and documents, then run both suites. Commit `feat: replace the ranking-override journey with the strategy demonstration`.

**Phase 5 exit:** unit and browser suites fully green. Regenerate screenshots under a new prefix (`ADAPTIVE_E2E_SHOT_PREFIX=strategy-2026-10-NN-`), look at the Offer, Business economics and phone views, and report what was seen.

---

# Phase 6 — Input overrides and the exception audit

### Task 6.1: Input overrides

**Files:** Modify `lib/service.ts`, `app/api/actions/route.ts`. Create `components/offer/deal-overrides.tsx`. Tests `tests/lib/input-overrides.test.ts`, `e2e/journey.spec.ts`.

**Interfaces:**
- `addInputOverride(args: { field: OverrideField; packageId?: string; value: number | ContributionFloor; reason: string }): Promise<DemoState>`; `removeInputOverride(id: string): Promise<DemoState>`
- Actions `add_input_override`, `remove_input_override`. `reason` is trimmed, 5–300 characters.
- Refused once a proposal is live (Task 2.7 statuses). One override per `field` (+ `packageId`); adding again replaces it and keeps the earlier one in the audit as superseded.
- Each change recomputes `effectiveHash`, calls `syncEconomicsBranch`, clears an unsent draft through the fingerprint, and records an event `input_override_added` / `input_override_removed` with provenance `merchant`.
- A `discount_limit` override may not exceed 100%; a `direct_cost` override must be ≥ 0.

**Screen (`deal-overrides`, collapsed under the Offer card as "Adjust for this deal"):** a row per overridable input showing the account value, an input, a required reason, and after saving: `override-{field}` with "Loosens your account rule" (amber) or "Tightens your account rule" (neutral), the reason, and "Remove". Footer: "This changes this deal only. Your business economics are not changed."

- [ ] **Step 1: Failing unit test.** Asserts: a cost override changes the leader's contribution by exactly the difference; the account store is byte-identical before and after; the direction is recorded; a missing reason is refused; an unsent draft becomes stale; removing the override restores the original `effectiveHash` and, when economics match the recording again, the recorded evidence reappears; an override at `sent` is refused.
- [ ] **Step 2–5:** red, implement, browser test for the form, green, commit `feat: deal-specific input overrides with a reason and a direction`.

### Task 6.2: Failed-rule exceptions

**Files:** Modify `lib/service.ts` (`makeCounterOffer`), `lib/deal-records.ts` (`CounterOffer.override.reason`, `.negativeContributionConfirmed`), `components/track/counter-form.tsx`, `lib/audit.ts`, `components/audit/sections.tsx`. Tests `tests/lib/counter-offer-service.test.ts`, `tests/lib/audit.test.ts`.

**Changes:**
- `makeCounterOffer(totalPaise, overrideConfirmed, acknowledgedChecks, reason, typedConfirmation?)`. A failing counter needs a `reason` (5–300 characters).
- When the evaluated net contribution is below zero, `typedConfirmation` must equal exactly `SELL AT A LOSS`; the form shows the field (`counter-loss-confirm`) with "This amount is below your direct costs. Type SELL AT A LOSS to continue."
- The audit gains a section "Merchant exceptions and overrides" (`audit-exceptions`) listing every input override and every failed-rule exception with who, when, the rules, the reason and the economics version.

- [ ] **Steps:** failing tests (reason required; loss needs the exact phrase; the audit lists both kinds separately; the stored engine result still has `approvable: false`), implement, green, commit `feat: reasons and a typed confirmation for failed-rule exceptions, shown in the audit`.

**Phase 6 exit:** all suites green.

---

# Phase 7 — Negotiation corridor

### Task 7.1: The lowest compliant total

**Files:** Create `domain/corridor.ts`. Test `tests/domain/corridor.test.ts`.

**Interfaces:**
- `interface CorridorResult { currentTotalPaise: number; currentPasses: boolean; lowestCompliantPaise: number | null; contiguous: true; evaluations: number; unavailableReason: "evaluation_limit" | null }`
- `lowestCompliantTotal(args: { base: Structure; constraints: BuyerConstraints; engine: EngineInput }): CorridorResult`

**Method:** `passes(total)` = `failingCounterChecks(evaluateStructure(counterStructure(base, total, gst), constraints, engine)).length === 0`. If the current offer does not pass every rule, return `lowestCompliantPaise: null`. Otherwise scan down from the current total in ₹100 steps while `passes`, stopping at the first failure or at ₹1; then scan up from the failing step in ₹1 steps to the first passing total. Cap at 6,000 evaluations. Reaching the cap returns `{ lowestCompliantPaise: null, unavailableReason: "evaluation_limit" }`; it never throws into the page and never authorises a counter. The result is otherwise the lowest total in the contiguous passing range that starts at the current offer.

- [ ] **Step 1: Failing test.** With version 1 (no discount): `lowestCompliantPaise === currentTotalPaise`. With a 10% ceiling: the result is within ₹1 of `currentTotal × 0.9` rounded by the engine's own rule, `passes(result)` is true and `passes(result − 100)` is false (100 paise is one rupee, the search precision). With a contribution floor that binds before the ceiling: the result is the floor-bound total and the failing rule one rupee lower is `seller_contribution`. Property over `SEEDS`: whenever `lowestCompliantPaise` is non-null, it passes and one rupee lower fails. A deliberately wide corridor reaches the cap, returns `unavailableReason: "evaluation_limit"`, and does not throw.
- [ ] **Step 2–5:** red, implement, green, commit `feat: lowest compliant total by bounded engine evaluation`.

### Task 7.2: Corridor data in the service

**Files:** Modify `lib/service.ts`, `app/api/actions/route.ts`. Test `tests/lib/corridor-service.test.ts`.

**Interfaces:**
- `interface CorridorView { requestedTotalPaise: number | null; gstBasis: "including" | "excluding" | null; check: CounterCheck | null; lowestCompliantPaise: number | null; ladder: { discountBps: number; totalPaise: number; contributionPaise: number; passes: boolean; structureId: string }[]; scopeAlternatives: string[]; timingAlternatives: string[] }`
- `corridorFor(args: { requestedPaise?: number; gstBasis?: "including" | "excluding" }): Promise<CorridorView>` (read only; same preconditions as `checkCounterOffer`: status `sent`, an open request with topic `price`)
- A request entered "excluding GST" is converted with `lineWithGst` before checking; the view states the including-GST total it used.
- `ladder`: the evaluated offers with the same offer type, scope and payment plan as the sent offer at each approved ladder level, ordered by the deal's strategy with lower discount first on ties.
- `scopeAlternatives` / `timingAlternatives`: ids from `strategyViewOf(...)` (undiscounted, feasible) whose scope is smaller, or whose scope is equal with different payment dates.

- [ ] **Steps:** failing test, implement, green, commit `feat: corridor data for a buyer's price request`. The test asserts: under version 1 the ladder has one 0% row and the lowest compliant total equals the current offer; with the illustrative version 2 activated **before** the case starts (a sent deal cannot be re-evaluated), the ladder has 0%, 5% and 10% rows; a request of ₹40,000 excluding GST is checked as ₹47,200 including GST, which is above the current ₹46,020 offer and is refused as not lower; a request with topic `date` is refused.

### Task 7.3: The corridor panel

**Files:** Create `components/track/negotiation-corridor.tsx` (wraps and extends `counter-form.tsx`). Modify `app/deals/[dealId]/track/page.tsx`.

**Contract (`negotiation-corridor`, shown only for a price request on a sent, unaccepted proposal):**
- "The buyer asked for a lower price." then the amount input and a required GST-basis choice (`corridor-basis-including`, `corridor-basis-excluding`): "Does the buyer's amount include GST?"
- After "Check this amount": `corridor-contribution` "You would keep about ₹…", `corridor-rules` (passed and failed, each named), `corridor-lowest` "Lowest total that meets every rule for this scope: ₹…" or "No lower total meets every rule." 
- When `unavailableReason === "evaluation_limit"`, `corridor-lowest` reads "We couldn’t calculate a safe lower limit automatically. Review the amount manually." No automatic counter action is enabled from that result.
- `corridor-ladder`: "Discounts your business economics permit" with one row per level and "Offer this" on passing rows. Under version 1 it reads "Your business economics permit no discount."
- `corridor-alternatives`: "Other ways to lower the buyer's payment" listing scope and timing alternatives with "Offer this".
- The existing override and "Prepare counter-offer" controls follow, unchanged in behaviour except Task 6.2.
- A line at the foot: "The buyer sees only the offer you choose. Your limits are never sent."

- [ ] **Step 1: Failing browser tests** (`e2e/economics.spec.ts`): with the illustrative version 2 active before the case starts, a price request shows three ladder rows and a lowest compliant total below the current offer; choosing the 5% row prepares a counter-offer that passes with no override; the buyer's version 2 page contains none of: "contribution", "floor", "lowest", "cash exposure", the merchant's cost. With version 1 the panel reads "Your business economics permit no discount." At 390px there is no horizontal scroll.
- [ ] **Step 2–5:** red, build, green, commit `feat: negotiation corridor on a buyer's price request`.

### Task 7.4: The illustrative version 2 for the demo

**Files:** Modify `app/economics/page.tsx` (a labelled preset), `lib/demo-steps.ts` only if the guide names it, `DEMO_SCRIPT.md`.

- A button `economics-illustrative-preset`: "Load illustrative example: 10% maximum discount with 0%, 5%, 10% approved". It fills the **draft** only. Activation still goes through "Review changes". The version is labelled "Illustrative" in `economics-version` and in the audit.
- The demo uses it only if the review step shows at least one feasible offer on the open demo deal; if not, the script says to skip it.
- The Buildathon walkthrough visibly guides this sequence: open Business economics; load the illustrative ladder; have the merchant review and activate it; start a fresh deal under that version; simulate a buyer price request; show the corridor and let the merchant choose the counter. The walkthrough may navigate and instruct, but it never activates economics or sends an offer for the merchant.

- [ ] **Steps:** browser test (preset fills the draft, review shows it valid, activation labels it Illustrative, the Offer screen's recommendation does not change, the corridor shows the ladder), implement, commit `feat: illustrative economics preset for the negotiation demo`.

**Phase 7 exit:** unit and browser suites green; `npm run check:release -- --build` passes; protected-file check prints `0`; no key in the repository; screenshots regenerated under a new prefix and looked at.

---

# Gate: deterministic product review

Stop here. Report:

1. Exact counts for unit and browser tests, typecheck, lint (whole output), release check, protected-file diff.
2. The list of existing assertions that were changed and why (spec section 12).
3. Any property-test seed that failed and what it showed.
4. Screens looked at by eye, and screens only covered by tests.
5. What the demo now shows for each of the three cases under each strategy.

This is a deterministic checkpoint, not the final AI scope. No AI task (`profile_extract.v1`, `strategy_narrative.v1`, `negotiation_message.v1`), no prompt and no model call begins until this review is approved and a pre-registered evaluation plan with a call budget is approved separately. After that approval, those three tasks are the next planned workstream.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| 4.1 economics, hash, validation | 1.1, 1.2, 1.3 |
| 4.2 baseline and price snapshot | 2.1 |
| 4.3 deal economics, effective hash | 2.2, 2.3 |
| 4.4 references, fingerprint | 2.6 |
| 5 engine inputs, decision 27 closure | 2.2 |
| 3.6 no fixture reads | 2.4 |
| 6 derived decisions, questions | 2.5 |
| 7 strategies, facts, discount rule | 3.2, 3.3 |
| 8.1 input overrides | 6.1 |
| 8.2 exceptions, negative contribution | 6.2 |
| 9 re-evaluation | 2.7, 4.2 |
| 10.1 page, decision 30 store | 1.3, 4.1, 4.2, 7.4 |
| 10.2 Offer | 5.2 |
| 10.3 corridor | 7.1, 7.2, 7.3 |
| 12 ranking replacement | 3.3, 5.1, 5.3 |
| 13 property and integrity tests | 2.2, 2.5, 2.6, 3.2, 7.1 |
| 11 AI tasks | Out of this plan by decision 18 |

**Gaps found and closed while writing**

1. The spec did not say when re-evaluation, overrides and a strategy change are allowed. This plan allows them only before a proposal is live, and says so in Tasks 2.7, 3.3 and 6.1. A sent or accepted version keeps its economics.
2. `recordAnswers` would have continued a recorded run under changed economics. Task 2.5 routes it to a derived decision.
3. The corridor needs a discount ladder, but a sent deal cannot be re-evaluated. Task 7.2 and 7.3 therefore activate the illustrative version before the case starts. The demo script must follow that order.
4. A selection must record whether the merchant made it, for the "explicit selection survives" rule. Task 3.3 adds `SelectedOption.explicit` with a migration.
5. `toPaise` is shared between the counter form and the economics page. Task 4.2 moves it to one place.
6. The spec says a new deal pins the active version, and also that standard prices never reach an existing deal. The three demo cases are existing deals with a stated quote, so starting one must not re-quote it. Task 2.3 takes the price snapshot from the case's own quote and only the costs, guardrails, ladder and flags from the active version.

**Known limits of this plan**

- Tasks 1.1 to 3.2 and 7.1 give complete code or complete tests. Screen tasks (4.2, 5.2, 6.1, 7.3) fix the contract, the exact copy and the browser assertions, and follow the existing component patterns named in each task; they do not reproduce every line of JSX.
- The fixture values and offer ids used in the tests were checked against `data/synthetic/hero.ts` and the committed recordings on `4a73973`.

**Type consistency:** `StrategyId` is declared once in `domain/strategy-id.ts` (Task 2.2) and imported by `lib/deal-economics.ts` and `domain/strategy.ts`, so `domain/` never imports from `lib/`. `EconomicsRef` (Task 2.6) is the only shape used on agreements, amendments and counter-offers. `effectiveHashOf` takes an `EngineInput` everywhere.
