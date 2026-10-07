import type { KnowledgeSource } from "./types";

export interface EvidenceClaim {
  id: string;
  field: string;
  value: string;
  sourceId: string;
  quote: string;
  start: number;
  end: number;
}

export interface EvidenceConflict {
  field: string;
  values: { value: string; claimIds: string[] }[];
}

const supportsCurrentValue = (source: KnowledgeSource | undefined, asOf: string) => Boolean(
  source && source.status === "active" && source.effectiveFrom <= asOf && (!source.effectiveTo || source.effectiveTo >= asOf),
);

export function detectEvidenceConflicts(claims: EvidenceClaim[], sources: KnowledgeSource[], asOf: string): EvidenceConflict[] {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const fields = new Map<string, Map<string, string[]>>();
  for (const claim of claims) {
    if (!supportsCurrentValue(sourceById.get(claim.sourceId), asOf)) continue;
    const values = fields.get(claim.field) ?? new Map<string, string[]>();
    values.set(claim.value, [...(values.get(claim.value) ?? []), claim.id]);
    fields.set(claim.field, values);
  }
  return [...fields.entries()].filter(([, values]) => values.size > 1).sort(([a], [b]) => a.localeCompare(b)).map(([field, values]) => ({
    field,
    values: [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([value, claimIds]) => ({ value, claimIds: [...claimIds].sort() })),
  }));
}
