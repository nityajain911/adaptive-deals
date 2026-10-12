import type { AgreementVersion } from "@/domain/agreement";
import type { EvaluatedStructure } from "@/domain/engine";
import type { DemoState } from "./service";

type Outcome = { evaluation: { result: { structures: EvaluatedStructure[] } | null } };

/**
 * The evaluated structure behind an agreement version: a revision's own, the rest of the year's own, or the one the engine listed
 * when the offer was made. One place, so every screen reads a version the same way.
 */
export function evaluatedForVersion(s: Pick<DemoState, "amendments" | "followOnSale">, v: Pick<AgreementVersion, "version" | "structureId">, out: Outcome): EvaluatedStructure | null {
  const amended = s.amendments.find((a) => a.toVersion === v.version && a.state !== "rejected");
  if (amended) return amended.revised;
  if (s.followOnSale?.version === v.version) return s.followOnSale.evaluated;
  return out.evaluation.result?.structures.find((x) => x.structure.id === v.structureId) ?? null;
}
