import "server-only";

import { activate, economicsContentHash, validateEconomics, type EconomicsIssue } from "@/domain/business-economics";
import type { DealEvaluation } from "@/domain/engine";
import { activeEconomics, getEconomicsStore } from "@/lib/economics-store";
import { previewReevaluationCandidate } from "@/lib/service";
import type { ReevaluationPreview } from "@/lib/reevaluation";

export interface ServiceEconomicsRow {
  id: string;
  name: string;
  pricePaise: number;
  costPaise: number;
  contributionPaise: number;
  marginBps: number;
}

export interface EconomicsActivationPreview {
  issues: EconomicsIssue[];
  /** True when the draft has exactly the active version's content, so there is nothing to activate. */
  unchanged: boolean;
  serviceEconomics: ServiceEconomicsRow[];
  demoDeal: ReevaluationPreview | null;
  unreachableFloor: boolean;
}

function floorUnreachable(evaluation: DealEvaluation | null): boolean {
  const structures = evaluation?.result?.structures ?? [];
  return structures.length > 0 && structures.every((item) =>
    item.sellerChecks.some((check) => check.id === "seller_contribution" && check.status === "fail"),
  );
}

export async function previewEconomicsActivation(): Promise<EconomicsActivationPreview> {
  const store = await getEconomicsStore();
  const content = store.draft;
  if (!content) throw new Error("There is no business economics draft to review");
  const issues = validateEconomics(content);
  const unchanged = economicsContentHash(content) === (await activeEconomics()).hash;
  const serviceEconomics = content.services.map((service) => {
    const contributionPaise = service.listPricePaise - service.directCostPaise;
    return {
      id: service.id,
      name: service.name,
      pricePaise: service.listPricePaise,
      costPaise: service.directCostPaise,
      contributionPaise,
      marginBps: service.listPricePaise > 0 ? Math.round((contributionPaise * 10_000) / service.listPricePaise) : 0,
    };
  });
  if (issues.some((issue) => issue.level === "error")) {
    return { issues, unchanged, serviceEconomics, demoDeal: null, unreachableFloor: false };
  }
  const active = await activeEconomics();
  const candidate = activate(content, {
    version: active.version + 1,
    activatedAt: active.activatedAt,
    activatedBy: "Activation preview",
  });
  const deal = await previewReevaluationCandidate(candidate);
  return {
    issues,
    unchanged,
    serviceEconomics,
    demoDeal: deal?.preview ?? null,
    unreachableFloor: floorUnreachable(deal?.evaluation ?? null),
  };
}
