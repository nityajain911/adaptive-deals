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

The app runs fully without credentials. It loads the bundled **Synthetic replay** and simulates payments.

### Demo

Open `/workspace` and use the **Guided demo** bar: **Do this step** performs each storyboard step in order. `DEMO_SCRIPT.md` has the 90-second walkthrough. **Reset demo** (or `npm run reset:seed`) starts again.

| View | Route |
| --- | --- |
| 1. Deal workspace: conversation, evidence-backed constraint cards, derived budget gap, ambiguity status, failure-state scenarios | `/workspace` |
| 2. Clarification: two questions, engine-derived reasons, answers with "Confirmed by buyer via" | `/clarification` |
| 3. Decision: rejected and feasible structures, buyer and seller checks, AI comparison, Approve and send | `/decision` |
| 4. Agreement: merchant view and the no-login **Demo buyer view** (role switch), hash match, payment link, mandate | `/agreement`, `/agreement?role=buyer` |
| 5. Deal timeline: schedules, ledger, simulated events, failed debit, amendment, mandate fit, version history | `/timeline` |

## Environment variables

Copy `.env.example` to `.env.local`. Every variable is optional.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables **Run live** (a real model call through the official Anthropic SDK). Without it, Run live is disabled and says why. |
| `ADAPTIVE_DEALS_MODEL` | Model ID, default `claude-opus-5`. |
| `RAZORPAY_MODE` | `test` to create the upfront payment link in Razorpay **test mode**; anything else simulates. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Test keys only. Keys must start with `rzp_test_`; `rzp_live_` and any other form are refused. |
| `ADAPTIVE_DEALS_DATA_DIR` | Location of the JSON store (default `.data/`, git-ignored). |

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run typecheck` · `npm run lint` · `npm run build` | Static checks and production build |
| `npm run test:e2e` | Playwright smoke test of the five-view journey; writes screenshots to `artifacts/ui-review/` |
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
| **Demo buyer view** | A no-login page that shows what the buyer accepts. It is not a buyer portal. |
| **AI wording** / **Code wording** | Who wrote the question or comparison text. Figures are always filled by code. |

## Architecture

```
domain/                 deterministic engine: money and GST, dates, constraint profile, templates, checks,
                        economics, ambiguity analysis, agreement hashing, mandate, collections, ledger,
                        amendments, state machines; injectable clock, no system-clock reads
ai/                     strict schemas, versioned prompts, provider interface (Anthropic SDK and replay),
                        extraction, clarification wording, explanation with placeholders, run records, replay
data/synthetic/         hero fixture (inputs only), synthetic AI outputs, bundled replay, failure scenarios
integrations/razorpay/  test-key guard, test-mode payment links, simulated payment links and recurring
evaluation/             gold-label format, count metrics, development set, frozen-set import and run
lib/                    JSON store (atomic writes) and the deal service used by the API
app/, components/       five views and one validated actions endpoint
```

## Limitations

- **Live model:** not exercised in this build environment, because no key was present. The provider is tested against a fake SDK client.
- **Razorpay:**
  - Test-mode payment links are tested against a fake transport only; no test keys were available.
  - Recurring payments (e-mandate, debits, failures) are always simulated.
  - Advance notices are simulated.
- **Data:** a single merchant segment, one Phase 1 preset, the hero seller configuration for all scenarios, and a single local user. The JSON store has an in-process lock only.
- **Next-budget amount:** "new budget in April" has no amount, so after April the engine checks timing only. This is shown on the constraint card.
- **Evaluation:** development labels for clarifications and state were reconciled with the engine, so they are not independent. No frozen evaluation has been run.
- **No external evidence:** the problem's frequency among Indian agencies is an assumption to validate.
