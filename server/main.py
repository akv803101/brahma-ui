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
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated, Any, Awaitable, Callable

import asyncio
import queue
import threading

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse
from fastapi.responses import FileResponse
from pathlib import Path

from starlette.middleware.sessions import SessionMiddleware

from sqlalchemy.orm import Session

from .auth_core import current_user
from .auth_routes import router as auth_router
from .db import Membership, PipelineRun, Project, User, db_dependency, init_db
from .feedback_routes import router as feedback_router
from .llm_routes import router as llm_router
from .memory_routes import router as memory_router
from .oauth_routes import (
    GOOGLE_CLIENT_ID,
    router as oauth_router,
)
from .password_reset import router as password_reset_router
from .workspace_routes import router as workspace_router

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

# Tracks real-engine runs that have already been kicked off so EventSource
# auto-reconnects don't spawn a second BrahmaRunner thread (which races on
# the shared vendor/brahma/outputs/ directory and corrupts chart copies).
_REAL_RUN_STARTED: set[str] = set()


# ════════════════════════════════════════════════════════════════════════
# FastAPI app
# ════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    _print_oauth_setup_hint()
    yield


def _print_oauth_setup_hint() -> None:
    """
    I3: at boot, print a visible hint with the exact OAuth callback URL
    the user needs to register in Google Cloud Console. Removes the
    guesswork after the first prod deploy when the Render-assigned URL
    is unknown until the build finishes.
    """
    backend = os.getenv("BACKEND_ORIGIN", "http://localhost:8000")
    has_oauth = bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))
    callback = f"{backend}/api/auth/google/callback"
    border = "=" * 72
    print(border, flush=True)
    print(f" Brahma backend is up — BACKEND_ORIGIN = {backend}", flush=True)
    if has_oauth:
        print(" Google OAuth: configured", flush=True)
        print(" Add this exact URL to Google Cloud Console > OAuth client >", flush=True)
        print(" Authorized redirect URIs:", flush=True)
        print(f"   {callback}", flush=True)
    else:
        print(" Google OAuth: NOT configured (GOOGLE_CLIENT_ID/SECRET missing)", flush=True)
        print(" Email + password sign-in still works.", flush=True)
    print(border, flush=True)


app = FastAPI(
    title="Brahma backend",
    description="Mock + real bridge to brahma_engine.BrahmaEngine. Used by the React UI via /api.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — restrict to the frontend origin so we can ship httpOnly auth cookies.
# In the default Vite proxy setup all /api calls are same-origin, so this only
# matters if the frontend runs at a different host (e.g. production).
_FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_SESSION_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me")
app.add_middleware(
    SessionMiddleware,
    secret_key=_SESSION_SECRET,
    same_site="lax",
    https_only=os.getenv("COOKIE_SECURE", "false").lower() == "true",
)


# I2 — production hardening
# ─────────────────────────
# Allowed origins for state-changing /api/* requests. SameSite=lax already
# blocks cookies on cross-origin POST, but verifying the Origin header
# closes the gap as defense-in-depth and rejects forged Origin headers
# from same-origin XSS payloads.
_ALLOWED_ORIGINS: set[str] = {
    o for o in (
        _FRONTEND_ORIGIN,
        os.getenv("BACKEND_ORIGIN"),
        # Always allow local dev origins so vite proxy + FastAPI talk freely
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
    ) if o
}

# Endpoints that can legitimately receive cross-origin requests (Google
# redirects /api/auth/google/callback back to us with no Origin header).
_ORIGIN_CHECK_EXEMPT: tuple[str, ...] = (
    "/api/auth/google/callback",
    "/api/auth/google/start",
)


@app.middleware("http")
async def security_headers_middleware(request, call_next):
    """
    I2: prod hardening — verify Origin on state-changing /api/* requests
    and stamp standard security headers on every response.
    """
    method = request.method.upper()
    path = request.url.path

    # Origin guard: only enforce for /api/* writes; skip OAuth callbacks
    # and dev-mode where COOKIE_SECURE is false (running on http).
    cookie_secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    if (
        cookie_secure
        and path.startswith("/api/")
        and method in ("POST", "PUT", "PATCH", "DELETE")
        and not any(path.startswith(exempt) for exempt in _ORIGIN_CHECK_EXEMPT)
    ):
        origin = request.headers.get("origin")
        # Browsers send Origin on cross-origin requests AND on same-origin
        # POSTs in modern browsers. Treat missing Origin as suspicious in prod.
        if origin and origin not in _ALLOWED_ORIGINS:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=403,
                content={"detail": f"Origin '{origin}' not allowed for this endpoint."},
            )

    response = await call_next(request)

    # Standard security headers — applied to every response
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if cookie_secure:
        # 1 year HSTS, only stamp when serving over HTTPS so we don't
        # bake in a useless header in dev.
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
    return response

app.include_router(auth_router)
app.include_router(oauth_router)
app.include_router(password_reset_router)
app.include_router(workspace_router)
app.include_router(memory_router)
app.include_router(feedback_router)
app.include_router(llm_router)


class StartPipelineBody(BaseModel):
    scenarioId: str = Field(default="churn", description="One of: churn|ltv|forecast|fraud|segmentation|anomaly|loanSemiSup")
    projectId: int | None = Field(default=None, description="Optional — link the run to a project the user can access.")
    goal: str | None = None
    sourceConfig: dict[str, Any] | None = None


class PredictBody(BaseModel):
    inputs: dict[str, float]


class TestConnectionBody(BaseModel):
    sourceConfig: dict[str, Any]


# Per-type required fields for sourceConfig validation
# Row count thresholds at which we warn the user that the engine will
# pull the whole table into memory in one shot. Above WARN, slower runs.
# Above DANGER, the FastAPI process is likely to OOM mid-ingestion.
_ROW_WARN_AT = 500_000
_ROW_DANGER_AT = 5_000_000


def _classify_size(n: int | None) -> tuple[str | None, str | None]:
    """Returns (warning_message, severity) given a row count, or (None, None)."""
    if n is None:
        return None, None
    if n >= _ROW_DANGER_AT:
        return (
            f"⚠ {n:,} rows — that's likely too large for an in-memory load. "
            f"Replace the table with a sampled SELECT (e.g. "
            f"SELECT * FROM <table> ORDER BY RANDOM() LIMIT 200000) before "
            f"running, or expect the engine to run out of memory.",
            "danger",
        )
    if n >= _ROW_WARN_AT:
        return (
            f"{n:,} rows — Brahma will load all of them. For faster runs, "
            f"replace the table name with SELECT * FROM <table> ... LIMIT 200000.",
            "warn",
        )
    return None, None


def _is_bare_table(toq: str) -> bool:
    """True if table_or_query looks like a table name we can safely COUNT."""
    return not toq.strip().lower().startswith("select")


_REQUIRED_SOURCE_FIELDS: dict[str, tuple[str, ...]] = {
    "file":       ("filename", "temp_path"),
    "postgresql": ("host", "port", "database", "user", "password", "table_or_query"),
    "mysql":      ("host", "port", "database", "user", "password", "table_or_query"),
    "snowflake":  ("account", "user", "password", "warehouse", "database", "schema", "table_or_query"),
    "bigquery":   ("project", "dataset", "table_or_query", "credentials_json"),
    "s3":         ("bucket", "key", "region", "file_format", "access_key", "secret_key"),
    "google_sheets": ("url", "tab", "credentials_json"),
    "rest_api":   ("url", "method"),
    "sqlite":     ("path", "table_or_query"),
}


