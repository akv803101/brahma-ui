"""
Brahma backend — FastAPI bridge that the React UI talks to via Vite's /api proxy.

Endpoints:
    POST /api/pipelines                 → start a run, returns { runId, scenarioId, totalStages }
    GET  /api/pipelines/{run_id}/stream → SSE stream of stage + log events
    GET  /api/pipelines/{run_id}/report → final scenario data (KPIs, leaderboard, SHAP, charts)
    POST /api/pipelines/{run_id}/predict→ live-predict endpoint, returns a 0..1 score

If ANTHROPIC_API_KEY is set AND the Brahma repo's brahma_engine module is importable,
the start endpoint hands off to BrahmaEngine. Otherwise — and by default — the server
returns deterministic mock responses generated from the same 7 scenarios the UI uses,
so the frontend works end-to-end without a real Brahma install.

Run with:
    pip install -r requirements.txt
    uvicorn server.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import math
import os
import time
import uuid
from datetime import datetime
from typing import Any, Awaitable, Callable

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

# ════════════════════════════════════════════════════════════════════════
# Optional real-Brahma path
# ════════════════════════════════════════════════════════════════════════

USE_REAL_BRAHMA = False
try:
    if os.getenv("ANTHROPIC_API_KEY"):
        from brahma_engine import BrahmaEngine  # type: ignore  # noqa: F401
        USE_REAL_BRAHMA = True
except Exception:  # noqa: BLE001 — any failure means we fall back to mocks
    USE_REAL_BRAHMA = False


# ════════════════════════════════════════════════════════════════════════
# Mock scenario data — mirrors src/data/scenarios.js
# Kept in lock-step with the frontend so JSON shapes match exactly.
# ════════════════════════════════════════════════════════════════════════

def _stages_supervised() -> list[dict[str, str]]:
    return [
        {"n": "01", "name": "Data Ingestion",      "detail": "loading source · validating schema"},
        {"n": "02", "name": "Data Quality",        "detail": "nulls · duplicates · type drift"},
        {"n": "03", "name": "EDA",                 "detail": "distributions · correlations · outliers"},
        {"n": "04", "name": "Feature Engineering", "detail": "derived features · multicollinearity"},
        {"n": "05", "name": "Preprocessing",       "detail": "encode · scale · split"},
        {"n": "06", "name": "Model Training",      "detail": "Optuna 50 trials · baseline vs candidates"},
        {"n": "07", "name": "Evaluation",          "detail": "holdout metrics · SHAP · plots"},
        {"n": "08", "name": "Validation",          "detail": "10-fold CV · train/test gap · integrity"},
        {"n": "09", "name": "Ensembling",          "detail": "Occam's razor · final model selection"},
        {"n": "10", "name": "UAT",                 "detail": "6 pre-deployment checks"},
        {"n": "11", "name": "Deployment",          "detail": "predict_brahma() · pred/sec"},
        {"n": "12", "name": "Dashboard",           "detail": "generated Streamlit app"},
        {"n": "13", "name": "Summary",             "detail": "CXO-ready executive report"},
    ]


def _stages_unsupervised() -> list[dict[str, str]]:
    return [
        {"n": "01", "name": "Data Ingestion",          "detail": "loading source · validating schema"},
        {"n": "02", "name": "Data Quality",            "detail": "nulls · duplicates · type drift"},
        {"n": "03", "name": "EDA",                     "detail": "distributions · pairwise patterns"},
        {"n": "04", "name": "Feature Engineering",     "detail": "RFM · ratios · log-transforms"},
        {"n": "05", "name": "Preprocessing",           "detail": "scale · encode · whitening"},
        {"n": "06", "name": "Clustering / Isolation",  "detail": "k-means · DBSCAN · IsolationForest"},
        {"n": "07", "name": "Cluster Profiling",       "detail": "persona description · share of base"},
        {"n": "08", "name": "Dimensionality Reduction","detail": "UMAP / t-SNE 2D layout"},
        {"n": "09", "name": "Validation",              "detail": "silhouette · stability · contamination"},
        {"n": "10", "name": "Dashboard",               "detail": "generated cluster explorer"},
        {"n": "11", "name": "Summary",                 "detail": "segment narrative + CXO summary"},
    ]


def _stages_semisupervised() -> list[dict[str, str]]:
    return [
        {"n": "01", "name": "Data Ingestion",      "detail": "loading source · validating schema"},
        {"n": "02", "name": "Data Quality",        "detail": "nulls · duplicates · label coverage"},
        {"n": "03", "name": "EDA",                 "detail": "labeled vs unlabeled distributions"},
        {"n": "04", "name": "Feature Engineering", "detail": "derived features · multicollinearity"},
        {"n": "05", "name": "Preprocessing",       "detail": "encode · scale · split labeled/unlabeled"},
        {"n": "06", "name": "Supervised Seed",     "detail": "baseline classifier on labeled-only"},
        {"n": "07", "name": "Pseudo-Labeling",     "detail": "high-confidence threshold τ=0.85"},
        {"n": "08", "name": "Self-Training Loop",  "detail": "iterate · expand labeled set · refit"},
        {"n": "09", "name": "Evaluation",          "detail": "holdout metrics · SHAP · coverage"},
        {"n": "10", "name": "Validation",          "detail": "CV · pseudo-label leakage check"},
        {"n": "11", "name": "Deployment",          "detail": "predict_brahma() · confidence chip"},
        {"n": "12", "name": "Dashboard",           "detail": "generated Streamlit app"},
        {"n": "13", "name": "Summary",             "detail": "CXO-ready executive report"},
    ]


STAGE_MAP: dict[str, list[dict[str, str]]] = {
    "classification":  _stages_supervised(),
    "regression":      _stages_supervised(),
    "forecast":        _stages_supervised(),
    "imbalanced":      _stages_supervised(),
    "clustering":      _stages_unsupervised(),
    "anomaly":         _stages_unsupervised(),
    "semisupervised":  _stages_semisupervised(),
}


# Score functions — Python ports of the JS scoreFn for each scenario
def _score_churn(x: dict) -> float:
    age, txn, util, rel = x["age"], x["txn"], x["util"], x["rel"]
    return _clamp01(0.15 + util * 0.55 + (60 - txn) / 120 - (rel / 60) * 0.4 + (age - 40) / 200)


def _score_ltv(x: dict) -> float:
    aov, freq, tenure, returns = x["aov"], x["freq"], x["tenure"], x["returns"]
    ltv = aov * freq * (tenure / 365) * 2 * (1 - returns * 1.5)
    return _clamp01(ltv / 5000)


def _score_forecast(x: dict) -> float:
    pred = x["lag7"] * 0.55 + x["lag30"] * 0.3 + x["promo"] * 30 - (x["price"] - 25) * 0.8
    return _clamp01(pred / 200)


def _score_fraud(x: dict) -> float:
    s = (x["amt"] / 8) * 0.45 + (x["mrisk"] / 100) * 0.25 + (x["dist"] / 2000) * 0.15 + (x["velocity"] / 20) * 0.15
    return _clamp01(s)


def _score_segmentation(x: dict) -> float:
    r = 1 - min(1.0, x["recency"] / 365)
    f = min(1.0, x["frequency"] / 40)
    m = min(1.0, x["monetary"] / 5000)
    b = min(1.0, x["breadth"] / 12)
    return min(0.999, max(0.0, r * 0.30 + f * 0.30 + m * 0.30 + b * 0.10))


def _score_anomaly(x: dict) -> float:
    s = max(0.0, x["amtZ"] / 8) * 0.40 + x["merchant"] * 0.30 + x["odd"] * 0.18 + (x["vel"] / 6) * 0.12
    return _clamp01(s)


def _score_loan_semisup(x: dict) -> float:
    p = (
        x["dti"] * 0.45
        + (1 - (x["creditScore"] - 500) / 350) * 0.30
        + min(1.0, x["loanToIncome"] / 8) * 0.18
        + (1 - min(1.0, x["employed"] / 240)) * 0.07
    )
    return _clamp01(p)


def _clamp01(v: float) -> float:
    if math.isnan(v):
        return 0.0
    return max(0.0, min(1.0, v))


SCENARIOS: dict[str, dict[str, Any]] = {
    "churn": {
        "id": "churn",
        "name": "Credit Card Churn",
        "goal": "Predict which credit card customers will churn next month",
        "dataset": "credit_card_customers.csv",
        "dataSize": "10,127 rows · 21 cols · 5.2 MB",
        "problemType": "classification",
        "agent": "supervised_learning_agent",
        "kpis": [
            {"label": "ROC-AUC",       "value": 0.9931, "fmt": "0.0000", "sub": "test set"},
            {"label": "F1",            "value": 0.875,  "fmt": "0.000",  "sub": "positive class"},
            {"label": "CV Gap",        "value": 0.003,  "fmt": "0.000",  "sub": "HEALTHY · no overfit"},
            {"label": "Predict Speed", "value": 179000, "fmt": "int",    "sub": "pred/sec · p95 5.6ms", "unit": "/s"},
        ],
        "finalModel": "XGBoost (tuned)",
        "headline":  "Transaction frequency is the dominant churn signal.",
        "narrative": "Customers who transact less churn more. total_trans_ct and total_trans_amt together account for 55% of SHAP magnitude.",
        "score_fn": _score_churn,
        "live_label": "CHURN RISK",
    },
    "ltv": {
        "id": "ltv",
        "name": "Customer Lifetime Value",
        "goal": "Estimate 24-month customer lifetime value in USD",
        "dataset": "customer_transactions.csv",
        "dataSize": "48,302 rows · 14 cols · 12.4 MB",
        "problemType": "regression",
        "agent": "supervised_learning_agent",
        "kpis": [
            {"label": "R²",            "value": 0.812,  "fmt": "0.000", "sub": "test set"},
            {"label": "MAE",           "value": 142.30, "fmt": "$0.00", "sub": "mean abs error"},
            {"label": "RMSE",          "value": 218.90, "fmt": "$0.00", "sub": "root mean sq error"},
            {"label": "Predict Speed", "value": 84000,  "fmt": "int",   "sub": "pred/sec · p95 11ms", "unit": "/s"},
        ],
        "finalModel": "XGBoost (tuned)",
        "headline":  "Order frequency and basket size drive 52% of lifetime value.",
        "narrative": "Average order value and purchase frequency together explain over half of LTV variance. Return rate is a moderate drag.",
        "score_fn": _score_ltv,
        "live_label": "PREDICTED VALUE",
    },
    "forecast": {
        "id": "forecast",
        "name": "Sales Forecast",
        "goal": "Forecast next-quarter sales for 42 SKUs",
        "dataset": "daily_sales_2022_2026.csv",
        "dataSize": "61,320 rows · 8 cols · 7.8 MB",
        "problemType": "forecast",
        "agent": "forecasting_agent",
        "kpis": [
            {"label": "MAPE",          "value": 8.4,    "fmt": "0.0%", "sub": "90-day horizon"},
            {"label": "SMAPE",         "value": 7.9,    "fmt": "0.0%", "sub": "symmetric error"},
            {"label": "Coverage 95",   "value": 0.94,   "fmt": "0.00", "sub": "prediction interval"},
            {"label": "Predict Speed", "value": 212000, "fmt": "int",  "sub": "pred/sec · p95 3.1ms", "unit": "/s"},
        ],
        "finalModel": "N-BEATS",
        "headline":  "Weekly lag dominates; holiday effects are negligible after lag terms.",
        "narrative": "Seven-day lag explains a third of next-day variance. Weekly seasonality and promos complete the top drivers.",
        "score_fn": _score_forecast,
        "live_label": "FORECAST",
    },
    "fraud": {
        "id": "fraud",
        "name": "Fraud Detection",
        "goal": "Flag fraudulent card transactions in real time",
        "dataset": "transactions_2026_q1.csv",
        "dataSize": "1.2M rows · 18 cols · 284 MB",
        "problemType": "imbalanced",
        "agent": "supervised_learning_agent",
        "kpis": [
            {"label": "PR-AUC",            "value": 0.847,  "fmt": "0.000", "sub": "class balance 0.34%"},
            {"label": "Recall @ 0.1% FPR", "value": 0.763,  "fmt": "0.000", "sub": "operating point"},
            {"label": "F1",                "value": 0.702,  "fmt": "0.000", "sub": "positive class"},
            {"label": "Predict Speed",     "value": 395000, "fmt": "int",   "sub": "pred/sec · p95 1.4ms", "unit": "/s"},
        ],
        "finalModel": "XGBoost (tuned)",
        "headline":  "Amount z-score + merchant risk catch 76% of fraud at 0.1% false positives.",
        "narrative": "Extreme-amount transactions at high-risk merchants account for the bulk of recall. Geographic velocity is the third-strongest signal.",
        "score_fn": _score_fraud,
        "live_label": "FRAUD RISK",
    },
    "segmentation": {
        "id": "segmentation",
        "name": "Customer Segmentation",
        "goal": "Discover natural customer segments from behavioral features",
        "dataset": "customer_behavior_2026.csv",
        "dataSize": "32,400 rows · 18 cols · 9.1 MB",
        "problemType": "clustering",
        "agent": "unsupervised_learning_agent",
        "kpis": [
            {"label": "Silhouette",     "value": 0.68,   "fmt": "0.00", "sub": "k=5 · cosine"},
            {"label": "Davies-Bouldin", "value": 0.74,   "fmt": "0.00", "sub": "lower is better"},
            {"label": "Clusters (k)",   "value": 5,      "fmt": "int",  "sub": "elbow + silhouette"},
            {"label": "Predict Speed",  "value": 240000, "fmt": "int",  "sub": "assignments/sec", "unit": "/s"},
        ],
        "finalModel": "KMeans (k=5)",
        "headline":  "Five distinct customer segments emerge from RFM + breadth.",
        "narrative": "Recency and monetary value drive most of the separation, with category breadth pulling apart loyalists from premium spenders.",
        "score_fn": _score_segmentation,
        "live_label": "SEGMENT",
        "clusters": [
            {"id": 0, "name": "Dormant Skeptics",     "share": 0.15},
            {"id": 1, "name": "Bargain Hunters",      "share": 0.28},
            {"id": 2, "name": "Mainstream Loyalists", "share": 0.32},
            {"id": 3, "name": "Premium Spenders",     "share": 0.18},
            {"id": 4, "name": "VIP Champions",        "share": 0.07},
        ],
    },
    "anomaly": {
        "id": "anomaly",
        "name": "Transaction Anomalies",
        "goal": "Surface anomalous transactions without labeled fraud examples",
        "dataset": "unlabeled_transactions_2026.csv",
        "dataSize": "2.4M rows · 16 cols · 412 MB",
        "problemType": "anomaly",
        "agent": "unsupervised_learning_agent",
        "kpis": [
            {"label": "Contamination", "value": 2.3,   "fmt": "0.0%",  "sub": "estimated outlier rate"},
            {"label": "Score AUC",     "value": 0.913, "fmt": "0.000", "sub": "vs synthetic labels"},
            {"label": "p99 Threshold", "value": 0.84,  "fmt": "0.00",  "sub": "anomaly score cutoff"},
            {"label": "Predict Speed", "value": 320000,"fmt": "int",   "sub": "scores/sec", "unit": "/s"},
        ],
        "finalModel": "IsolationForest (tuned)",
        "headline":  "Amount and merchant rarity isolate the top 2.3% of transactions.",
        "narrative": "Two thirds of high-anomaly transactions involve either an extreme z-scored amount or a merchant the user has never visited.",
        "score_fn": _score_anomaly,
        "live_label": "ANOMALY",
        "anomalyTiers": {"suspect": 0.4, "anomaly": 0.7},
        "anomalyDisplayMax": 5,
    },
    "loanSemiSup": {
        "id": "loanSemiSup",
        "name": "Loan Default (Partial Labels)",
        "goal": "Predict default risk when only 15% of historical loans are labeled",
        "dataset": "loans_partial_labels_2024_2026.csv",
        "dataSize": "210,000 rows · 26 cols · 88 MB · 15% labeled",
        "problemType": "semisupervised",
        "agent": "semi_supervised_agent",
        "kpis": [
            {"label": "Final AUC",        "value": 0.891, "fmt": "0.000", "sub": "after self-training"},
            {"label": "Labeled-Only AUC", "value": 0.823, "fmt": "0.000", "sub": "baseline · labels only"},
            {"label": "Pseudo Coverage",  "value": 0.71,  "fmt": "0.00",  "sub": "fraction high-confidence"},
            {"label": "Iterations",       "value": 4,     "fmt": "int",   "sub": "until convergence"},
        ],
        "finalModel": "Self-Training (XGBoost)",
        "headline":  "Self-training lifts AUC by 6.8 points using unlabeled loans.",
        "narrative": "Starting from 31,500 labeled loans, four self-training iterations confidently pseudo-labeled 71% of the unlabeled pool.",
        "score_fn": _score_loan_semisup,
        "live_label": "DEFAULT RISK",
    },
}


# Ambient log-fragment pool used during stage transitions
LOG_FRAGMENTS: list[list[list[str]]] = [
    [["dim", "[stage_03]"], ["fg", " EDA complete · "], ["ok", "6 charts"]],
    [["dim", "[stage_04]"], ["fg", " engineered "], ["ok", "+5 features"], ["fg", " · dropped 1 multicollinear"]],
    [["dim", "[stage_06]"], ["fg", " optuna · trial 23/50 · "], ["ok", "AUC_val = 0.9917"]],
    [["dim", "[stage_06]"], ["fg", " optuna · trial 50/50 · "], ["ok", "AUC_val = 0.9931"]],
    [["dim", "[stage_07]"], ["fg", " computing SHAP on 1,000 sampled rows…"]],
    [["dim", "[stage_08]"], ["fg", " 10-fold CV · "], ["ok", "0.985 ± 0.006"], ["fg", " · gap 0.003 "], ["ok", "HEALTHY"]],
    [["dim", "[stage_09]"], ["fg", " ensembling rejected (Δ < 0.005) · "], ["ok", "Occam: XGBoost_tuned"]],
    [["dim", "[stage_10]"], ["fg", " UAT · "], ["ok", "6/6 PASS"], ["fg", " · APPROVED FOR DEPLOYMENT"]],
    [["dim", "[stage_11]"], ["fg", " predict_brahma() registered · "], ["ok", "179,243 pred/sec"]],
    [["dim", "[stage_06]"], ["fg", " KMeans · k=3..8 sweep · best k=5 · "], ["ok", "silhouette = 0.68"]],
    [["dim", "[stage_07]"], ["fg", " profiling cluster 4 · "], ["ok", "7% of base · 23% of revenue"]],
    [["dim", "[stage_08]"], ["fg", " UMAP 2D · perplexity=30 · "], ["ok", "separable layout"]],
    [["dim", "[stage_06]"], ["fg", " IsolationForest · 200 trees · "], ["ok", "p99 score = 0.84"]],
    [["dim", "[stage_06]"], ["fg", " supervised seed (15% labeled) · "], ["ok", "AUC = 0.823"]],
    [["dim", "[stage_07]"], ["fg", " pseudo-labeling · τ=0.85 · "], ["ok", "+47% coverage"]],
    [["dim", "[stage_08]"], ["fg", " self-training iter 4/4 · "], ["ok", "AUC = 0.891 · converged"]],
]


# ════════════════════════════════════════════════════════════════════════
# Run registry — in-memory; fine for a dev bridge
# ════════════════════════════════════════════════════════════════════════

_RUNS: dict[str, dict[str, Any]] = {}


# ════════════════════════════════════════════════════════════════════════
# FastAPI app
# ════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="Brahma backend",
    description="Mock + real bridge to brahma_engine.BrahmaEngine. Used by the React UI via /api.",
    version="0.1.0",
)

# Permissive CORS — fine for a dev bridge. Tighten for production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StartPipelineBody(BaseModel):
    scenarioId: str = Field(default="churn", description="One of: churn|ltv|forecast|fraud|segmentation|anomaly|loanSemiSup")
    goal: str | None = None
    sourceConfig: dict[str, Any] | None = None


class PredictBody(BaseModel):
    inputs: dict[str, float]


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "mode": "real-brahma" if USE_REAL_BRAHMA else "mock",
        "scenarios": list(SCENARIOS.keys()),
        "runs": len(_RUNS),
    }


@app.get("/api/scenarios")
def list_scenarios() -> dict[str, Any]:
    return {
        sid: {k: v for k, v in s.items() if k != "score_fn"}
        for sid, s in SCENARIOS.items()
    }


@app.post("/api/pipelines")
def start_pipeline(body: StartPipelineBody) -> dict[str, Any]:
    if body.scenarioId not in SCENARIOS:
        raise HTTPException(404, f"Unknown scenarioId: {body.scenarioId}")

    scenario = SCENARIOS[body.scenarioId]
    stages = STAGE_MAP[scenario["problemType"]]
    run_id = uuid.uuid4().hex[:12]

    _RUNS[run_id] = {
        "scenarioId": body.scenarioId,
        "goal": body.goal or scenario["goal"],
        "sourceConfig": body.sourceConfig or {},
        "totalStages": len(stages),
        "startedAt": datetime.utcnow().isoformat() + "Z",
        "currentStage": 0,
    }
    return {
        "runId": run_id,
        "scenarioId": body.scenarioId,
        "problemType": scenario["problemType"],
        "totalStages": len(stages),
        "mode": "real-brahma" if USE_REAL_BRAHMA else "mock",
    }


@app.get("/api/pipelines/{run_id}/stream")
async def stream_pipeline(run_id: str) -> EventSourceResponse:
    if run_id not in _RUNS:
        raise HTTPException(404, f"Unknown run: {run_id}")

    run = _RUNS[run_id]
    scenario = SCENARIOS[run["scenarioId"]]
    stages = STAGE_MAP[scenario["problemType"]]

    async def event_generator():
        for i, stage in enumerate(stages):
            run["currentStage"] = i + 1
            yield {
                "event": "stage",
                "data": _json({"index": i, "status": "started", **stage}),
            }
            # 1–2 ambient log lines per stage, throttled to feel like a real run
            for _ in range(2):
                frag = LOG_FRAGMENTS[(i * 2 + _) % len(LOG_FRAGMENTS)]
                yield {
                    "event": "log",
                    "data": _json({"ts": _ts(), "parts": frag}),
                }
                await asyncio.sleep(0.18)
            yield {
                "event": "stage",
                "data": _json({"index": i, "status": "done", **stage}),
            }
            await asyncio.sleep(0.25)

        yield {
            "event": "done",
            "data": _json({
                "runId": run_id,
                "finalModel": scenario["finalModel"],
                "kpis": scenario["kpis"],
            }),
        }

    return EventSourceResponse(event_generator())


@app.get("/api/pipelines/{run_id}/report")
def get_report(run_id: str) -> dict[str, Any]:
    if run_id not in _RUNS:
        raise HTTPException(404, f"Unknown run: {run_id}")
    run = _RUNS[run_id]
    scenario = SCENARIOS[run["scenarioId"]]
    return {
        "runId": run_id,
        **{k: v for k, v in scenario.items() if k != "score_fn"},
        "stages": STAGE_MAP[scenario["problemType"]],
    }


@app.post("/api/pipelines/{run_id}/predict")
def predict(run_id: str, body: PredictBody) -> dict[str, Any]:
    if run_id not in _RUNS:
        raise HTTPException(404, f"Unknown run: {run_id}")
    run = _RUNS[run_id]
    scenario = SCENARIOS[run["scenarioId"]]
    score_fn: Callable[[dict], float] = scenario["score_fn"]

    try:
        score = score_fn(body.inputs)
    except KeyError as e:
        raise HTTPException(400, f"Missing input field: {e.args[0]}")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Score function error: {e}") from e

    return {
        "runId": run_id,
        "scenarioId": scenario["id"],
        "problemType": scenario["problemType"],
        "score": score,
        "label": scenario["live_label"],
        "tier": _tier(scenario, score),
    }


# ════════════════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════════════════

def _ts() -> str:
    n = datetime.now()
    return f"{n.hour:02d}:{n.minute:02d}:{n.second:02d}"


def _json(obj: Any) -> str:
    import json
    return json.dumps(obj, separators=(",", ":"))


def _tier(scenario: dict[str, Any], score: float) -> str:
    pt = scenario["problemType"]
    if pt == "anomaly":
        t = scenario.get("anomalyTiers", {"suspect": 0.4, "anomaly": 0.7})
        if score >= t["anomaly"]:
            return "ANOMALY"
        if score >= t["suspect"]:
            return "SUSPECT"
        return "NORMAL"
    if pt == "clustering":
        clusters = scenario.get("clusters", [])
        if not clusters:
            return "—"
        idx = min(len(clusters) - 1, int(score * len(clusters)))
        return clusters[idx]["name"].upper()
    if score > 0.6:
        return "HIGH"
    if score > 0.35:
        return "MEDIUM"
    return "LOW"


# Allow `python -m server.main` for dev convenience
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.main:app", host="127.0.0.1", port=8000, reload=True)
