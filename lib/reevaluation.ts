import { canonicalJson } from "@/domain/agreement";
import type { DealBaseline } from "@/domain/deal-baseline";
import type { DealEvaluation, EngineInput } from "@/domain/engine";
import { strategyView, type StrategyId } from "@/domain/strategy";

export interface ReevaluationPreview {
  fromVersion: number;
  toVersion: number;
  blocked: string[];
  changesInputs: boolean;
  inputChanges: { field: string; from: string; to: string }[];
  pricesNote: "Service prices are unchanged for this deal.";
  becomesFeasible: string[];
  becomesInfeasible: string[];
  recommendationChanges: boolean;
  staleDraftVersion: number | null;
}

function flatten(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (value === null || typeof value !== "object") {
    out.set(prefix, String(value));
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      for (const [key, shown] of flatten(item, prefix + "[" + index + "]")) out.set(key, shown);
    });
    return out;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    for (const [nested, shown] of flatten(item, prefix ? prefix + "." + key : key)) out.set(nested, shown);
  }
  return out;
}

const engineRelevant = (input: EngineInput) => ({
  policy: input.merchant.policy,
  packages: input.packages.map(({ id, kind, listPricePaise, directCostPaise, removable, deferrable, hasIndependentValue, dependsOnAny }) => ({
    id, kind, listPricePaise, directCostPaise, removable, deferrable, hasIndependentValue, dependsOnAny: dependsOnAny ?? [],
  })),
  templates: input.templates,
});

export function changedInputs(before: EngineInput, after: EngineInput): { field: string; from: string; to: string }[] {
  const a = flatten(engineRelevant(before));
  const b = flatten(engineRelevant(after));
  return [...new Set([...a.keys(), ...b.keys()])].sort().flatMap((field) => {
    const from = a.get(field) ?? "not set";
    const to = b.get(field) ?? "not set";
    return from === to ? [] : [{ field, from, to }];
  });
}

const feasibleIds = (evaluation: DealEvaluation) => new Set(evaluation.result?.feasible.map((item) => item.structure.id) ?? []);

export function buildReevaluationPreview(args: {
  fromVersion: number;
  toVersion: number;
  blocked: string[];
  beforeInput: EngineInput;
  afterInput: EngineInput | null;
  beforeEvaluation: DealEvaluation;
  afterEvaluation: DealEvaluation | null;
  staleDraftVersion: number | null;
  /** The deal's own strategy decides what 'the recommendation' is. */
  strategy: StrategyId;
  baseline: DealBaseline;
}): ReevaluationPreview {
  const inputChanges = args.afterInput ? changedInputs(args.beforeInput, args.afterInput) : [];
  const before = feasibleIds(args.beforeEvaluation);
  const after = args.afterEvaluation ? feasibleIds(args.afterEvaluation) : null;
  const topOf = (evaluation: DealEvaluation | null) => (evaluation?.result ? strategyView(evaluation.result.feasible, args.strategy, args.baseline).leader?.structure.id ?? null : null);
  const beforeTop = topOf(args.beforeEvaluation);
  const afterTop = topOf(args.afterEvaluation);
  return {
    fromVersion: args.fromVersion,
    toVersion: args.toVersion,
    blocked: [...args.blocked],
    changesInputs: !!args.afterInput && canonicalJson(engineRelevant(args.beforeInput)) !== canonicalJson(engineRelevant(args.afterInput)),
    inputChanges,
    pricesNote: "Service prices are unchanged for this deal.",
    becomesFeasible: after ? [...after].filter((id) => !before.has(id)).sort() : [],
    becomesInfeasible: after ? [...before].filter((id) => !after.has(id)).sort() : [],
    recommendationChanges: args.afterEvaluation ? beforeTop !== afterTop : false,
    staleDraftVersion: args.staleDraftVersion,
  };
}
