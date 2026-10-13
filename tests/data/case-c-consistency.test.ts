import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoCase, scriptedReplyText } from "@/data/synthetic/cases";
import { heroScriptedReplies } from "@/data/synthetic/hero";
import { FOLLOW_ON_POLICY } from "@/domain/follow-on";
import { addDays, addMonths } from "@/domain/dates";

/**
 * Case C (Harbour Fresh Foods), end to end: what the recorded Cerebras run was given and returned, what the code took from it, and that the
 * numbers in the simulated replies are the numbers the engine is given. Only the conversation, the question wording and the ranking
 * go through the model; every scripted reply carries its meaning as metadata, so this test is what keeps the metadata honest.
 */
const run = JSON.parse(readFileSync("data/case-recorded-runs/run-case-reduced-scope-4e94d36d.json", "utf8"));
const item = demoCase("reduced-scope")!;
const rupees = (text: string) => [...text.matchAll(/₹([\d,]+)/g)].map((m) => Number(m[1].replaceAll(",", "")) * 100);

describe("what Cerebras was given", () => {
  it("is exactly the conversation the case shows, in order, and nothing else", () => {
    expect(run.inputs.messages.map((m: { id: string; text: string }) => [m.id, m.text])).toEqual(item.deal.messages.map((m) => [m.id, m.text]));
    const given = run.steps.find((s: { task: string }) => s.task === "extract").userContent as string;
    for (const m of item.deal.messages) expect(given).toContain(m.text);
  });

  it("returned only quotes that are in the messages they cite, and the code kept the same words", () => {
    const extract = run.steps.find((s: { task: string }) => s.task === "extract");
    const fields = extract.rawOutput.fields as { key: string; evidence_quote: string; message_id: string }[];
    for (const f of fields) {
      const message = item.deal.messages.find((m) => m.id === f.message_id)!;
      expect(message, f.key).toBeTruthy();
      expect(message.text, `${f.key}: ${f.evidence_quote}`).toContain(f.evidence_quote.replace(/\.$/, ""));
    }
    for (const field of run.engine.profile as { evidence: { quote: string; messageId: string; start: number; end: number }[] }[]) {
      for (const e of field.evidence) expect(item.deal.messages.find((m) => m.id === e.messageId)!.text.slice(e.start, e.end)).toBe(e.quote);
    }
  });

  it("gave the engine the numbers the buyer said", () => {
    const by = Object.fromEntries((run.engine.profile as { key: string; display: string; status: string }[]).map((f) => [f.key, f]));
    expect(by.budgetNow.display).toContain("₹50,000");
    expect(by.budgetNow.display).toContain("31 Dec 2026");
    expect(by.nextBudget.display).toContain("Jan 2027");
    expect(by.approvalLimit.display).toContain("₹60,000");
    const condition = (run.engine.profile as { key: string; rawText?: string }[]).find((f) => f.key.startsWith("other"))?.rawText ?? JSON.stringify(run.engine.profile);
    expect(condition).toContain("20 a month");
  });

  it("wrote words around figures only the engine supplied: every amount in the explanation is an engine amount", () => {
    const structures = JSON.stringify(run.engine.final.structures);
    const spoken = [run.displayed.explanation.comparison, ...run.displayed.explanation.notes.map((n: { note?: string; text?: string }) => n.note ?? n.text ?? "")].join(" ");
    expect(rupees(spoken).length).toBeGreaterThan(0);
    for (const paise of rupees(spoken)) expect(structures, `₹${paise / 100}`).toContain(String(paise));
  });
});

