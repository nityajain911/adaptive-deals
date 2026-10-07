import { describe, expect, it } from "vitest";
import { migrateState, STORE_SCHEMA_VERSION } from "@/lib/migrate";
import { DEFAULT_CASE_ID } from "@/data/synthetic/cases";

const base = (over: Record<string, unknown> = {}) => ({
  schema: "adaptive-deals.store.v1", dealId: "deal-hero", status: "clarifying",
  statusHistory: [{ at: "2026-10-01T09:00:00+05:30", from: null, to: "stalled", reason: "x" }],
  clockAdvances: [], run: { record: {}, viewing: "replay" }, agreements: [], paymentLinks: [], mandate: null, attempts: [], notices: [],
  extraMessages: [], amendments: [], events: [{ id: "ev-1" }], scenario: null, conversation: [], suggestionsPaused: false, changeRequests: [], ...over,
});
const agreement = (version: number, status: string) => ({ agreementId: "agr-hero", version, structureId: `s${version}`, status, createdAt: "2026-10-01T09:22:00+05:30", terms: {}, termsHash: "h" });
const proposalMsg = (version: number, kind = "proposal") => ({ id: `conv-${version}`, kind, direction: "outbound", author: "code", sentAt: "2026-10-01T09:23:00+05:30", refs: { agreementVersion: version } });

