# Frozen test set — intentionally empty

This folder holds the **frozen, unseen** test set. The builder (Claude Code) must not author, edit or view cases here.

- A different person writes 15–20 cases in the format of `evaluation/gold.ts` (`EvalCaseSchema`, `split: "frozen"`), with gold labels written **before** the first frozen run.
- Frozen cases must not include `referenceExtraction`.
- Freeze the prompts (`ai/prompts.ts` versions) before running. Any prompt change after a frozen run requires a new, untouched test set.
- Import and validate with `npm run eval:frozen -- --validate-only`, then run with a live model (`ANTHROPIC_API_KEY`). Results are reported as counts only.
