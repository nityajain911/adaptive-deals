# Adaptive Deals by Razorpay — prototype

Adaptive Deals turns a buyer's budget, timing and approval constraints into commercial structures that a small service seller can actually deliver and collect. The prototype connects three merchant stages—understand the buyer, review the offer and track the deal—to a buyer proposal and a versioned amendment flow.

Built for the Razorpay × ISB AI Product Manager Build Challenge (Track 2).

> **Synthetic prototype.** Pinecone Media Works, Kestrel Lane Clinics, every amount, policy and date, and all WhatsApp and payment events are fictional. Payments are simulated, or use Razorpay test mode when test credentials are supplied. This is not a live Razorpay product.

## Run locally

Requires Node 20.9 or later.

```bash
npm install
npm run reset:seed
npm run dev
```

Open [http://localhost:3000/deals](http://localhost:3000/deals) and choose a case. The deal home (`/deals/hero`) always redirects to the stage that currently needs attention.

The prototype works without credentials. Each case starts from a **hand-written sample output** (`data/synthetic/`), labelled **Sample output written by hand · no AI ran** in the reviewer audit trail, and no model call is made while you use it. The three earlier real Groq runs are kept unchanged in `data/case-recorded-runs/` as historical evidence; the case conversations were later rewritten to read like real WhatsApp chats, so those recordings no longer belong to any case the merchant can start (see **Recorded model runs** below). Messaging and payments are simulated.

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
- Ranks, and writes a short reason for, structures that deterministic code has marked eligible.

Code normalises amounts and dates, enumerates every merchant-approved template, calculates GST and economics, applies policies, validates every model output, creates canonical terms and hashes, and gates every approval and payment action. Payment-change replies use narrow deterministic rules because an interpretation error could move money; unsupported language goes to the merchant.

Who or what produced an output is shown in the reviewer audit trail (**For reviewers → Audit trail for this deal**), derived from the stored run rather than from the feature. The merchant's own screens stay in plain words: an offer card says *Suggested for the default priority: earning the most*, *Suggested for what matters most to you*, or *You chose this offer*, because code ranks the offers by the merchant's priority and works out every figure.

### Commercial Memory (RAG)

Commercial Memory retrieves only evidence the merchant is allowed to use: active rate cards, direct-cost records, policies, service rules and buyer-specific history. Eligibility is applied before ranking. Each result keeps the exact source substring and offsets; weak matches abstain, conflicting active values are blocked, and source text is treated as untrusted data.

Prices & costs can be drafted from this evidence, but a merchant must select the values, review the ordinary version diff and activate it. Deal decisions then combine three distinct inputs: the buyer's confirmed words, the merchant's cited business records and deterministic engine checks. Private costs and policies never reach the buyer proposal.

The presenter page includes an unseen-query proof. Lexical code retrieval always runs first. The optional, separately versioned Groq reranker can reorder only the closed list of eligible chunk IDs; an invalid response or unavailable provider keeps the code order and says so. The frozen, agent-authored retrieval set currently records 13 of 13 expected sources in the top three, 2 of 2 abstentions, and 32 of 32 valid citations. These are synthetic product checks, not independent validation.

Run the reproducible code-only report with `npm run eval:memory`. No Groq call is required.

#### Bring your own rate card or cost sheet

On Prices & costs, **Add your own rate card or cost sheet** accepts a CSV, pasted text, or a **text-based PDF** (up to 1.5 MB and 10 pages). The file stays on the local data directory and **no model reads it**: code finds each service by name and reads exactly one amount per line or row, and every proposed value quotes the exact line it came from. Lines it cannot use (an unknown service, a formula cell, two amounts, an instruction hidden in the text) are listed with the reason. A document with nothing usable is refused whole.

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

## Recorded model runs (historical)

> **Status, 8 October 2026.** These recordings were made on the first version of the three case conversations. The conversations have since been rewritten as realistic chats, so the recordings no longer match any case and the product does not load them. They are kept unchanged as evidence of what the frozen prompts did on real model output (`data/synthetic/recorded-conversations.ts` holds the exact messages they replay against, and `tests/data/case-recordings.test.ts` still verifies them). Re-recording on the rewritten conversations needs a provider key and is a separate, approved step.

Each case had one real Groq run (`openai/gpt-oss-120b`, prompts `extract.v2`, `clarify.v1`, `explain.v3`), recorded once, kept as it came, misses included. Seven provider requests were made: five tasks produced usable model output, and two attempts at one task broke the declared output schema. The report is `data/case-recorded-runs/recording-report.json`. These are product evidence for three fictional cases, not an evaluation.

| Case | What the recording shows | What the merchant does |
| --- | --- | --- |
| **Repair bookings now, defer social** | Groq extracts the constraints and words both questions. Its recorded run also ranked the single upfront payment first, with per-offer reasons; that is kept as history only. | Code recommends the **two-payment** offer under *Protect contribution*. **Preserve scope** leads with the annual offer, says it needs the buyer's MD approval and names the best offer without it. Back on *Protect contribution*, the preventive restructuring journey continues. |
| **Keep the annual scope, move the start** | Schema-valid extraction with one rejected required-scope field ("complete annual package" names no service) and one missed GST fact. The model's explanation broke its schema twice, so code writes the explanation. | **Confirms the required services** before any offer. The engine then recalculates, and the card reads *Recalculated by the engine after the merchant confirmed the services · explanation written by code.* |
| **Decline an impossible start date** | A clean extraction. | Reads why the engine rejects every approved structure, and closes the deal. |

One of the seven requests is not stored: the recorder did not save the second schema-invalid output (it only preserved an output it was about to retry), and the failure reason is the only record of it. The recorder was fixed afterwards. The report says so and the output has not been reconstructed.

## Environment variables

Copy `.env.example` to `.env.local`. Every variable is optional.

| Variable | Purpose |
| --- | --- |
| `ADAPTIVE_DEALS_PROVIDER` | `groq` (default) or `anthropic` |
| `GROQ_API_KEY` | Enables a new live Groq run from the presenter page |
| `ADAPTIVE_DEALS_MODEL` | Provider model ID |
| `ANTHROPIC_API_KEY` | Used only with the Anthropic provider |
| `RAZORPAY_MODE` | `test` creates the upfront link in Razorpay test mode; other values simulate it |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Test keys only; live keys are refused |
| `ADAPTIVE_DEALS_DATA_DIR` | JSON store location; defaults to git-ignored `.data/` |
| `ADAPTIVE_DEALS_DEMO_RUN` | `synthetic` forces the labelled hand-written sample (the default behaviour while no recording matches a case) |

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Unit and integration tests |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint check |
| `npm run build` | Production build |
| `npm run test:e2e` | Desktop and mobile browser journeys against one production server on port 3200 (the labelled hand-written sample); writes review screenshots unless `ADAPTIVE_E2E_NO_SHOTS=1`; set `ADAPTIVE_E2E_SHOT_PREFIX` (for example `ux-2026-10-06-`) to write a new set without overwriting existing files |
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
data/case-recorded-runs/ the three historical Groq runs and their recording report (not loaded by the product)
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
- The evidence consists of one synthetic merchant segment, three fictional cases (one recorded model run each) and agent-conducted role inspections. It does not establish market frequency.
- How often Indian service sellers negotiate commercial structure over WhatsApp remains an assumption to validate.
