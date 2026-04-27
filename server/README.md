# Brahma backend

A thin FastAPI bridge that the React UI talks to via Vite's `/api` proxy. Two modes:

- **Mock mode (default)** — returns deterministic responses generated from the same 7 scenarios the UI uses. No external dependencies beyond `fastapi` + `uvicorn`. Works without the Brahma repo installed.
- **Real-Brahma mode** — when `ANTHROPIC_API_KEY` is set **and** [`brahma_engine`](https://github.com/akv803101/Brahma) is importable, the start endpoint hands off to `BrahmaEngine` instead of mocks.

The frontend itself does not require this server — it has client-side mocks of the same data and works standalone. Run the server only if you want to exercise the API surface.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/health` | mode + scenario list + run count |
| `GET`  | `/api/scenarios` | full mock data for all 7 scenarios |
| `POST` | `/api/pipelines` | start a run → `{ runId, scenarioId, totalStages, mode }` |
| `GET`  | `/api/pipelines/{id}/stream` | Server-Sent Events stream of `stage` + `log` + `done` events |
| `GET`  | `/api/pipelines/{id}/report` | final scenario report (KPIs, finalModel, headline, narrative, stages) |
| `POST` | `/api/pipelines/{id}/predict` | live-predict → `{ score, tier, label }` |

## Run it

```bash
# from the repo root
cd server
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn server.main:app --reload --port 8000   # run from the repo root
```

Then open another terminal and start the React UI:

```bash
npm run dev
```

Vite (port 5173) proxies `/api/*` to `127.0.0.1:8000`, so the frontend reaches the server at `/api/health`, `/api/pipelines`, etc.

## Smoke test

```bash
curl http://127.0.0.1:8000/api/health
# → { "status": "ok", "mode": "mock", "scenarios": [...], "runs": 0 }

curl -X POST http://127.0.0.1:8000/api/pipelines \
  -H "Content-Type: application/json" \
  -d '{"scenarioId":"churn"}'
# → { "runId": "abc123…", "scenarioId": "churn", "problemType": "classification", "totalStages": 13, "mode": "mock" }

# Stream the run (use the runId from above)
curl -N http://127.0.0.1:8000/api/pipelines/abc123…/stream

# Score a record
curl -X POST http://127.0.0.1:8000/api/pipelines/abc123…/predict \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"age":46,"txn":28,"util":0.72,"rel":18}}'
# → { "score": 0.72…, "tier": "HIGH", "label": "CHURN RISK", … }
```

## Switching to real Brahma

1. Clone the Brahma repo alongside this one (or somewhere on `PYTHONPATH`):
   ```bash
   git clone https://github.com/akv803101/Brahma.git
   pip install -e ./Brahma          # or however that repo recommends
   ```
2. Export your Anthropic key:
   ```bash
   export ANTHROPIC_API_KEY=sk-…
   ```
3. Restart `uvicorn`. The `/api/health` response will flip to `"mode": "real-brahma"` and `POST /api/pipelines` will dispatch to `BrahmaEngine` instead of the mock generators.

The endpoint contracts stay identical — the frontend doesn't need to know which mode is running.
