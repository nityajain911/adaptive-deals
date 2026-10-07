import { lineWithGst } from "./money";
import type { ScopeItem, ServicePackage } from "./types";

export interface BaselinePrice {
  packageId: string;
  kind: "one_time" | "monthly";
  listPricePaise: number;
}

export interface DealBaseline {
  servicePrices: BaselinePrice[];
  quotedScope: ScopeItem[];
  quotedPrePaise: number;
  quotedGstPaise: number;
  quotedTotalPaise: number;
  gstRateBps: number;
  economicsVersionAtStart: number;
}

export class BaselineError extends Error {}

export function listValueOf(prices: BaselinePrice[], scope: ScopeItem[]): number {
  const byPackage = new Map(prices.map((price) => [price.packageId, price]));
  return scope.reduce((total, item) => {
    const price = byPackage.get(item.packageId);
    if (!price) throw new BaselineError(`Service "${item.packageId}" is not in this deal's price snapshot`);
    return total + price.listPricePaise * (price.kind === "monthly" ? item.months : 1);
  }, 0);
}

export function captureBaseline(args: {
  services: Pick<ServicePackage, "id" | "kind" | "listPricePaise">[];
  quotedScope: ScopeItem[];
  quotedPrePaise: number;
  gstRateBps: number;
  economicsVersion: number;
}): DealBaseline {
  const servicePrices = args.services.map((service) => ({
    packageId: service.id,
    kind: service.kind,
    listPricePaise: service.listPricePaise,
  }));
  const calculated = listValueOf(servicePrices, args.quotedScope);
  if (calculated !== args.quotedPrePaise) {
    throw new BaselineError(`The quoted pre-GST amount ${args.quotedPrePaise} does not match the price snapshot total ${calculated}`);
  }
  const quote = lineWithGst(args.quotedPrePaise, args.gstRateBps);
  return {
    servicePrices: structuredClone(servicePrices),
    quotedScope: structuredClone(args.quotedScope),
    quotedPrePaise: quote.prePaise,
    quotedGstPaise: quote.gstPaise,
    quotedTotalPaise: quote.totalPaise,
    gstRateBps: args.gstRateBps,
    economicsVersionAtStart: args.economicsVersion,
  };
}
