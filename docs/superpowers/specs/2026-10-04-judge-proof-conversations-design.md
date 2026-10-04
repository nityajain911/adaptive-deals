# Judge-proof conversations and scenarios — design spec

**Date:** 4 October 2026  
**Status:** conversational direction approved; awaiting review of this written spec. Product code must not change until this spec and its implementation plan are approved.  
**Baseline:** `ab35c37` on `codex/persona-p0`.  
**Origin:** Razorpay Track 2 judge review at `docs/reviews/2026-10-04-razorpay-judge-review.md`.

---

## 1. Purpose

Adaptive Deals must prove that it can turn different buyer conversations into different, justified commercial decisions without weakening the deterministic controls already demonstrated.

The primary judge journey is:

> Incoming conversation → cited commercial constraints and priorities → clarification → engine evaluation → grounded recommendation → merchant approval → measurable outcome.

This cycle fixes the current alternate-answer failure, gives the hero deal enough commercial context to justify its recommendation, and adds three native cases without rebuilding the product as a multi-deal CRM.

### 1.1 Success criteria

Before this cycle is complete:

1. All four combinations of GST basis and approval scope reach a valid Offer page and survive reload.
2. A judge can explain, from source messages, why the hero buyer needs the selected work, what can wait, and why a smaller first phase has value.
3. Positive, negative, uncertain and custom replies have truthful outcomes; unknown information remains unknown.
4. The product states separately what AI extracted or ranked, what code calculated or wrote, and what the merchant decided.
5. Three native cases demonstrate reduced scope now, preserved scope later, and justified abstention.
6. Selecting another case resets the one active demo explicitly; the product never implies simultaneous persisted deals.
7. The 44 protected historical AI and evaluation assets remain byte-for-byte unchanged.

---

## 2. Scope and sequence

### 2.1 Included in this cycle

1. Application-level decision branches for clarification answers not represented by a recorded replay.
2. A new chronological hero conversation and fixture, preserving the earlier fixture and run as historical evidence.
3. Question-specific reply choices, including uncertainty and custom text.
4. Accurate AI, engine, code and merchant attribution in merchant and audit views.
5. A native case picker with one active scenario store.
6. Three case definitions and their expected extractions and commercial outcomes.
7. Capped development probes and one final recorded run per case, subject to explicit approval before external model calls.
8. Browser coverage for every supported clarification direction and each scenario entry.

### 2.2 Separate go/no-go cycle

The pre-acceptance **Revise the offer** disposition is not part of this implementation cycle. After the work above passes, review remaining time and stability. If approved, it receives its own design and plan covering:

> Buyer request → cited candidate interpretation → merchant confirmation → complete engine re-evaluation → revised proposal → fresh buyer decision.

The existing post-acceptance amendment flow is not reused for this pre-agreement revision.

### 2.3 Non-goals

- Persistent progress for several deals at once.
- A CRM, shared inbox, multi-column conversation view or merchant analytics dashboard.
- Real WhatsApp or Meta integration.
- A new AI prompt solely to make the product appear more AI-heavy.
- Autonomous pricing, discounts, scope invention, contract drafting or policy changes.
- Model calculations of money, GST, dates, feasibility, contribution or payment schedules.
- Rerunning the frozen evaluation or editing its cases, results or provenance.
- Claiming merchant validation, learned policy improvement, conversion probability or recovered revenue from synthetic cases.

---

## 3. Protected boundary

### 3.1 Historical evidence remains immutable

Every path listed in `docs/superpowers/plans/frozen-assets.txt` remains byte-for-byte unchanged during this cycle. In particular, do not modify:

- `ai/` prompts, schemas, validators, providers, orchestrator or run-record types;
- frozen and development evaluation cases and recorded results;
- committed live runs and `data/demo-run.json`.

The replay integrity check remains strict. The fix must stop asking a historical replay to produce output for inputs it never saw.