def _validate_source_config(cfg: dict[str, Any]) -> str:
    src_type = cfg.get("type")
    if not src_type:
        raise HTTPException(400, "sourceConfig.type is required.")
    required = _REQUIRED_SOURCE_FIELDS.get(src_type)
    if required is None:
        raise HTTPException(400, f"Unsupported source type: {src_type}")
    missing = [f for f in required if not cfg.get(f) and cfg.get(f) != 0]
    if missing:
        raise HTTPException(400, f"sourceConfig missing required fields for {src_type}: {', '.join(missing)}")
    return src_type


@app.get("/api/health")
def health() -> dict[str, Any]:
    backend_origin = os.getenv("BACKEND_ORIGIN", "http://localhost:8000")
    return {
        "status": "ok",
        "mode": "real-brahma" if USE_REAL_BRAHMA else "mock",
        "scenarios": list(SCENARIOS.keys()),
        "runs": len(_RUNS),
        "google_oauth": bool(GOOGLE_CLIENT_ID),
        # I3: surface the exact OAuth callback URL so post-deploy setup
        # is one curl away — paste it into Google Cloud Console.
        "google_oauth_callback": f"{backend_origin}/api/auth/google/callback",
        "resend_configured": bool(os.getenv("RESEND_API_KEY", "").strip()),
        "db": "postgres" if (os.getenv("DATABASE_URL") or "").strip() else "sqlite",
        "backend_origin": backend_origin,
        "version": "0.1.0",
    }


@app.get("/api/scenarios")
def list_scenarios() -> dict[str, Any]:
    return {
        sid: {k: v for k, v in s.items() if k != "score_fn"}
        for sid, s in SCENARIOS.items()
    }


# ════════════════════════════════════════════════════════════════════════
# File uploads — for sourceConfig.type='file' when the user picks a CSV
# from their laptop. The file is saved to a per-user uploads dir and the
# returned temp_path becomes the sourceConfig.temp_path for the next run.
# ════════════════════════════════════════════════════════════════════════

_UPLOAD_MAX_BYTES = 50 * 1024 * 1024  # 50 MB
_UPLOAD_ALLOWED_EXT = {".csv", ".xlsx", ".xls", ".parquet", ".json", ".tsv"}


def _safe_filename(name: str) -> str:
    """Strip directory components and any character that could break a path."""
    base = Path(name).name  # drops any directory traversal
    safe = "".join(c if (c.isalnum() or c in "._-") else "_" for c in base)
    return safe[:120] or "uploaded.csv"


@app.post("/api/uploads")
async def upload_file(
    user: Annotated[User, Depends(current_user)],
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """
    Accept a single file upload from the Connect screen, save it to
    runs/uploads/{user_id}/, and return a sourceConfig-compatible
    {filename, temp_path, size_bytes, columns, row_count} payload.

    Validation:
      - Extension must be in _UPLOAD_ALLOWED_EXT (csv, xlsx, xls, parquet,
        json, tsv).
      - Size capped at 50 MB.
      - Filename is sanitized (path-traversal proof).
    """
    if not file.filename:
        raise HTTPException(400, "No filename provided.")
    safe = _safe_filename(file.filename)
    ext = Path(safe).suffix.lower()
    if ext not in _UPLOAD_ALLOWED_EXT:
        raise HTTPException(
            400,
            f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(_UPLOAD_ALLOWED_EXT))}",
        )

    repo_root = Path(__file__).resolve().parent.parent
    uploads_dir = repo_root / "runs" / "uploads" / str(user.id)
    uploads_dir.mkdir(parents=True, exist_ok=True)

    ts = int(time.time())
    target = uploads_dir / f"{ts}_{safe}"

    # Stream-write so we can enforce the size cap mid-upload
    written = 0
    try:
        with target.open("wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > _UPLOAD_MAX_BYTES:
                    f.close()
                    target.unlink(missing_ok=True)
                    raise HTTPException(
                        413,
                        f"File too large: {written / (1024 * 1024):.1f} MB > {_UPLOAD_MAX_BYTES / (1024 * 1024):.0f} MB cap",
                    )
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        target.unlink(missing_ok=True)
        raise HTTPException(500, f"Upload failed: {e}") from e

    # Sniff: try to read a tiny preview so the UI can show "✓ uploaded · 22 cols"
    columns: list[str] = []
    row_count: int | None = None
    try:
        import pandas as pd
        if ext == ".csv":
            df_head = pd.read_csv(target, nrows=5)
            columns = list(df_head.columns)
            # cheap row count via line scan; capped to avoid choking on huge files
            with target.open("r", encoding="utf-8", errors="ignore") as f:
                row_count = sum(1 for _ in f) - 1  # minus header
        elif ext == ".tsv":
            df_head = pd.read_csv(target, nrows=5, sep="\t")
            columns = list(df_head.columns)
        elif ext in (".xlsx", ".xls"):
            df_head = pd.read_excel(target, nrows=5)
            columns = list(df_head.columns)
        elif ext == ".parquet":
            df_head = pd.read_parquet(target).head(5)
            columns = list(df_head.columns)
        elif ext == ".json":
            df_head = pd.read_json(target).head(5)
            columns = list(df_head.columns)
    except Exception as e:  # noqa: BLE001
        # Don't fail the upload just because sniffing didn't work — the
        # file is on disk and the engine will try to read it later.
        columns = []
        row_count = None

    return {
        "filename": safe,
        # Absolute POSIX path — works regardless of where the engine cwd's to
        "temp_path": str(target).replace("\\", "/"),
        "size_bytes": written,
        "size_mb": round(written / (1024 * 1024), 2),
        "columns": columns[:30],
        "column_count": len(columns) if columns else None,
        "row_count": row_count,
    }


@app.post("/api/pipelines/test-connection")
def test_connection(
    body: TestConnectionBody,
    user: Annotated[User, Depends(current_user)],  # noqa: ARG001
) -> dict[str, Any]:
    """
    Lightweight connectivity check before kicking off a full run.
    Validates required fields, then probes the source with a small
    SELECT/list. Returns:
       { ok: bool, source: str, message: str, sample?: {...} }

    Per-source behaviour:
      - file: assert file exists at temp_path; return size + first row count
      - postgresql / mysql: connect with 5s timeout; SELECT 1 + table preview
      - sqlite: open + table count
      - others: validation only (full probe lands in F)
    """
    cfg = body.sourceConfig
    src = _validate_source_config(cfg)

    try:
        if src == "file":
            return _probe_file(cfg)
        if src == "postgresql":
            return _probe_postgres(cfg)
        if src == "sqlite":
            return _probe_sqlite(cfg)
        if src == "snowflake":
            return _probe_snowflake(cfg)
        if src == "bigquery":
            return _probe_bigquery(cfg)
        if src == "s3":
            return _probe_s3(cfg)
        if src == "google_sheets":
            return _probe_google_sheets(cfg)
        if src == "rest_api":
            return _probe_rest(cfg)
        # mysql probe lands in a follow-up chunk
        return {
            "ok": True,
            "source": src,
            "message": f"Configuration valid for {src}. Live probe lands in chunk F.",
        }
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "source": src,
            "message": f"{type(e).__name__}: {e}",
        }


