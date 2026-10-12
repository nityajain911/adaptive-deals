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
- `no-fit` → `run-case-no-fit-6fb4027d`: **Recorded Cerebras output**, one extraction request, kept as it came.
  The engine reaches the case's expected outcome (no approved offer fits).
- `preserve-scope` → `run-case-preserve-scope-1ec088fa`: **Recorded Cerebras output** on the case's revised text. Three
  earlier attempts on the earlier text (`fcc306d2`, `ff0d6acf`, `9a841334`) all missed identically, and are kept as
  evidence but never mapped (their conversation no longer matches the case). The cause was the capitalised, sentence-initial
  "This quarter is tight": the model returned "this quarter", and the exact, case-sensitive quote check rejected it, so the
  engine stopped at "insufficient information". On the applicant's instruction only that one message was reworded so the
  phrase sits mid-sentence, the rule for the new attempt was written first (`CASE_RECORDING_FREEZE_BATCH6.json`: one
  attempt, final whatever it is, mapped only if it reaches the expected offer), and the single new attempt reached the
  expected deferred-start offer. Its misses are kept: the phrase "complete annual package" matches no package (the merchant
  confirms the services) and the GST statement was rejected as conflicting.

The three Groq files and `recording-report.json` are historical evidence made from the earlier
conversation text. They remain immutable and are not loaded for the rewritten cases.

Each case keeps its labelled hand-written sample in `data/synthetic/replay/` as the fallback if a recording ever stops
matching its conversation byte for byte (the product then says "Sample output written by hand · no model ran").