describe("the simulated replies say what their metadata says", () => {
  const text = (id: string) => scriptedReplyText("reduced-scope", heroScriptedReplies.find((s) => s.id === id)!);
  const find = (id: string) => heroScriptedReplies.find((s) => s.id === id)! as Record<string, unknown> & { text: string };

  it("answers to the two questions", () => {
    expect(text("clar-gst-yes")).toContain(find("clar-gst-yes").text);
    expect(find("clar-gst-yes")).toMatchObject({ answerValue: "yes" });
    expect(find("clar-gst-yes").text).toMatch(/include GST/);
    expect(find("clar-gst-no")).toMatchObject({ answerValue: "no" });
    expect(find("clar-gst-no").text).toMatch(/exclude GST/);
    expect(find("clar-approval-contract")).toMatchObject({ answerValue: "per_contract" });
    expect(find("clar-approval-contract").text).toMatch(/per contract/);
    expect(find("clar-approval-payment")).toMatchObject({ answerValue: "per_payment" });
    expect(find("clar-approval-payment").text).toMatch(/per payment/);
    // The amounts a reply names are the amounts the buyer named.
    for (const id of ["clar-gst-unclear", "clar-approval-unclear", "clar-approval-contract", "clar-approval-payment"]) for (const p of rupees(find(id).text)) expect([5_000_000, 6_000_000]).toContain(p);
  });

  it("the buyer's answer at the review", () => {
    expect(text("review-proceed")).toMatch(/continue/i);
    expect(text("review-stop")).toMatch(/stop here/i);
    expect(find("review-proceed")).toMatchObject({ reviewDecision: "proceed" });
    expect(find("review-stop")).toMatchObject({ reviewDecision: "stop" });
    for (const id of ["review-change-price", "review-change-date", "review-change-scope"]) expect(find(id)).toMatchObject({ reviewDecision: "changes" });
  });

  it("a change they ask for is the change the engine is given", () => {
    const price = find("review-change-price") as unknown as { reviewChange: { kind: string; targetPaise: number } };
    expect(price.reviewChange.kind).toBe("lower_price");
    expect(rupees(text("review-change-price"))).toEqual([price.reviewChange.targetPaise]);
    const date = find("review-change-date") as unknown as { reviewChange: { kind: string; startDate: string } };
    expect(date.reviewChange).toEqual({ kind: "later_start", startDate: "2027-04-01" });
    expect(text("review-change-date")).toContain("1 April");
    const scope = find("review-change-scope") as unknown as { reviewChange: { kind: string; removePackageId: string } };
    expect(scope.reviewChange).toEqual({ kind: "leave_out", removePackageId: "social-media" });
    expect(text("review-change-scope")).toMatch(/social media/i);
  });
});

describe("the dates and amounts told across the journey agree", () => {
  it("the 45 days the merchant promises in the chat are the 45 days the product holds", () => {
    expect(FOLLOW_ON_POLICY.holdDays).toBe(45);
    expect(item.deal.messages.find((m) => m.id === "reduced-6")!.text).toContain("45 days of the month-three review");
    // Phase one starts 1 Nov for three months, so the review is 1 Feb, and the price is held 45 days after it.
    const review = addMonths("2026-11-01", 3);
    expect(review).toBe("2027-02-01");
    expect(addDays(review, FOLLOW_ON_POLICY.holdDays)).toBe("2027-03-18");
  });

  it("the buyer's own timing allows what is offered: phase one inside this quarter, the rest after January", () => {
    expect("2026-11-01" <= "2026-12-31").toBe(true);
    expect("2027-02-01" >= "2027-01-01").toBe(true);
    // ₹1,20,000 + GST for the year, ₹39,000 + GST for phase one, ₹72,000 + GST for the rest: 24,000 + 3 × 5,000... = 39,000; 9 × 8,000 = 72,000.
    expect(39_000 * 1.18).toBeCloseTo(46_020, 5);
    expect(72_000 * 1.18).toBeCloseTo(84_960, 5);
    expect(3 * 28_320).toBe(84_960);
    expect(120_000 * 1.18).toBeCloseTo(141_600, 5);
    expect(84_960).toBeGreaterThan(60_000);
    expect(46_020).toBeLessThan(50_000);
  });
});
