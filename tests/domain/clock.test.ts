import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DEMO_ANCHOR, FixedClock, SimulatedClock } from "@/domain/clock";
import { evaluateDeal } from "@/domain/engine";
import { createAgreementVersion } from "@/domain/agreement";
import { heroBuyer, heroMerchant, HERO_DEAL_ID } from "@/data/synthetic/hero";
import { clarifiedHeroProfile, heroInput } from "../helpers";

describe("injectable clock", () => {
  it("anchors fixtures and demo mode at 2026-10-01 09:00 Asia/Kolkata", () => {
    expect(new FixedClock().now()).toBe(DEMO_ANCHOR);
    expect(DEMO_ANCHOR).toBe("2026-10-01T09:00:00+05:30");
    expect(new SimulatedClock().isSimulated).toBe(false);
  });

  it("gives byte-identical results across repeated runs", () => {
    const run = () => {
      const r = evaluateDeal(clarifiedHeroProfile(), heroInput()).result!;
      const v = createAgreementVersion({ agreementId: "a", version: 1, evaluated: r.feasible[0], dealId: HERO_DEAL_ID, merchantId: heroMerchant.id, buyerId: heroBuyer.id, policy: heroMerchant.policy, clock: new FixedClock() });
      return JSON.stringify({ r, v });
    };
    expect(run()).toBe(run());
  });

  it("replays recorded simulated advances", () => {
    const c = new SimulatedClock();
    c.advanceTo("2026-12-01T10:00:00+05:30", "Simulated date: 2026-12-01");
    const replayed = new SimulatedClock(DEMO_ANCHOR, [...c.advances]);
    expect(replayed.now()).toBe(c.now());
    expect(replayed.isSimulated).toBe(true);
  });

  it("domain code never reads the system clock", () => {
    const dir = path.join(__dirname, "../../domain");
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(path.join(dir, f), "utf8");
      if (/Date\.now\s*\(|new Date\s*\(\s*\)|performance\.now\s*\(|process\.hrtime|Temporal\.Now/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