### 3.2 Deterministic product rules remain unchanged

Do not change:

- structure enumeration and template parameter ranges;
- commercial checks and economics;
- GST and amount normalisation;
- agreement hashing and canonical terms;
- payment, mandate, collection and preventive restructuring rules;
- the primary metric definition.

### 3.3 New evidence is additive

The new conversations, scenario definitions, branch records and future recorded runs receive new identifiers. Earlier run IDs remain attributable to their original messages only.

---

## 4. Decision-branch architecture

### 4.1 Problem

The current product continues a stored replay after the merchant records clarification answers. Only the original answer combination has matching explanation output. A different GST or approval answer can be evaluated by the engine, but asking the replay for an unseen explanation produces `Replay needed outputs this run never produced (explain)` and can leave the saved state unreadable.

### 4.2 Stored branch record

Add an application-level `decisionBranch` beside the immutable run reference. It contains:

- a new branch ID;
- the parent run ID;
- creation time from the injected clock;
- the complete merchant-recorded, buyer-confirmed answers;
- the evidence message and quote for each answer;
- the reason: `answers_differ_from_recorded_run`;
- explanation source: `code_fallback`;
- the prompt versions and hashes inherited only as parent-run context, never as a claim that those prompts processed the branch;
- no copied money or feasibility result.

The engine outcome is recomputed from the parent run's evidence-backed profile plus the branch answers whenever the state is read. Every displayed figure therefore continues to come from the engine.

### 4.3 Continuation selection

When all clarification answers are recorded:

1. Canonically compare the answer set with the answer continuation contained in the immutable run.
2. If it matches, continue through the existing replay and retain its existing attribution.
3. If it differs, create a decision branch without calling the replay provider for missing steps.
4. Evaluate every approved template through the unchanged engine.
5. Rank feasible structures through a deterministic documented order for the branch and write the explanation in code.
6. Save the branch only after a complete renderable outcome has been produced.

No thrown replay-integrity error may be used to create or partially save product state. If branch construction fails, the original clarifying state remains intact and the user receives a recoverable error.

### 4.4 Attribution

Merchant and audit views distinguish:

- **Recorded AI run:** output present in the immutable run.
- **Engine recalculation:** all commercial structures and figures recomputed after changed answers.
- **Code explanation:** deterministic comparison used because the recorded model never saw this answer combination.
- **Merchant interpretation:** a custom buyer reply normalised by the merchant with verbatim evidence.

The UI must never say or imply that AI ranked or explained an application branch when no matching model step exists.

### 4.5 Audit behavior

The audit drawer shows:

- branch and parent IDs;
- changed answers and evidence;
- unchanged prompt-version context of the parent run;
- engine result fingerprint;
- explanation source;
- a sentence that the parent model run did not process the changed answers.

Agreement terms, approvals and hashes continue to appear under their existing audit sections.

---

## 5. Conversations and extraction

### 5.1 Chronological thread

Conversation messages render in timestamp order. The first buyer and merchant messages are not separated into author-specific blocks that hide the earlier quotation. The collapsed view keeps enough context to understand the current decision; **Show full conversation** reveals the remainder without changing order.

### 5.2 Hero conversation requirements

The new fictional conversation must state naturally:

1. The buyer's business objective: repair booking friction and begin generating relevant enquiries.
2. The desired start timing.
3. The merchant's annual package, scope and quotation.
4. The buyer's current budget, its period and GST ambiguity.
5. The next-budget timing and the January–March gap when intended as a hard constraint.
6. The buyer's approval threshold, initially ambiguous as per contract or per payment.
7. Website fixes and search as required now.
8. Social media as deferrable.
9. Confirmation that the smaller initial phase has standalone value and buying authority.

No fact may be added solely to make the model succeed. The conversation is written for human credibility first.

### 5.3 Expected extraction before model use

For each case, author a gold expectation before any live call:

