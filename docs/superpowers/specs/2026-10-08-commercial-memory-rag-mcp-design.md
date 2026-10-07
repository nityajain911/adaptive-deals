# Adaptive Deals Commercial Memory and MCP Action Layer

- **Date:** 8 October 2026
- **Branch:** `codex/merchant-profit-strategy`
- **Baseline:** commit `0e83ca6`
- **Status:** draft for applicant and Claude review
- **Scope:** Option A+ local RAG for a single fictional merchant, plus a Razorpay test-mode MCP action layer
- **Implementation authority:** none. Approval of this document permits an implementation plan, not product code or provider calls.

## 1. Executive summary

Adaptive Deals can already extract buyer constraints, calculate every allowed offer, protect the merchant's economics, support negotiation and execute a simulated or Razorpay test-mode collection flow. It still asks the merchant to enter or maintain most commercial context manually, and its external actions are product-specific integrations rather than a reusable tool boundary.

This work adds two complementary layers:

1. **Commercial Memory (RAG):** retrieves relevant facts from the merchant's rate cards, cost sheets, policies, prior proposals and buyer records; gives every proposed fact a source, exact quote and date; and lets the merchant confirm facts before they become business economics or deal evidence.
2. **Approved Action Layer (MCP):** discovers and invokes a Razorpay test-mode collection tool only after the merchant reviews the exact action. It stores an idempotent receipt and never lets a model select or execute a money-related tool.

The product boundary is:

> **RAG remembers the business. The deterministic engine protects the business. AI extracts and communicates. The merchant decides. MCP executes the approved action through Razorpay.**

No Supabase integration is required for this version. The product remains a single-merchant local prototype with bundled fictional sources and optional session-local pasted text or CSV.

## 2. Problem statement

A small service-business founder often keeps rate cards, delivery costs, discount rules, client history and past proposals across disconnected documents and systems. Re-entering that context for every stalled deal is slow and makes an otherwise intelligent offer recommendation difficult to trust.

After a deal is accepted, the merchant also has to move from the commercial decision into a payment system. If the product cannot show how an approved offer becomes a real Razorpay collection action, it stops before the point where Razorpay creates value.

The current prototype proves the decision engine. This addition must prove that Adaptive Deals can retrieve grounded commercial context and safely execute an approved collection action without turning into a generic document chatbot or an autonomous negotiator.

### Evidence and assumptions

- The existing product research supports fragmented payment and collection workflows, but it does **not** establish how frequently merchants maintain reusable rate cards or negotiate scope through WhatsApp. Those remain assumptions.
- The demo corpus and buyer histories are fictional. Retrieval evaluation proves technical behavior on synthetic sources, not market demand.
- The current three recorded Groq cases remain product evidence. They are not independent validation.
- The exact Razorpay MCP tools and test-mode behavior must be discovered from the connected server at runtime. The product never assumes a tool name or capability that the server does not advertise.

## 3. Target users and jobs

### 3.1 Busy agency or service-business founder

**Job:** When a buyer cannot accept my standard quote, I want the product to find the relevant costs, policies and prior context so I can approve a profitable alternative without searching through files.

### 3.2 Finance or operations owner

**Job:** When commercial inputs or payment actions are proposed, I want to see their source, version and audit trail so I can verify that the system did not invent a number or act twice.

### 3.3 Buyer opening a proposal

**Job:** When I receive revised terms, I want a clear proposal and payment arrangement without seeing the merchant's internal costs, guardrails or retrieval evidence.

### 3.4 Razorpay Build Challenge judge

**Job:** In under three minutes, I want to see what AI understood, what evidence it used, what deterministic code decided and what approved Razorpay action occurred.

### 3.5 Razorpay platform or agent team (future)

**Job:** I want Adaptive Deals' safe read and calculation capabilities exposed as tools so RAY or Agent Studio can use them without bypassing the merchant's approval boundaries.

## 4. Goals

### 4.1 User goals

1. Reduce the effort needed to create or update Business economics from merchant evidence.
2. Make the source of every retrieved commercial fact visible and reviewable.
3. Connect a buyer's accepted terms to a real Razorpay test-mode collection action.
4. Keep the existing one-primary-action product flow focused and usable without the walkthrough.

### 4.2 Product goals

1. Demonstrate a genuine retrieval pipeline rather than case-specific document mappings.
2. Demonstrate meaningful AI use while preserving deterministic money and policy decisions.
3. Show a reusable MCP boundary with explicit permissions, idempotency and receipts.
4. Preserve all existing frozen prompts, recordings, evaluations, engine files and agreement-hash guarantees.

