import { readFileSync } from "node:fs";
// Data directory is set inside the store-reading test before any dynamic import (see test-isolation).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RunRecord } from "@/ai/run-record";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";
import { appliedRules, auditSources, branchAudit, executionPipeline, modelHeader, whoDidWhat } from "@/lib/audit";
import type { DecisionBranch } from "@/lib/decision-branch";
import { modelProvenance } from "@/lib/model-provenance";
import { scopeAttribution } from "@/lib/scope-confirmation";
import { evaluateDeal } from "@/domain/engine";
import { clarifiedHeroProfile, heroInput } from "../helpers";

/** Spec §8.3: truthful sources, run-specific attribution, read-only. */
const run = JSON.parse(readFileSync("data/live-runs/run-live-3f518779.json", "utf8")) as RunRecord;
const baseState = {
  conversation: [{ kind: "clarification", state: "approved_and_sent_by_merchant", direction: "outbound" }],
  agreements: [{ version: 1, merchantApproval: { by: "Merchant", at: "t" }, buyerAcceptance: { by: "Buyer", at: "t" }, status: "active" }],
  attempts: [{ status: "succeeded", method: "payment_link" }],
  outcomes: [],
  interpretations: [{ messageId: "conv-3", questionId: "clar-gst", value: "yes", quote: "with gst", actor: "merchant", at: "t" }],
  handledMessages: [],
  decisionBranch: null,
};
const state = baseState as never;
const groq = modelProvenance(run);
const sampleRun = JSON.parse(readFileSync("data/synthetic/replay/reduced-scope-synthetic-run.json", "utf8")) as RunRecord;
const sample = modelProvenance(sampleRun);

const branch: DecisionBranch = {
  schema: "adaptive-deals.decision-branch.v1",
  branchId: "branch-changed",
  parentRunId: run.runId,
  createdAt: "2026-10-01T09:30:00+05:30",
  answers: [
    { questionId: "clar-gst", value: "no", answerText: "No, both exclude GST.", recordedBy: "Merchant", confirmedByBuyerVia: "whatsapp", answeredAt: "2026-10-01T09:20:00+05:30" },
    { questionId: "clar-approval", value: "per_payment", answerText: "₹60,000 is per payment.", recordedBy: "Merchant", confirmedByBuyerVia: "whatsapp", answeredAt: "2026-10-01T09:22:00+05:30" },
  ],
  reason: "changed_clarification_answers",
  explanationSource: "code_fallback",
};
const branchedState = { ...baseState, decisionBranch: branch } as never;

describe("audit sources", () => {
  const src = auditSources(state, run, "replay", heroPackages);
  it("labels each source truthfully", () => {
    expect(src.find((x) => x.item === "Original annual proposal")!.source).toBe("Synthetic deal fixture");
    expect(src.find((x) => x.item === "Merchant costs and rules")!.source).toBe("Synthetic deal fixture");
    // A deal that carries its own economics says which version, and any overrides, instead.
    const withEconomics = auditSources({ ...baseState, economics: { pinned: { version: 2, hash: "h" }, overrides: [{}, {}], strategy: "protect_contribution", effectiveHash: "e" } } as never, sampleRun, "replay", heroPackages);
    expect(withEconomics.find((x) => x.item === "Merchant costs and rules")!.source).toBe("Your prices & costs, version 2, with 2 deal overrides · synthetic demo data");
    expect(src.find((x) => x.item === "Budget available now")!.source).toBe("Simulated WhatsApp conversation");
    expect(src.find((x) => x.item === "Amounts include GST (confirmation)")!.source).toBe("Clarification message");
    expect(src.find((x) => x.item === "Payment state")!.source).toBe("Simulated payment record");
    expect(src.find((x) => x.item.startsWith("Interpretation of conv-3"))!.source).toBe("Merchant interpretation of buyer message");
    expect(src.find((x) => x.item === "Offer figures and checks")!.source).toBe("Deterministic calculation from configured inputs");
    expect(src.find((x) => x.item === "Constraint extraction")!.source).toBe(`Recorded Groq output · run ${run.runId} · extract.v2`);
  });
  it("never labels a hand-written sample as an AI run", () => {
    const sampleSources = auditSources(state, sampleRun, "replay", heroPackages);
    for (const item of ["Constraint extraction", "Clarification wording", "Recorded option order and reasons (not used for the recommendation)"]) {
      expect(sampleSources.find((x) => x.item === item)!.source).toBe(`Sample output written by hand · no model ran · run ${sampleRun.runId}`);
    }
    expect(sampleSources.map((x) => `${x.source} ${x.detail ?? ""}`).join(" ")).not.toMatch(/\bAI\b|Groq/);
    const branched = auditSources(branchedState, sampleRun, "replay", heroPackages);
    expect(branched.find((x) => x.item === "Parent option order and reasons")).toMatchObject({
      source: `Parent sample output ${sampleRun.runId} · context only`,
      detail: "The hand-written parent sample did not cover the changed answers and its recommendation output was not used for this branch.",
    });
  });
});

