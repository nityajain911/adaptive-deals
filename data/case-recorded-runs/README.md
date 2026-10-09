# Case recorded runs

Immutable model runs for the commercial cases (`run-case-<case id>-<8 hex>.json`).
`data/case-runs.json` maps only an exact current case to its recording.

- A file here is the first technically valid final run for its case, kept as recorded,
  model misses included. It is never edited, re-labelled or replaced by a rerun.
- Loaded only by `lib/case-runs.ts`, which accepts a recording only when it is a complete
  model run of exactly that case's conversation. Anything else falls back to the hand-written
  sample in `data/synthetic/replay/`, which the product labels
  "Sample output written by hand · no model ran".
- Separate from `data/live-runs/`, which holds the earlier historical runs and stays unchanged.

## Current product mapping

- `reduced-scope` → `run-case-reduced-scope-ed5442a3`: **Recorded Cerebras output**
  from the final realistic conversation, kept from its first valid three-request run.
- `preserve-scope` and `no-fit`: no current recording; both use the labelled hand-written sample.

The three Groq files and `recording-report.json` are historical evidence made from the earlier
conversation text. They remain immutable and are not loaded for the rewritten cases.
