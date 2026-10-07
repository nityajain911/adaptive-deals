import "server-only";

import type { DealContext } from "@/ai/orchestrator";
import type { BusinessEconomics } from "@/domain/business-economics";
import { demoCase } from "@/data/synthetic/cases";
import { ActionError } from "./action-error";
import { engineInputFor } from "./deal-economics";
import { economicsVersion } from "./economics-store";
import type { DemoState } from "./service";
export { originalProposalOf, packageName } from "./deal-context-shared";

export function dealContextFor(s: DemoState, version: BusinessEconomics): DealContext {
  const item = demoCase(s.caseId);
  if (!item) throw new ActionError("Unknown case", 404);
  const input = engineInputFor({
    merchant: item.deal.merchant,
    baseline: s.baseline,
    version,
    overrides: s.economics.overrides,
  });
  return {
    dealId: item.deal.dealId,
    messages: structuredClone(item.deal.messages),
    ...input,
  };
}

export async function pinnedEconomicsOf(s: DemoState): Promise<BusinessEconomics> {
  const version = await economicsVersion(s.economics.pinned.version);
  if (!version) throw new ActionError(`Business economics version ${s.economics.pinned.version} is unavailable`);
  return version;
}
