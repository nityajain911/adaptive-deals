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

The prototype works without credentials. After a reset each case starts from its **recorded Groq run** (`data/case-recorded-runs/`, mapped by `data/case-runs.json`), replayed exactly from the stored outputs: no model call is made while you use it. If a case has no valid recording for its exact conversation, the product falls back to a hand-written sample, labelled **Sample output written by hand · no model ran**. Set `ADAPTIVE_DEALS_DEMO_RUN=synthetic` to force the sample. Messaging and payments are simulated.

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

Every attribution on screen is derived from the stored run, not from the feature: a recorded run reads **Recorded Groq output**, a hand-written sample reads **Sample output written by hand · no model ran**, and an offer card says **Default strategy · offers ranked by code · explained by code** (or **Strategy selected by you**, or **You selected this offer**), because code ranks the offers by the merchant's strategy and writes the explanation. The recorded model's own order and reason are kept behind an information control as **historical evidence that does not drive the current recommendation**.

## Recorded model runs

Each case has one real Groq run (`openai/gpt-oss-120b`, prompts `extract.v2`, `clarify.v1`, `explain.v3`), recorded once, kept as it came, misses included. Seven provider requests were made: five tasks produced usable model output, and two attempts at one task broke the declared output schema. The report is `data/case-recorded-runs/recording-report.json`. These are product evidence for three fictional cases, not an evaluation.

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
| `ADAPTIVE_DEALS_DEMO_RUN` | `synthetic` forces the labelled hand-written sample instead of the recorded runs |

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Unit and integration tests |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint check |
| `npm run build` | Production build |
| `npm run test:e2e` | Desktop and mobile browser journeys against two production servers (the labelled sample on port 3200, the recorded runs on 3201); writes review screenshots unless `ADAPTIVE_E2E_NO_SHOTS=1`; set `ADAPTIVE_E2E_SHOT_PREFIX` (for example `ux-2026-10-06-`) to write a new set without overwriting existing files |
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
data/case-recorded-runs/ the three recorded Groq runs and their recording report
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
