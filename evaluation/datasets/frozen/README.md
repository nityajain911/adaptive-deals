# Frozen test set — 20 agent-authored cases

This folder holds the held-out evaluation set. On 2026-10-01, Nitya Jain directed OpenAI Codex to write and import all 20 cases. The labels were written before the first live frozen run.

This set is an **agent-authored, user-directed holdout**. It must not be described as independently authored or used as evidence of independent validation. Its value is as a consistent, previously unseen check against the frozen prompts and code.

- The 20 cases use the format in `evaluation/gold.ts` (`EvalCaseSchema`, `split: "frozen"`).
- Composition: 4 `options_ready`, 5 `ambiguous`, 3 `insufficient_information`, 3 `outside_templates`, and 5 `no_feasible_deal` cases.
- Language mix: 14 English and 6 Hinglish cases.
- Frozen cases must not include `referenceExtraction`.
- Freeze the prompts (`ai/prompts.ts` versions) before running. Any prompt change after a frozen run requires a new, untouched test set.
- Import and validate with `npm run eval:frozen -- --validate-only`, then run with a live model: `GROQ_API_KEY` for the default Groq provider (`openai/gpt-oss-120b`), or `ANTHROPIC_API_KEY` when `ADAPTIVE_DEALS_PROVIDER=anthropic`. Results are reported as counts only.