describe("who did what", () => {
  it("credits code, not AI, when AI prose failed validation", () => {
    const w = whoDidWhat(run, { ranking: "ai", text: "code_fallback" }, state);
    expect(w.ai).toContain("Suggested an order of eligible options (explain.v3) · historical, not used for the recommendation");
    expect(w.ai.join(" ")).not.toMatch(/wrote the recommendation explanation/i);
    expect(w.code).toContain("Wrote the recommendation explanation, because the AI wording did not pass validation");
    expect(w.code).toContain("Read only the narrow supported payment-date reply (reply-rules.v1)");
    expect(w.merchant).toContain("Interpreted 1 buyer reply (merchant judgement)");
  });
  it("credits AI with the explanation only when its prose was used", () => {
    const w = whoDidWhat(run, { ranking: "ai", text: "ai" }, state);
    expect(w.ai).toContain("Wrote a recommendation explanation (explain.v3) · historical, not the reason now shown");
    expect(w.code.join(" ")).not.toMatch(/did not pass validation/);
  });
  it("credits validated per-offer reasons to AI and the failed comparison to code", () => {
    const w = whoDidWhat(run, { ranking: "ai", text: "code_fallback" }, state, "replay", 4);
    expect(w.ai).toContain("Wrote 4 per-offer reasons that passed validation (explain.v3)");
    expect(w.ai.join(" ")).not.toMatch(/wrote the recommendation explanation/i);
    expect(w.code).toContain("Wrote the full comparison, because the AI comparison did not pass validation");
    expect(whoDidWhat(run, { ranking: "ai", text: "code_fallback" }, state, "replay", 1).ai).toContain("Wrote 1 per-offer reason that passed validation (explain.v3)");
    // No validated note: code wrote the whole explanation, as before.
    expect(whoDidWhat(run, { ranking: "ai", text: "code_fallback" }, state, "replay", 0).code).toContain("Wrote the recommendation explanation, because the AI wording did not pass validation");
    // A hand-written sample's notes are listed under the sample heading, never under AI.
    const s = whoDidWhat(sampleRun, { ranking: "ai", text: "code_fallback" }, state, "replay", 2);
    expect(s.ai).toEqual([]);
    expect(s.sample).toContain("Per-offer reasons");
  });
  it("attributes a branch to the engine and code, never to the parent AI explanation", () => {
    const w = whoDidWhat(run, { ranking: "code", text: "code_fallback" }, branchedState);
    expect(w.ai.join(" ")).not.toMatch(/order|recommendation explanation/i);
    expect(w.code.join(" ")).toMatch(/recalculated every permitted offer/i);
    expect(w.code.join(" ")).toMatch(/wrote the recommendation explanation/i);
    expect(`${w.ai.join(" ")} ${w.code.join(" ")}`).not.toMatch(/AI ranked|AI explained/i);
  });
  it("lists hand-written sample outputs under their own heading, never under AI", () => {
    const w = whoDidWhat(sampleRun, { ranking: "ai", text: "ai" }, state);
    expect(w.ai).toEqual([]);
    expect(w.sample).toEqual(["Constraint extraction", "Clarification question wording", "Order of eligible options · historical, not used for the recommendation", "Recommendation explanation · historical, not the reason now shown"]);
    expect(w.code.join(" ")).not.toMatch(/\bAI\b/);
    const fallback = whoDidWhat(sampleRun, { ranking: "ai", text: "code_fallback" }, state);
    expect(fallback.sample).not.toContain("Recommendation explanation · historical, not the reason now shown");
    expect(fallback.code).toContain("Wrote the recommendation explanation, because the sample wording did not pass validation");
  });
  it("splits a mixed run step by step", () => {
    const mixedRun = { ...run, steps: run.steps.map((step) => (step.task === "explain" ? { ...step, provider: "synthetic_replay" } : step)) } as RunRecord;
    const w = whoDidWhat(mixedRun, { ranking: "ai", text: "ai" }, state);
    expect(w.ai).toEqual(["Extracted the opening constraints (extract.v2)", "Drafted the clarification questions (clarify.v1)"]);
    expect(w.aiLabel).toBe("Recorded Groq output");
    expect(w.sample).toEqual(["Order of eligible options · historical, not used for the recommendation", "Recommendation explanation · historical, not the reason now shown"]);
    const sources = auditSources(state, mixedRun, "replay", heroPackages);
    expect(sources.find((x) => x.item === "Constraint extraction")!.source).toBe(`Recorded Groq output · run ${run.runId} · extract.v2`);
    expect(sources.find((x) => x.item === "Recorded option order and reasons (not used for the recommendation)")!.source).toBe(`Sample output written by hand · no model ran · run ${run.runId}`);
  });
  it("keeps recorded model work out of the sample heading", () => {
    expect(whoDidWhat(run, { ranking: "ai", text: "ai" }, state).aiLabel).toBe("Recorded Groq output");
    expect(whoDidWhat(sampleRun, { ranking: "ai", text: "ai" }, state).aiLabel).toBeNull();
    expect(whoDidWhat(run, { ranking: "ai", text: "ai" }, state).sample).toEqual([]);
  });
});

