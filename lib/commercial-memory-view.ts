import "server-only";
import { chunkSource } from "@/commercial-memory/chunker";
import { retrieveCommercialEvidence, validateCitation } from "@/commercial-memory/retrieval";
import { loadBundledKnowledgeSources } from "@/commercial-memory/source-schema";

const SERVICE_NAMES: Record<string, string> = {
  "website-fixes": "Website fixes",
  "search-marketing": "Search marketing",
  "social-media": "Social media",
  "monthly-reporting": "Monthly reporting",
};

export interface MerchantEvidenceView {
  serviceId: string;
  serviceName: string;
  kind: "price" | "cost";
  sourceId: string;
  sourceTitle: string;
  effectiveFrom: string;
  quote: string;
  chunkId: string;
  score: number;
}

export interface CommercialMemoryDealView {
  history: { sourceId: string; sourceTitle: string; effectiveFrom: string; quote: string; chunkId: string } | null;
  merchantEvidence: MerchantEvidenceView[];
  attribution: "code";
}

export function commercialMemoryForDeal(args: { merchantId: string; buyerId: string; asOf: string; serviceIds: string[] }): CommercialMemoryDealView {
  const sources = loadBundledKnowledgeSources();
  const chunks = sources.flatMap(chunkSource);
  const byId = new Map(sources.map((source) => [source.id, source]));
  const historyResult = retrieveCommercialEvidence("separate website purchase history", {
    merchantId: args.merchantId, buyerId: args.buyerId, asOf: args.asOf, allowedAccess: ["buyer_specific"], limit: 1,
  }, sources, chunks);
  const historyCandidate = historyResult.candidates[0] ?? null;
  const historySource = historyCandidate ? byId.get(historyCandidate.sourceId) ?? null : null;
  const history = historyCandidate && historySource && validateCitation(historySource, historyCandidate, {
    start: historyCandidate.start, end: historyCandidate.end, quote: historyCandidate.text,
  }).ok ? { sourceId: historySource.id, sourceTitle: historySource.title, effectiveFrom: historySource.effectiveFrom, quote: historyCandidate.text, chunkId: historyCandidate.id } : null;

  const merchantEvidence: MerchantEvidenceView[] = [];
  for (const serviceId of [...new Set(args.serviceIds)]) {
    const serviceName = SERVICE_NAMES[serviceId];
    if (!serviceName) continue;
    for (const kind of ["price", "cost"] as const) {
      const result = retrieveCommercialEvidence(`${serviceName} ${kind === "price" ? "standard price" : "direct cost"}`, {
        merchantId: args.merchantId, buyerId: args.buyerId, asOf: args.asOf, allowedAccess: kind === "price" ? ["commercial"] : ["finance_restricted"], limit: 4,
      }, sources, chunks);
      const candidate = result.candidates.find((item) => item.sourceKind === (kind === "price" ? "rate_card" : "cost_sheet"));
      const source = candidate ? byId.get(candidate.sourceId) : null;
      if (!candidate || !source) continue;
      if (!validateCitation(source, candidate, { start: candidate.start, end: candidate.end, quote: candidate.text }).ok) continue;
      merchantEvidence.push({ serviceId, serviceName, kind, sourceId: source.id, sourceTitle: source.title, effectiveFrom: source.effectiveFrom, quote: candidate.text, chunkId: candidate.id, score: candidate.score });
    }
  }
  return { history, merchantEvidence, attribution: "code" };
}
