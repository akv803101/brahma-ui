<div align="center">

<img src="public/assets/brahma-mark-blue.svg" alt="Brahma" width="96" />

# Brahma UI

### **The Creator Intelligence**

*Connect a source. State a goal. Nothing else.*

[![React 18](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite 5](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![Anthropic](https://img.shields.io/badge/Claude-Haiku%204.5-D97757)](https://www.anthropic.com)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-D71F00)](https://www.sqlalchemy.org)
[![SSE](https://img.shields.io/badge/Streaming-SSE-555)]()
[![License](https://img.shields.io/badge/license-private-lightgrey)](#license)

**Production-ready React + FastAPI surface for an autonomous ML agent.**
Plain-English goal in. Trained model, evaluation report, insights deck, and a live predictor out.

</div>

---

## What this is

Brahma is an autonomous ML agent built on top of Claude. You describe a problem in plain English, point Brahma at your data, and a real pipeline runs end-to-end — ingestion, EDA, feature engineering, training, evaluation, validation, ensembling, and deployment. The user sees Claude's reasoning stream live, then 8 ML stages execute as subprocesses, then a McKinsey-style insights deck is generated from the actual run's outputs.

This repo is the **product surface** wrapping the upstream engine ([`akv803101/Brahma`](https://github.com/akv803101/Brahma), vendored as a read-only submodule). Concretely, it provides:

- A **React 18 + Vite** frontend — workspaces, projects, connect-source flow, live running screen with SSE-streamed stage logs, three report layouts, an executive insights deck, a live predictor with HITL feedback, and a memory tab that tracks per-run accuracy over time.
- A **FastAPI backend** — auth (email + Google OAuth), workspace/project APIs, a real-engine bridge that turns Claude narratives + Python subprocess stages into one coherent SSE stream, eight live data-source probes, real predictions from saved models, and a Claude-driven insights generator.
- **Eight live data sources** — Local CSV · PostgreSQL · SQLite · Snowflake · BigQuery · Amazon S3 · Google Sheets · HTTP / REST.

---

## How a run actually flows

```
            ┌──────────────────────────────────────────────────────────────┐
   USER ──► │ 1.  Pick source from dropdown · fill credentials             │
            │ 2.  Click Test connection — psycopg2 / boto3 / google-auth   │
            │     pings the real backend, returns "Connected · 22 cols"    │
            │     (warns if table > 500K rows)                             │
            │ 3.  Type goal in plain English                               │
            │ 4.  Click Start the pipeline                                 │
            └──────┬───────────────────────────────────────────────────────┘
                   │
                   ▼
            ┌─────────────────────────────────────────────────────────────┐
   BACKEND  │ POST /api/pipelines  (auth-gated)                           │
            │   ├─ persist row in pipeline_runs                           │
            │   ├─ register in _RUNS for SSE handler dedup                │
            │   └─ return { runId, mode: 'real' }                         │
            └─────────────────────────────────────────────────────────────┘
                   │
                   ▼
            ┌─────────────────────────────────────────────────────────────┐
   SSE      │ GET /api/pipelines/{runId}/stream                           │
   STREAM   │   producer thread spawns BrahmaRunner.run() → yields:       │
            │                                                             │
            │   started                                                   │
            │   narrative_start                                           │
            │   narrative_chunk × N      ← Claude Haiku streaming text    │
            │   narrative_done                                            │
            │   stage_started (i=0)                                       │
            │   stage_log     (i=0, line) × M  ← stdout of stage subproc  │
            │   stage_done    (i=0, ok=true, elapsed_s=12.3)              │
            │     ... (× 8 stages)                                        │
            │   outputs_copied                                            │
            │   leaderboard                                               │
            │   complete                                                  │
            └─────────────────────────────────────────────────────────────┘
                   │
                   ▼
            ┌─────────────────────────────────────────────────────────────┐
   ENGINE   │ Phase 1 — Narrative      (Claude Haiku, ~10s, ~$0.005)      │
            │ Phase 2 — Stages         (8 Python subprocesses, ~90s)      │
            │   • ingestion + EDA + feature engineering                   │
            │   • model training (Optuna 50 trials × 4-6 candidates)      │
            │   • evaluation + validation + ensembling                    │
            │   • UAT + deployment package                                │
            │ Phase 3 — Outputs        (copy to runs/{id}/outputs/)       │
            │   17 charts · leaderboard.csv · deployment_package.pkl      │
            └─────────────────────────────────────────────────────────────┘
                   │
                   ▼
            ┌─────────────────────────────────────────────────────────────┐
   USER ◄── │ Auto-route to Report tab                                    │
            │   • Real leaderboard (auto schema-detected)                 │
            │   • 17 engine-produced PNGs grouped by category             │
            │   • Claude's narrative pinned                               │
            │ Click Insights → POST /insights → 9-slide McKinsey deck    │
            │ Click Live Predict → real predict_proba on saved model     │
            │ Thumbs ✓/✗ feedback ties to runId; next run's narrative    │
            │ opens with "PRIOR FEEDBACK: 67% accuracy, weakest at LOW"  │
            └─────────────────────────────────────────────────────────────┘
```

---

## Feature matrix

### Data sources (eight live)

| Source | Backend type | Live probe checks | Live in run |
| --- | --- | --- | --- |
| Local CSV file | `file` | file exists, size readout | ✓ |
| PostgreSQL | `postgresql` | psycopg2 connect, SELECT 1, table preview, row count + auto-sample warning | ✓ (verified against Neon) |
| SQLite | `sqlite` | open DB, list tables | ✓ |
| Snowflake | `snowflake` | snowflake-connector login, SELECT 1, preview, row count | ✓ |
| BigQuery | `bigquery` | service-account auth, scoped query, preview, row count via `__TABLES__` | ✓ |
| Amazon S3 | `s3` | boto3 head_object, size + last-modified | ✓ |
| Google Sheets | `google_sheets` | gspread auth, open by URL, header row + capacity | ✓ |
| HTTP / REST | `rest_api` | httpx GET/POST, optional Bearer + JSON-path drill | ✓ |

### Live-stream surface

| Capability | What you see |
| --- | --- |
| Claude narrative streaming | Token-by-token text in the right pane while Brahma reasons about the goal |
| Stage subprocess stdout | Per-stage line tail beneath the narrative, grey-fading from oldest to newest |
| Live elapsed timer | `5.2s` ticking up in primary color next to whichever stage is `RUN`-ning |
| Failure auto-pivot | Red border, larger panel, 15 lines of traceback when a stage exits non-zero |
| Navigation persistence | Connect → Running → Report → back: SSE stays open, log buffer survives |
| Auto-route on complete | Run finishes → screen flips to Report automatically |

### HITL feedback loop

```
   Run finishes ──► User clicks Live Predict
                          │
                          ▼
                  Adjust feature inputs
                          │
                          ▼
       POST /predict ──► XGBoost predict_proba on saved model
                          │
                          ▼
                  Score · tier · top-3 contributors shown
                          │
                          ▼
            User clicks ✓ Yes  /  ✗ No
                          │
                          ▼
       POST /feedback (with runId) ──► row stored in DB
                          │
                          ▼
    Memory tab updates: per-run accuracy bar, by-tier breakdown
                          │
                          ▼
           Next pipeline run on this project:
           Claude's narrative prompt now opens with
           "PRIOR FEEDBACK: 60% accuracy, weakest at LOW"
                          │
                          ▼
              Reasoning is calibrated by reality
```

---

## Quickstart (local development)

### Prerequisites

- **Node 20+** and **Python 3.12** on PATH
- An **Anthropic API key** ([console.anthropic.com](https://console.anthropic.com))
- Optional: Google OAuth client (for the "Continue with Google" button), Neon free Postgres (for persistence), Resend API key (for password-reset emails)

### One-time setup

```bash
# 1. Clone with the upstream engine submodule
git clone https://github.com/akv803101/brahma-ui.git
cd brahma-ui
git submodule update --init --recursive

# 2. Install JS deps
npm install

# 3. Install Python deps (FastAPI + SDKs + ML stack)
python -m venv .venv
source .venv/Scripts/activate            # Windows: .venv\Scripts\activate
pip install -r server/requirements.txt
pip install -r vendor/brahma/requirements.txt

# 4. Create server/.env
cat > server/.env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=dev-only-32-bytes-of-randomness-here
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
COOKIE_NAME=brahma_session
JWT_EXPIRY_DAYS=30
FRONTEND_ORIGIN=http://localhost:5173
BACKEND_ORIGIN=http://localhost:8000
# optional:
# GOOGLE_CLIENT_ID=...
# GOOGLE_CLIENT_SECRET=...
# RESEND_API_KEY=...
# DATABASE_URL=postgresql://...    (else SQLite at server/brahma.db)
# BRAHMA_NARRATIVE_MODEL=claude-haiku-4-5-20251001
# BRAHMA_INSIGHTS_MODEL=claude-haiku-4-5-20251001
EOF
```

### Run

Two terminals:

```bash
# Terminal A — backend (FastAPI on :8000)
python -m uvicorn server.main:app --reload --host 127.0.0.1 --port 8000

# Terminal B — frontend (Vite on :5173, /api proxied to :8000)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Sign up, create a workspace, create a project, click **Test connection** on the bundled CSV, type a goal, click **Start the pipeline**. About 90 seconds later you're on the Report tab with real charts.

### Run a real pipeline against a Postgres database

```bash
# In server/.env, add:
NEON_TEST_URL=postgresql://USER:PASSWORD@host.neon.tech/db?sslmode=require

# Load the bundled customer dataset into your Neon DB:
python scripts/load_neon.py

# In the UI, switch the source dropdown to PostgreSQL,
# fill host/port/db/user/password from your Neon connection string,
# set table_or_query=customers, sslmode=require,
# click Test connection (should go green),
# then Start the pipeline.
```

---

## Production deploy (Render)

The repo ships a [`render.yaml`](./render.yaml) blueprint configured for a single web service that serves both the React bundle and the FastAPI backend on the same domain.

```bash
# 1. Render dashboard → Blueprints → New Blueprint Instance
# 2. Connect this repo
# 3. In the prompted env vars, set:
#      ANTHROPIC_API_KEY     (required)
#      GOOGLE_CLIENT_ID      (required)
#      GOOGLE_CLIENT_SECRET  (required)
#      DATABASE_URL          (recommended — Neon free Postgres)
#      RESEND_API_KEY        (optional)
# 4. Apply. First build takes ~5 min.
# 5. After deploy, get the OAuth callback URL:
curl https://your-service.onrender.com/api/health | jq .google_oauth_callback
# 6. Paste that URL into Google Cloud Console → OAuth client → Authorized redirect URIs
# 7. Smoke test:
python scripts/smoke_deploy.py https://your-service.onrender.com
```

**Plan choice.** The free tier sleeps after 15 min idle and is fine for clicking around / login, but real engine runs (XGBoost + Optuna + SHAP) need RAM. Recommended:

| Render plan | What works | What doesn't |
| --- | --- | --- |
| `free` | Auth, UI, test-connection probes, narrative streaming | Real engine runs OOM on the 5K-row demo |
| `starter` ($7/mo) | Same as free, no sleep, snappier UX | Same RAM ceiling |
| `standard` ($25/mo) | Comfortable for 5K–200K row real runs | — |

**Persistent disk.** Render's free + starter tiers have no persistent disk, so `runs/{id}/outputs/` vanishes on restart. The blueprint sketches a `disk:` block (commented) for `standard`+ plans.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                       Browser (React 18 + Vite)                        │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │  Connect   │  │   Running    │  │    Report    │  │  Insights   │  │
│  │            │  │              │  │              │  │             │  │
│  │ source +   │  │  SSE consume │  │ chart grid + │  │ Claude 9-   │  │
│  │ probe API  │  │  via Event-  │  │ leaderboard  │  │ slide deck  │  │
│  │            │  │  Source hook │  │ (real mode)  │  │ (real mode) │  │
│  └─────┬──────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │
│        │                │                  │                  │        │
│        ▼                ▼                  ▼                  ▼        │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  pipelinesApi  +  useEngineStream  +  useReport  +  useInsights│    │
│  └────────────────────┬───────────────────────────────────────────┘    │
└───────────────────────┼────────────────────────────────────────────────┘
                        │  same-origin (Vite proxy in dev,
                        │  Render same-domain in prod) →
                        ▼  cookies just work
┌────────────────────────────────────────────────────────────────────────┐
│                       FastAPI backend (Python 3.12)                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Auth · Workspaces · Projects · Feedback (SQLite or Postgres)    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Pipeline routes                                                 │  │
│  │   POST /pipelines/test-connection  → 8 source probes             │  │
│  │   POST /pipelines                  → register run                │  │
│  │   GET  /pipelines/{id}/stream      → SSE bridge to BrahmaRunner  │  │
│  │   GET  /pipelines/{id}/report      → narrative + leaderboard +   │  │
│  │                                       chart manifest             │  │
│  │   POST /pipelines/{id}/insights    → Claude generates 9-slide JSON│ │
│  │   GET  /pipelines/{id}/predict-schema  → feature list + samples  │  │
│  │   POST /pipelines/{id}/predict     → real predict_proba on .pkl  │  │
│  │   GET  /pipelines/{id}/files/{...} → serve charts/models         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  BrahmaRunner (server/brahma_runner.py)                          │  │
│  │   • Phase 1 narrative — Claude streaming via Anthropic SDK       │  │
│  │   • Phase 2 stages    — 8 subprocess.Popen, line-buffered stdout │  │
│  │   • Phase 3 outputs   — copytree vendor → runs/{id}/             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────┬──────────────────────────────────────────────────────────┘
              │  injects connection code into stage scripts at runtime,
              │  restores from pristine snapshot before each run
              ▼
┌────────────────────────────────────────────────────────────────────────┐
│       vendor/brahma/   (read-only submodule — akv803101/Brahma)        │
│                                                                        │
│   stage3_eda.py  stage4_features.py  stage5_preprocess.py              │
│   stage6_train.py (XGBoost+Optuna)   stage7_evaluate.py                │
│   stage8_validate.py  stage9_ensemble.py  stage10_uat.py               │
│   stage11_deploy.py (writes deployment_package.pkl)                    │
└────────────────────────────────────────────────────────────────────────┘
```

**Defensive submodule.** The runner snapshots upstream stage scripts on first init so re-injection across runs doesn't stack onto a previous connection string. The submodule's working tree is restored before every Phase 2.

**Pickle compatibility.** Upstream's `deployment_package.pkl` includes function closures whose qualnames live in the original `__main__`. The predict path stubs those names in our `__main__` before unpickling and uses only `model` + `feature_cols` (the closures aren't needed — we re-implement `predict_proba` on the server side).

---

## Project structure

```
brahma-ui/
├── public/                          static assets (Brahma mark, fonts)
├── src/
│   ├── auth/                        client API + hooks
│   │   ├── api.js                   pipelinesApi · authApi · workspacesApi · ...
│   │   ├── AuthContext.jsx          provider + useAuth
│   │   ├── useEngineStream.js       SSE consumer with reducer + log buffer
│   │   ├── useReport.js             one-shot /report fetch
│   │   └── useInsights.js           POST /insights with cache awareness
│   ├── components/
│   │   ├── BrahmaShell.jsx          tabbed app surface, owns SSE hook
│   │   ├── BrahmaWindow.jsx         macOS-style chrome
│   │   ├── TweaksPanel.jsx          dev-only color/layout/scenario picker
│   │   ├── primitives/              Charts.jsx · KPI.jsx · BrahmaMark.jsx · ...
│   │   ├── screens/
│   │   │   ├── ConnectScreen.jsx    8-source dropdown + probe + flow
│   │   │   ├── RunningScreen.jsx    real / mock split, log tail, time tick
│   │   │   ├── LivePredict.jsx      real schema-driven form + predict
│   │   │   ├── FeedbackWidget.jsx   ✓/✗ tied to runId
│   │   │   └── MemoryScreen.jsx     per-run accuracy + recent feedback
│   │   ├── report/
│   │   │   ├── ReportLayoutA/B/C.jsx  three real-mode + mock-fallback layouts
│   │   │   ├── ChartGrid.jsx        engine PNGs grouped by category
│   │   │   ├── RealLeaderboard.jsx  schema-agnostic table
│   │   │   └── RealReportSections.jsx  hero + narrative components
│   │   └── insights/
│   │       ├── InsightsDeck.jsx     real (useInsights) / mock split
│   │       └── Slides.jsx           5 slide kinds incl. engine-chart
│   └── data/                        scenarios.js · decks.js (mock fallback only)
├── server/
│   ├── main.py                      FastAPI app + middleware + routes
│   ├── brahma_runner.py             Phase 1/2/3 orchestrator + feedback block
│   ├── brahma_bridge.py             cached singleton engine
│   ├── auth_core.py                 JWT cookies, current_user dependency
│   ├── auth_routes.py               /signup /login /logout /me
│   ├── oauth_routes.py              Google OAuth (authlib)
│   ├── feedback_routes.py           feedback CRUD + stats with by_run aggregate
│   ├── workspaces_routes.py         workspaces + projects + memberships
│   ├── memory_routes.py             recent runs + run details
│   ├── db.py                        SQLAlchemy models, SQLite/Postgres switch
│   └── requirements.txt
├── scripts/
│   ├── load_neon.py                 one-shot CSV → Neon Postgres
│   └── smoke_deploy.py              5-check post-deploy verification
├── vendor/brahma/                   ── read-only submodule ──
├── runs/                            per-run logs + outputs (gitignored)
├── render.yaml                      Render blueprint
└── vite.config.js                   /api proxy to :8000
```

---

## API surface (selected)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | Email + password signup |
| `POST` | `/api/auth/login` | Email + password login |
| `GET`  | `/api/auth/google/start` | Redirect to Google OAuth |
| `GET`  | `/api/auth/google/callback` | OAuth callback handler |
| `GET`  | `/api/me` | Current user + workspaces |
| `GET`  | `/api/health` | Status, mode, OAuth callback URL, version |
| `POST` | `/api/pipelines/test-connection` | Per-source live probe with row-count warning |
| `POST` | `/api/pipelines` | Register a run, returns runId |
| `GET`  | `/api/pipelines/{id}/stream` | SSE event stream (deduped) |
| `GET`  | `/api/pipelines/{id}/report` | Narrative + leaderboard + chart manifest |
| `POST` | `/api/pipelines/{id}/insights` | Claude-generated deck (cached) |
| `GET`  | `/api/pipelines/{id}/predict-schema` | Feature list + sample quantiles + tiers |
| `POST` | `/api/pipelines/{id}/predict` | Real predict_proba on saved model |
| `GET`  | `/api/pipelines/{id}/files/{path}` | Serve PNG/CSV/PKL from `runs/{id}/outputs/` |
| `POST` | `/api/feedback` | Log thumbs-up/down with runId linkage |
| `GET`  | `/api/feedback/stats` | Project-level + per-tier + per-run aggregates |
| `POST` | `/api/feedback/recalibrate` | Bump `model_version` after enough corrections |

---

## Production hardening

**Cookies.** httpOnly, `Secure` in prod (`COOKIE_SECURE=true`), `SameSite=lax`. Same-domain hosting on Render means no third-party cookie gymnastics — the browser ships them on every same-origin request without any cross-site shenanigans.

**Origin guard.** Every state-changing `/api/*` request in prod (`COOKIE_SECURE=true`) verifies the `Origin` header against an allowlist of `{FRONTEND_ORIGIN, BACKEND_ORIGIN}`. SameSite=lax already blocks cross-origin POST cookies; this is defense-in-depth for the same-origin XSS edge case. Returns `403 "Origin '...' not allowed"` cleanly.

**Security headers.** Stamped on every response:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (HTTPS only)

**SSE dedup.** EventSource auto-reconnects fire fresh requests at the same endpoint. The runner is keyed by `runId` so reconnects emit `already_running` and close, instead of spawning concurrent runners that race on the shared `vendor/brahma/outputs/` directory.

**Row-count safety.** PostgreSQL / Snowflake / BigQuery probes run a cheap `SELECT count(*)` against bare table names. Above 500K rows the UI shows a yellow warning suggesting `SELECT ... LIMIT 200000`; above 5M rows it shows a red banner warning of OOM. Custom `SELECT` queries are passed through unchanged — the user knows what they want.

---

## Honest limitations

- **No real model retraining from feedback.** Feedback flows to Claude's *narrative prompt* (so reasoning is calibrated), not back into the upstream stages. Real retraining would require modifying the read-only submodule.
- **LivePredict shows scaled features.** The saved model expects already-StandardScaled inputs because upstream preprocesses before training. Sliders show z-score values (e.g. `age = -0.5`) rather than raw values (`age = 45`). Folding the saved scaler into the predict path is a sensible next chunk.
- **Single-user workspaces.** The DB schema supports memberships, but the UI only exposes the project-owner view today.
- **Ephemeral runs on free Render.** `runs/{id}/outputs/` lives on the local filesystem; without a paid persistent disk, those files vanish on restart. The DB rows persist, just not the chart PNGs.
- **Connection strings briefly land on disk.** Upstream's `_inject_connection` writes the SQLAlchemy URL with the password into the stage script files during a run. Files aren't committed (the snapshot logic restores them) but credentials are transiently on the filesystem. **Rotate database passwords after demo runs.**

---

## Configuration reference

| Env var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | — | Claude calls (narrative + insights) |
| `GOOGLE_CLIENT_ID` | for Google login | — | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | for Google login | — | OAuth client secret |
| `JWT_SECRET` | yes | dev-only | Session token signing key |
| `JWT_EXPIRY_DAYS` | no | `30` | Cookie lifetime |
| `COOKIE_NAME` | no | `brahma_session` | Session cookie name |
| `COOKIE_SECURE` | no | `false` | `true` in prod (HTTPS only) |
| `COOKIE_SAMESITE` | no | `lax` | Same-domain hosting → lax is fine |
| `FRONTEND_ORIGIN` | no | `http://localhost:5173` | CORS allowlist + OAuth redirect |
| `BACKEND_ORIGIN` | no | `http://localhost:8000` | OAuth callback construction |
| `DATABASE_URL` | no | SQLite | Postgres connection string for prod |
| `RESEND_API_KEY` | no | — | Transactional email; without it, reset links log to stdout |
| `RESEND_FROM` | no | — | From address for Resend |
| `BRAHMA_NARRATIVE_MODEL` | no | `claude-haiku-4-5-20251001` | Override for Phase 1 narrative |
| `BRAHMA_INSIGHTS_MODEL` | no | `claude-haiku-4-5-20251001` | Override for insights deck |

---

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | React 18 · Vite 5 · framer-motion · jsPDF (deck export) · pure CSS-in-JS |
| Backend | FastAPI · Uvicorn · SSE-Starlette · SQLAlchemy 2.0 |
| Auth | JWT in httpOnly cookies · bcrypt · authlib (Google OAuth) |
| ML stack | scikit-learn · XGBoost · Optuna · SHAP · pandas · matplotlib (via upstream submodule) |
| Data drivers | psycopg2-binary · snowflake-connector-python · google-cloud-bigquery · boto3 · gspread · httpx |
| DB | SQLite (dev) · Postgres (prod via `DATABASE_URL`, tested on Neon) |
| LLM | Anthropic Claude (Haiku 4.5 default; Sonnet supported via env override) |
| Deploy | Render Blueprint (single web service, same-domain) |

---

## License

Private. The upstream Brahma engine ([`akv803101/Brahma`](https://github.com/akv803101/Brahma)) is vendored as a submodule; consult its license for engine reuse.

---

<div align="center">

*Built with Brahma. The kitchen cooks with real ingredients.*

</div>