### 4.3 Buildathon success condition

A judge can follow one coherent story:

1. Commercial Memory retrieves and cites the merchant's rate card, cost sheet and policy.
2. The merchant confirms the proposed economics.
3. A buyer constraint is extracted with evidence.
4. The deterministic engine recommends an offer under the merchant's selected strategy.
5. The buyer accepts.
6. The merchant reviews and approves a Razorpay test-mode MCP action.
7. The resulting Payment Link ID and status appear in Track and Audit details.

## 5. Non-goals

1. **Production multi-tenancy, authentication or Supabase.** The build remains a local, single-merchant prototype. The data model carries `merchantId` so a production database can enforce isolation later.
2. **A general-purpose “chat with your documents” product.** Retrieval serves named commercial decisions only.
3. **PDF, image or spreadsheet parsing.** P0 accepts bundled plain text/CSV sources and session-local pasted text or CSV. OCR and rich parsers are separate systems.
4. **Autonomous negotiation.** A model cannot set a price, choose an offer, change a guardrail, approve an exception, send a proposal or move money.
5. **Automatic learning from a few outcomes.** Similar deals may be shown later as evidence; they do not automatically change ranking or policies.
6. **RAG for mutable payment status.** Payment status comes from MCP, the existing test adapter or a webhook, never from an indexed document.
7. **Live Razorpay money movement.** Only test-mode actions are permitted.
8. **Replacing the existing JSON stores.** Commercial Memory and MCP records use additive stores under `ADAPTIVE_DEALS_DATA_DIR`.
9. **Editing frozen AI assets.** The existing `ai/`, `evaluation/`, case recordings and frozen engine boundary remain byte-for-byte unchanged.

## 6. Product principles

1. **Retrieve before generating.** The model receives only filtered candidate chunks and the user's current decision context.
2. **Citations before confidence.** A confidence label never substitutes for an exact source quote.
3. **Evidence proposes; the merchant confirms.** Retrieved facts do not silently become Business economics.
4. **Code owns money.** Amount normalisation, GST, contribution, discounts, schedules, eligibility and ranking remain deterministic.
5. **Code selects tools.** A model may word an explanation; it never chooses an MCP tool or its commercial arguments.
6. **Approval binds exact inputs.** MCP approval covers a canonical argument hash, agreement version and terms hash.
7. **No silent fallback.** Recorded AI output, code fallback, simulated MCP and live test-mode MCP are visibly distinct.
8. **Abstention is a valid outcome.** Insufficient, contradictory, stale or unauthorised evidence produces a review state rather than a guess.

## 7. Scope and priorities

### 7.1 P0 — required for this build

1. Local Commercial Memory source store and deterministic chunking.
2. Hybrid retrieval across the full eligible corpus, with no case-to-document mapping.
3. Exact citations, dates, source hashes and retrieval traces.
4. A constrained AI reranker with deterministic lexical fallback.
5. Draft Business economics from retrieved evidence using the separately versioned `profile_extract.v1` contract where compatible.
6. Merchant confirmation before any retrieved value becomes an active economics version.
7. Evidence behind the offer: buyer quote, merchant source and engine rule in one view.
8. A presenter-only unseen retrieval test, one abstention case and one conflicting-source case.
9. Razorpay MCP capability discovery.
10. Merchant-reviewed creation of one Razorpay test-mode Payment Link through MCP when supported.
11. Idempotency, receipts, failure handling and audit display for the MCP action.
12. A recorded or simulated fallback that is explicitly labelled and never presented as a live MCP call.
13. Frozen retrieval and MCP safety evaluations, reported as counts.

### 7.2 P1 — designed now, built after P0 is stable

1. Buyer Account Memory from prior proposals, accepted scopes and payment facts.
2. RAG-grounded negotiation-message context for `negotiation_message.v1`.
3. Read-only MCP tools for payment status, failure reason and settlement context.
4. Adaptive Deals as an MCP server exposing safe read and calculation tools.
5. Session-local source addition from pasted text or CSV through the merchant UI.

### 7.3 P2 — future product direction

1. Supabase/Postgres, `pgvector`, object storage, authentication and Row Level Security.
2. CRM, accounting, project-management and messaging MCP connections.
3. Durable merchant uploads and background re-indexing.
4. Similar-deal precedent retrieval after sufficient real outcomes exist.
5. Versioned, evaluated policy improvements proposed from outcome evidence and approved by the merchant.

