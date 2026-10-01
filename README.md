# Adaptive Deals by Razorpay — prototype

An AI commercial-structuring layer for small service businesses. It turns a buyer's budget, timing and approval constraints into deal options both parties can carry out. It rejects structures the seller cannot afford, and carries the accepted agreement into payment rails. Built for the Razorpay × ISB AI Product Manager Build Challenge (Track 2).

**Everything here is synthetic.** The merchant (Pinecone Media Works), the buyer (Kestrel Lane Clinics), and every price, cost, policy and date are fictional. Payments are simulated, or Razorpay **test mode** when you configure test keys. This is not a Razorpay product.

## Run it

Requires Node 20.9+ (developed on Node 24).

```bash
npm install
npm run reset:seed     # clean demo state in .data/
npm run dev            # http://localhost:3000
```

The app runs fully without credentials. After a reset it shows a committed **actual Groq run** (`data/demo-run.json` → `data/live-runs/`), replayed from its stored outputs, and simulates payments. Set `ADAPTIVE_DEALS_DEMO_RUN=synthetic` to show the hand-written **Synthetic replay** instead.

### Demo

Open `/workspace` and use the **Guided demo** bar: **Do this step** performs each storyboard step in order. `DEMO_SCRIPT.md` has the 90-second walkthrough. **Reset demo** (or `npm run reset:seed`) starts again.

| View | Route |
| --- | --- |
| 1. Workspace · conversation: the simulated WhatsApp thread (AI drafts the merchant sends, simulated buyer replies, pause control), evidence-backed constraint cards, derived budget gap, **Other outcomes** | `/workspace` |
| 2. Clarification: engine-derived reasons, recorded answers, manual answer form | `/clarification` |
| 3. Decision: one **Recommended** card (projected contribution, peak funding requirement, approval status, why), compact alternatives, one buyer-side and one seller-side rejection, **View details**, **Applied merchant rules** drawer | `/decision` |
| 4. Agreement (merchant): versions, hash match, proposal link, payment link, mandate | `/agreement` |
| Buyer proposal: standalone mobile-first page with **Accept proposal**, **Request a change** and **Decline**, and collapsed **Agreement details**. A thin **Demo control** bar sits outside the buyer frame | `/proposal/agr-hero/v1`, `/v2` for the revision |
| 5. Deal timeline: conversation after acceptance, **Buyer-triggered restructuring** (change requested → draft amendment → two approvals → payment rescheduled), ledger, schedules, version history, event log, close | `/timeline` |

## Environment variables

Copy `.env.example` to `.env.local`. Every variable is optional.

