import type * as Svc from "@/lib/service";

type S = Awaited<ReturnType<typeof Svc.getState>>;
type Stop = (s: S) => boolean;
/**
 * preventive: the buyer answers the 28 Nov notice before any debit (spec hero path).
 * failed_debit: the 1 Dec debit fails first, then the buyer replies (secondary path).
 * Both require the upfront payment and mandate before the notice.
 */
export type HeroPath = "preventive" | "failed_debit";

/**
 * Advance the hero story with the real merchant, buyer and system actions until `stop` holds.
 * Replaces loops over the guided demo step, which no longer performs merchant decisions.
 */
export async function driveTo(svc: typeof Svc, stop: Stop, max = 30, path: HeroPath = "preventive"): Promise<S> {
  for (let i = 0; i < max; i++) {
    const s = await svc.getState();
    if (stop(s)) return s;
    const clar = s.conversation.filter((x) => x.kind === "clarification");
    const unanswered = clar.filter((d) => !s.conversation.some((r) => r.inReplyTo === d.id));
    const amendment = s.amendments.at(-1);
    if (s.status === "clarifying" && clar.some((d) => !d.sentAt)) await svc.sendQuestions();
    else if (s.status === "clarifying" && unanswered.length) {
      for (const d of unanswered) await svc.buyerReply({ inReplyTo: d.id, scriptId: d.refs.questionId === "clar-gst" ? "clar-gst-yes" : "clar-approval-contract" });
    } else if (s.status === "clarifying") await svc.adoptRepliesAsAnswers();
    else if (s.status === "options_ready") {
      const v = await svc.reviewBuyerProposal();
      await svc.approveDraft(v.version, v.termsHash);
      await svc.sendProposal(v.version);
    } else if (s.status === "approved") await svc.sendProposal(s.selectedOption!.draftVersion!);
    else if (s.status === "sent") {
      const v = s.agreements.find((x) => x.status === "sent")!;
      await svc.acceptAgreement(v.version, v.termsHash, v.terms.conditions.includes("buyer_confirms_authority_for_phase_scope"));
    } else if (amendment?.state === "proposed") await svc.approveAmendment(s.agreements.find((x) => x.status === "draft")!.termsHash);
    else if (amendment?.state === "merchant_approved") {
      const v = s.agreements.find((x) => x.status === "sent")!;
      await svc.acceptAmendment(v.termsHash, v.terms.conditions.includes("buyer_confirms_authority_for_phase_scope"));
    } else if (s.status === "active" && s.attempts.some((a) => a.method === "payment_link" && a.status === "scheduled")) await svc.simulate("payment_link_paid");
    else if (s.status === "active" && s.mandate?.status === "pending") await svc.simulate("mandate_confirmed");
    else if (s.status === "active" && !s.conversation.some((x) => x.kind === "notice")) await svc.simulate("advance_notice");
    else if (s.status === "active" && path === "failed_debit" && !s.changeRequests.length && !s.attempts.some((a) => a.status === "failed")) await svc.simulate("debit_failed");
    else if (s.status === "active" && !s.changeRequests.length) {
      const n = [...s.conversation].reverse().find((x) => x.kind === "notice")!;
      await svc.buyerReply({ inReplyTo: n.id, scriptId: "notice-cash-tight" });
    } else if (s.status === "active" && s.changeRequests.some((c) => c.state === "change_requested")) await svc.proposeAmendment();
    else return s;
  }
  return svc.getState();
}