## 8. End-to-end product journey

### 8.1 Set up Commercial Memory

1. The merchant opens **Business economics → Commercial Memory**.
2. The screen explains which bundled fictional sources are connected: rate card, direct-cost sheet, commercial policy, service rules, tone guide and prior buyer records.
3. Each source shows type, effective date, status, access scope, hash and last indexed time.
4. The merchant selects **Draft economics from evidence**.
5. Retrieval finds the relevant source chunks across the corpus.
6. The extraction model proposes service, price and cost fields with exact quotes.
7. Code rejects any unsupported, ambiguous or instruction-contaminated value.
8. The merchant accepts, edits or rejects each proposed field.
9. The existing Business economics review shows contribution and the effect on the open deal.
10. The merchant activates a numbered economics version through the existing approval flow.

### 8.2 Understand a buyer

1. A buyer message enters the current simulated conversation.
2. Existing extraction identifies buyer constraints with verbatim evidence.
3. Commercial Memory retrieves only buyer-eligible and merchant-wide sources relevant to this case.
4. **What we know for this decision** shows retrieved context separately from what the buyer said.
5. Any retrieved historical fact is labelled as historical evidence and never treated as a current buyer commitment.

### 8.3 Review the offer

The recommendation begins with one human sentence and then shows three evidence groups:

1. **Buyer said:** the exact buyer message quote.
2. **Your business records say:** exact merchant source quotes for price, cost or policy.
3. **The engine checked:** contribution, funding, discount, payment and buyer constraints.

The existing strategy rank remains authoritative. Retrieval cannot alter the order except through merchant-confirmed Business economics or a recorded deal override.

### 8.4 Approve and execute collection

1. The buyer accepts the canonical proposal.
2. Track shows **Create Razorpay test collection link** as the current merchant action.
3. The review card displays:
   - agreement version and terms hash;
   - amount and currency;
   - buyer contact fields included;
   - purpose/reference;
   - test-mode label;
   - MCP server identity and advertised tool;
   - idempotency key;
   - data that will leave the application.
4. The merchant selects **Approve and create test Payment Link**.
5. Code rechecks the active accepted agreement and the exact argument hash.
6. The MCP client invokes the discovered tool once.
7. The returned identifier, short URL and status are schema-validated and stored in a receipt.
8. Track shows the test link and status. Audit details shows the request hash and receipt without secrets.

### 8.5 Unseen judge test

The presenter page contains **Test Commercial Memory**. A judge can enter an unseen question such as “What is our current direct cost for website fixes?” The product shows:

- the normalised query;
- eligible sources searched;
- top retrieved passages and scores;
- whether AI reranking ran, replayed or fell back to code;
- exact citations;
- an abstention when the corpus does not support an answer.

This surface is evidence of retrieval quality, not a general merchant chatbot.

## 9. Product surfaces

### 9.1 Business economics

Add a **Commercial Memory** section above the existing service and guardrail editor.

Required states:

- Sources connected
- Index current
- Source superseded
- Conflicting sources
- Suspicious instructions found
- No supported values found
- Proposed values awaiting merchant confirmation
- Confirmed values ready for existing economics review

Each proposed field displays source title, effective date and exact quote. Opening the citation reveals the whole chunk and its surrounding context.

### 9.2 Understand the buyer

Add a compact **Relevant history** card only when retrieval finds eligible buyer evidence. It remains collapsed by default and never repeats the active buyer constraints.

The card must use past tense and a source date, for example: “In the proposal dated 12 June, Kestrel purchased website maintenance separately.” It must not say that the buyer currently agrees or will behave the same way.

### 9.3 Review the offer

Add **Evidence behind this recommendation** below the recommendation summary. The merchant can trace each input to buyer evidence, merchant evidence or engine calculation.

Internal costs, contribution floors and merchant sources never appear on the buyer proposal.

### 9.4 Track the deal

Add a collection-action card after acceptance. There is one primary action. A successful test-mode MCP result shows:

- “Created through Razorpay MCP · Test mode”;
- Payment Link identifier;
- amount;
- current status;
- created time;
- link to Audit details.

An unavailable MCP server shows “No Razorpay action occurred” and offers a separately labelled **Use simulated collection for this demo** action.

### 9.5 Audit details

Add two read-only sections:

