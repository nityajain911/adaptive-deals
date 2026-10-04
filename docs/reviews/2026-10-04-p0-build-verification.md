# Persona P0 Build Verification

**Date:** 4 October 2026  
**Branch:** `codex/persona-p0`  
**Merge base:** `91648e5d60eea8d36b76738dbd5e3fcc1c99fb95`

## Scope delivered

This build implements the five P0 findings from the five-persona review:

1. Unresolved buyer work remains visible and owned until the merchant records an explicit disposition.
2. New buyer evidence blocks stale commercial decisions and requires a fresh review.
3. Merchant-selected offers identify the merchant as the selector and carry buyer approval conditions through every agreement version.
4. Amendment comparisons disclose all contractual changes and preserve the original payment when restructuring is not feasible.
5. Track separates the current contract, operational collections and the 90-day outcome window, then presents the current agreement as the focal summary.

P1 comparison, mobile-layout and manual-interpretation enhancements remain outside this build.

## Implementation commits

| Commit | Purpose |
| --- | --- |
| `c9df102` | Keep unresolved buyer work actionable |
| `a86b052` | Block stale commercial decisions |
| `c5733d4` | Preserve offer approval conditions |
| `c4cfa7a` | Disclose complete amendment differences |
| `32b989c` | Separate contract and outcome finances |
| `007a5ea` | Focus Track on the current agreement |

The final browser proof, documentation and this verification record are committed separately after the checks below.

## Verification results

| Check | Result |
| --- | --- |
| Unit and integration tests | **455 of 455 passed** across 54 files |
| Type checking | **Clean** |
| Lint | **Clean** |
| Production build using the restricted-runner fallback | **Passed** with Next.js 16.3.8 and webpack |
| Browser journeys | **18 of 18 passed**, including six P0 browser journeys |
| Protected assets | **44 of 44 unchanged** from the recorded baseline |

The standard Next.js production build remains the default in the project and in Playwright. In this execution environment, Turbopack's PostCSS worker cannot bind its internal local port and exits with `Operation not permitted`. The build and browser suite therefore ran with the explicit `ADAPTIVE_E2E_WEBPACK=1` restricted-runner fallback. This is an environment limitation; it is not recorded as a successful Turbopack run.

The final browser suite used `ADAPTIVE_E2E_NO_SHOTS=1`, so verification did not regenerate or overwrite the committed screenshot evidence.

## Protected boundary

All 43 repository paths in `docs/superpowers/plans/frozen-assets.txt` have no content difference from the merge base. The external freeze pack also matches its recorded baseline:

- File: `/Users/nityajain/Documents/Resolve Razorpay/adaptive-deals-build/FREEZE_PACK.md`
- SHA-256: `93cd3770ca7e33a37fd34f9acbbf941ffd3f39e414ce6033d9ac96a0449eab4b`

There is no change in:

- `ai/`
- `evaluation/`
- `data/live-runs/`
- `data/demo-run.json`
- `domain/engine.ts`
- `domain/checks.ts`
- `domain/economics.ts`
- `domain/replies.ts`

No live model call was made, and the frozen evaluation was not rerun.

## Release questions answered in the working views

1. **Who prepares and approves the commercial decision?** The recommendation identifies the system's role, merchant-selected alternatives say **Selected by you**, and buyer-side approval conditions remain visible through acceptance.
2. **What is currently agreed?** Track's current-agreement summary names the active version, scope, service period, contract total and payment status. A pending revision does not replace the active agreement.
3. **What did the buyer accept, and under which conditions?** The buyer page is version-specific, states its lifecycle, shows the canonical commercial terms and requires the recorded approval-condition attestation when applicable.
4. **What changed in an amendment?** The amendment review lists every changed contractual field and keeps unchanged terms separate from the differences.
5. **How much is proposed, contracted, collected and counted in the outcome window?** The views label these as distinct financial scopes and show their respective time basis.
6. **Who acts next, and why?** A single progress derivation supplies the responsible actor, current action and blocking reason. Buyer requests, conflicting evidence and failed restructuring remain actionable until explicitly disposed.
7. **What will the product measure and learn from?** The outcome card measures realised contribution within 90 days, states incomplete inputs, records deal outcomes and explains that any recommendation or template improvement is versioned, merchant-approved and evaluated before use.

## Simulated and unmodelled boundaries

- WhatsApp delivery and buyer replies are simulated and labelled.
- Payment links, mandates, debits and retries are simulated; they do not move real money.
- Buyer MD approval is attested by the buyer and is not identity-verified.
- Service and delivery dates are planned contractual dates. Actual delivery completion is not tracked.
- Refunds and external bank or accounting reconciliation are not modelled.
- Messages never mutate canonical terms or the ledger by themselves.

## Final review

The independent whole-branch review found two Critical and four Important issues. Each was reproduced with a failing regression before the fix:

- amendment approval and both acceptance paths now refuse unresolved current-version buyer intent;
- resolving a notice correction removes it from both action queues, while non-date unsupported replies receive generic guidance;
- proposed and declined offers use offer language rather than agreement language;
- a historical proposal follows the complete replacement chain to the latest buyer-accessible version;
- the operational-versus-90-day collection explanation is rendered beside the contract figures.

No Critical or Important finding remains. One Minor finding is deferred: `components/track/contract-financial-card.tsx` is an unused component. It is not rendered, has no state or side effects and does not affect a P0 requirement.