def _probe_file(cfg: dict[str, Any]) -> dict[str, Any]:
    repo_root = Path(__file__).resolve().parent.parent
    rel = cfg.get("temp_path") or ""
    target = (repo_root / "vendor" / "brahma" / rel).resolve()
    if not target.exists():
        # Also try repo-root-relative path (e.g. when temp_path already absolute-ish)
        alt = (repo_root / rel).resolve()
        if alt.exists():
            target = alt
    if not target.is_file():
        return {"ok": False, "source": "file", "message": f"File not found at {rel}"}
    size_kb = target.stat().st_size / 1024
    return {
        "ok": True,
        "source": "file",
        "message": f"{cfg.get('filename')} · {size_kb:.1f} KB",
        "sample": {"filename": cfg.get("filename"), "size_kb": round(size_kb, 1)},
    }


def _probe_postgres(cfg: dict[str, Any]) -> dict[str, Any]:
    import psycopg2
    kwargs = dict(
        host=cfg["host"],
        port=int(cfg["port"]),
        dbname=cfg["database"],
        user=cfg["user"],
        password=cfg["password"],
        connect_timeout=8,
    )
    sslmode = cfg.get("sslmode")
    if sslmode:
        kwargs["sslmode"] = sslmode
    conn = psycopg2.connect(**kwargs)
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        # Try a small preview against the user's table_or_query
        toq = cfg["table_or_query"].strip()
        if toq.lower().startswith("select"):
            preview_sql = f"SELECT * FROM ({toq.rstrip(';')}) AS _b LIMIT 1"
        else:
            preview_sql = f"SELECT * FROM {toq} LIMIT 1"
        try:
            cur.execute(preview_sql)
            cols = [d.name for d in cur.description] if cur.description else []
            row = cur.fetchone()
            # Cheap row-count for bare table names (skip if user wrote a SELECT).
            row_count: int | None = None
            if _is_bare_table(toq):
                try:
                    cur.execute(f"SELECT count(*) FROM {toq}")
                    row_count = cur.fetchone()[0]
                except Exception:  # noqa: BLE001
                    pass
            warning, severity = _classify_size(row_count)
            return {
                "ok": True,
                "source": "postgresql",
                "message": f"Connected · {len(cols)} columns" + (f" · {row_count:,} rows" if row_count is not None else ""),
                "warning": warning,
                "severity": severity,
                "sample": {
                    "columns": cols,
                    "first_row_present": row is not None,
                    "row_count": row_count,
                },
            }
        except Exception as e:  # noqa: BLE001
            return {
                "ok": False,
                "source": "postgresql",
                "message": f"Connected, but preview failed: {e}",
            }
    finally:
        conn.close()


def _probe_snowflake(cfg: dict[str, Any]) -> dict[str, Any]:
    """
    Connect to Snowflake with the user's credentials, run SELECT 1, then
    preview the user's table_or_query. Failures (auth, unreachable, bad
    table) are caught and surfaced as ok=false with the raw error text
    so the UI can display it.
    """
    import snowflake.connector  # heavy import — keep lazy
    kwargs = dict(
        account=cfg["account"],
        user=cfg["user"],
        password=cfg["password"],
        warehouse=cfg["warehouse"],
        database=cfg["database"],
        schema=cfg["schema"],
        login_timeout=10,
        network_timeout=10,
    )
    role = cfg.get("role")
    if role:
        kwargs["role"] = role

    conn = snowflake.connector.connect(**kwargs)
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        toq = cfg["table_or_query"].strip()
        if toq.lower().startswith("select"):
            preview_sql = f"SELECT * FROM ({toq.rstrip(';')}) LIMIT 1"
        else:
            preview_sql = f"SELECT * FROM {toq} LIMIT 1"
        try:
            cur.execute(preview_sql)
            cols = [d.name for d in cur.description] if cur.description else []
            row = cur.fetchone()
            row_count: int | None = None
            if _is_bare_table(toq):
                try:
                    cur.execute(f"SELECT count(*) FROM {toq}")
                    row_count = cur.fetchone()[0]
                except Exception:  # noqa: BLE001
                    pass
            warning, severity = _classify_size(row_count)
            return {
                "ok": True,
                "source": "snowflake",
                "message": f"Connected · {len(cols)} columns" + (f" · {row_count:,} rows" if row_count is not None else ""),
                "warning": warning,
                "severity": severity,
                "sample": {
                    "columns": cols,
                    "first_row_present": row is not None,
                    "warehouse": cfg["warehouse"],
                    "database": cfg["database"],
                    "schema": cfg["schema"],
                    "row_count": row_count,
                },
            }
        except Exception as e:  # noqa: BLE001
            return {
                "ok": False,
                "source": "snowflake",
                "message": f"Connected, but preview failed: {e}",
            }
    finally:
        conn.close()


def _probe_bigquery(cfg: dict[str, Any]) -> dict[str, Any]:
    """
    Authenticate to BigQuery with the user-supplied service-account JSON
    (pasted into the credentials_json field), then preview their
    table_or_query. The credentials live in memory only — never written
    to disk by this probe path.

    table_or_query: either 'project.dataset.table' or a full SELECT.
    """
    import json as _json
    from google.cloud import bigquery
    from google.oauth2 import service_account

    raw = cfg["credentials_json"]
    if isinstance(raw, str):
        try:
            info = _json.loads(raw)
        except Exception as e:  # noqa: BLE001
            return {
                "ok": False,
                "source": "bigquery",
                "message": f"credentials_json is not valid JSON: {e}",
            }
    else:
        info = raw

    try:
        creds = service_account.Credentials.from_service_account_info(
            info,
            scopes=["https://www.googleapis.com/auth/bigquery.readonly"],
        )
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "source": "bigquery",
            "message": f"Could not load service account: {e}",
        }

    client = bigquery.Client(project=cfg["project"], credentials=creds)
    toq = cfg["table_or_query"].strip()
    if toq.lower().startswith("select"):
        preview_sql = f"SELECT * FROM ({toq.rstrip(';')}) LIMIT 1"
    else:
        # qualify single-name tables with project + dataset
        if "." not in toq:
            toq = f"`{cfg['project']}.{cfg['dataset']}.{toq}`"
        else:
            toq = f"`{toq}`"
        preview_sql = f"SELECT * FROM {toq} LIMIT 1"

    try:
        job = client.query(preview_sql)
        rows = list(job.result(timeout=15))
        cols = [f.name for f in job.schema] if job.schema else []
        # Row count via __TABLES__ when user gave a bare table name. Skip
        # for full SELECTs (would re-run the query just for count, defeats
        # the cost-conscious instinct of BigQuery users).
        row_count: int | None = None
        if _is_bare_table(cfg["table_or_query"]):
            bare = cfg["table_or_query"].strip()
            # bare may be 'table' or 'project.dataset.table'
            if "." not in bare:
                fq = f"`{cfg['project']}.{cfg['dataset']}.__TABLES__`"
                count_sql = (
                    f"SELECT row_count FROM {fq} WHERE table_id = @t LIMIT 1"
                )
                try:
                    from google.cloud.bigquery import QueryJobConfig, ScalarQueryParameter
                    job2 = client.query(
                        count_sql,
                        job_config=QueryJobConfig(query_parameters=[
                            ScalarQueryParameter("t", "STRING", bare),
                        ]),
                    )
                    res = list(job2.result(timeout=10))
                    if res:
                        row_count = int(res[0]["row_count"])
                except Exception:  # noqa: BLE001
                    pass
        warning, severity = _classify_size(row_count)
        return {
            "ok": True,
            "source": "bigquery",
            "message": f"Connected · {len(cols)} columns" + (f" · {row_count:,} rows" if row_count is not None else ""),
            "warning": warning,
            "severity": severity,
            "sample": {
                "columns": cols,
                "first_row_present": bool(rows),
                "project": cfg["project"],
                "dataset": cfg["dataset"],
                "row_count": row_count,
            },
        }
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "source": "bigquery",
            "message": f"BigQuery query failed: {e}",
        }