1. **Commercial Memory:** source eligibility, retrieval query, candidate ranking, reranking attribution, selected chunks, citation validation, suspicious spans and merchant confirmations.
2. **MCP actions:** capability discovery, approval record, arguments hash, idempotency key, tool receipt, response validation and retry history.

Secrets, full access tokens and raw buyer contact information are never displayed.

## 10. Commercial Memory architecture

### 10.1 Storage boundary

P0 uses additive files under the configured application data directory:

```text
data/commercial-memory/             committed fictional demo sources and manifests
<ADAPTIVE_DEALS_DATA_DIR>/knowledge/ session-local source records and index
<ADAPTIVE_DEALS_DATA_DIR>/retrieval/ retrieval runs and confirmations
```

Bundled demo documents are immutable. Session-local records are reset with the demo. No source is written into frozen `data/live-runs/`, `data/demo-run.json`, `ai/` or `evaluation/`.

### 10.2 Source schema

```ts
interface KnowledgeSource {
  schema: "adaptive-deals.knowledge-source.v1";
  id: string;
  merchantId: string;
  buyerId: string | null;
  title: string;
  kind: "rate_card" | "cost_sheet" | "policy" | "service_rules" | "proposal" | "buyer_history" | "tone_guide";
  format: "text" | "csv";
  access: "merchant_wide" | "commercial" | "finance_restricted" | "buyer_specific";
  effectiveFrom: string;
  effectiveTo: string | null;
  supersedes: string | null;
  status: "active" | "superseded" | "withdrawn";
  content: string;
  contentHash: string;
  indexedAt: string;
}
```

Every retrieval begins with merchant, buyer, access, status and effective-date filtering. A score is never used to overcome an eligibility filter.

### 10.3 Chunk schema

```ts
interface KnowledgeChunk {
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
```

Text is split at headings and paragraph boundaries into approximately 400–900 character chunks with limited overlap. A CSV row is one chunk. All offsets refer to the immutable source content.

### 10.4 Retrieval pipeline

1. **Normalise query:** lowercase, currency/amount normalisation, service aliases and buyer identity.
2. **Filter:** merchant, permissions, buyer scope, source status and effective date.
3. **Lexical retrieval:** BM25-style token score, exact phrase boost, service/entity boost and exact amount boost.
4. **Candidate set:** retain a bounded top set with score components recorded.
5. **Constrained AI reranking:** `commercial_retrieval_rerank.v1` receives only candidate IDs, titles and excerpts. It can return candidate IDs and relevance labels only.
6. **Code validation:** unknown/duplicate IDs or unsupported output are rejected. Lexical order remains the fallback.
7. **Reciprocal combination:** code combines lexical and accepted rerank positions; metadata eligibility remains absolute.
8. **Evidence selection:** only top chunks above a pre-registered score threshold reach extraction or display.
9. **Exact citation check:** every displayed quote must be a substring of the source at its stored offsets and match the stored source hash.
10. **Abstain:** if no eligible chunk meets the threshold, return `insufficient_evidence`.

There is no per-case source map. The same retrieval function runs for canonical and unseen queries.

### 10.5 Contradictions and recency

- A newer source does not silently erase an older one. Both remain auditable.
- When two active sources disagree on a commercial value, the field becomes `conflicting_evidence` and the merchant chooses the applicable source or enters a value with a reason.
- A superseded source may appear in audit history but cannot support a new proposed field.
- Source date and status are visible wherever the value is proposed.

### 10.6 Prompt-injection handling

All source text is untrusted data.

- Existing instruction-span detection is reused and extended at chunk creation.
- Suspicious spans are excluded from extraction evidence.
- The reranker prompt receives explicit data delimiters and cannot call tools.
- A source instruction can never alter system instructions, retrieval filters, economics or MCP behavior.
- The merchant sees that a suspicious instruction was ignored.

## 11. AI contracts and attribution

### 11.1 `commercial_retrieval_rerank.v1`

Input:

- decision/query ID;
- normalised query;
- bounded candidate list with opaque chunk ID, title, date and excerpt;
- no credentials, internal cost calculations or MCP tools.

Output:

```ts
{
  order: string[];
  relevance: { chunkId: string; label: "direct" | "supporting" | "irrelevant" }[];
}
```

The model cannot write an answer, figure, citation or action. Code validates all IDs and produces the final retrieval order.

### 11.2 Economics extraction

