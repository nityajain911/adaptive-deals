# Focused verification — 3 October 2026

On repository HEAD `f03d90e` (product last changed at `d525ce1`):

```text
npm test -- tests/domain/money.test.ts tests/domain/economics.test.ts tests/domain/collections.test.ts tests/domain/hero-timeline.test.ts tests/domain/agreement.test.ts tests/domain/notices-and-rules.test.ts tests/lib/outcome.test.ts tests/lib/outcome-card.test.ts

Test Files  8 passed (8)
Tests       57 passed (57)
```

Existing tests only; no test code changed. Not the complete test suite, frozen AI evaluation, provider integration test or production accounting audit.

Browser inspection used isolated synthetic state at `/tmp/adaptive-finance-review`, port 3101. Evidence JSON contains fixture and simulated records only. `reconciliation.json` independently sums successful attempt amounts and payment schedule components from those recorded snapshots. Failed/removed attempts are excluded from collections. `guards.json` records deliberately rejected application actions and verifies attempt records were unchanged; the internal-retry simulation rejection is a missing demo capability, not a safety success.
