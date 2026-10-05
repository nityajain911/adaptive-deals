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

Open [http://localhost:3000/deals/hero](http://localhost:3000/deals/hero). The deal home always redirects to the stage that currently needs attention.

The prototype works without credentials. After a reset it replays a stored actual Groq run and uses simulated messaging and payments. Set `ADAPTIVE_DEALS_DEMO_RUN=synthetic` to use the hand-written synthetic replay instead.

## Product journey

| Stage | What the merchant does | Route |
| --- | --- | --- |
| **Understand the buyer** | Reviews evidence-backed constraints, sends two useful questions and confirms the buyer's answers | `/deals/hero/understand` |
| **Review the offer** | Reviews the recommended structure, compares eligible alternatives, previews the exact buyer proposal and approves the version | `/deals/hero/offer` |
| **Buyer preview** | Sees the same canonical terms and the exact simulated WhatsApp message before sending | `/deals/hero/offer/preview` |
| **Track the deal** | Sees the current agreement, amount collected, amount still to collect, next action and preventive amendment | `/deals/hero/track` |
| **Buyer proposal** | Accepts, requests a change or declines a delivered version | `/proposal/agr-hero/v1` and `/proposal/agr-hero/v2` |
| **Presenter** | Holds scenario controls, run evidence, the event log and secondary outcomes | `/presenter` |

The old `/workspace`, `/clarification`, `/decision`, `/agreement` and `/timeline` URLs remain only as redirects into the current deal stage.

### Buildathon walkthrough and audit

Open `/deals` for the first-visit experience, choose **Start walkthrough**, then deliberately select a fictional buyer case. The walkthrough follows the deal's real stored state, survives route changes and reloads, and can be reopened from **Walkthrough** in the merchant header. On phones it starts as a compact bottom sheet so the product action stays visible.

The guide explains the current decision and can take the reviewer to the relevant product area. Merchant decisions—including sending questions, approving terms and closing a deal—remain in the product. The guide can execute only clearly labelled simulated buyer replies and system events. **Hide** leaves the product usable on its own; **Restart** confirms before atomically returning to case selection. No recommendation, price or AI answer is copied into the walkthrough.

**Audit details** opens a read-only drawer with source evidence, rules, calculations, approvals, deliveries, schedules, hashes and run attribution. The primary product screens show only the information needed for the current decision.

## What AI does

- Extracts candidate buyer constraints with verbatim evidence.
- Drafts clarification wording.
- Prioritises and explains only structures that deterministic code has marked eligible.

Code normalises amounts and dates, enumerates every merchant-approved template, calculates GST and economics, applies policies, creates canonical terms and hashes, and gates every approval and payment action. Payment-change replies use narrow deterministic rules because an interpretation error could move money; unsupported language goes to the merchant.

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

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Unit and integration tests |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint check |
| `npm run build` | Production build |
| `npm run test:e2e` | Desktop and mobile browser journeys; writes review screenshots unless `ADAPTIVE_E2E_NO_SHOTS=1` |
| `npm run check:release -- --build` | Checks product claims and reports applicant-owned placeholders without failing on them |
| `npm run check:release -- --submission` | Final gate; also fails while applicant-owned sections remain |
| `npm run reset:seed` | Restores the clean hero deal |
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
data/synthetic/         fictional hero fixture, replay outputs and failure scenarios
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
- The evidence consists of one synthetic merchant segment, one main deal and agent-conducted role inspections. It does not establish market frequency.
- How often Indian service sellers negotiate commercial structure over WhatsApp remains an assumption to validate.