The existing separately versioned `profile_extract.v1` remains unchanged. Retrieved chunks are assembled into a bounded source bundle with stable separators. Its quote offsets are mapped back to the source and chunk. The existing code verifier still requires the amount to appear in the quote, near the service, and outside an instruction span.

If the bundle format cannot preserve the verifier's guarantees, a new task and evaluation are required; the existing prompt is not edited.

### 11.3 Strategy and message assistance

- Strategy ranking remains code-only.
- `strategy_narrative.v1` may explain code facts but cannot read arbitrary documents or introduce commercial figures.
- `negotiation_message.v1` may later receive approved source excerpts for tone or service wording. All figures and terms remain code-inserted slots.

### 11.4 Live-first and fallback behavior

- Canonical demo queries call Groq when **Run live** is explicitly selected and a key is configured.
- The ordinary guided demo uses a recorded valid run tied to the exact input hash.
- Unseen queries attempt live Groq first when enabled; if unavailable, retrieval proceeds in lexical order and is labelled **Ranked by code · AI unavailable**.
- A recorded answer is used only when its exact query and candidate-set hash match.
- A generic saved answer is never applied to a new query.

## 12. MCP architecture

### 12.1 Capability discovery

The application treats MCP tool names and schemas as runtime data.

```ts
interface McpCapabilityBinding {
  serverId: string;
  serverVersion: string | null;
  catalogHash: string;
  capability: "create_test_payment_link" | "fetch_payment_link";
  toolName: string;
  inputSchemaHash: string;
  discoveredAt: string;
}
```

At connection time, the client lists tools and binds only a tool whose advertised schema can safely represent the required capability. If no such tool exists, the capability is unavailable. Code does not guess a likely tool name.

### 12.2 Action intent

```ts
interface McpActionIntent {
  id: string;
  dealId: string;
  agreementId: string;
  agreementVersion: number;
  termsHash: string;
  capability: "create_test_payment_link";
  serverId: string;
  toolName: string;
  canonicalArguments: Record<string, unknown>;
  argumentsHash: string;
  idempotencyKey: string;
  mode: "test";
  status: "draft" | "approved" | "executing" | "succeeded" | "failed" | "unknown";
  approvedBy: string | null;
  approvedAt: string | null;
}
```

The idempotency key is derived from merchant, agreement, version, terms hash, capability and amount. It contains no secret.

### 12.3 Receipt

```ts
interface McpActionReceipt {
  intentId: string;
  serverId: string;
  toolName: string;
  catalogHash: string;
  argumentsHash: string;
  requestedAt: string;
  completedAt: string | null;
  outcome: "succeeded" | "failed" | "unknown";
  externalId: string | null;
  shortUrl: string | null;
  externalStatus: string | null;
  responseHash: string | null;
  errorCode: string | null;
  safeError: string | null;
}
```

Raw credentials and unrestricted raw output are not stored. The original tool response may be held transiently for schema validation and reduced to allowlisted fields plus a hash.

### 12.4 Execution rules

1. Code, never a model, creates the action intent.
2. The deal must have one active accepted agreement version.
3. The intent's terms hash must equal the current canonical terms.
4. The MCP connection must be test mode and the tool catalog binding must still match.
5. The merchant must approve the exact argument hash.
6. Approval becomes stale if any argument, agreement state, tool schema or catalog hash changes.
7. The same idempotency key cannot create a second action.
8. On timeout, the status becomes `unknown`; the product checks status before offering retry.
9. A malformed tool response fails closed and produces no Payment Link in product state.
10. No buyer message is sent automatically after tool success. Existing merchant approval rules still apply.

### 12.5 Fallbacks

- **MCP unavailable:** show “No Razorpay action occurred.” The merchant may choose the existing simulated collection path.
- **Tool unsupported:** show the discovered catalog and the missing capability in Audit details; do not call an unrelated tool.
- **Authentication failure:** keep the intent failed, show a safe configuration message and never log the secret.
- **Rate limit or transient failure:** respect the server retry signal; never loop automatically.
- **Unknown outcome:** fetch status using the receipt/reference before any retry.
- **Recorded walkthrough:** may replay a saved test-mode receipt only when clearly labelled **Recorded MCP test result · no tool called now**.

## 13. Permissions, privacy and security

### 13.1 P0 single-merchant boundary

- Every source and retrieval query carries `merchantId`, even though P0 has one fictional merchant.
- Tests include a second merchant corpus and require zero cross-merchant hits.
- Finance-restricted sources may support economics proposals but are not shown on buyer-facing surfaces or included in negotiation-message prompts.

