import { beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Whatever the buyer answers to the two questions, the deal is still the one they described: start small with the website and search,
 * leave social media for later, and hold the rest of the year. A service the buyer said can wait is not put into the first offer.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-answers-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("no network"); });
type Svc = typeof import("@/lib/service");
let svc: Svc;
beforeAll(async () => { svc = await import("@/lib/service"); });

const PILOT = "phased_scope:scope=web-search-report-3m,plan=upfront";
const answers: [string, string][] = [
  ["clar-gst-yes", "clar-approval-contract"],
  ["clar-gst-no", "clar-approval-contract"],
  ["clar-gst-yes", "clar-approval-payment"],
  ["clar-gst-no", "clar-approval-payment"],
];

describe("every answer the guide offers leads to the pilot the chat describes", () => {
  it.each(answers)("%s + %s", async (gst, approval) => {
    await svc.resetToSeed();
    await svc.sendQuestions();
    let s = await svc.getState();
    const question = (id: string) => s.conversation.find((i) => i.kind === "clarification" && i.refs.questionId === id)!;
    await svc.buyerReply({ inReplyTo: question("clar-gst").id, scriptId: gst });
    s = await svc.getState();
    await svc.buyerReply({ inReplyTo: question("clar-approval").id, scriptId: approval });
    s = await svc.getState();
    if (s.status === "clarifying") await svc.adoptRepliesAsAnswers();
    s = await svc.getState();
    expect(s.status).toBe("options_ready");
    const view = svc.strategyViewOf(s, await svc.currentOutcome(s));
    expect(view.leader?.structure.id).toBe(PILOT);
    const draft = await svc.reviewBuyerProposal();
    expect(draft.terms.scope.map((x) => x.packageId)).toEqual(["website-fixes", "search-marketing", "monthly-reporting"]);
    expect(draft.terms.followOn?.scope.map((x) => x.packageId)).toEqual(["search-marketing", "social-media", "monthly-reporting"]);
  });
});
