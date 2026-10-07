import type { DealBaseline } from "@/domain/deal-baseline";
import type { ServicePackage } from "@/domain/types";

export function originalProposalOf(baseline: DealBaseline) {
  return {
    prePaise: baseline.quotedPrePaise,
    gstPaise: baseline.quotedGstPaise,
    totalPaise: baseline.quotedTotalPaise,
    gstRateBps: baseline.gstRateBps,
  };
}

export function packageName(packages: Pick<ServicePackage, "id" | "name">[], id: string): string {
  return packages.find((item) => item.id === id)?.name ?? id;
}
