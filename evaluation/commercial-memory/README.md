# Commercial Memory retrieval evaluation

This evaluation is agent-authored by OpenAI Codex, the same agent implementing the retrieval logic. It tests technical behavior and is not independent validation or merchant evidence.

## Frozen measures

- Expected current source in top 3: count of cases.
- Expected exact passage in top 5: count of cases.
- Correct abstentions: count of abstention cases.
- Cross-merchant chunks returned: target 0.
- Superseded sources used as current evidence: target 0.
- Invalid reranker outputs safely rejected: count of adversarial outputs.
- Exact citations passing source-hash and offset validation: count of displayed citations.

## Provider budget and stopping rule

- Development: one live Groq rerank over each frozen case, batched where the provider permits; no quality reruns.
- Recording: one final technically valid run for each canonical demo query; reruns only after a transport or schema failure.
- A valid but poor result is kept and reported.
- Prompt or validator changes require a new prompt version, new case-set hash and a new recorded result. Earlier results remain attached to the earlier version.
- No call occurs until the applicant authorises this budget and a local `GROQ_API_KEY` is configured outside the repository.

The deterministic lexical result is always evaluated separately and remains the production fallback.

## Buyer rename (13 October 2026)

When the hero case changed from Kestrel Lane Clinics to Harbour Fresh Foods, the three cases that named the buyer were renamed (`harbour-fresh-history`, `harbour-fresh-proposal`, and the wrong-buyer query). Their structure, expected outcomes and access rules are unchanged, and the case-set hash in `FREEZE.json` was refreshed to the renamed file. No retrieval code or prompt changed.
