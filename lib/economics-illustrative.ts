import { economicsContentHash, type EconomicsContent } from "@/domain/business-economics";
import { defaultEconomicsContent } from "./economics-default";

/** The demo's example of a merchant who permits discounts: a 10% maximum with 0%, 5% and 10% approved. */
export function illustrativeEconomicsContent(): EconomicsContent {
  const content = defaultEconomicsContent();
  content.guardrails.discountLimitBps = 1000;
  content.discountLadderBps = [0, 500, 1000];
  return content;
}

const ILLUSTRATIVE_HASH = economicsContentHash(illustrativeEconomicsContent());

/** True when a version's content is exactly the illustrative example, so it can be labelled as one. */
export const isIllustrativeHash = (hash: string) => hash === ILLUSTRATIVE_HASH;
