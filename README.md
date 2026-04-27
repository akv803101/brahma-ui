<div align="center">

<img src="public/assets/brahma-mark-blue.svg" alt="Brahma" width="84" />

# Brahma UI

### **The Creator Intelligence**

*Tell me your goal and your data source. Nothing else is required.*

[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org)
[![framer-motion](https://img.shields.io/badge/framer--motion-11-0055FF?logo=framer&logoColor=white)](https://www.framer.com/motion/)
[![License](https://img.shields.io/badge/license-private-lightgrey)](#license)

A production-grade React frontend + FastAPI backend for **Brahma**, an autonomous ML super-agent built on top of Claude. You describe a problem in plain English, point Brahma at your data, and the pipeline runs end-to-end — ingestion, EDA, training, validation, deployment, and an executive insights deck — without writing code.

**Live workflow** — sign in → create workspace → create project → connect a data source → start the pipeline → 13 stages stream live → executive report → **insights deck (Stage 13 slide-by-slide takeaway)** → live predictor with **human-in-the-loop feedback** → Brahma recalibrates from your corrections.

---

</div>

## Why this exists

Brahma is the autonomous ML side of the workflow — it picks the right algorithm, runs the pipeline, and explains the results in plain English. This repo is the **product UI** for Brahma: a clean, tab-driven workspace that turns Brahma's runs into something a stakeholder, an analyst, or a CXO can actually consume.

The original [`akv803101/Brahma`](https://github.com/akv803101/Brahma) backend is the ML engine. This repo provides:

- A **multi-tenant frontend** with real auth (email + Google OAuth), workspaces, projects, and per-user run history
- A **FastAPI bridge** that adapts the engine to the UI (or runs in mock mode when `ANTHROPIC_API_KEY` isn't set)
- An **executive insights deck** built from McKinsey-style action-title slide templates, with PDF export
- A **memory layer** that remembers every run and surfaces similar past goals
- A **human-in-the-loop feedback loop** — corrections persist, drive accuracy metrics, and trigger a recalibration cycle

---

## ⚡ Quick start

```bash
# 1. Frontend
git clone https://github.com/akv803101/brahma-ui.git
cd brahma-ui
npm install
npm run dev                    # → http://localhost:5173

# 2. Backend (separate terminal)
pip install -r server/requirements.txt
uvicorn server.main:app --reload --port 8000   # → http://localhost:8000
```

Vite proxies `/api/*` to `127.0.0.1:8000`, so cookies + CORS just work in dev.

> **Need Google OAuth?** See [§ Setting up Google OAuth](#-setting-up-google-oauth).
> **Need real password-reset emails?** See [§ Email delivery (Resend)](#-email-delivery-resend).
> **Need the real Brahma engine?** Set `ANTHROPIC_API_KEY` and clone the [Brahma repo](https://github.com/akv803101/Brahma) alongside.

---

## 🧭 What's in the box

The app is a **6-tab macOS-style window** with auth and workspace gating:

| Tab | What it shows | When it's available |
|---|---|---|
| **Connect** | 9 enterprise data sources (CSV / Snowflake / Postgres / BigQuery / Databricks / S3 / Redshift / Sheets / REST), 3-step gated flow, scenario-aware writeup, **similar-run suggestions from memory** | Always |
| **Running** | Live two-column view: stage list (auto-routes 11 / 13 stages by problem type) + streaming terminal log (50+ ambient log lines) | After clicking *Start the pipeline* |
| **Report** | 3 layouts (A metrics-first, B narrative-first, C leaderboard-forward) with hero gradient, KPI row, **7 problem-type chart grids**, auto-routed leaderboard columns, SHAP panel | Anytime mid- or post-run |
| **Insights** | Scenario-aware **executive deck** (10–15 slides) — McKinsey-style action titles, fullscreen present mode, PDF export | After the pipeline completes |
| **Live Predict** | Slider-driven scoring with 7 polymorphic result panels + **inline feedback widget** (✓ / ✗ / Skip + actual-value form) | Always (any project) |
| **Memory** | Run history (per project or per workspace) + **feedback intelligence panel** (accuracy, by-tier breakdown, recent corrections, retrain banner) | Always |

---

## 🧠 Memory + human-in-the-loop

Two features that compound over time as the user works in Brahma.

### Memory

Every completed run is persisted to SQLite. The UI surfaces past work in two places:

- **Connect screen** — when the user types a goal of 12+ chars, Brahma fuzzy-matches recent runs by goal text and surfaces them inline ("You ran a similar one last month, ROC-AUC 0.99 with XGBoost"). One click reuses the scenario.
- **Memory tab** — full run history with a project / workspace scope toggle. Each row shows scenario, goal, primary metric, best model, started timestamp. Buttons: *Use as template* (start a fresh run) and *Insights →* (open the saved deck).

Backed by the existing [`brahma_memory.py`](https://github.com/akv803101/Brahma/blob/main/brahma_memory.py) semantics — `get_similar_runs()` matches keywords from the goal text against past runs the user can access.

### Human-in-the-loop feedback

After any Live Predict score, an inline widget asks **"Was Brahma right?"** with three actions:

| Action | What happens |
|---|---|
| **✓ Correct** | One click — logs the prediction as confirmed |
| **✗ Wrong — fix it** | Inline form expands with a **polymorphic actual-value input** keyed by `problemType`: binary toggle (classification / fraud / semi-sup), numeric (regression / forecast), cluster picker (clustering, 5 personas), `NORMAL / SUSPECT / ANOMALY` (anomaly) |
| **Skip** | No record — uncertainty is fine |

Every confirmation and correction lands in a `feedback` row. Aggregates feed:

- The Live Predict status caption: `MODEL v1.0.0 · accuracy 91.3% · last recalibrated 2h ago`
- The Memory tab's **Feedback intelligence panel** — accuracy hero, by-tier breakdown bars (correct vs incorrect ratio per tier), recent feedback feed
- A **retrain banner** that appears once `corrections_since_last_calibration ≥ 5` — clicking *Recalibrate Brahma →* bumps the project's `model_version` (`v1.0.0 → v1.0.1`), stamps `last_calibrated_at`, resets the counter

> **An honest seam.** The "retrain" simulates the loop closing. The backend mock has no model to actually retrain — the version bump and accuracy refresh are visual signals that the feedback was registered. Wiring real retraining requires the [Brahma engine](https://github.com/akv803101/Brahma) integration (set `ANTHROPIC_API_KEY` and the start endpoint hands off to `BrahmaEngine` instead of mocks).

---

## 📊 The seven scenarios

The frontend ships seven canonical scenarios that exercise all four problem families in Brahma's taxonomy:

| Scenario | Problem type | Agent | Headline metric | Pipeline stages |
|---|---|---|---|---|
| Credit Card Churn | classification | supervised | ROC-AUC 0.9931 | 13 |
| Customer Lifetime Value | regression | supervised | R² 0.812 | 13 |
| Sales Forecast | forecast | forecasting | MAPE 8.4% | 13 |
| Fraud Detection | imbalanced | supervised | PR-AUC 0.847 | 13 |
| **Customer Segmentation** | **clustering** | **unsupervised** | **Silhouette 0.68** | **11** |
| **Transaction Anomalies** | **anomaly** | **unsupervised** | **Contamination 2.3%** | **11** |
| **Loan Default (Partial Labels)** | **semisupervised** | **semi-sup** | **Final AUC 0.891** | **13** |

Each scenario carries: features (with SHAP weights), 4 KPIs, a 6-row leaderboard, headline + narrative, scenario-specific live-predict inputs with a deterministic `scoreFn`, an executive **insights deck** (10–15 slides), and a *finding-with-chart* slide template per chart type.

---

## 🏗 Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[React + Vite<br/>port 5173]
    UI --> AC[AuthContext]
    UI --> BS[BrahmaShell<br/>6 tabs]
    BS --> Tab1[Connect + similar runs]
    BS --> Tab2[Running + SSE]
    BS --> Tab3[Report 3 layouts]
    BS --> Tab4[Insights deck<br/>lazy chunk]
    BS --> Tab5[Live Predict + feedback]
    BS --> Tab6[Memory + intel panel]
  end

  subgraph FastAPI [FastAPI port 8000]
    AR[/api/auth/*] --> DB
    OR[/api/auth/google/*] --> DB
    PR[/api/auth/forgot<br/>/reset-password] --> DB
    WR[/api/workspaces/*<br/>/api/projects/*] --> DB
    MR[/api/runs/recent<br/>/similar /stats /id] --> DB
    FR[/api/feedback<br/>/feedback/stats<br/>/recalibrate] --> DB
    PE[/api/pipelines/*] --> DB
    PE -->|SSE| UI
  end

  subgraph DB [SQLite brahma.db]
    USR[users]
    WS[workspaces]
    MEM[memberships]
    PRJ[projects]
    RUN[pipeline_runs]
    FB[feedback]
    PRT[password_reset_tokens]
  end

  UI -->|fetch /api/* with cookie| FastAPI
  FastAPI -->|optional handoff if<br/>ANTHROPIC_API_KEY set| ENG[brahma_engine<br/>real ML pipeline]

  style UI fill:#2563EB,color:#fff,stroke:#1E3A8A
  style FastAPI fill:#009688,color:#fff,stroke:#00695C
  style DB fill:#003B57,color:#fff,stroke:#001f30
  style ENG fill:#7C3AED,color:#fff,stroke:#4C1D95
```

### Frontend shape

```
src/
├── auth/                          # AuthContext + 3 API client modules
│   ├── AuthContext.jsx            # status: loading | anonymous | needs_workspace | needs_project | ready
│   ├── api.js                     # authApi / workspacesApi / projectsApi / runsApi / feedbackApi / healthApi
│   └── index.js
├── data/
│   ├── scenarios.js               # 7 scenarios + 3 stage sets + log fragments
│   └── decks.js                   # ~80 slides authored across 7 scenarios
├── theme/useTheme.js              # PALETTES (blue/indigo/purple) + count-up + format
├── styles/tokens.css              # design tokens, fonts, animations
├── components/
│   ├── primitives/                # PulseDot, KPI, ChartCard, SHAPPanel, BrahmaMark,
│   │                              # 17 SVG charts, Icons
│   ├── auth/                      # SignInFlow (signin/signup/forgot router),
│   │                              # ResetPasswordScreen, OnboardingFlow
│   │                              # (CreateWorkspace + CreateProject), AvatarMenu
│   ├── screens/                   # ConnectScreen, RunningScreen, LivePredict,
│   │                              # MemoryScreen, FeedbackWidget, FeedbackIntelPanel,
│   │                              # SimilarRunsPanel
│   ├── report/                    # HeroBanner, ProblemCharts (7 branches),
│   │                              # Leaderboard (5 metric layouts), ReportLayout A/B/C
│   ├── insights/                  # SlideDeck, Slides (10 templates), InsightsDeck
│   │                              # (lazy-loaded chunk, ~155 KB)
│   ├── BrahmaWindow.jsx           # macOS chrome, 6-tab bar
│   ├── BrahmaShell.jsx            # tab routing, pipeline state, lazy boundary
│   └── TweaksPanel.jsx            # dev widget (scenario / layout / color / dark / stage)
├── App.jsx                        # auth gate: ?reset=token override → status switch
└── main.jsx                       # AuthProvider wrap

public/
├── fonts/                         # Plus Jakarta Sans + JetBrains Mono (variable woff2)
└── assets/                        # 9 brand SVGs (mark, wordmark, om, brain, chart-mark)
```

### Backend shape

```
server/
├── __init__.py                    # loads .env at package import
├── main.py                        # FastAPI app, CORS, routers, pipeline mock + SSE
├── db.py                          # SQLAlchemy 2.0 models + session factory + init_db()
├── auth_core.py                   # bcrypt, JWT cookie, current_user dependency,
│                                  # email validator
├── auth_routes.py                 # signup / login / logout / me
├── oauth_routes.py                # Google OAuth — start + callback
├── password_reset.py              # forgot / reset-password (Resend or stdout)
├── workspace_routes.py            # workspaces + projects + members CRUD
├── memory_routes.py               # /api/runs/{recent,similar,stats,{id}}
├── feedback_routes.py             # /api/feedback POST/stats/recalibrate
├── requirements.txt
└── README.md                      # backend-specific setup
```

---

## 🌐 API reference (selected)

All endpoints are under `/api/` and require an httpOnly JWT cookie unless marked **public**. Send `credentials: 'include'` from the frontend (the existing `runsApi` / `feedbackApi` / `authApi` wrappers do this).

### Auth

| Method | Path | Body / Query | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/signup` *public* | `{email, password, name}` | Create user + set session cookie |
| `POST` | `/api/auth/login` *public* | `{email, password}` | Set session cookie |
| `POST` | `/api/auth/logout` *public* | — | Clear cookie |
| `GET`  | `/api/me` | — | Returns user + workspaces + `needs_onboarding` flag |
| `GET`  | `/api/auth/google/start` *public* | — | 302 to Google consent screen |
| `GET`  | `/api/auth/google/callback` *public* | `?code&state` | Exchange code, set cookie, 302 to frontend |
| `POST` | `/api/auth/forgot` *public* | `{email}` | Always 204 (no enumeration); emails reset link |
| `POST` | `/api/auth/reset-password` *public* | `{token, password}` | Validates + updates + marks token used |

### Workspaces & projects

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/workspaces` | Create — caller becomes admin |
| `GET`  | `/api/workspaces` | List user's workspaces with role |
| `GET`  | `/api/workspaces/{id}` | Workspace + projects |
| `GET`  | `/api/workspaces/{id}/members` | List members |
| `POST` | `/api/workspaces/{id}/members` | Add member by email (admin only) |
| `GET`  | `/api/workspaces/{id}/projects` | List |
| `POST` | `/api/workspaces/{id}/projects` | Create |
| `GET`  | `/api/projects/{id}` | Project details |

### Pipelines

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/pipelines` | Start — body `{scenarioId, projectId?, goal?, sourceConfig?}`; persists to `pipeline_runs` |
| `GET`  | `/api/pipelines/{id}/stream` | SSE: `stage` + `log` + `done` events |
| `GET`  | `/api/pipelines/{id}/report` | Final scenario report JSON |
| `POST` | `/api/pipelines/{id}/predict` | Live-score — body `{inputs}` |

### Memory

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/runs/recent?workspaceId=&projectId=&limit=` | Paginated run history scoped by membership |
| `GET` | `/api/runs/similar?goal=&limit=` | Fuzzy-match past runs by keyword overlap |
| `GET` | `/api/runs/stats?workspaceId=&projectId=` | Aggregate counts + last completion |
| `GET` | `/api/runs/{id}` | Single run detail |

### Feedback (HITL)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/feedback` | Log a single ✓ or ✗ row + actual value |
| `GET`  | `/api/feedback/stats?projectId=&scenarioId=` | Accuracy, by-tier, recent, retrain flag |
| `POST` | `/api/feedback/recalibrate?projectId=` | Bump model_version, reset counter |

---

## 🔐 Setting up Google OAuth

Real "Continue with Google" requires a Google Cloud Console OAuth 2.0 client. Free, no card.

1. **Console** → [console.cloud.google.com](https://console.cloud.google.com) → "Select a project" → "New Project" → name "Brahma UI" → Create.
2. **APIs & Services** → **OAuth consent screen** → External → fill app name + your email → Save.
3. **APIs & Services** → **Credentials** → Create Credentials → **OAuth client ID** → Web application.
4. **Authorized redirect URIs** → add `http://localhost:8000/api/auth/google/callback` (and your prod URL later).
5. Create → copy **Client ID** + **Client Secret** → paste into `server/.env`:

```ini
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

Restart `uvicorn`. `/api/health` will show `"google_oauth": true`. The "Continue with Google" button on the sign-in screen now does the real OAuth dance.

> Until creds are present the button is gated server-side (`/start` returns 503) and disabled in the UI.

---

## 📧 Email delivery (Resend)

The forgot-password flow generates a token, persists a sha256 hash, and sends an email with a one-time reset link (valid 30 min, single-use). Email dispatch is provider-agnostic.

**With Resend** (recommended for dev):

1. Sign up at [resend.com](https://resend.com) — free tier: 100 mails/day, 3000/month, no card.
2. Dashboard → API Keys → Create.
3. Add to `server/.env`:

   ```ini
   RESEND_API_KEY=re_...
   RESEND_FROM=Brahma <onboarding@resend.dev>      # or your verified domain
   ```

4. Restart `uvicorn`. Reset emails now route through Resend.

**Without Resend** (dev fallback): the link is logged to the uvicorn console — copy it into a browser to test.

---

## 🛠 Build + scripts

```bash
npm run dev          # Vite dev server (port 5173) with HMR + /api proxy
npm run build        # production bundle to dist/
npm run preview      # serve dist/ locally on 5173

# Backend
uvicorn server.main:app --reload --port 8000

# Smoke test the full flow without a UI:
curl http://localhost:8000/api/health
```

**Bundle composition** (post-Phase 3 lazy splits):

| Chunk | Size | gzip | When loaded |
|---|---:|---:|---|
| `index` (main) | 286 KB | 84 KB | Always |
| `InsightsDeck` | 157 KB | 51 KB | Click Insights tab |
| `framer-motion` | (in InsightsDeck) | — | Click Insights tab |
| `html2canvas` | 201 KB | 48 KB | Click Export PDF |
| `jspdf` + deps | 565 KB | 189 KB | Click Export PDF |
| **Initial load** | **286 KB** | **84 KB** | — |

---

## 🎨 Design system

- **Palette** — 8 brand colors with semantic roles (anomaly red, success green, warning amber, primary blue with cycleable indigo / purple variants)
- **Typography** — Plus Jakarta Sans (variable, 200–800) + JetBrains Mono (variable, 100–800), shipped as `.woff2` in `public/fonts/`
- **Layout** — strict white space, "CXO dashboard, not consumer app" aesthetic
- **No chart library** — every chart in the app is hand-rolled SVG (17 chart components in `primitives/Charts.jsx`)
- **Action-title rule** — every Insights deck slide title states the *takeaway*, not the topic ("Transaction frequency drives 55% of churn risk", not "Feature Importance Analysis")

Source: a pure port of the Brahma Design System (`colors_and_type.css`) — see `src/styles/tokens.css` for the canonical token list.

---

## 🗺 Roadmap

**Built ✓**

- [x] Auth — email/password + Google OAuth + workspace + project + onboarding gate
- [x] Real password reset (Resend-ready, dev fallback to stdout)
- [x] 7 scenarios across 4 problem families
- [x] Connect → Running → Report → Live Predict flow
- [x] 3 report layouts + problem-type-aware chart grids
- [x] Insights deck — 10–15 slides per scenario, McKinsey-style action titles
- [x] PDF export of the deck (lazy-loaded html2canvas + jspdf)
- [x] Memory — persisted runs, similar-goal suggestions, run history tab
- [x] Human-in-the-loop feedback + retrain simulation

**Next**

- [ ] **Real ML retraining** — wire `Brahma.brahma_engine.BrahmaEngine` so the recalibrate cycle uses actual model fits (`ANTHROPIC_API_KEY` already gates the handoff)
- [ ] **Real-time multi-user** — broadcast pipeline progress to all members of a workspace via WebSocket (currently SSE is single-client)
- [ ] **Run-specific deck content** — bind the user-typed goal + run timestamp + project metadata into each slide's cover, not just the static scenario template
- [ ] **2FA + recovery codes** — TOTP authenticator app, recovery-code generation (skeleton already present in design system)
- [ ] **Workspace billing + plan tiers** — placeholder fields in `Workspace`; Stripe wiring TBD
- [ ] **Run history sidebar on Connect** — rolling list of recent runs in the active project
- [ ] **Side-by-side run comparison** — pick two runs from Memory, diff their leaderboards + KPIs

---

## 🧪 Troubleshooting

**`/api/me` returns 401 in the browser but works in curl**
> Check that `credentials: 'include'` is set on every fetch. The bundled `authApi` does this; raw `fetch()` does not by default.

**Vite dev server won't start because port 5173 is busy**
> An older Vite probably didn't shut down. `Get-NetTCPConnection -LocalPort 5173` (Windows) → `Stop-Process -Id <pid> -Force`. On Mac/Linux: `lsof -ti :5173 | xargs kill`.

**Google OAuth → `redirect_uri_mismatch`**
> The redirect URI in Google Cloud Console must be **exactly** `http://localhost:8000/api/auth/google/callback`. Trailing slashes break it.

**`pip install` fails on Python 3.14 building `pydantic-core`**
> Known issue — Python 3.14 wheels are still landing for some packages. Either use Python 3.11–3.13, or `pip install --prefer-binary -r server/requirements.txt`. The current `requirements.txt` uses `>=` pins so pip can pick the latest available.

**SQLite file ends up in git**
> It shouldn't — `*.db` is in `.gitignore`. If you see it, run `git rm --cached server/brahma.db` and recommit.

**Cookies disappear after Google OAuth**
> Browser cookies set during a 302 redirect can be lost if `samesite` doesn't match. The default is `lax`, which works for the OAuth flow. If you set `samesite=strict` in `.env`, OAuth callbacks won't carry the cookie.

---

## 📷 Screenshots

> Adding screenshots is a one-time activity on a working install. Drop them into `public/docs/screenshots/` (PNG, 1440 × 900 ideal) and reference them here:
>
> ```markdown
> ![Sign in](public/docs/screenshots/sign-in.png)
> ![Onboarding](public/docs/screenshots/onboarding-workspace.png)
> ![Main app — Connect tab](public/docs/screenshots/main-connect.png)
> ![Insights deck](public/docs/screenshots/insights-deck.png)
> ![Memory tab](public/docs/screenshots/memory-tab.png)
> ![Live Predict + feedback](public/docs/screenshots/live-predict-feedback.png)
> ```

---

## 📚 Related

- [`akv803101/Brahma`](https://github.com/akv803101/Brahma) — the ML engine (Python, Streamlit, Claude API, 13 pipeline stages)
- The original [Brahma Design System](https://claude.ai/design) (Claude Design output) — canonical color tokens + type scale + component library

---

## License

Private — internal use.

---

<div align="center">

<sub>**Brahma is awake.** &nbsp;·&nbsp; *Tell me your goal and your data source. Nothing else is required.*</sub>

</div>
