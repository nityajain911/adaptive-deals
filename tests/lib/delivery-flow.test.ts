import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { termsHash } from "@/domain/agreement";
import { isDelivered } from "@/lib/deal-records";
import { driveTo } from "../helpers/drive";

/** Spec §3.3 and §5.5: select → draft → approve → send, delivery gate, idempotent retry. No network. */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-delivery-"));
delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
type Svc = typeof import("@/lib/service");
let svc: Svc;
let presenter: typeof import("@/lib/presenter-store");
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
beforeAll(async () => {
  svc = await import("@/lib/service");
  presenter = await import("@/lib/presenter-store");
});
afterAll(() => fetchSpy.mockRestore());

async function toOptions() {
  await svc.resetToSeed();
  await presenter.setFailNextSend(false);
  await driveTo(svc, (s) => s.status === "options_ready");
}

describe("select → draft → approve → send", () => {
  it("preview and approval use the same canonical hash; approval sends nothing", async () => {
    await toOptions();
    const v = await svc.reviewBuyerProposal();
    expect(v.status).toBe("draft");
    expect(v.termsHash).toBe(termsHash(v.terms));
    expect((await svc.reviewBuyerProposal()).version).toBe(v.version); // idempotent
    await expect(svc.approveDraft(v.version, "0".repeat(64))).rejects.toThrow(/does not match/);
    const s = await svc.approveDraft(v.version, v.termsHash);
    expect([s.status, s.agreements[0].status]).toEqual(["approved", "merchant_approved"]);
    expect(s.conversation.some((i) => i.kind === "proposal")).toBe(false);
    expect(isDelivered(s.deliveries, v.version)).toBe(false);
  });

  it("a failed send keeps the approval, opens no buyer access, and retries idempotently", async () => {
    await presenter.setFailNextSend(true);
    const failed = await svc.sendProposal(1);
    expect(failed.delivered).toBe(false);
    expect(failed.state.status).toBe("approved");
    expect(failed.state.agreements[0].merchantApproval).not.toBeNull();
    expect(failed.state.deliveries[0].attempts.map((a) => a.status)).toEqual(["failed"]);
    expect(isDelivered(failed.state.deliveries, 1)).toBe(false);
    expect((await presenter.readPresenterFlags()).failNextSend).toBe(false); // one-shot
    const ok = await svc.sendProposal(1);
    expect(ok.delivered).toBe(true);
    expect(ok.state.status).toBe("sent");
    expect(ok.state.deliveries[0].attempts.map((a) => a.status)).toEqual(["failed", "sent"]);
    const again = await svc.sendProposal(1);
    expect(again.delivered).toBe(true);
    expect(again.state.deliveries[0].attempts).toHaveLength(2); // no duplicate delivery
    expect(again.state.conversation.filter((i) => i.kind === "proposal")).toHaveLength(1);
  });

  it("opening the recommended option is not a merchant choice; explicit selection is recorded once", async () => {
    await toOptions();
    await svc.reviewBuyerProposal();
    expect((await svc.getState()).outcomes.filter((o) => o.type === "option_selected")).toEqual([]);
    const out = await svc.currentOutcome(await svc.getState());
    const alt = out.explanation!.order[1];
    await svc.selectOption(alt);
    await svc.selectOption(alt); // same option again: no duplicate, no invalidation
    const recs = (await svc.getState()).outcomes.filter((o) => o.type === "option_selected");
    expect(recs).toEqual([expect.objectContaining({ actor: "merchant", source: { kind: "action", id: alt } })]);
  });

  it("selecting another option invalidates the previous draft; failing options cannot be selected", async () => {
    await toOptions();
    const out = await svc.currentOutcome(await svc.getState());
    const failing = out.evaluation.result!.rejected[0].structure.id;
    await expect(svc.selectOption(failing)).rejects.toThrow(/cannot be selected/);
    const v = await svc.reviewBuyerProposal();
    const other = out.explanation!.order[1];
    await svc.selectOption(other);
    const s = await svc.getState();
    expect(s.selectedOption!.structureId).toBe(other);
    expect(s.selectedOption!.draftVersion).toBeNull();
    expect(s.agreements.some((a) => a.status === "draft")).toBe(false);
    await expect(svc.approveDraft(v.version, v.termsHash)).rejects.toThrow(/not the selected draft/);
  });

  it("an old retry cannot send after the merchant reselects", async () => {
    await toOptions();
    const v = await svc.reviewBuyerProposal();
    await svc.approveDraft(v.version, v.termsHash);
    await presenter.setFailNextSend(true);
    await svc.sendProposal(v.version);
    // Approved-but-unsent: reselection is not possible (options are no longer "ready"), so the retry checks still hold.
    const s = await svc.getState();
    s.selectedOption = { ...s.selectedOption!, draftVersion: 99 };
    const { writeJsonAtomic } = await import("@/lib/store");
    await writeJsonAtomic(svc.STORE_FILE, s);
    await expect(svc.sendProposal(v.version)).rejects.toThrow(/not the selected, approved proposal/);
    expect(isDelivered((await svc.getState()).deliveries, v.version)).toBe(false);
  });

  it("an amendment's delivery is recorded when its message is sent; the presenter flag never affects it", async () => {
    await svc.resetToSeed();
    await presenter.setFailNextSend(false);
    await driveTo(svc, (s) => s.amendments.at(-1)?.state === "proposed");
    await presenter.setFailNextSend(true);
    const v2 = (await svc.getState()).agreements.find((x) => x.version === 2)!;
    expect(isDelivered((await svc.getState()).deliveries, 2)).toBe(false);
    const s = await svc.approveAmendment(v2.termsHash);
    expect(isDelivered(s.deliveries, 2)).toBe(true);
    const rec = s.deliveries.find((d) => d.version === 2)!;
    expect(rec.kind).toBe("amendment");
    expect(s.conversation.find((i) => i.id === rec.reference)?.kind).toBe("amendment");
    expect((await presenter.readPresenterFlags()).failNextSend).toBe(true); // untouched
    await presenter.setFailNextSend(false);
  });

  it("made no network or model call", () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