describe("migrateState (spec §9)", () => {
  it("adds defaults and the schema version to a fresh pre-offer store", () => {
    const s = migrateState(base());
    expect(s.schemaVersion).toBe(STORE_SCHEMA_VERSION);
    expect(s.eligibleAt).toBe("2026-10-01T09:00:00+05:30");
    expect([s.selectedOption, s.deliveries, s.outcomes, s.reviewRequired]).toEqual([null, [], [], null]);
    expect(s.workDispositions).toEqual([]);
    expect(s.decisionBranch).toBeNull();
    expect(s.caseId).toBe(DEFAULT_CASE_ID);
  });
  it("gives a store saved before counter-offers an empty list, at the current schema too", () => {
    expect(migrateState(base()).counterOffers).toEqual([]);
    expect(migrateState(base({ schemaVersion: STORE_SCHEMA_VERSION })).counterOffers).toEqual([]);
    const kept = [{ id: "counter-1" }];
    expect(migrateState(base({ schemaVersion: STORE_SCHEMA_VERSION, counterOffers: kept })).counterOffers).toEqual(kept);
  });
  it("requires review when a stored decision branch is incomplete", () => {
    const s = migrateState(base({
      schemaVersion: STORE_SCHEMA_VERSION - 1,
      decisionBranch: {
        schema: "adaptive-deals.decision-branch.v1",
        branchId: "branch-broken",
        parentRunId: "run-parent",
        answers: [],
      },
    }));
    expect(s.decisionBranch).toBeNull();
    expect(s.reviewRequired).toMatch(/decision branch/i);
  });
  describe("a decision branch with a merchant's confirmed services", () => {
    const scope = { kind: "required_services", packageIds: ["website-fixes", "search-marketing"], confirmedAt: "2026-10-01T09:30:00+05:30", by: "Merchant", sources: [{ rawText: "the set", evidenceQuote: "the set", messageId: "m1", extractInputHash: "h" }] };
    const branch = (over: Record<string, unknown> = {}) => ({ schema: "adaptive-deals.decision-branch.v1", branchId: "b", parentRunId: "run-parent", createdAt: "2026-10-01T09:30:00+05:30", answers: [], reason: "merchant_scope_confirmation", answersChanged: false, scope, explanationSource: "code_fallback", ...over });
    it("keeps a valid scope-only branch, which needs no changed answers", () => {
      const s = migrateState(base({ schemaVersion: STORE_SCHEMA_VERSION, decisionBranch: branch() }));
      expect(s.decisionBranch).toMatchObject({ reason: "merchant_scope_confirmation", scope: { packageIds: ["website-fixes", "search-marketing"] } });
      expect(s.reviewRequired).toBeNull();
    });
    it("still reads a branch stored before confirmations existed as an answer branch", () => {
      const answer = { questionId: "clar-gst", value: "no", answerText: "No.", recordedBy: "Merchant", confirmedByBuyerVia: "whatsapp", answeredAt: "2026-10-01T09:20:00+05:30" };
      const legacy = { schema: "adaptive-deals.decision-branch.v1", branchId: "b", parentRunId: "run-parent", createdAt: "t", answers: [answer], reason: "changed_clarification_answers", explanationSource: "code_fallback" };
      expect(migrateState(base({ schemaVersion: STORE_SCHEMA_VERSION, decisionBranch: legacy })).decisionBranch).toMatchObject({ reason: "changed_clarification_answers" });
    });
    it.each([
      ["a scope-only branch with no confirmation", { scope: null }],
      ["a scope-only branch that claims changed answers", { answersChanged: true }],
      ["a confirmation naming no service", { scope: { ...scope, packageIds: [] } }],
      ["a confirmation with no source", { scope: { ...scope, sources: [] } }],
      ["a confirmation without who confirmed", { scope: { ...scope, by: undefined } }],
      ["an answer branch with no answers", { reason: "changed_clarification_answers", answersChanged: true, scope: null, answers: [] }],
    ])("sends %s to review instead of guessing", (_name, over) => {
      const s = migrateState(base({ schemaVersion: STORE_SCHEMA_VERSION, decisionBranch: branch(over) }));
      expect(s.decisionBranch).toBeNull();
      expect(s.reviewRequired).toMatch(/decision branch/i);
    });
  });
  it("adds work dispositions to a schema-2 store without treating handled messages as resolved", () => {
    const handled = [{ messageId: "reply-1", handledAt: "2026-12-01T11:00:00+05:30", actor: "merchant", note: "Called buyer" }];
    const raw = base({
      schemaVersion: 2,
      eligibleAt: "2026-10-01T09:00:00+05:30",
      selectedOption: null,
      deliveries: [],
      outcomes: [],
      handledMessages: handled,
      interpretations: [],
      reviewRequired: null,
    });
    const s = migrateState(raw);
    expect(s.schemaVersion).toBe(STORE_SCHEMA_VERSION);
    expect(s.handledMessages).toEqual(handled);
    expect(s.workDispositions).toEqual([]);
    const snapshot = JSON.stringify(s);
    expect(JSON.stringify(migrateState(JSON.parse(snapshot)))).toBe(snapshot);
  });
  it("infers delivery for a sent, accepted hero state, so it stays in Track", () => {
    const s = migrateState(base({ status: "active", agreements: [agreement(1, "active")], conversation: [proposalMsg(1)] }));
    expect(s.deliveries).toEqual([expect.objectContaining({ version: 1, kind: "proposal", deliveredAt: "2026-10-01T09:23:00+05:30", reference: "conv-1" })]);
    expect(s.selectedOption?.structureId).toBe("s1");
    expect(s.reviewRequired).toBeNull();
  });
  it("infers amendment-version deliveries from the amendment message", () => {
    const s = migrateState(base({ status: "active", agreements: [agreement(1, "superseded"), agreement(2, "active")], conversation: [proposalMsg(1), proposalMsg(2, "amendment")] }));
    expect(s.deliveries.map((d) => [d.version, d.kind])).toEqual([[1, "proposal"], [2, "amendment"]]);
  });
  it("fails safely when a sent version has no delivery evidence", () => {
    const s = migrateState(base({ status: "sent", agreements: [agreement(1, "sent")], conversation: [] }));
    expect(s.deliveries).toEqual([]);
    expect(s.reviewRequired).toMatch(/Version 1 is marked sent but no delivery message is recorded/);
  });
  it("leaves the selection unset when it cannot be inferred unambiguously", () => {
    const s = migrateState(base({ status: "options_ready", agreements: [agreement(1, "draft"), { ...agreement(1, "draft"), structureId: "other" }] }));
    expect(s.selectedOption).toBeNull();
  });
  it("never rewrites history and runs once", () => {
    const raw = base({ status: "active", agreements: [agreement(1, "active")], conversation: [proposalMsg(1)] });
    const events = JSON.stringify(raw.events);
    const once = migrateState(raw);
    expect(JSON.stringify(once.events)).toBe(events);
    const snapshot = JSON.stringify(once);
    expect(JSON.stringify(migrateState(JSON.parse(snapshot)))).toBe(snapshot);
  });
});
