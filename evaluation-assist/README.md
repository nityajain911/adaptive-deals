# evaluation-assist

Pre-registered evaluation for the three assist tasks. Read `PLAN.md` first: it fixes the criteria, case counts and call budget before any prompt exists.

- `cases/<task>/dev/`: development cases, written by the coding agent. Prompts may be revised against these.
- `generators/narrative.ts`: builds `strategy_narrative` sets from the real engine; makes no model call.
- Hold-out and adversarial hold-out sets are committed as hashes only (`holdout-manifest.json`) until the final run.

No model call has been made. The frozen `evaluation/` directory is not used or changed.