describe("decision branch audit", () => {
  it("records parent and branch IDs, changed evidence, engine fingerprint and explanation source", async () => {
    const svc = await import("@/lib/service");
    const seeded = await svc.seedState(run, "replay");
    const out = await svc.initialOutcomeForBranch(seeded);
    const derived = (await import("@/lib/decision-branch")).deriveBranchOutcome({ initial: out, branch, deal: (await import("@/data/synthetic/hero-run")).heroDeal() });
    const audit = branchAudit(branchedState, derived, groq);
    expect(audit).toMatchObject({ parentRunId: run.runId, branchId: "branch-changed", explanationSource: "code_fallback" });
    expect(audit?.answers.map((answer) => [answer.questionId, answer.value, answer.answerText])).toEqual([
      ["clar-gst", "no", "No, both exclude GST."],
      ["clar-approval", "per_payment", "₹60,000 is per payment."],
    ]);
    expect(audit?.engineFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(audit?.notice).toMatch(/parent model run did not process the changed answers/i);
    expect(branchAudit(branchedState, derived, sample)?.notice).toBe("The hand-written parent sample did not cover the changed answers. The engine recalculated the decision and code wrote the explanation.");
  });
});

describe("applied rules", () => {
  it("come from configuration, with every binding rule present", () => {
    const rules = appliedRules(heroMerchant.policy, heroTemplates, heroPackages);
    expect(rules.map((r) => r.id)).toEqual(["contribution_floor", "cash_at_risk", "templates", "max_tenure", "smallest_instalment", "discount", "package_rules"]);
    expect(rules.find((r) => r.id === "cash_at_risk")!.value).toBe("₹10,000");
  });
});

describe("audit drawer content is read-only", () => {
  it("contains no forms, buttons or action endpoints, on a real deal state", async () => {
    const { mkdtempSync } = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-audit-"));
    process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic"; // pinned to the labelled hand-written sample: this suite asserts that run
    // The pure audit imports may have loaded the store already. Re-import it only
    // after choosing the isolated test directory, never the merchant's demo store.
    vi.resetModules();
    const svc = await import("@/lib/service");
    const { driveTo } = await import("../helpers/drive");
    await svc.resetToSeed();
    const s = await driveTo(svc, (x) => x.amendments.at(-1)?.state === "active");
    const out = await svc.currentOutcome(s);
    const { AuditSections } = await import("@/components/audit/sections");
    const html = renderToStaticMarkup(AuditSections({ s, out, deal: { dealId: s.dealId, messages: s.run.record.inputs.messages, merchant: heroMerchant, packages: heroPackages, templates: heroTemplates } }));
    // Read-only: no forms or action endpoints. The only buttons are the quiet copy-to-clipboard controls.
    expect(html).not.toMatch(/<form|\/api\/actions|data-action=/);
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.every((tag) => tag.includes('data-testid="copy-button"'))).toBe(true);
    for (const h of ["Evidence", "Applied merchant rules", "Approval and acceptance history", "Calculation provenance", "System execution pipeline", "Schedules"]) expect(html).toContain(h);
    expect(html).toContain("Simulated WhatsApp conversation");
    // The default case runs on a hand-written sample: the drawer must say so and credit no model.
    expect(modelProvenance(s.run.record).modelMade).toBe(false);
    expect(html).toContain("Sample output written by hand · no model ran");
    expect(html).toContain("No model ran for this case.");
    expect(html).not.toMatch(/AI run|Recorded Groq output|Suggested the order|Suggested an order|Extracted the opening constraints/);
  });
});