### 13.2 Data leaving the application

Before a live Groq or MCP call, the product discloses the categories sent:

- Groq retrieval rerank: query and candidate excerpts.
- Groq extraction: retrieved merchant source excerpts.
- Razorpay MCP: buyer/contact fields required by the tool, amount, currency, description and reference.

The user is not asked to approve each read-only rerank during the guided demo, but the connection and disclosure must be visible in Commercial Memory settings. Every MCP write requires per-action approval.

### 13.3 Secret handling

- API keys and MCP credentials come from environment or an approved connection provider.
- Secrets never enter prompts, source content, receipts, screenshots, logs or committed files.
- Release checks scan committed Commercial Memory and MCP fixtures for key patterns.
- Live Razorpay keys are refused; only test credentials are accepted.

## 14. Failure and edge states

| State | Product behavior |
|---|---|
| No relevant source | Abstain; explain what information is missing. |
| Conflicting active sources | Show both citations; require merchant selection or manual value with reason. |
| Only superseded source matches | Show as history; do not propose a current fact. |
| Suspicious instruction in source | Exclude the span, disclose it and continue with safe evidence if any remains. |
| Reranker unavailable or invalid | Use deterministic lexical order and attribute it to code. |
| Extraction unavailable | Keep retrieved passages visible; create no economics proposal. |
| Unsupported extracted value | Drop it and report why; never show it as confirmed. |
| Citation offset or source hash mismatch | Reject the citation and block confirmation of that value. |
| MCP tool absent | No call; offer labelled simulation. |
| MCP response malformed | Fail closed; store safe error and response hash only. |
| MCP call times out | Mark unknown; reconcile before retry. |
| Double click/retry | Return the existing intent/receipt; never create a second link. |
| Agreement changed after approval | Invalidate the intent and require a new review. |
| Buyer declined or deal closed | No collection action may be prepared or executed. |

## 15. Evaluation plan

No new AI prompt or provider call occurs until its evaluation plan, datasets, hashes, budget and stopping rules are committed.

### 15.1 Retrieval evaluation

Report counts, not percentages:

- Expected source in top 3: X of Y.
- Expected exact passage in top 5: X of Y.
- Correct abstentions: X of Y.
- Conflicting-source cases detected: X of Y.
- Superseded source used as current evidence: target 0.
- Cross-merchant chunks retrieved: target 0.
- Suspicious source instructions followed: target 0.
- Displayed citations with valid exact offsets and source hash: X of Y.
- Invalid reranker outputs safely rejected: X of Y.

The set must include English, Hinglish, service synonyms, amounts written in Indian formats, stale documents, conflicting values, an unrelated buyer, a second merchant and prompt-injection attempts.

### 15.2 End-to-end grounded extraction

- Supported economics fields proposed correctly: X of Y.
- Unsupported economics fields proposed: target 0.
- Conflicts routed to merchant review: X of Y.
- Proposed values activated without merchant confirmation: target 0.
- Retrieval/extraction provenance correctly displayed: X of Y.

### 15.3 MCP verification

- No write before explicit approval: 0 of N.
- Duplicate external Payment Links for one idempotency key: 0 of N.
- Stale approvals refused: X of Y.
- Unsupported tool catalogs refused: X of Y.
- Unknown outcomes reconciled before retry: X of Y.
- Live-mode credentials accepted: target 0.
- Valid test-mode tool executions produce a schema-valid receipt: X of Y.
- Secrets present in stored records or committed fixtures: target 0.

### 15.4 Authorship and claims

If the coding agent writes the retrieval cases, results must say **agent-authored cases, same author as the retrieval logic or prompt**. Hashes prove immutability, not independence. The product note must not claim market validation from these results.

## 16. Product metrics

### 16.1 Prototype metrics

- Time from opening Commercial Memory to a reviewable economics draft.
- Proposed fields confirmed, corrected and rejected, reported as counts.
- Retrieval queries that return sufficient cited evidence, reported as counts.
- MCP action completion and duplicate-prevention counts.
- Judge walkthrough completed without facilitator explanation.

### 16.2 Pilot metrics

- Time from buyer constraint to sent offer.
- Merchant correction rate for retrieved commercial facts.
- Offer recommendations with complete source coverage.
- Accepted contract value and verified cash collected.
- **Primary product metric:** realised contribution within 90 days per eligible stalled deal, using the existing definition.

