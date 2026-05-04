"""
Human-in-the-loop feedback endpoints.

  POST /api/feedback                     — log a single feedback row
  GET  /api/feedback/stats               — aggregate panel for the project
  POST /api/feedback/recalibrate         — simulated retrain bump

A feedback row is the only thing we persist on the prediction side — there's
no separate "predictions" log. A row exists iff a human said ✓ Yes or ✗ No.

The "recalibrate" endpoint is theatre: it bumps Project.model_version and
sets last_calibrated_at. No real ML retraining happens — the backend mock
doesn't host a model.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from .auth_core import current_user
from .db import Feedback, Membership, Project, User, db_dependency

router = APIRouter(prefix="/api/feedback", tags=["feedback"])

# Threshold of corrections-since-calibration that triggers the "Re-train"
# banner on the Memory tab. Tuned for demo purposes.
RETRAIN_THRESHOLD = 5


# ── Schemas ──────────────────────────────────────────────────────────────


class FeedbackBody(BaseModel):
    project_id: int = Field(..., alias="projectId")
    scenario_id: str = Field(..., alias="scenarioId")
    run_id: Optional[str] = Field(default=None, alias="runId")
    inputs: dict = Field(default_factory=dict)
    predicted_score: float = Field(..., alias="predictedScore")
    predicted_label: Optional[str] = Field(default=None, alias="predictedLabel")
    predicted_tier: Optional[str] = Field(default=None, alias="predictedTier")
    was_correct: bool = Field(..., alias="wasCorrect")
    actual_value: Optional[str] = Field(default=None, alias="actualValue")
    note: Optional[str] = None

    model_config = {"populate_by_name": True}


class FeedbackOut(BaseModel):
    id: int
    project_id: int
    scenario_id: str
    was_correct: bool
    actual_value: Optional[str] = None
    predicted_score: float
    predicted_tier: Optional[str] = None
    model_version: Optional[str] = None
    created_at: datetime


class ByRunStat(BaseModel):
    run_id: str
    total: int
    correct: int
    incorrect: int
    accuracy: float
    earliest: datetime
    latest: datetime
    model_version: Optional[str] = None


class FeedbackStatsOut(BaseModel):
    project_id: int
    scenario_id: Optional[str] = None
    total: int
    correct: int
    incorrect: int
    accuracy: float                       # 0..1
    by_tier: dict[str, dict[str, int]]    # {"HIGH": {"correct": 4, "incorrect": 1}, ...}
    by_run: list[ByRunStat]               # H4: per-run accuracy, newest first
    recent: list[FeedbackOut]
    last_correction_at: Optional[datetime]
    model_version: str
    last_calibrated_at: Optional[datetime]
    corrections_since_calibration: int
    retrain_threshold: int
    retrain_recommended: bool


# ── Helpers ──────────────────────────────────────────────────────────────


def _require_project_member(db: Session, user: User, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
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
    return project


def _row_to_out(row: Feedback) -> FeedbackOut:
    return FeedbackOut(
        id=row.id,
        project_id=row.project_id,
        scenario_id=row.scenario_id,
        was_correct=row.was_correct,
        actual_value=row.actual_value,
        predicted_score=row.predicted_score,
        predicted_tier=row.predicted_tier,
        model_version=row.model_version,
        created_at=row.created_at,
    )


# ── Endpoints ────────────────────────────────────────────────────────────


@router.post("", response_model=FeedbackOut, status_code=201)
def submit_feedback(
    body: FeedbackBody,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
) -> FeedbackOut:
    project = _require_project_member(db, user, body.project_id)

    row = Feedback(
        run_id=body.run_id,
        project_id=project.id,
        user_id=user.id,
        scenario_id=body.scenario_id,
        inputs_json=json.dumps(body.inputs, default=str),
        predicted_score=body.predicted_score,
        predicted_label=body.predicted_label,
        predicted_tier=body.predicted_tier,
        was_correct=body.was_correct,
        actual_value=body.actual_value,
        note=body.note,
        model_version=project.model_version,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_out(row)


@router.get("/stats", response_model=FeedbackStatsOut)
def get_feedback_stats(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
    projectId: int = Query(..., description="Required — feedback is project-scoped."),
    scenarioId: Optional[str] = Query(default=None),
) -> FeedbackStatsOut:
    project = _require_project_member(db, user, projectId)

    q = db.query(Feedback).filter(Feedback.project_id == project.id)
    if scenarioId:
        q = q.filter(Feedback.scenario_id == scenarioId)

    rows = q.order_by(desc(Feedback.created_at)).all()
    total = len(rows)
    correct = sum(1 for r in rows if r.was_correct)
    incorrect = total - correct
    accuracy = (correct / total) if total else 0.0

    by_tier: dict[str, dict[str, int]] = {}
    for r in rows:
        tier = r.predicted_tier or "—"
        bucket = by_tier.setdefault(tier, {"correct": 0, "incorrect": 0})
        bucket["correct" if r.was_correct else "incorrect"] += 1

    # H4: per-run accuracy aggregates. Skip rows with run_id == NULL
    # (legacy rows from before H1 wired runId through).
    per_run: dict[str, dict[str, Any]] = {}
    for r in rows:
        if not r.run_id:
            continue
        slot = per_run.setdefault(r.run_id, {
            "total": 0, "correct": 0,
            "earliest": r.created_at, "latest": r.created_at,
            "model_version": r.model_version,
        })
        slot["total"] += 1
        if r.was_correct:
            slot["correct"] += 1
        if r.created_at < slot["earliest"]:
            slot["earliest"] = r.created_at
        if r.created_at > slot["latest"]:
            slot["latest"] = r.created_at

    by_run = [
        ByRunStat(
            run_id=rid,
            total=v["total"],
            correct=v["correct"],
            incorrect=v["total"] - v["correct"],
            accuracy=v["correct"] / v["total"] if v["total"] else 0.0,
            earliest=v["earliest"],
            latest=v["latest"],
            model_version=v["model_version"],
        )
        for rid, v in per_run.items()
    ]
    # Newest run first (by latest correction time)
    by_run.sort(key=lambda b: b.latest, reverse=True)

    last_correction_at = rows[0].created_at if rows else None

    # Count corrections since the project's last calibration
    if project.last_calibrated_at:
        since_calibration = sum(
            1 for r in rows if r.created_at >= project.last_calibrated_at and not r.was_correct
        )
    else:
        since_calibration = sum(1 for r in rows if not r.was_correct)

    return FeedbackStatsOut(
        project_id=project.id,
        scenario_id=scenarioId,
        total=total,
        correct=correct,
        incorrect=incorrect,
        accuracy=accuracy,
        by_tier=by_tier,
        by_run=by_run,
        recent=[_row_to_out(r) for r in rows[:8]],
        last_correction_at=last_correction_at,
        model_version=project.model_version,
        last_calibrated_at=project.last_calibrated_at,
        corrections_since_calibration=since_calibration,
        retrain_threshold=RETRAIN_THRESHOLD,
        retrain_recommended=since_calibration >= RETRAIN_THRESHOLD,
    )


@router.post("/recalibrate")
def recalibrate(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
    projectId: int = Query(...),
) -> dict:
    """
    Simulate a recalibration triggered by accumulated corrections.
    Increments the project's model_version (v1.0.0 → v1.0.1 → v1.1.0 → v2.0.0)
    and stamps last_calibrated_at = now.

    No real ML retraining occurs. The version bump is the visible signal that
    the feedback loop closed.
    """
    project = _require_project_member(db, user, projectId)

    project.model_version = _bump_version(project.model_version)
    project.last_calibrated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)

    return {
        "project_id": project.id,
        "model_version": project.model_version,
        "last_calibrated_at": project.last_calibrated_at,
        "message": "Brahma recalibrated using your feedback.",
    }


def _bump_version(version: str) -> str:
    """Bump the patch component, rolling over at 10. Crude but enough for demo."""
    try:
        # strip leading 'v'
        core = version.lstrip('vV')
        parts = [int(p) for p in core.split('.')]
        while len(parts) < 3:
            parts.append(0)
        major, minor, patch = parts[:3]
        patch += 1
        if patch >= 10:
            patch = 0
            minor += 1
        if minor >= 10:
            minor = 0
            major += 1
        return f"v{major}.{minor}.{patch}"
    except Exception:  # noqa: BLE001
        return "v1.0.1"