- expected fields and evidence messages;
- required and optional packages;
- ambiguities and required clarification;
- unsupported requests;
- expected engine state and the reason for it.

This is development evidence, not an independent frozen evaluation.

### 5.4 Existing extractor first

The current `extract.v2` already supports required and optional packages, latest start, later corrections, budgets, approval limits and unsupported requests. Use it unchanged for this cycle.

Do not add a business-goal or counter-request prompt during this cycle. If a judge-relevant decision cannot be represented after the probes, record the limitation and propose a separately versioned task in the later Revise-the-offer design.

---

## 6. Reply choices and uncertainty

### 6.1 GST question

Offer:

- **Both include GST** → supported normalised value.
- **Both exclude GST** → supported normalised value.
- **Different bases / not sure** → remains unresolved; no offer is generated.
- **Type a reply** → the merchant may record a supported interpretation only with a verbatim quote, or leave it unresolved.

The current profile represents one GST basis with per-amount coverage. A mixed basis is not forced into include or exclude.

### 6.2 Approval-scope question

Offer:

- **Per contract** → supported normalised value.
- **Per payment** → supported normalised value.
- **Not sure** → remains unresolved.
- **Type a reply** → merchant interpretation with verbatim evidence, or unresolved.

### 6.3 Uncertain and custom replies

- An uncertain reply shows what fact is still missing and a code-written follow-up action.
- A typed reply never silently becomes a structured answer.
- The merchant interpretation form includes **Not clear yet** as a valid disposition.
- Recording uncertainty creates no engine option, agreement, payment or ledger change.
- Existing buyer proposal choices—Accept, Request a change and Decline—remain unchanged.

### 6.4 Consequences must be visible

The four supported combinations must produce their actual engine consequences. The UI must not present branch support as a cosmetic chat variation. Browser tests assert the recommendation, approval treatment and at least one material option-set difference for each combination.

---

## 7. Native case picker

### 7.1 Route and purpose

Add `/deals` as a merchant-facing case picker. It contains three fictional deal cards and is accessible from the merchant frame. It is part of the product demonstration, not the presenter page.

Each card shows:

- buyer and company;
- original proposal summary;
- suspected commercial barrier;
- intended proof point;
- case provenance: **Recorded AI run** or **Synthetic scenario**;
- **Open case** as its action.

Do not display invented conversion probabilities, revenue recovered or model confidence scores.

### 7.2 One active workspace

The product retains one active store and `/deals/hero/...` workspace. Selecting another case:

1. Shows an explicit message that starting it resets the current demo state.
2. Requires a deliberate **Start this case** action.
3. Seeds the selected scenario and resets its injected clock.
4. Redirects to that case's current Understand stage.

The picker does not claim to preserve unfinished progress when switching.

### 7.3 Required cases

1. **Start now with reduced scope**  
   Required website and search work can start within the current constraint; social media can wait. The engine should recommend a smaller independently valuable first phase.

2. **Preserve required scope and defer**  
   The buyer requires the full approved scope but has timing flexibility. The feasible recommendation should preserve scope and begin when funding is available.

3. **No approved structure fits**  
   Confirmed budget, timing or required-scope constraints make every approved structure infeasible. The product abstains, explains the failed checks and offers an honest merchant action.

Each case uses the same merchant policy and approved template catalogue so the changed decision can be attributed to the conversation rather than hidden policy changes.

### 7.4 Scenario isolation

Every case definition owns its conversation, fictional buyer, expected extraction and run reference. Selecting a case must never mix messages or run provenance from another case. Reset reloads the currently selected case, not always the reduced-scope hero.

---

## 8. Model calls and evidence policy

### 8.1 External-call approval

Implementation and tests use authored development outputs until explicit approval is obtained for external model calls. No live Groq call is implied by approval of this spec alone.

### 8.2 Development probes

After the conversations and gold expectations are reviewed, permit at most:

- one extraction probe for each of the three cases;
- one optional full hero continuation through clarification and explanation;
- a rerun only for a provider or transport failure, never because the content result is undesirable.

Record every probe in `AI_BUILD_LOG.md` with purpose, prompt version, input hash, outcome and any subsequent product change.

Conversation wording may change after a probe only when a human reader also finds it unclear or inconsistent. Do not rewrite natural messages solely to improve model performance.

### 8.3 Final recorded runs

After product behavior and copy are frozen:

- run each case once through the steps its state requires;
- retain the first technically valid result, including model misses;
- show merchant correction where needed;
- save each run under a new ID with exact prompt hashes and inputs;
- never overwrite or relabel an earlier run.

The final recorded runs are product evidence, not a replacement for the historical frozen evaluation.

---

## 9. Error handling and compatibility

- Existing saved states without a scenario ID migrate to the reduced-scope hero scenario.
- Existing states without a branch remain unchanged.
- A malformed or incomplete branch enters the existing migration-review state; approval and sending remain blocked.
- An unknown scenario ID is rejected without changing the active store.
- A case switch failure leaves the previous active state intact.
- Branch construction is atomic; a failure cannot leave `options_ready` without a renderable outcome.
- The presenter reset action resets the selected case and remains clearly labelled as a demo control.

---

## 10. Testing and verification

### 10.1 Branch matrix

Test all four supported answer combinations:

| GST | Approval scope |
|---|---|
| Includes | Per contract |
| Excludes | Per contract |
| Includes | Per payment |
| Excludes | Per payment |

For each, assert:

- a complete outcome exists;
- Offer renders before and after process reload;
- every displayed figure traces to the engine;
- provenance is accurate;
- failed options never appear approvable;
- the result differs where the commercial facts require it.

### 10.2 Uncertainty and evidence

Test:

- GST different/not sure;
- approval scope not sure;
- custom reply with supported verbatim evidence;
- custom reply without a valid quote;
- **Not clear yet**;
- prompt-injection text inside a buyer reply;
- no agreement, payment or ledger mutation while required information remains unresolved.

### 10.3 Cases

Test:

- the three cards and their provenance labels;
- switch confirmation;
- atomic reset and redirect;
- no cross-case messages, run IDs or outcomes;
- reset applies to the selected case;
- reduced scope, defer and abstain outcomes are materially different;
- direct unknown scenario requests fail safely.

### 10.4 Full release checks

Before completion:

- unit and integration suite passes;
- typecheck and lint pass;
- production build passes using the default Next.js build;
- browser journeys cover all branch combinations and all three cases;
- every path in `frozen-assets.txt` matches its baseline hash;
- no live call or frozen evaluation rerun occurred without its recorded approval and log;
- the original user-owned screenshots remain untouched;
- the demo is reset to the reduced-scope case at Understand.

---

## 11. Submission positioning

Use this product position:

> Adaptive Deals extends Razorpay's agentic platform upstream into pre-agreement commercial structuring: it converts buyer constraints into executable scope, timing and payment terms within merchant-approved rules.

If the adjacent Razorpay products are mentioned:

> Razorpay's public demos cover abandoned-cart recovery, overdue receivables and revenue analysis. Adaptive Deals addresses the earlier moment when a buyer cannot yet accept the proposed commercial structure.

The product note contains no broad claim that all existing Razorpay agents operate only after a payment failure.

---

## 12. Delivery gates

1. **Spec gate:** applicant approves this written design.
2. **Plan gate:** implementation plan identifies exact files, interfaces, tests and commit boundaries; applicant approves native execution.
3. **P0 gate:** replay-safe branches, hero conversation and reply choices pass before case-picker work begins.
4. **Case gate:** three cases pass before deciding whether to design Revise the offer.
5. **External-call gate:** applicant explicitly authorises the capped development probes and final recorded runs.
6. **Feature freeze:** final runs are recorded once; only defects, applicant-authored reflection and submission packaging may change afterwards.

