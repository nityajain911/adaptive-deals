# Adaptive Deals by Razorpay — prototype

Adaptive Deals turns a buyer's budget, timing and approval constraints into commercial structures that a small service seller can actually deliver and collect. The prototype connects three merchant stages—understand the buyer, review the offer and track the deal—to a buyer proposal and a versioned amendment flow.

Built for the Razorpay × ISB AI Product Manager Build Challenge (Track 2).

> **Synthetic prototype.** Pinecone Media Works, Harbour Fresh Foods, every amount, policy and date, and all WhatsApp and payment events are fictional. Payments are simulated, or use Razorpay test mode when test credentials are supplied. This is not a live Razorpay product.

## Run locally

Requires Node 20.9 or later.

```bash
npm install
npm run reset:seed
npm run dev
```

Open [http://localhost:3000/deals](http://localhost:3000/deals) and choose a case. The deal home (`/deals/hero`) always redirects to the stage that currently needs attention.

The prototype works without credentials and makes no model call during its saved replay. **Start small, see results first** (Harbour Fresh Foods) starts from a real, frozen Cerebras run of that exact conversation, labelled **Recorded Cerebras output** in the reviewer audit trail. The other two cases use clearly labelled **hand-written sample output**. New live runs use Cerebras by default when `CEREBRAS_API_KEY` is configured. Three earlier Groq runs are kept unchanged as historical evidence of the previous conversations. Messaging and payments are simulated.

## Product journey

| Stage | What the merchant does | Route |
| --- | --- | --- |
| **Understand the buyer** | Reviews evidence-backed constraints, sends two useful questions and confirms the buyer's answers, or confirms required services the extraction could not map | `/deals/hero/understand` |
| **Review the offer** | Reviews the recommended offer, sees the other offers it could send, previews the exact buyer proposal and approves the version | `/deals/hero/offer` |
| **Buyer preview** | Sees the same canonical terms and the exact simulated WhatsApp message before sending | `/deals/hero/offer/preview` |
| **Track the deal** | Sees the current agreement, amount collected, amount still to collect, next action and preventive amendment | `/deals/hero/track` |
| **Buyer proposal** | Accepts, requests a change or declines a delivered version | `/proposal/agr-hero/v1` and `/proposal/agr-hero/v2` |
| **Presenter** | Holds scenario controls, run evidence, the event log and secondary outcomes | `/presenter` |

The old `/workspace`, `/clarification`, `/decision`, `/agreement` and `/timeline` URLs remain only as redirects into the current deal stage.

### Buildathon walkthrough and audit

Open `/deals` for the first-visit experience, choose **Start walkthrough**, then deliberately select a fictional buyer case. The walkthrough follows the deal's real stored state, survives route changes and reloads, and can be reopened from **Walkthrough** in the merchant header. On phones it starts as a compact bottom sheet so the product action stays visible.

The guide explains the current decision. On a merchant step it names the product's own button (**Your turn**) and **Show me** scrolls to and highlights it without clicking it; only clearly labelled simulated buyer and system events have a guide button. Merchant decisions—including sending questions, approving terms and closing a deal—remain in the product. The guide can execute only clearly labelled simulated buyer replies and system events. **Hide** leaves the product usable on its own; **Restart** confirms before atomically returning to case selection. No recommendation, price or AI answer is copied into the walkthrough.

**Audit details** opens a read-only drawer with source evidence, rules, calculations, approvals, deliveries, schedules, hashes and run attribution. The primary product screens show only the information needed for the current decision.

## What AI does

- Extracts candidate buyer constraints with verbatim evidence.
- Drafts clarification wording.
- Writes bounded reasons for structures that deterministic code has marked eligible.

Code normalises amounts and dates, enumerates every merchant-approved template, calculates GST and economics, applies policies, ranks the eligible offers according to the merchant's chosen priority, validates every model output, creates canonical terms and hashes, and gates every approval and payment action. A recorded model order is retained as evidence but does not drive the recommendation. Payment-change replies use narrow deterministic rules because an interpretation error could move money; unsupported language goes to the merchant.

Who or what produced an output is shown in the reviewer audit trail (**Presenter → Audit trail for this deal**), derived from the stored run rather than from the feature. The merchant's own screens stay in plain words: an offer card says *Suggested for the default priority: earning the most*, *Suggested for what matters most to you*, or *You chose this offer*, because code ranks the offers by the merchant's priority and works out every figure.

### Commercial Memory (RAG)

Commercial Memory retrieves only evidence the merchant is allowed to use: active rate cards, direct-cost records, policies, service rules and buyer-specific history. Eligibility is applied before ranking. Each result keeps the exact source substring and offsets; weak matches abstain, conflicting active values are blocked, and source text is treated as untrusted data.

Prices & costs can be drafted from this evidence, but a merchant must select the values, review the ordinary version diff and activate it. Deal decisions then combine three distinct inputs: the buyer's confirmed words, the merchant's cited business records and deterministic engine checks. Private costs and policies never reach the buyer proposal.

The presenter page includes an unseen-query proof. Lexical code retrieval always runs first. The optional, separately versioned reranker uses the configured live provider and can reorder only the closed list of eligible chunk IDs; an invalid response or unavailable provider keeps the code order and says so. The frozen, agent-authored retrieval set currently records 13 of 13 expected sources in the top three, 2 of 2 abstentions, and 32 of 32 valid citations. These are synthetic product checks, not independent validation.

Run the reproducible code-only report with `npm run eval:memory`. No model call is required.

#### Bring your own rate card or cost sheet

On **Deal settings**, **Upload your rate card** (it becomes **Update source** once a document is synced) opens a dialog that accepts a CSV, pasted text, or a **text-based PDF** (up to 1.5 MB and 10 pages). The file stays in the local data directory. **Two readers propose values and code checks both.** A built-in line reader finds each service by name and reads exactly one amount per line or row. An AI reader (Cerebras `gpt-oss-120b`, prompt `read_document.v1`) can also propose values, including for a service the document names differently. The AI returns words and a verbatim quote only; code must find that quote in the document, read exactly one amount out of it, match the amount the AI wrote, and see no second service or instruction, or the value is dropped. In the product the AI path replays a **recorded** Cerebras reading for the exact sample documents and makes no live call unless `ADAPTIVE_DEALS_DOCUMENT_AI=live` and a Cerebras key are set; any other document is read by the line reader alone and says so. A value the AI matched under another name is marked for the merchant to confirm. The four-document check and the five injected mistakes are in `docs/DOCUMENT_READING_EVAL.md`; re-score it with `npx tsx --conditions=react-server scripts/run-document-eval.ts` (no model call). Lines it cannot use (an unknown service, a formula cell, two amounts, an instruction hidden in the text) are listed with the reason. A document with nothing usable is refused whole.

PDFs are read from their text layer only, using `unpdf` (pdf.js, no script or font execution). A scan, an encrypted file, a file that is not a PDF, or one over the limits is refused with its reason, and the product shows the text it read so the merchant can see what it saw. Excel files, images and scans are not supported. Fictional sample documents to try are in `public/sample-documents/`. An uploaded value that disagrees with a sample document is a conflict the merchant must resolve, by replacing the sample or withdrawing the upload. Nothing reaches Prices & costs until the merchant confirms each value and then reviews and activates the new version.

### Approved Razorpay action layer (MCP)

After buyer acceptance, Adaptive Deals can prepare one canonical test-mode Payment Link intent behind an injected MCP transport. Code discovers the tool catalog at runtime and binds only an advertised Razorpay test capability whose schema supports the exact amount, currency, description, reference and idempotency key. A model never chooses the tool or its arguments.

The merchant's approval binds the agreement version, terms hash, argument hash, input-schema hash and catalog hash. A repeated execution returns the existing reduced receipt. A timeout becomes **unknown** and must use an advertised read capability before another write; malformed output fails closed. Raw provider output and credentials are never stored.

No Razorpay MCP server or tool was exposed in this build environment. Therefore Track and Audit show **Razorpay MCP is not connected** and **No Razorpay MCP action occurred**; the existing collection path remains separately labelled simulated. `evaluation/mcp/` records this gate and the injected-transport safety counts. A real test action requires a connected server that advertises a compatible test-mode tool and credentials configured outside the repository.

#### Connecting to Razorpay's MCP server (test mode only)

The product can now reach Razorpay's own MCP server, but only when you opt in from your own terminal. Create free test API keys (Razorpay dashboard in Test Mode: Account & Settings, API Keys, Generate Key). Then set, outside the repository (for example in `.env.local`, which is git-ignored):

```bash
RAZORPAY_MCP_MODE=remote        # or stdio (a local Docker or binary server)
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

Step 1 is read-only: `npm run mcp:discover` connects, lists the tools the server advertises and reports whether the Payment Link capability can bind. It never calls a tool. Only `rzp_test_` keys are accepted, and the remote endpoint is fixed to `https://mcp.razorpay.com/mcp`, so a key cannot be sent anywhere else.

Razorpay's server describes its tools differently from our approval contract, so `mcp/razorpay-adapter.ts` translates. It binds `create_payment_link` only if the server advertises the parameters we rely on, including the ones that switch SMS, email and reminders off, and it ties the approval to a hash of the server's own schema. It can call exactly two tools (`create_payment_link` and `fetch_all_payment_links`) and always sends notifications off. The test or live environment comes from your key, because the server itself has no such switch.

Step 2 happens on Track after the buyer accepts: **Review Razorpay test Payment Link**, then **Approve and create test Payment Link**. If a request times out, the outcome is marked unknown and reconciled by `reference_id` before any retry. Everything above is tested against a fake Razorpay MCP server. On 9 Oct 2026 the read-only discovery was run against Razorpay's hosted server with a test key: it advertised 42 tools, the Payment Link capability bound as compatible, and no tool was called (`evaluation-assist/results/mcp-discovery-2026-10-09.json`). On 9 Oct 2026 the real create path was also exercised in test mode: the agreement payment of ₹23,010 was rejected by Razorpay ("amount exceeds maximum amount allowed"), while ₹100, ₹10,000 and ₹15,000 diagnostic links were created with SMS, email and reminders off (`evaluation-assist/results/mcp-first-test-link-2026-10-09.json`). The account has a per-link cap between ₹15,000 and ₹20,000; the exact cap is unknown.

## Recorded model runs

### Current hero recording

On 13 October 2026, the hero conversation (Harbour Fresh Foods, a buyer who wants to start small and see results first, told over eight messages) was run once on Cerebras `gpt-oss-120b` under its own pre-call freeze (`data/synthetic/CASE_RECORDING_FREEZE_BATCH7.json`, committed before the call). Three provider requests were made—extract, clarify and explain—with no retry and no rejected attempt. The first technically valid outputs were kept. The model found the buyer's budget, next budget date, approval limit, required services and the buyer's own success test, drafted both clarification questions, and reached the expected phased-scope offer family. The committed run is `data/case-recorded-runs/run-case-reduced-scope-4e94d36d.json`, and its report is `data/case-recorded-runs/cerebras-reduced-scope-harbour-fresh-recording-report.json`. The earlier Kestrel Lane Clinics hero run (`ed5442a3`) is kept as evidence and no longer maps to any case. The conversation also has the merchant's promise to hold today's monthly rates for the rest of the year and the buyer's go-ahead test. The product carries the rate hold as a *held offer* in the terms of a first-phase proposal (₹84,960 including GST, three quarterly payments from 1 Feb 2027, held until 18 Mar 2027, checked by the same engine and bound to the same terms hash). After the month-three review the merchant sends it as version 3, which the buyer accepts and pays on their own page with a payment setup of its own; the deal is two phases and closes in the second. The buyer's test is shown as a *Condition* and the product never judges it.

The product loads this recording only when its deal ID and complete conversation match the current hero case byte for byte. A mismatch falls back to the labelled hand-written sample. Replaying it makes no provider call.

### Second recording batch (12 October 2026)

On the applicant's explicit go, the remaining two cases were each run once on Cerebras `gpt-oss-120b` under the same frozen prompts and the same policy (`data/synthetic/CASE_RECORDING_FREEZE_BATCH2.json`; first valid outputs kept, technical retries only). Each used one provider request, no retry.

- **No fit** (`run-case-no-fit-6fb4027d`): a clean extraction. The engine reaches the case's expected outcome, no approved offer fits, so the case now replays **Recorded Cerebras output**.
- **Keep the annual scope, move the start:** the first three attempts (`run-case-preserve-scope-fcc306d2`, `ff0d6acf`, `9a841334`) all missed identically, so the case stayed on its labelled sample and the attempts were kept as evidence. The cause was in the case text: the buyer's sentence began "This quarter is tight", the model returned "this quarter" in lowercase, and the exact, case-sensitive quote check rejected it, so the engine stopped at *insufficient information*. On the applicant's instruction only that one message was reworded ("…right now, as this quarter is tight."), the rule for the next attempt was written before the call (`CASE_RECORDING_FREEZE_BATCH6.json`: one attempt, final whatever it is), and the single new attempt (`run-case-preserve-scope-1ec088fa`, two requests) reached the expected deferred-start offer, so this case now replays **Recorded Cerebras output** too. Its misses are kept: "the complete annual package" matches no package (the merchant confirms the services) and the GST statement was rejected as conflicting. This is product evidence, not an evaluation. A reworded message changes only that case: the hero and no-fit recordings and texts are untouched.

## Earlier Groq recordings (historical)

> **Status, 8 October 2026.** These recordings were made on the first version of the three case conversations. The conversations were later rewritten as realistic chats, so these Groq recordings no longer match a case the merchant can start. They remain unchanged as historical evidence (`data/synthetic/recorded-conversations.ts` holds their exact inputs, and `tests/data/case-recordings.test.ts` verifies them).

Each case had one real Groq run (`openai/gpt-oss-120b`, prompts `extract.v2`, `clarify.v1`, `explain.v3`), recorded once, kept as it came, misses included. Seven provider requests were made: five tasks produced usable model output, and two attempts at one task broke the declared output schema. The report is `data/case-recorded-runs/recording-report.json`. These are product evidence for three fictional cases, not an evaluation.

| Case | What the recording shows | What the merchant does |
| --- | --- | --- |
| **Start small, see results first** (Harbour Fresh Foods) | The earlier Groq recording remains historical. The current case uses the exact-match Cerebras recording described above. | Code recommends the **two-payment** offer under *Protect contribution*. **Preserve scope** leads with the annual offer, says it needs the buyer's MD approval and names the best offer without it. Back on *Protect contribution*, the preventive restructuring journey continues. |
| **Keep the annual scope, move the start** | Schema-valid extraction with one rejected required-scope field ("complete annual package" names no service) and one missed GST fact. The model's explanation broke its schema twice, so code writes the explanation. | **Confirms the required services** before any offer. The engine then recalculates, and the card reads *Recalculated by the engine after the merchant confirmed the services · explanation written by code.* |
| **Decline an impossible start date** | A clean extraction. | Reads why the engine rejects every approved structure, and closes the deal. |

One of the seven requests is not stored: the recorder did not save the second schema-invalid output (it only preserved an output it was about to retry), and the failure reason is the only record of it. The recorder was fixed afterwards. The report says so and the output has not been reconstructed.

## Environment variables

Copy `.env.example` to `.env.local`. Every variable is optional.

| Variable | Purpose |
| --- | --- |
| `ADAPTIVE_DEALS_PROVIDER` | `cerebras` (default), `groq` or `anthropic`; backend-only and applied after restart |
| `CEREBRAS_API_KEY` | Enables new live Cerebras runs and live reranking with the default provider |
| `GROQ_API_KEY` | Used only when the backend provider is set to Groq |
| `ADAPTIVE_DEALS_MODEL` | Provider model ID |
| `ANTHROPIC_API_KEY` | Used only with the Anthropic provider |
| `RAZORPAY_MODE` | `test` creates the upfront link in Razorpay test mode; other values simulate it |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Test keys only; live keys are refused |
| `ADAPTIVE_DEALS_DATA_DIR` | JSON store location; defaults to git-ignored `.data/` |
| `ADAPTIVE_DEALS_DEMO_RUN` | `synthetic` forces the labelled hand-written sample; otherwise an exact-match committed recording is used when available |

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Unit and integration tests |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint check |
| `npm run build` | Production build |
| `npm run test:e2e` | Browser journeys against the sample product on port 3200 and a localhost-only Cerebras fixture on port 3202; writes review screenshots unless `ADAPTIVE_E2E_NO_SHOTS=1` |
| `npm run check:release -- --build` | Checks product claims and reports applicant-owned placeholders without failing on them |
| `npm run check:release -- --submission` | Final gate; also fails while applicant-owned sections remain |
| `npm run reset:seed` | Restores the clean default case |
| `npm run hero:report` | Prints every evaluated hero structure and its checks |
| `npm run eval` | Development evaluation |
| `npm run eval:frozen` | Frozen evaluation tooling and recorded-set validation |

## Recorded evaluation

The frozen evaluation ran once against prompts `extract.v2`, `clarify.v1` and `explain.v3` on 20 labelled cases. It recorded 42 of 47 expected fields correctly extracted, 2 unsupported fields, 4 of 6 required clarifications asked, 0 unnecessary clarifications, 14 of 16 failure states correctly identified, and 0 of 120 failing options presented as approvable.

The 20 cases were authored by OpenAI Codex at Nitya Jain's direction. They are agent-authored and are not independent validation. The later connected journey and interface changes did not alter the frozen prompts, schemas, validators or result.

## Architecture

```text
domain/                 deterministic money, dates, templates, checks, economics,
                        agreement hashes, collections, amendments and state machines
ai/                     frozen schemas, versioned prompts, providers and run records
data/synthetic/         fictional cases, hand-written sample outputs and failure scenarios
data/case-recorded-runs/ the current exact-match Cerebras hero run plus three historical Groq runs
integrations/razorpay/  test-key guard and simulated/test-mode payment links
evaluation/             development data and frozen evaluation records
lib/                    service, derived product views, JSON store and walkthrough orchestration
app/, components/       three-stage merchant product, buyer proposal, walkthrough, presenter and audit
```

## Boundaries

- WhatsApp is simulated; no message is sent to a real buyer.
- The buyer proposal has no authentication.
- Mandates, recurring debits, retries and notices are simulated. A mandate does not guarantee payment.
- Razorpay payment-link integration accepts test keys only.
- Buyer MD approval is an attestation, not identity verification.
- Service dates are contractual plans; actual delivery completion is not tracked.
- Refunds, external payments and accounting reconciliation are not modelled.
- The evidence consists of one synthetic merchant segment, three fictional cases (three current recorded Cerebras runs, one per case, with a hand-written sample as the fallback for each), earlier historical model runs, and agent-conducted role inspections. It does not establish market frequency.
- How often Indian service sellers negotiate commercial structure over WhatsApp remains an assumption to validate.

## Hosting a public demo

No database or Supabase is needed. Set `ADAPTIVE_DEALS_SESSIONS=1` and every visitor gets a private copy of the state (a random cookie id, files under `sessions/<id>/`), so reviewers do not interfere with each other. See `docs/DEPLOY.md`, `render.yaml` and the `Dockerfile`. It runs with no model or Razorpay keys.