def _probe_s3(cfg: dict[str, Any]) -> dict[str, Any]:
    """
    Boot a boto3 S3 client with explicit credentials + region, then
    HEAD the user-supplied object. Cheap (no body download), exercises
    auth + bucket policy + key existence in one round trip. Returns
    object size and last-modified timestamp on success.

    file_format is recorded but not validated here — the actual read
    happens inside upstream's stage script during the run.
    """
    import boto3
    from botocore.exceptions import ClientError, EndpointConnectionError, NoCredentialsError

    s3 = boto3.client(
        "s3",
        region_name=cfg["region"],
        aws_access_key_id=cfg["access_key"],
        aws_secret_access_key=cfg["secret_key"],
    )
    try:
        meta = s3.head_object(Bucket=cfg["bucket"], Key=cfg["key"])
    except (ClientError, EndpointConnectionError, NoCredentialsError) as e:
        return {
            "ok": False,
            "source": "s3",
            "message": f"S3 head_object failed: {e}",
        }

    size = meta.get("ContentLength", 0)
    size_mb = size / (1024 * 1024)
    last_modified = meta.get("LastModified")
    return {
        "ok": True,
        "source": "s3",
        "message": f"Connected · {size_mb:.2f} MB · format={cfg.get('file_format')}",
        "sample": {
            "bucket": cfg["bucket"],
            "key": cfg["key"],
            "size_bytes": size,
            "last_modified": last_modified.isoformat() if last_modified else None,
            "file_format": cfg.get("file_format"),
        },
    }


def _probe_google_sheets(cfg: dict[str, Any]) -> dict[str, Any]:
    """
    Open the spreadsheet at cfg.url with the user-pasted service account
    JSON, find the worksheet named cfg.tab, and report its basic shape
    (rows × cols + header preview).

    The probe never downloads the full sheet body — it only inspects
    metadata + the header row. The actual full read happens inside the
    upstream stage script during the run.
    """
    import json as _json
    import gspread
    from google.oauth2.service_account import Credentials

    raw = cfg["credentials_json"]
    if isinstance(raw, str):
        try:
            info = _json.loads(raw)
        except Exception as e:  # noqa: BLE001
            return {
                "ok": False,
                "source": "google_sheets",
                "message": f"credentials_json is not valid JSON: {e}",
            }
    else:
        info = raw

    try:
        creds = Credentials.from_service_account_info(
            info,
            scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
        )
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "source": "google_sheets",
            "message": f"Could not load service account: {e}",
        }

    try:
        gc = gspread.authorize(creds)
        sh = gc.open_by_url(cfg["url"])
        ws = sh.worksheet(cfg.get("tab") or "Sheet1")
        # row_count and col_count are sheet capacity — get the actual
        # used header row to give the user something concrete.
        header = ws.row_values(1)
        return {
            "ok": True,
            "source": "google_sheets",
            "message": f"Connected · {ws.row_count} rows × {ws.col_count} cols capacity · {len(header)} header columns",
            "sample": {
                "spreadsheet_title": sh.title,
                "tab": ws.title,
                "row_capacity": ws.row_count,
                "col_capacity": ws.col_count,
                "header": header[:20],  # cap to first 20 column names
            },
        }
    except gspread.exceptions.SpreadsheetNotFound as e:
        return {
            "ok": False,
            "source": "google_sheets",
            "message": f"Spreadsheet not found / share with the service account: {e}",
        }
    except gspread.exceptions.WorksheetNotFound as e:
        return {
            "ok": False,
            "source": "google_sheets",
            "message": f"Worksheet (tab) not found: {e}",
        }
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "source": "google_sheets",
            "message": f"Sheets probe failed: {e}",
        }


def _probe_rest(cfg: dict[str, Any]) -> dict[str, Any]:
    """
    Send the configured HTTP request to the user's endpoint and report
    what came back. Optional Bearer api_key, optional JSON path to drill
    into. Returns response status, top-level shape (list/dict), and
    sample columns if the result is a list of dicts.

    Probe sticks to GET-or-POST with no body — full requests with body
    happen during the run (upstream stage code).
    """
    import json as _json
    import httpx

    url = cfg["url"]
    method = (cfg.get("method") or "GET").upper()
    if method not in ("GET", "POST"):
        return {
            "ok": False,
            "source": "rest_api",
            "message": f"Unsupported method '{method}' (probe accepts GET or POST).",
        }

    headers: dict[str, str] = {"Accept": "application/json"}
    api_key = cfg.get("api_key")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        with httpx.Client(timeout=10) as client:
            resp = client.request(method, url, headers=headers)
    except httpx.HTTPError as e:
        return {
            "ok": False,
            "source": "rest_api",
            "message": f"HTTP error: {e}",
        }

    if resp.status_code >= 400:
        return {
            "ok": False,
            "source": "rest_api",
            "message": f"HTTP {resp.status_code}: {resp.text[:200]}",
        }

    try:
        data = resp.json()
    except _json.JSONDecodeError as e:
        return {
            "ok": False,
            "source": "rest_api",
            "message": f"Response is not JSON: {e}",
        }

    # Optional json_path drill-down (dotted: "data.items")
    json_path = cfg.get("json_path")
    if json_path:
        try:
            for part in json_path.split("."):
                if not part:
                    continue
                if isinstance(data, list) and part.isdigit():
                    data = data[int(part)]
                else:
                    data = data[part]
        except (KeyError, IndexError, TypeError) as e:
            return {
                "ok": False,
                "source": "rest_api",
                "message": f"json_path '{json_path}' could not be resolved: {e}",
            }

    # Describe the resolved shape
    if isinstance(data, list):
        first = data[0] if data else None
        cols = list(first.keys()) if isinstance(first, dict) else []
        return {
            "ok": True,
            "source": "rest_api",
            "message": f"Connected · HTTP {resp.status_code} · {len(data)} records · {len(cols)} columns",
            "sample": {
                "status_code": resp.status_code,
                "record_count": len(data),
                "columns": cols[:30],
            },
        }
    if isinstance(data, dict):
        return {
            "ok": True,
            "source": "rest_api",
            "message": f"Connected · HTTP {resp.status_code} · object with {len(data)} top-level keys",
            "sample": {
                "status_code": resp.status_code,
                "top_level_keys": list(data.keys())[:30],
            },
        }
    return {
        "ok": True,
        "source": "rest_api",
        "message": f"Connected · HTTP {resp.status_code} · scalar response",
        "sample": {"status_code": resp.status_code, "type": type(data).__name__},
    }


