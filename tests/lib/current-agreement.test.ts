import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CurrentAgreement } from "@/components/track/current-agreement";
import { createAgreementVersion, type AgreementVersion } from "@/domain/agreement";
import { FixedClock } from "@/domain/clock";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate } from "@/domain/engine";
import { heroBuyer, heroMerchant, heroPackages, HERO_DEAL_ID } from "@/data/synthetic/hero";
import { currentAgreementSummary } from "@/lib/current-agreement";
import type { ContractFinancialView } from "@/lib/financial-view";
import type { DealProgress } from "@/lib/progress";
import { clarifiedHeroProfile, heroInput } from "../helpers";

const options = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible;
const phase = options.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!;
const annual = options.find((x) => x.structure.scopeKind === "full" && x.structure.template === "split_payment")!;
const deferred = options.find((x) => x.structure.template === "deferred_start")!;
const version = (evaluated: (typeof options)[number], status: AgreementVersion["status"], n = 1): AgreementVersion => {
  const v = createAgreementVersion({ agreementId: "agr", version: n, evaluated, dealId: HERO_DEAL_ID, merchantId: heroMerchant.id, buyerId: heroBuyer.id, policy: heroMerchant.policy, clock: new FixedClock(), supersedes: n > 1 ? n - 1 : null });
  return { ...v, status, buyerAcceptance: ["accepted", "active", "superseded"].includes(status) ? { by: "buyer", at: v.createdAt, termsHash: v.termsHash, authorityConfirmed: true } : null };
};
const progress = (headline = "Up to date · next payment ₹23,010 on 1 Dec 2026."): DealProgress => ({ stage: "track", stages: { understand: "done", offer: "done", track: "current" }, kind: "informational", actor: null, headline, primaryAction: null, blockingReason: null, version: 1, rule: "track.next_payment" });
const financial = (state: ContractFinancialView["state"], remainingPaise: number | null, nextDueDate = "2026-12-01"): ContractFinancialView => ({
  state,
  stateLabel: state,
  contractTotalPaise: 4_602_000,
  contractPrePaise: 3_900_000,
  contractGstPaise: 702_000,
  collectedPaise: remainingPaise === null ? 0 : 4_602_000 - remainingPaise,
  collectedPrePaise: 0,
  collectedGstPaise: 0,
  remainingPaise,
  remainingPrePaise: remainingPaise,
  remainingGstPaise: 0,
  nextPayment: remainingPaise ? { amountPaise: remainingPaise, dueDate: nextDueDate, status: "scheduled" } : null,
  windowedCollectedPaise: 0,
  cutoff: "2026-11-01T10:00:00+05:30",
  windowEnded: false,
  windowExplanation: "",
});
const summarize = (agreements: AgreementVersion[], state: ContractFinancialView["state"] = "accepted", remaining: number | null = 2_301_000, nextDueDate = "2026-12-01") =>
  currentAgreementSummary({ agreements, packages: heroPackages, financial: financial(state, remaining, nextDueDate), progress: progress(), paymentSetup: { upfront: "paid", mandate: "confirmed" } });

describe("current agreement summary", () => {
  it("describes proposed and accepted phase scope without calling it an annual contract", () => {
    const proposed = summarize([version(phase, "sent")], "proposed", null)!;
    expect(proposed.title).toBe("Standalone three-month package");
    expect(proposed.kind).toBe("proposed");
    expect(proposed.title).not.toMatch(/annual/i);
    const accepted = summarize([version(phase, "active")])!;
    expect(accepted.included).toEqual(["Website fixes · one-time in Nov 2026", "Search marketing · Nov 2026–Jan 2027", "Monthly reporting · Nov 2026–Jan 2027"]);
    expect(accepted.excluded).toContain("Social media");
    expect(accepted.laterWorkStatement).toBe("Nothing beyond this is promised.");
  });

  it("uses the active v2 payment facts while retaining the Nov–Jan service period", () => {
    const v1 = version(phase, "superseded");
    const v2 = { ...version(phase, "active", 2), terms: { ...version(phase, "active", 2).terms, paymentSchedule: version(phase, "active", 2).terms.paymentSchedule.map((p, i) => (i === 1 ? { ...p, dueDate: { value: "2026-12-21", precision: "day" as const } } : p)) } };
    const s = summarize([v1, v2], "accepted", 2_301_000, "2026-12-21")!;
    expect(s.version).toBe(2);
    expect(s.financial.nextPayment?.dueDate).toBe("2026-12-21");
    expect(s.servicePeriod).toBe("Nov 2026–Jan 2027");
  });

  it("keeps paid agreements active without claiming delivery is complete", () => {
    const phasePaid = summarize([version(phase, "active")], "accepted", 0)!;
    const annualPaid = summarize([version(annual, "active")], "accepted", 0)!;
    for (const s of [phasePaid, annualPaid]) {
      expect(s.readiness).toContain("First payment paid");
      expect(s.readiness).not.toMatch(/delivery complete/i);
    }
  });

  it("names full annual and deferred annual structures accurately", () => {
    expect(summarize([version(annual, "active")])!.title).toBe("Annual digital marketing agreement");
    expect(summarize([version(deferred, "active")])!.title).toMatch(/^Annual digital marketing from May 2027/);
  });

  it("distinguishes decline and payment setup readiness", () => {
    const declined = summarize([version(phase, "buyer_rejected")], "declined", null)!;
    expect(declined.kind).toBe("declined");
    expect(declined.readiness).toContain("Nothing was set up");
    const pending = currentAgreementSummary({ agreements: [version(phase, "active")], packages: heroPackages, financial: financial("accepted", 4_602_000), progress: progress("Buyer accepted. Waiting for setup."), paymentSetup: { upfront: "pending", mandate: "pending" } })!;
    expect(pending.readiness).toContain("First payment not paid yet");
    expect(pending.readiness).toContain("automatic payments not set up yet");
  });

  it("never chooses a superseded version as the current agreement", () => {
    expect(currentAgreementSummary({ agreements: [version(phase, "superseded")], packages: heroPackages, financial: financial("accepted", 0), progress: progress(), paymentSetup: { upfront: "paid", mandate: "confirmed" } })).toBeNull();
  });

  it("keeps the active agreement current while a revision awaits acceptance", () => {
    const current = version(phase, "active");
    const proposedRevision = version(annual, "sent", 2);
    const s = summarize([current, proposedRevision])!;
    expect(s.version).toBe(1);
    expect(s.title).toBe("Standalone three-month package");
  });

  it("uses agreement language only for accepted terms", () => {
    const proposed = summarize([version(phase, "sent")], "proposed", null)!;
    const accepted = summarize([version(phase, "active")])!;
    const declined = summarize([version(phase, "buyer_rejected")], "declined", null)!;

    const proposedHtml = renderToStaticMarkup(CurrentAgreement({ summary: proposed }));
    expect(proposedHtml).toContain("Your offer");
    expect(proposedHtml).toContain("What&#x27;s included");
    expect(proposedHtml).not.toContain("Agreed deal");

    const acceptedHtml = renderToStaticMarkup(CurrentAgreement({ summary: accepted }));
    expect(acceptedHtml).toContain("Agreed deal");
    expect(acceptedHtml).toContain("What&#x27;s included");

    const declinedHtml = renderToStaticMarkup(CurrentAgreement({ summary: declined }));
    expect(declinedHtml).toContain("Declined offer");
    expect(declinedHtml).toContain("What was offered");
    expect(declinedHtml).not.toContain("Agreed deal");
  });
});
