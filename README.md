# Brahma UI

> *"Tell me your goal and your data source. Nothing else is required."*

A React + Vite frontend for **Brahma — The Creator Intelligence**, the autonomous ML super-agent built on top of Claude. The backend ML pipeline lives at [akv803101/Brahma](https://github.com/akv803101/Brahma); this repo is the production-grade UI for it, with an optional FastAPI bridge.

The UI ships with **mock data baked in** for all 7 scenarios across the 4 problem families (supervised classification + regression, forecasting, imbalanced, unsupervised clustering, anomaly detection, semi-supervised), so it runs end-to-end without any backend.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

That's it. The page loads to the Connect screen — pick a data source, click *Test connection*, edit the goal, click *Start the pipeline*, watch all 13 (or 11) stages execute, and explore the Report and Live Predict tabs.

The floating **TWEAKS** widget in the bottom-right is the dev console: scenario picker (7 options), report layout (A/B/C), primary color (blue/indigo/purple), dark mode, and a manual pipeline-stage scrubber.

## Optional FastAPI backend

```bash
pip install -r server/requirements.txt
uvicorn server.main:app --reload --port 8000
```

Vite proxies `/api/*` to `127.0.0.1:8000`, so once `uvicorn` is running the frontend can hit the real endpoints. See [server/README.md](server/README.md) for the endpoint reference and the path to switching from mock mode to a real Brahma engine via `ANTHROPIC_API_KEY`.

## What's in the box

| Surface | Powers |
|---|---|
| **Connect** | 9 enterprise data sources (CSV, Snowflake, Postgres, BigQuery, Databricks, S3, Redshift, Sheets, REST) · 3-step gated flow · scenario-aware writeup |
| **Running** | Two-column live view: stage list (auto-routes 11 / 13 stages by problem type) + streaming terminal log |
| **Report** | 3 layouts (A/B/C) · gradient hero · KPI row · 7 problem-type-aware chart grids · auto-routed leaderboard columns · SHAP panel |
| **Live Predict** | Slider-driven scoring with **7 polymorphic result panels** — percent + tier, dollars, units, cluster persona, anomaly score, or semi-sup probability with labeled-vs-pseudo confidence chip |

## The 7 scenarios

| Scenario | Problem type | Agent | Headline metric |
|---|---|---|---|
| Credit Card Churn | classification | supervised | ROC-AUC 0.9931 |
| Customer Lifetime Value | regression | supervised | R² 0.812 |
| Sales Forecast | forecast | forecasting | MAPE 8.4% |
| Fraud Detection | imbalanced | supervised | PR-AUC 0.847 |
| Customer Segmentation | clustering | unsupervised | Silhouette 0.68 |
| Transaction Anomalies | anomaly | unsupervised | Contamination 2.3% |
| Loan Default (Partial Labels) | semisupervised | semi-supervised | Final AUC 0.891 |

## Architecture

```
src/
├── data/scenarios.js          7 scenarios + 3 stage sets + log fragments
├── theme/useTheme.js          PALETTES (blue/indigo/purple) + useTheme + count-up + format
├── styles/tokens.css          design tokens — colors, type, spacing, animations
├── components/
│   ├── primitives/            PulseDot · KPI · ChartCard · SHAPPanel · BrahmaMark · 17 Charts · Icons
│   ├── screens/               ConnectScreen · RunningScreen · LivePredict
│   ├── report/                HeroBanner · ProblemCharts (7 branches) · Leaderboard · ReportLayoutA/B/C
│   ├── BrahmaWindow.jsx       macOS window chrome
│   └── TweaksPanel.jsx        floating dev widget
├── App.jsx                    composition — persists tweaks & screen via localStorage
└── main.jsx

server/                        optional FastAPI bridge — mock + real-Brahma modes
public/
├── fonts/                     Plus Jakarta Sans + JetBrains Mono (variable)
└── assets/                    Brahma marks · wordmarks · favicon
```

## Build

```bash
npm run build       # production bundle to dist/ (~220 KB JS gzipped 68 KB)
npm run preview     # serve the bundle locally
```

## Design system

Visual tokens come from the [Brahma Design System](https://github.com/akv803101/Brahma) — blue `#2563EB` primary, Plus Jakarta Sans + JetBrains Mono variable fonts, a deliberate "CXO dashboard, not consumer app" aesthetic. No chart library — every chart is hand-rolled SVG.

## License

Private — internal use.