/** A recorded Groq run whose required scope ("complete annual package") matched no package. */
describe("an unmapped required scope and the merchant's confirmation", () => {
  const phrase = "complete annual package";
  const quote = "We need the complete annual package—Website fixes, Search marketing, Social media and Monthly reporting—for the admissions launch";
  const recorded = {
    ...run,
    runId: "run-case-preserve-scope-0a1b2c3d",
    inputs: { ...run.inputs, messages: [{ id: "preserve-2", dealId: "d", author: "buyer", text: `${quote}. Please do not reduce the scope.`, timestamp: "2026-10-01T09:00:00+05:30", source: "whatsapp" }] },
    engine: { ...run.engine, rejectedFields: [{ key: "required_package", reason: "does not match a deal package", rawText: phrase }] },
    steps: run.steps.map((step) => (step.task === "extract" ? { ...step, inputHash: "abc123", rawOutput: { fields: [{ key: "required_package", raw_text: phrase, evidence_quote: quote, message_id: "preserve-2", confidence: "high" }] } } : step)),
  } as RunRecord;
  const scope = { kind: "required_services" as const, packageIds: ["website-fixes", "search-marketing", "social-media", "monthly-reporting"], confirmedAt: "2026-10-01T09:05:00+05:30", by: "Merchant (Pinecone Media Works)", sources: [{ rawText: phrase, evidenceQuote: quote, messageId: "preserve-2", extractInputHash: "abc123" }] };
  const confirmed = { ...baseState, decisionBranch: { schema: "adaptive-deals.decision-branch.v1", branchId: "b", parentRunId: recorded.runId, createdAt: "t", answers: [], reason: "merchant_scope_confirmation", answersChanged: false, scope, explanationSource: "code_fallback" } } as never;

  it("shows the unmapped phrase as the model's own output, with its evidence", () => {
    const row = auditSources(state, recorded, "replay", heroPackages).find((x) => x.item === "Required services (unmapped phrase)")!;
    expect(row.source).toBe(`Recorded Groq output · run ${recorded.runId} · extract.v2`);
    expect(row.detail).toBe(`“${phrase}” matched no package in this deal · evidence “${quote}” (preserve-2)`);
  });

  it("shows nothing for a run whose required services all mapped", () => {
    expect(auditSources(state, run, "replay", heroPackages).some((x) => x.item.startsWith("Required services"))).toBe(false);
  });

  it("records the merchant's confirmation, who made it and which phrase it answers", () => {
    const row = auditSources(confirmed, recorded, "replay", heroPackages).find((x) => x.item === "Required services (merchant confirmation)")!;
    expect(row.source).toBe("Merchant confirmation of an unmapped extraction");
    expect(row.detail).toBe(`“${phrase}” → Website fixes, Search marketing, Social media, Monthly reporting · Merchant (Pinecone Media Works) · ${scope.confirmedAt}`);
  });

  it("credits Groq with the phrase, the merchant with the services, and code with the recalculation", () => {
    const w = whoDidWhat(recorded, { ranking: "code", text: "code_fallback" }, confirmed);
    expect(w.ai).toContain("Extracted the opening constraints (extract.v2)");
    expect(w.merchant).toContain("Confirmed the required services (4 services)");
    expect(w.code).toContain("Recalculated every permitted offer and every figure after the merchant confirmed the required services");
    expect(w.code).toContain("Wrote the recommendation explanation because the parent model did not process the merchant-confirmed services");
    expect(w.ai.join(" ")).not.toMatch(/order|recommendation/i);
  });

  it("explains the branch as a recalculation from the confirmation", () => {
    const outcome = { evaluation: evaluateDeal(clarifiedHeroProfile(), heroInput()) } as never;
    const audit = branchAudit(confirmed, outcome, groq)!;
    expect(audit.notice).toBe("The parent model run did not process the merchant-confirmed services. The engine recalculated the decision and code wrote the explanation.");
    expect(audit.answers).toEqual([]);
    expect(audit.scope?.packageIds).toHaveLength(4);
    expect(branchAudit(confirmed, outcome, sample)!.notice).toBe("The hand-written parent sample did not cover the merchant-confirmed services. The engine recalculated the decision and code wrote the explanation.");
  });

  it("states what the confirmation did, in one plain line", () => {
    expect(scopeAttribution(groq)).toBe("Groq extracted the phrase · merchant confirmed the services · engine recalculated the options.");
    expect(scopeAttribution(sample)).toBe("Phrase from the hand-written sample extraction · merchant confirmed the services · engine recalculated the options.");
    expect(scopeAttribution(modelProvenance({ ...run, steps: [] }))).not.toMatch(/Groq/);
  });
});