Retrieval quality and offer outcomes are reported separately. The product does not claim retrieval caused acceptance without a suitable comparison.

## 17. Acceptance criteria

### 17.1 Commercial Memory

- [ ] The corpus contains at least 8 realistic fictional sources across at least 5 source types.
- [ ] Retrieval searches the eligible corpus and has no case-specific source map.
- [ ] Every shown citation reproduces the exact source substring at stored offsets.
- [ ] Every source and chunk carries a merchant ID and source hash.
- [ ] A second-merchant test corpus never appears for Pinecone Media Works.
- [ ] An unseen query can retrieve relevant evidence or honestly abstain.
- [ ] Conflicting current sources create a merchant-review state.
- [ ] Superseded sources cannot support a current proposed value.
- [ ] Prompt-injection text in a source cannot change retrieval filters, economics, prompts or actions.
- [ ] A retrieved value cannot become active Business economics without merchant confirmation and the existing activation review.
- [ ] Buyer-facing pages never expose merchant cost, margin, policy or source content.

### 17.2 AI attribution

- [ ] Each retrieval states whether order came from live AI, an exact recorded run or deterministic code.
- [ ] A recorded rerank is used only for an exact query plus candidate-set hash.
- [ ] Invalid model output falls back without blocking the merchant.
- [ ] No AI output can set an amount, rank an offer, change a rule or choose a tool.

### 17.3 MCP

- [ ] The client discovers tools and validates the advertised schema before binding a capability.
- [ ] Only Razorpay test mode is accepted.
- [ ] The merchant sees the exact action summary and data disclosure before approval.
- [ ] Approval is tied to agreement version, terms hash, arguments hash and tool catalog hash.
- [ ] Repeated execution with the same idempotency key cannot create another Payment Link.
- [ ] Successful execution stores a reduced, schema-valid receipt and shows it in Track and Audit details.
- [ ] Timeout and unknown status are reconciled before retry.
- [ ] MCP failure never silently becomes simulation.
- [ ] No credential is persisted, displayed or committed.

### 17.4 Regression boundary

- [ ] All existing unit, integration and browser journeys pass.
- [ ] The existing 1,060 tests are not weakened to accommodate this work.
- [ ] Protected frozen files remain byte-for-byte unchanged.
- [ ] The ordinary product remains fully usable when Groq and MCP are unavailable.
- [ ] The existing recorded cases continue to replay under their recorded economics.
- [ ] Release checks and secret scans pass.

## 18. Demo storyboard

Target: approximately three minutes.

1. Open Business economics and show the connected Commercial Memory sources.
2. Select **Draft economics from evidence**.
3. Open two citations: a rate-card price and a direct-cost value.
4. Confirm the fields and show the existing review/activation boundary.
5. Start the Reduced Scope case.
6. Show the buyer's evidence and the retrieved merchant evidence beside the offer.
7. Change strategy once to prove code, not AI, owns ranking.
8. Send and accept the proposal.
9. Review the MCP action card, including test-mode label, amount and data disclosure.
10. Approve the test Payment Link action.
11. Show the Razorpay identifier and receipt in Track/Audit details.
12. In Presenter, run one unseen retrieval query and one unsupported query that abstains.

The walkthrough may navigate and run labelled simulated buyer/system events. It may not confirm retrieved facts, activate economics, choose an offer or approve the MCP action for the merchant.

## 19. Phasing and implementation gates

### Phase 0 — capability and data gate

- Verify the connected Razorpay MCP server, authentication method, advertised tools and test-mode behavior without a write.
- Freeze the fictional source corpus and retrieval evaluation design.
- Set the Groq call budget and stopping rules.
- **Gate:** if a safe Payment Link capability is not advertised, retain the MCP UI in unavailable state and scope the demo to a labelled simulation; never invent support.

### Phase 1 — deterministic Commercial Memory

- Source store, chunker, eligibility filters, lexical retrieval, citations, conflicts, injection spans and audit records.
- No AI calls.
- **Gate:** retrieval and isolation evaluation passes deterministic hard criteria.

### Phase 2 — grounded AI assistance

- Reranker schema, validator, prompt and pre-registered evaluation.
- Connect `profile_extract.v1` only if its existing evidence guarantees remain intact.
- Recorded canonical results and code fallback.
- **Gate:** hard safety criteria pass; otherwise ship deterministic retrieval only.

### Phase 3 — product surfaces

