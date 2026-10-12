# Hosting the prototype

No database and no Supabase are needed. The app keeps its state in small JSON files, and with `ADAPTIVE_DEALS_SESSIONS=1` every visitor gets a private copy (a random cookie id), so two reviewers never reset each other's deal. It runs with no model keys and no Razorpay keys: it replays the recorded runs and simulates payments.

Needs one always-on instance (state is in files, so do not scale to several). It resets when the host restarts or sleeps, which is fine for a demo; the Presenter panel has "Reset this deal to step 1".

**Render (free):** push this folder to a GitHub repo, then Render → New → Blueprint → pick the repo. `render.yaml` sets everything. The free tier sleeps after idle time, so the first visit can take about a minute: open the link yourself just before sharing it.

**Any container host (Railway, Fly.io, Cloud Run):** use the `Dockerfile`; port 3000.

Environment: `ADAPTIVE_DEALS_SESSIONS=1`, `ADAPTIVE_DEALS_DATA_DIR=/tmp/adaptive-deals`, `RAZORPAY_MODE=simulated`. Leave every `*_API_KEY` unset.
