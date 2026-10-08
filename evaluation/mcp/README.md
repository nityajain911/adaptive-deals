# MCP verification

These cases were authored by OpenAI Codex at Nitya Jain's direction and are not independent validation. They use injected transports to exercise the exact approval, idempotency, timeout, reconciliation, response-validation and secret-reduction boundaries.

`phase-0.json` records the actual capability gate for this build session. No Razorpay MCP tool was exposed, so no external write was attempted. The product remains in the honest unavailable state and keeps simulation separate.