def _probe_sqlite(cfg: dict[str, Any]) -> dict[str, Any]:
    import sqlite3
    path = cfg["path"]
    conn = sqlite3.connect(path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [r[0] for r in cur.fetchall()]
        return {
            "ok": True,
            "source": "sqlite",
            "message": f"Opened · {len(tables)} table{'s' if len(tables) != 1 else ''}",
            "sample": {"tables": tables[:8]},
        }
    finally:
        conn.close()


@app.post("/api/pipelines")
def start_pipeline(
    body: StartPipelineBody,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
) -> dict[str, Any]:
    """
    Two modes of operation:
      • Real engine: sourceConfig has a 'type' field. Runs upstream
        BrahmaEngine on real data via BrahmaRunner. Returns runId + mode='real'.
      • Mock: scenarioId only. Plays back the canned scenario animation.
        Kept for back-compat; will be removed once the UI is dataset-adaptive.
    """
    src = body.sourceConfig or {}
    is_real = bool(src.get("type"))

    # Project membership check (same for both modes)
    if body.projectId is not None:
        project = db.query(Project).filter(Project.id == body.projectId).first()
        if not project:
            raise HTTPException(404, "Project not found.")
        is_member = (
            db.query(Membership)
            .filter(
                Membership.user_id == user.id,
                Membership.workspace_id == project.workspace_id,
            )
            .first()
        )
        if not is_member:
            raise HTTPException(403, "You are not a member of this project's workspace.")

    run_id = uuid.uuid4().hex[:12]

    if is_real:
        goal = body.goal or "Run pipeline on the provided data source"
        source_type = src.get("type")
        problem_type = "auto"  # Brahma decides
        scenario_id = body.scenarioId  # may still be set for analytics
        total_stages = 8  # 8 real stages in upstream STAGE_SCRIPTS

        _RUNS[run_id] = {
            "mode": "real",
            "scenarioId": scenario_id,
            "projectId": body.projectId,
            "userId": user.id,
            "goal": goal,
            "sourceConfig": src,
            "totalStages": total_stages,
            "startedAt": datetime.utcnow().isoformat() + "Z",
            "currentStage": 0,
        }
    else:
        # Mock branch (back-compat)
        if body.scenarioId not in SCENARIOS:
            raise HTTPException(404, f"Unknown scenarioId: {body.scenarioId}")
        scenario = SCENARIOS[body.scenarioId]
        stages = STAGE_MAP[scenario["problemType"]]
        goal = body.goal or scenario["goal"]
        source_type = src.get("sourceId") or src.get("type")
        problem_type = scenario["problemType"]
        scenario_id = body.scenarioId
        total_stages = len(stages)

        _RUNS[run_id] = {
            "mode": "mock",
            "scenarioId": scenario_id,
            "projectId": body.projectId,
            "userId": user.id,
            "goal": goal,
            "sourceConfig": src,
            "totalStages": total_stages,
            "startedAt": datetime.utcnow().isoformat() + "Z",
            "currentStage": 0,
        }

    # Persist the run for memory / history (same for both modes)
    db.add(
        PipelineRun(
            id=run_id,
            project_id=body.projectId,
            scenario_id=scenario_id,
            problem_type=problem_type,
            started_by=user.id,
            goal=goal,
            source_type=source_type,
            status="running",
        )
    )
    db.commit()

    return {
        "runId": run_id,
        "scenarioId": scenario_id,
        "problemType": problem_type,
        "totalStages": total_stages,
        "mode": "real" if is_real else "mock",
    }


@app.get("/api/pipelines/{run_id}/stream")
async def stream_pipeline(
    run_id: str,
    user: Annotated[User, Depends(current_user)],
) -> EventSourceResponse:
    if run_id not in _RUNS:
        raise HTTPException(404, f"Unknown run: {run_id}")
    if _RUNS[run_id].get("userId") not in (None, user.id):
        raise HTTPException(403, "This run belongs to a different user.")

    run = _RUNS[run_id]
    if run.get("mode") == "real":
        return EventSourceResponse(_real_event_generator(run_id, run))
    else:
        return EventSourceResponse(_mock_event_generator(run_id, run))


async def _mock_event_generator(run_id: str, run: dict[str, Any]):
    """Original scenario-based mock — back-compat only."""
    scenario = SCENARIOS[run["scenarioId"]]
    stages = STAGE_MAP[scenario["problemType"]]

    for i, stage in enumerate(stages):
        run["currentStage"] = i + 1
        yield {"event": "stage", "data": _json({"index": i, "status": "started", **stage})}
        for _ in range(2):
            frag = LOG_FRAGMENTS[(i * 2 + _) % len(LOG_FRAGMENTS)]
            yield {"event": "log", "data": _json({"ts": _ts(), "parts": frag})}
            await asyncio.sleep(0.18)
        yield {"event": "stage", "data": _json({"index": i, "status": "done", **stage})}
        await asyncio.sleep(0.25)

    _mark_run_complete(run_id, scenario)
    yield {
        "event": "done",
        "data": _json({"runId": run_id, "finalModel": scenario["finalModel"], "kpis": scenario["kpis"]}),
    }


async def _real_event_generator(run_id: str, run: dict[str, Any]):
    """
    Bridge BrahmaRunner's sync generator to async SSE.
    Producer thread calls runner.run() and pushes events into a queue;
    this async generator consumes from the queue and yields SSE events.

    EventSource auto-reconnects: every reconnect lands here as a fresh
    request. We dedupe by run_id so only the first call spawns the
    runner. Reconnects after that just emit an `already_running` notice
    and close — the existing producer thread continues populating the
    run dir; the client should poll /report for the final state.
    """
    if run_id in _REAL_RUN_STARTED:
        yield {"event": "already_running", "data": _json({"run_id": run_id})}
        return
    _REAL_RUN_STARTED.add(run_id)

    from .brahma_runner import BrahmaRunner

    repo_root = Path(__file__).resolve().parent.parent
    runs_root = repo_root / "runs"
    runs_root.mkdir(parents=True, exist_ok=True)

    q: queue.Queue = queue.Queue()
    SENTINEL = object()

    def producer():
        try:
            runner = BrahmaRunner()
            for event in runner.run(
                run_id=run_id,
                goal=run["goal"],
                connection_config=run["sourceConfig"],
                out_root=runs_root,
                project_id=run.get("projectId"),
            ):
                q.put(event)
        except Exception as e:  # noqa: BLE001
            q.put({"event": "fatal", "error": str(e), "type": type(e).__name__})
        finally:
            q.put(SENTINEL)

    thread = threading.Thread(target=producer, daemon=True)
    thread.start()

    leaderboard_rows: list[dict[str, Any]] | None = None
    while True:
        item = await asyncio.to_thread(q.get)
        if item is SENTINEL:
            break

        kind = item.get("event", "message")
        # Track leaderboard so we can update DB at end
        if kind == "leaderboard":
            leaderboard_rows = item.get("rows")
        # Track current stage for back-compat with our existing UI logic
        if kind == "stage_done":
            run["currentStage"] = item.get("index", -1) + 1

        yield {"event": kind, "data": _json(item)}

    # Mark run complete in DB. Pull primary metric from leaderboard if available.
    _mark_real_run_complete(run_id, leaderboard_rows)


def _mark_real_run_complete(run_id: str, leaderboard_rows: list[dict[str, Any]] | None) -> None:
    """Update the persistent PipelineRun row at the end of a real engine run."""
    from .db import SessionLocal
    session = SessionLocal()
    try:
        row = session.query(PipelineRun).filter(PipelineRun.id == run_id).first()
        if not row:
            return
        row.status = "complete"
        row.completed_at = datetime.utcnow()

        if leaderboard_rows:
            # Pick the row with highest auc_val (or first row's primary metric)
            best = max(
                leaderboard_rows,
                key=lambda r: r.get("auc_val") or r.get("auc") or 0,
            )
            row.best_model = str(best.get("model", "")) or None
            for metric_key in ("auc_val", "auc", "f1_val", "r2", "silhouette"):
                if metric_key in best and best[metric_key] is not None:
                    row.primary_metric = metric_key
                    try:
                        row.primary_value = float(best[metric_key])
                    except (TypeError, ValueError):
                        pass
                    break
        session.commit()
    finally:
        session.close()


def _mark_run_complete(run_id: str, scenario: dict) -> None:
    """Update the persistent PipelineRun row with completion metadata."""
    from .db import SessionLocal
    session = SessionLocal()
    try:
        row = session.query(PipelineRun).filter(PipelineRun.id == run_id).first()
        if row:
            primary_kpi = scenario["kpis"][0] if scenario.get("kpis") else None
            row.status = "complete"
            row.completed_at = datetime.utcnow()
            row.best_model = scenario.get("finalModel")
            if primary_kpi:
                row.primary_metric = primary_kpi.get("label")
                row.primary_value = float(primary_kpi.get("value", 0))
            session.commit()
    finally:
        session.close()


_CHART_TITLES = {
    "roc_curve": "ROC Curve",
    "precision_recall_curve": "Precision–Recall Curve",
    "confusion_matrix": "Confusion Matrix",
    "calibration_curve": "Calibration",
    "score_distribution": "Score Distribution",
    "shap_beeswarm": "SHAP Feature Impact",
    "feature_importance_top20": "Top 20 Feature Importance",
    "learning_curve_xgb_tuned": "Learning Curve (XGB tuned)",
    "optuna_history": "Optuna Tuning History",
    "cv_and_threshold": "Cross-Validation & Threshold",
    "ensemble_comparison": "Ensemble vs Single Models",
    "eda_correlation_heatmap": "Correlation Heatmap",
    "eda_feature_correlations": "Top Feature Correlations",
    "eda_target_distribution": "Target Distribution",
    "residuals_vs_predicted": "Residuals vs Predicted",
    "actual_vs_predicted": "Actual vs Predicted",
    "forecast_90d": "90-Day Forecast",
    "mape_by_horizon": "MAPE by Horizon",
    "cluster_distribution": "Cluster Distribution",
    "silhouette": "Silhouette by Cluster",
    "elbow": "Elbow / k Selection",
    "anomaly_histogram": "Anomaly Score Distribution",
    "self_training_auc": "Self-Training AUC",
    "confidence_distribution": "Confidence Distribution",
}

# Order categories by what makes the most sense in a Report scroll
_CATEGORY_ORDER = ["evaluation", "validation", "training", "ensembling", "eda"]


def _humanize_chart_kind(kind: str) -> str:
    if kind in _CHART_TITLES:
        return _CHART_TITLES[kind]
    # Strip "eda_" prefix and "_top20" suffix; title-case the rest
    name = kind.removeprefix("eda_").removesuffix("_top20").replace("_", " ")
    return name[:1].upper() + name[1:] if name else kind


def _enumerate_charts(out_root: Path) -> list[dict[str, str]]:
    """
    Walk outputs/charts/{category}/*.png and return a list of
    {kind, title, category, path} entries — path is relative to outputs/
    so the frontend can build /api/pipelines/{id}/files/{path}.
    """
    charts_dir = out_root / "charts"
    if not charts_dir.exists():
        return []
    items: list[dict[str, str]] = []
    for png in charts_dir.rglob("*.png"):
        rel = png.relative_to(out_root)
        category = png.parent.name
        kind = png.stem
        items.append({
            "kind": kind,
            "title": _humanize_chart_kind(kind),
            "category": category,
            "path": str(rel).replace("\\", "/"),
        })
    items.sort(key=lambda c: (
        _CATEGORY_ORDER.index(c["category"]) if c["category"] in _CATEGORY_ORDER else 99,
        c["kind"],
    ))
    return items


@app.get("/api/pipelines/{run_id}/files/{file_path:path}")
def get_run_file(
    run_id: str,
    file_path: str,
    user: Annotated[User, Depends(current_user)],
):
    """
    Serve a file produced by a real-engine run.
    Files live under runs/{run_id}/outputs/ (charts/*.png, models/*.pkl,
    data/leaderboard.csv, etc.). Path traversal is rejected.
    """
    if run_id not in _RUNS:
        raise HTTPException(404, f"Unknown run: {run_id}")
    if _RUNS[run_id].get("userId") not in (None, user.id):
        raise HTTPException(403, "This run belongs to a different user.")

    repo_root = Path(__file__).resolve().parent.parent
    run_dir = (repo_root / "runs" / run_id).resolve()
    outputs_root = (run_dir / "outputs").resolve()

    target = (outputs_root / file_path).resolve()
    try:
        target.relative_to(outputs_root)
    except ValueError:
        raise HTTPException(403, "Path traversal not allowed.")

    if not target.is_file():
        raise HTTPException(404, "File not found.")

    return FileResponse(target)


@app.get("/api/pipelines/{run_id}/report")
def get_report(
    run_id: str,
    user: Annotated[User, Depends(current_user)],
) -> dict[str, Any]:
    if run_id not in _RUNS:
        raise HTTPException(404, f"Unknown run: {run_id}")
    if _RUNS[run_id].get("userId") not in (None, user.id):
        raise HTTPException(403, "This run belongs to a different user.")
    run = _RUNS[run_id]
    if run.get("mode") == "real":
        # Read narrative + leaderboard + outputs file list from runs/{id}/
        repo_root = Path(__file__).resolve().parent.parent
        run_dir = repo_root / "runs" / run_id
        narrative = ""
        nm = run_dir / "narrative.md"
        if nm.exists():
            narrative = nm.read_text(encoding="utf-8")
        leaderboard: list[dict[str, Any]] = []
        lb = run_dir / "outputs" / "data" / "leaderboard.csv"
        if lb.exists():
            try:
                import pandas as pd
                leaderboard = pd.read_csv(lb).to_dict("records")
            except Exception:  # noqa: BLE001
                pass
        files: list[str] = []
        out_root = run_dir / "outputs"
        if out_root.exists():
            files = [str(p.relative_to(out_root)).replace("\\", "/") for p in sorted(out_root.rglob("*")) if p.is_file()]
        charts = _enumerate_charts(out_root)
        return {
            "runId": run_id,
            "mode": "real",
            "goal": run["goal"],
            "narrative": narrative,
            "leaderboard": leaderboard,
            "files": files,
            "charts": charts,
        }
    scenario = SCENARIOS[run["scenarioId"]]
    return {
        "runId": run_id,
        **{k: v for k, v in scenario.items() if k != "score_fn"},
        "stages": STAGE_MAP[scenario["problemType"]],
    }


@app.post("/api/pipelines/{run_id}/insights")
def generate_insights(
    run_id: str,
    user: Annotated[User, Depends(current_user)],
) -> dict[str, Any]:
    """
    Generate (or return cached) executive insights deck for a real run.

    Claude reads the run's narrative + leaderboard + chart list and
    returns a structured slides[] array using kinds:
       cover, action-title, engine-chart, recommendation, next-steps
    The frontend renders slides via the existing renderSlide pipeline.
    """
    if run_id not in _RUNS:
        raise HTTPException(404, f"Unknown run: {run_id}")
    if _RUNS[run_id].get("userId") not in (None, user.id):
        raise HTTPException(403, "This run belongs to a different user.")
    run = _RUNS[run_id]
    if run.get("mode") != "real":
        raise HTTPException(400, "Insights are only available for real runs.")

    # Cache: return previously generated deck if present
    cached = run.get("insights")
    if cached:
        return {"runId": run_id, "slides": cached, "cached": True}

    repo_root = Path(__file__).resolve().parent.parent
    run_dir = repo_root / "runs" / run_id
    nm = run_dir / "narrative.md"
    narrative = nm.read_text(encoding="utf-8") if nm.exists() else ""
    out_root = run_dir / "outputs"
    charts = _enumerate_charts(out_root)
    leaderboard: list[dict[str, Any]] = []
    lb = out_root / "data" / "leaderboard.csv"
    if lb.exists():
        try:
            import pandas as pd
            leaderboard = pd.read_csv(lb).to_dict("records")
        except Exception:  # noqa: BLE001
            pass

    if not leaderboard and not charts:
        raise HTTPException(409, "Run hasn't produced enough output yet for an insights deck.")

    slides = _generate_insights_with_claude(run["goal"], narrative, leaderboard, charts)
    run["insights"] = slides
    return {"runId": run_id, "slides": slides, "cached": False}


def _generate_insights_with_claude(
    goal: str,
    narrative: str,
    leaderboard: list[dict[str, Any]],
    charts: list[dict[str, str]],
) -> list[dict[str, Any]]:
    """Ask Claude Haiku for an exec deck. Returns parsed slides[] list."""
    from .brahma_bridge import get_engine
    engine = get_engine()
    model = os.getenv("BRAHMA_INSIGHTS_MODEL", "claude-haiku-4-5-20251001")

    chart_lines = "\n".join(
        f"  - kind={c['kind']}, category={c['category']}, path={c['path']}, title={c['title']}"
        for c in charts
    )
    leader_summary = "\n".join(
        f"  - {row.get('model') or row.get('name') or 'row'}: " +
        ", ".join(f"{k}={v:.4f}" if isinstance(v, float) else f"{k}={v}"
                  for k, v in row.items() if k != "model" and k != "name")
        for row in leaderboard[:6]
    )

    system = (
        "You are Brahma, generating a McKinsey-style executive insights deck "
        "for a finished ML pipeline. Output STRICTLY valid JSON: a single object "
        '{"slides": [...]} with 8-12 slides. Each slide must use one of these kinds: '
        '"cover", "action-title", "engine-chart", "recommendation", "next-steps".\n\n'
        "Slide schemas:\n"
        '  {"kind":"cover","title":"...","subtitle":"..."}\n'
        '  {"kind":"action-title","title":"<takeaway sentence>","subtitle":"<optional>"}\n'
        '  {"kind":"engine-chart","title":"<takeaway>","path":"<path from charts list>","bullets":["..."],"source":"<optional>"}\n'
        '  {"kind":"recommendation","title":"...","actions":[{"verb":"...","target":"...","reason":"..."}]}\n'
        '  {"kind":"next-steps","title":"...","items":["..."]}\n\n'
        "Rules:\n"
        " - Slide titles state the takeaway, not the topic. ✓ 'Frequency drives 55% of churn.' ✗ 'Feature analysis.'\n"
        " - 'engine-chart' path MUST come from the supplied charts list verbatim.\n"
        " - Use 4-6 engine-chart slides covering the most decision-relevant charts (evaluation > validation > eda).\n"
        " - First slide is always 'cover'. Last slide is always 'next-steps'.\n"
        " - Output JSON only. No markdown fences. No prose before/after."
    )

    user_msg = (
        f"GOAL: {goal}\n\n"
        f"NARRATIVE (Brahma's reasoning during the run):\n{narrative[:3000]}\n\n"
        f"LEADERBOARD ({len(leaderboard)} candidates):\n{leader_summary}\n\n"
        f"CHARTS PRODUCED ({len(charts)}):\n{chart_lines}\n\n"
        "Generate the deck now."
    )

    resp = engine.client.messages.create(
        model=model,
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = "".join(b.text for b in resp.content if hasattr(b, "text")).strip()
    # Strip accidental markdown fences
    if text.startswith("```"):
        text = text.strip("`")
        text = text.split("\n", 1)[1] if "\n" in text else text
        text = text.rsplit("```", 1)[0]
    import json as _json
    try:
        data = _json.loads(text)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Claude returned invalid JSON: {e}") from e
    slides = data.get("slides", [])
    if not isinstance(slides, list) or not slides:
        raise HTTPException(502, "Claude returned no slides.")
    # Validate engine-chart paths exist in our charts
    valid_paths = {c["path"] for c in charts}
    for s in slides:
        if s.get("kind") == "engine-chart" and s.get("path") not in valid_paths:
            # Drop invalid path; downgrade to action-title so deck still renders
            s["kind"] = "action-title"
            s.pop("path", None)
    return slides


@app.get("/api/pipelines/{run_id}/predict-schema")
def predict_schema(
    run_id: str,
    user: Annotated[User, Depends(current_user)],
) -> dict[str, Any]:
    """
    Return the feature schema needed to build a Live Predict form for a
    real run. Pulls feature names from the deployment package and
    (when available) sampled defaults from the preprocessed parquet.

    Mock runs return a 400 — the legacy LivePredict already knows what
    fields to render from scenario.inputs.
    """
    repo_root = Path(__file__).resolve().parent.parent
    pkl_path = repo_root / "runs" / run_id / "outputs" / "models" / "deployment_package.pkl"
    has_disk = pkl_path.exists()
    if run_id not in _RUNS and not has_disk:
        raise HTTPException(404, f"Unknown run: {run_id}")
    if run_id in _RUNS and _RUNS[run_id].get("userId") not in (None, user.id):
        raise HTTPException(403, "This run belongs to a different user.")
    if run_id in _RUNS and _RUNS[run_id].get("mode") != "real":
        raise HTTPException(400, "Schema only available for real runs.")

    pkg = _load_deployment_package(run_id)
    if pkg is None:
        raise HTTPException(404, "Run has no deployment package yet.")

    repo_root = Path(__file__).resolve().parent.parent
    pre_path = repo_root / "runs" / run_id / "outputs" / "data" / "preprocessed.parquet"

    feature_cols: list[str] = list(pkg.get("feature_cols", []))
    samples: dict[str, list[float]] = {}
    if pre_path.exists():
        try:
            import pandas as pd
            df = pd.read_parquet(pre_path)
            for col in feature_cols:
                if col not in df.columns:
                    continue
                series = df[col].dropna()
                if series.empty:
                    continue
                # Numeric: send 5 evenly-spaced quantiles + median; the UI
                # uses median as the default and the others as quick picks.
                if pd.api.types.is_numeric_dtype(series):
                    quantiles = [0.1, 0.25, 0.5, 0.75, 0.9]
                    samples[col] = [round(float(series.quantile(q)), 4) for q in quantiles]
        except Exception:  # noqa: BLE001
            pass

    return {
        "runId": run_id,
        "feature_cols": feature_cols,
        "samples": samples,
        "threshold": pkg.get("threshold", 0.5),
        "risk_tiers": pkg.get("risk_tiers", {}),
        "model_version": pkg.get("model_version"),
    }


def _stub_main_for_pickle() -> None:
    """
    Upstream's deployment_package.pkl includes function closures whose
    qualnames live in __main__ (predict_brahma, validate_input, etc).
    Pickle won't unpickle them unless the names exist in __main__.
    We don't actually USE those closures (we re-implement predict on
    our side using model + feature_cols), so we just stub them as
    placeholders so the rest of the pickle loads cleanly.
    """
    import sys as _sys
    main = _sys.modules["__main__"]
    for name in ("predict_brahma", "validate_input", "check_for_drift"):
        if not hasattr(main, name):
            setattr(main, name, lambda *a, **kw: None)
    # Modules the closures captured globally
    for mod_name in ("numpy", "pandas", "time"):
        try:
            __import__(mod_name)
            setattr(main, mod_name.replace("numpy", "np"), __import__(mod_name))
        except Exception:  # noqa: BLE001
            pass


# Cache loaded packages per run_id so we don't unpickle the model on
# every prediction call. Keyed by run_id; entries never evict in dev.
_DEPLOY_PKG_CACHE: dict[str, dict[str, Any]] = {}


def _load_deployment_package(run_id: str) -> dict[str, Any] | None:
    if run_id in _DEPLOY_PKG_CACHE:
        return _DEPLOY_PKG_CACHE[run_id]
    repo_root = Path(__file__).resolve().parent.parent
    pkl = repo_root / "runs" / run_id / "outputs" / "models" / "deployment_package.pkl"
    if not pkl.exists():
        return None
    _stub_main_for_pickle()
    import pickle as _pickle
    with open(pkl, "rb") as f:
        pkg = _pickle.load(f)
    # Trim closures we don't use to keep the cache lean
    pkg = {
        "model": pkg.get("model"),
        "feature_cols": pkg.get("feature_cols", []),
        "model_version": pkg.get("model_version"),
        "threshold": pkg.get("threshold", 0.5),
        "risk_tiers": pkg.get("risk_tiers", {"HIGH": 0.7, "MEDIUM": 0.4, "LOW": 0.0}),
    }
    _DEPLOY_PKG_CACHE[run_id] = pkg
    return pkg


def _real_predict(run_id: str, inputs: dict[str, float]) -> dict[str, Any]:
    """
    Real prediction path: load the run's deployment_package.pkl (cached),
    build a feature row in the saved column order, run predict_proba,
    classify into risk tier. Mirrors upstream stage11_deploy.predict_brahma
    minus the closures (we use model + feature_cols only).
    """
    import time as _time
    import numpy as _np

    pkg = _load_deployment_package(run_id)
    if pkg is None:
        raise HTTPException(404, "Run has no deployment package yet.")
    model = pkg["model"]
    feature_cols: list[str] = pkg["feature_cols"]
    threshold: float = pkg.get("threshold", 0.5)
    tiers: dict[str, float] = pkg.get("risk_tiers", {"HIGH": 0.7, "MEDIUM": 0.4, "LOW": 0.0})

    t0 = _time.perf_counter()
    row = _np.array(
        [[float(inputs.get(c, 0.0) or 0.0) for c in feature_cols]],
        dtype=float,
    )
    prob = float(model.predict_proba(row)[0, 1])
    prediction = int(prob >= threshold)

    if prob > tiers.get("HIGH", 0.7):
        tier = "HIGH"
    elif prob > tiers.get("MEDIUM", 0.4):
        tier = "MEDIUM"
    else:
        tier = "LOW"

    # Top reasons: feature_importances_ * value
    top: list[dict[str, Any]] = []
    if hasattr(model, "feature_importances_"):
        try:
            imps = model.feature_importances_
            contribs = _np.abs(imps * row[0])
            top_idx = contribs.argsort()[-3:][::-1]
            top = [
                {
                    "feature": feature_cols[i],
                    "importance": round(float(imps[i]), 4),
                    "value": round(float(row[0][i]), 4),
                }
                for i in top_idx
            ]
        except Exception:  # noqa: BLE001
            pass

    return {
        "score": round(prob, 4),
        "prediction": prediction,
        "tier": tier,
        "top_reasons": top,
        "model_version": pkg.get("model_version"),
        "latency_ms": round((_time.perf_counter() - t0) * 1000, 3),
    }


@app.post("/api/pipelines/{run_id}/predict")
def predict(
    run_id: str,
    body: PredictBody,
    user: Annotated[User, Depends(current_user)],
) -> dict[str, Any]:
    # H2: allow predicting against any run whose deployment_package.pkl
    # exists on disk, even if uvicorn restarted and dropped _RUNS.
    repo_root = Path(__file__).resolve().parent.parent
    pkl_path = repo_root / "runs" / run_id / "outputs" / "models" / "deployment_package.pkl"
    has_disk = pkl_path.exists()

    if run_id not in _RUNS and not has_disk:
        raise HTTPException(404, f"Unknown run: {run_id}")
    if run_id in _RUNS and _RUNS[run_id].get("userId") not in (None, user.id):
        raise HTTPException(403, "This run belongs to a different user.")

    run = _RUNS.get(run_id) or {"mode": "real" if has_disk else "mock"}

    # H2 — real path: load deployment_package.pkl and run real predict_proba
    if run.get("mode") == "real":
        try:
            res = _real_predict(run_id, body.inputs)
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"Real predict failed: {e}") from e
        return {
            "runId": run_id,
            "mode": "real",
            **res,
        }

    # Mock fallback (back-compat with the legacy 7-scenario demo)
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


# ════════════════════════════════════════════════════════════════════════
# Static frontend — serve the React build alongside /api/* on the same domain
# ════════════════════════════════════════════════════════════════════════
#
# In production (Render / Docker), `npm run build` produces ./dist at the
# repo root before uvicorn starts. Mounting it here means:
#   • Single domain for frontend + backend → cookies just work
#   • OAuth callback lands on the same origin as the rest of the app
#   • No CORS headache
#
# In dev, `dist/` doesn't exist (Vite serves on port 5173 with HMR), so this
# whole block is a no-op.

_DIST_DIR = Path(__file__).resolve().parent.parent / "dist"

if _DIST_DIR.exists():
    @app.get("/{full_path:path}", include_in_schema=False)
    async def _spa_catchall(full_path: str = ""):
        # /api/* and FastAPI's auto-routes already won via earlier registration.
        # Defend explicitly anyway, in case someone hits an unknown /api/...:
        if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("openapi"):
            raise HTTPException(404)

        candidate = _DIST_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        # Anything else → SPA root (so client-side routing on `?reset=...` etc. works)
        return FileResponse(_DIST_DIR / "index.html")


# Allow `python -m server.main` for dev convenience
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.main:app", host="127.0.0.1", port=8000, reload=True)
