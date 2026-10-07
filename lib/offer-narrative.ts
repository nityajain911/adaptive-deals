import type { RunOutcome } from "@/ai/orchestrator";
import type { EvaluatedStructure } from "@/domain/engine";
import { explainLeader, type StrategyView } from "@/domain/strategy";
import { branchCause } from "./decision-branch";
import { taskOrRunProvenance } from "./model-provenance";
import { approxINR, headlineFor, whyOffer } from "./offer-copy";
import { economicsMatchRecording, strategyChosen, type DemoState } from "./service";
import { recordedEvidence, strategyAttribution } from "./strategy-copy";

/**
 * What the offer card says about its offer: the reason, who ranked and explained it, and the
 * recorded model's order kept as history. Code writes the reason and ranks the offers; the recorded
 * run is shown only while the deal still has the economics it was recorded under.
 */
export function offerNarrative(args: { s: DemoState; out: RunOutcome; x: EvaluatedStructure; view: StrategyView; eligible: EvaluatedStructure[] }) {
  const { s, out, x, view, eligible } = args;
  const isLeader = x.structure.id === view.leader?.structure.id;
  const selectedByMerchant = !!s.selectedOption?.explicit && s.selectedOption.structureId === x.structure.id;
  const wholeRupees = (paise: number) => approxINR(paise).replace(/^about /, "");
  const headline = (id: string) => {
    const o = eligible.find((e) => e.structure.id === id);
    return o ? headlineFor(o) : id;
  };
  return {
    isLeader,
    selectedByMerchant,
    wholeRupees,
    headline,
    reason: isLeader ? explainLeader(view, { inr: wholeRupees }) : whyOffer(x),
    attribution: strategyAttribution({ strategyChosen: strategyChosen(s), selectedByMerchant, branchCause: s.decisionBranch ? branchCause(s.decisionBranch) : undefined }),
    evidence: s.decisionBranch
      ? null
      : recordedEvidence({ exp: out.explanation, provenance: taskOrRunProvenance(s.run.record, "explain", s.run.viewing), matchesRecording: economicsMatchRecording(s), shownId: x.structure.id, headline }),
  };
}
