# Case recorded runs

Recorded model runs for the three commercial cases, one immutable file per run
(`run-case-<case id>-<8 hex>.json`). `data/case-runs.json` maps each case to its recording.

- A file here is the first technically valid final run for its case, kept as recorded,
  model misses included. It is never edited, re-labelled or replaced by a rerun.
- Loaded only by `lib/case-runs.ts`, which accepts a recording only when it is a complete
  model run of exactly that case's conversation. Anything else falls back to the hand-written
  sample in `data/synthetic/replay/`, which the product labels
  "Sample output written by hand · no model ran".
- Separate from `data/live-runs/`, which holds the earlier historical runs and stays unchanged.
