export const KNOWLEDGE_SOURCE_SCHEMA = "adaptive-deals.knowledge-source.v1" as const;

export type KnowledgeKind = "rate_card" | "cost_sheet" | "policy" | "service_rules" | "proposal" | "buyer_history" | "tone_guide";
export type KnowledgeAccess = "merchant_wide" | "commercial" | "finance_restricted" | "buyer_specific";
export type KnowledgeStatus = "active" | "superseded" | "withdrawn";

export interface KnowledgeSource {
  schema: typeof KNOWLEDGE_SOURCE_SCHEMA;
  id: string;
  merchantId: string;
  buyerId: string | null;
  title: string;
  kind: KnowledgeKind;
  format: "text" | "csv";
  access: KnowledgeAccess;
  effectiveFrom: string;
  effectiveTo: string | null;
  supersedes: string | null;
  status: KnowledgeStatus;
  content: string;
  contentHash: string;
  indexedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  merchantId: string;
  buyerId: string | null;
  start: number;
  end: number;
  text: string;
  heading: string | null;
  rowNumber: number | null;
  tokens: string[];
  entities: string[];
  amountsPaise: number[];
  instructionSpans: { start: number; end: number; text: string }[];
  hash: string;
}