| Variable | Purpose |
| --- | --- |
| `ADAPTIVE_DEALS_PROVIDER` | `groq` (default) or `anthropic`. |
| `GROQ_API_KEY` | Enables **Run live** on Groq (official `groq-sdk`, strict JSON-schema output). Without it, Run live is disabled and says why. |
| `ADAPTIVE_DEALS_MODEL` | Model ID. Default `openai/gpt-oss-120b` for Groq, `claude-opus-5` for Anthropic. |
| `ANTHROPIC_API_KEY` | Used only when `ADAPTIVE_DEALS_PROVIDER=anthropic`. |
| `RAZORPAY_MODE` | `test` to create the upfront payment link in Razorpay **test mode**; anything else simulates. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Test keys only. Keys must start with `rzp_test_`; `rzp_live_` and any other form are refused. |
| `ADAPTIVE_DEALS_DATA_DIR` | Location of the JSON store (default `.data/`, git-ignored). |

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run typecheck` · `npm run lint` · `npm run build` | Static checks and production build |
| `npm run test:e2e` | Playwright journey across the merchant views and the buyer proposal, at 1440 px and 390 px, including keyboard and expand/collapse checks; writes screenshots to `artifacts/ui-review/` |
| `npm run reset:seed` | Restore the clean demo state |
| `npm run hero:report` | Print every hero structure with its engine result |
| `npm run replay:build` | Rebuild the bundled synthetic replay from the hand-written synthetic AI outputs |
| `npm run eval` | Development-set evaluation (live model if a key is set; otherwise a clearly labelled reference-extraction check) |
| `npm run eval:frozen` | Frozen test set: import, validate, freeze, run. See `evaluation/datasets/frozen/README.md` |

## Labels you will see

| Label | Meaning |
| --- | --- |
| **Synthetic data** | Invented fixture data. |
| **Synthetic replay · run ID …** | The bundled run. Its AI outputs were written by hand; the engine results are real computations. It is not a model run. |
| **Replay of an actual run · run ID …** | A stored run that a real model produced (after Run live with a key). |
| **Live run · run ID …** | A run in progress with a real model. |
| **Simulated** / **Simulated event** / **Simulated date: …** | A local stand-in for a payment, mandate, debit, notice or clock advance. |
| **Razorpay test mode** | A real call to Razorpay's test environment. |
| **Demo control** · **Demo buyer view** | The buyer proposal is a no-login demonstration of what the buyer accepts. It is not a buyer portal. |
| **WhatsApp simulated · buyer replies selected by the demo operator** | The conversation channel. No message reaches anyone. |
| **Suggested by AI** / **Approved and sent by merchant** / **Received from buyer** / **Sent by Adaptive Deals** | Conversation message states. Proposal, payment, notice and amendment messages are written by code from verified state. |
| **Read by code · reply-rules.v1 · not AI** | A buyer's payment-change reply, classified by deterministic rules. |
| **AI wording** / **Code wording** · "Explanation written by …" | Who wrote the question or explanation text. Figures are always calculated by the engine. |

## Architecture

```
domain/                 deterministic engine: money and GST, dates, constraint profile, templates, checks,
                        economics, ambiguity analysis, agreement hashing, mandate, collections, ledger,
                        amendments, state machines; injectable clock, no system-clock reads
ai/                     strict schemas, versioned prompts, provider interface (Groq, Anthropic and replay),
                        extraction, clarification wording, explanation with placeholders, run records, replay
data/synthetic/         hero fixture (inputs only), synthetic AI outputs, bundled replay, failure scenarios
integrations/razorpay/  test-key guard, test-mode payment links, simulated payment links and recurring
evaluation/             gold-label format, count metrics, development set, frozen-set import and run
lib/                    JSON store (atomic writes) and the deal service used by the API
app/, components/       merchant views, the standalone buyer proposal (app/proposal) and one validated actions endpoint
```

## Limitations

- **WhatsApp is simulated.** Buyer replies are pre-scripted or typed by the demo operator. Payment-change replies are read by narrow code rules (`reply-rules.v1`). Hinglish and imprecise relative dates ("20 tak", "till next week", "till salary comes") need merchant attention by design.
- **Buyer proposal:** a demonstration with no authentication.
- **Live model:** the committed live runs (`data/live-runs/`) were produced on Groq `openai/gpt-oss-120b`. The connected journey added no model calls; the demo replays the stored run named in `data/demo-run.json`.
- **Razorpay:**
  - Test-mode payment links are tested against a fake transport only.
  - Recurring payments (e-mandate, debits, failures) and advance notices are always simulated.
- **Evaluation:** the frozen evaluation was run once against its recorded prompts (`extract.v2`, `clarify.v1`, `explain.v3`) on 20 cases written with Codex at the applicant's direction, so they are not independent. It does not cover the connected journey. Development labels for clarifications and state were reconciled with the engine and are not independent either.
- **Data:** a single merchant segment, one Phase 1 preset, the hero seller configuration for all scenarios, and a single local user. The JSON store has an in-process lock only.
- **Next-budget amount:** "new budget in April" has no amount, so after April the engine checks timing only. This is shown on the constraint card.
- **No external evidence:** the problem's frequency among Indian agencies, and how often commercial negotiation happens over WhatsApp, are assumptions to validate.