describe("the system execution pipeline", () => {
  it("states the model once, from the run's own steps", () => {
    expect(modelHeader(run)).toMatchObject({ kind: "single", label: "Recorded Groq output" });
    expect(modelHeader(run).detail).toMatch(/^groq \/ /);
    expect(modelHeader(run, "fresh").label).toBe("Live Groq output");
    expect(modelHeader(sampleRun)).toEqual({ kind: "sample", label: "Sample output written by hand · no model ran", detail: null });
    const mixed = { ...run, steps: run.steps.map((step) => (step.task === "explain" ? { ...step, provider: "synthetic_replay" } : step)) } as RunRecord;
    expect(modelHeader(mixed).kind).toBe("mixed");
    expect(modelHeader({ ...run, steps: [] } as RunRecord).kind).toBe("none");
  });

  it("lists the work in the order it happens, in the AI lane, the rules engine's lane or the people's", () => {
    const steps = executionPipeline(whoDidWhat(run, { ranking: "ai", text: "ai" }, state));
    expect(steps[0]).toMatchObject({ lane: "ai", actor: "ai", text: "Extracted the opening constraints (extract.v2)" });
    expect(steps[1]).toMatchObject({ lane: "code", actor: "code" });
    expect(steps[1]!.text).toMatch(/verified every evidence quote/);
    const firstPerson = steps.findIndex((step) => step.lane === "people");
    expect(steps.slice(firstPerson).every((step) => step.lane === "people")).toBe(true);
    expect(steps.some((step) => step.actor === "merchant")).toBe(true);
    expect(steps.some((step) => step.actor === "buyer")).toBe(true);
  });

  it("never puts a hand-written sample in the AI's name", () => {
    const steps = executionPipeline(whoDidWhat(sampleRun, { ranking: "ai", text: "ai" }, state));
    expect(steps.some((step) => step.actor === "ai")).toBe(false);
    expect(steps.filter((step) => step.actor === "sample").length).toBeGreaterThan(0);
  });
});

describe("evidence for the table", () => {
  it("gives the quote and value without offsets, and keeps the offsets for Advanced details", () => {
    const rows = auditSources(state, run, "replay", heroPackages).filter((x) => x.evidence?.length);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.detail).not.toMatch(/chars \d/);
      expect(row.evidence!.every((e) => e.quote.length > 0)).toBe(true);
      expect(row.advanced).toMatch(/chars \d+–\d+/);
    }
  });
});


describe("who reworded a question", () => {
  it("credits the merchant when they changed the words before sending", () => {
    const sentEdited = { kind: "clarification", state: "approved_and_sent_by_merchant", direction: "outbound", refs: { edited: true } };
    const sentPlain = { kind: "clarification", state: "approved_and_sent_by_merchant", direction: "outbound", refs: {} };
    const w = whoDidWhat(run, { ranking: "ai", text: "ai" }, { ...baseState, conversation: [sentEdited, sentPlain] } as never);
    expect(w.merchant).toContain("Sent 2 clarification questions");
    expect(w.merchant).toContain("Reworded 1 of them before sending (the merchant's own words)");
    expect(whoDidWhat(run, { ranking: "ai", text: "ai" }, { ...baseState, conversation: [sentPlain] } as never).merchant.join(" ")).not.toMatch(/Reworded/);
  });
});