- Commercial Memory in Business economics.
- Relevant history in Understand.
- Evidence behind the recommendation in Offer.
- Presenter unseen-query proof.
- **Gate:** focused UI and complete browser journeys on desktop and phone.

### Phase 4 — MCP action layer

- Tool discovery, intent, approval, idempotency, execution, receipt, reconciliation and audit.
- Test mode only.
- **Gate:** no duplicate, stale approval, live-key or secret-handling failure.

### Phase 5 — submission evidence

- Full regression suite, retrieval/MCP counts, screenshot set, demo script, product note and AI build log.
- Applicant-owned judgement sections remain written by the applicant.

## 20. Dependencies and cost boundary

- Groq `openai/gpt-oss-120b` remains the generative provider. A paid Developer tier is recommended for evaluation throughput, with a low spend limit.
- P0 does not require Supabase, a hosted vector database or a paid embedding API.
- Razorpay test credentials and MCP connection details are required for a real test-mode action. They are not pasted into chat or committed.
- The deterministic retrieval and ordinary product work without any credential.
- New dependencies require explicit review for bundle size, offline behavior, licensing and release reproducibility.

## 21. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Local RAG appears hardcoded | No case map; unseen query; visible retrieval trace; abstention and conflict cases; frozen evaluation. |
| Keyword retrieval misses synonyms | Normalisation, service aliases, entity/amount boosts and constrained reranking; report misses. |
| AI reranker makes unsupported claims | It returns IDs and labels only; code owns the answer and citations. |
| Source injection manipulates the model | Treat text as data, remove suspicious spans from evidence, no tools in the reranker, adversarial evaluation. |
| Stale document drives a decision | Effective dates/status filters and visible source version. |
| Historical buyer fact is treated as a commitment | Past-tense copy and separation from current buyer constraints. |
| MCP action duplicates a link | Stable idempotency key, stored intent and reconcile-before-retry. |
| MCP claims exceed actual Razorpay support | Runtime discovery and unavailable state; no guessed tool. |
| Product becomes information-heavy again | One primary action; citations collapsed; raw retrieval stays in Audit/Presenter. |
| New work weakens frozen proof | Additive modules and protected-file hash checks. |

## 22. Open questions

### Blocking before implementation

1. **Razorpay MCP capability — engineering:** Which connected server and transport will be used, and does its advertised test-mode catalog include Payment Link creation and status fetch? Resolve through the Phase 0 read-only probe.
2. **Credential ownership — applicant:** Which local environment holds the Razorpay test credentials and MCP connection configuration? Credentials must be installed outside the repository.
3. **Evaluation budget — applicant:** Approve the separate call budget for `commercial_retrieval_rerank.v1` before its prompt or provider run.

### Non-blocking during implementation

1. **Corpus wording — product:** Review fictional sources so they resemble one coherent agency without encoding the desired query answer unnaturally.
2. **Source disclosure — design:** Final placement of the Groq data-disclosure copy on the Commercial Memory surface.
3. **Adaptive Deals MCP server — product/platform:** Decide after P0 whether to expose read/calculation tools as P1.

## 23. Decision record

1. Option A+ local RAG is selected for the Buildathon.
2. No Supabase migration is included.
3. Retrieval must be genuine across the corpus and demonstrable with unseen input.
4. Semantic vector infrastructure is deferred; P0 hybrid retrieval combines deterministic lexical/entity/amount retrieval with a constrained AI reranker.
5. Merchant-confirmed evidence may update Business economics through its existing versioned review; retrieval alone cannot.
6. MCP is used for an approved Razorpay test-mode collection action, subject to runtime capability discovery.
7. The existing engine, strategy ranking, terms hashes and merchant approval boundaries remain authoritative.
8. No production or market claim is made from fictional sources or agent-authored evaluations.

## 24. Spec self-review

- **Placeholders:** none.
- **Internal consistency:** RAG proposes evidence, code calculates, the merchant approves and MCP executes; no section gives a model authority over price, ranking, rules or actions.
- **Scope:** P0 is one local merchant, a bounded fictional corpus and one Razorpay test-mode MCP write. Supabase, arbitrary files, multi-system connectors and outcome learning are phased out.
- **Ambiguity:** MCP support is deliberately conditional on runtime discovery. The product has an explicit unavailable state rather than an assumed tool.
- **Frozen boundary:** existing frozen prompts, data, evaluation and engine files remain unchanged. New evaluation lives separately.
- **Submission honesty:** recorded, live, code fallback, simulated and MCP test-mode outputs have distinct labels.
