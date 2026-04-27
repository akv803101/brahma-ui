"""
Memory endpoints — surface persisted PipelineRun rows to the UI.

  GET /api/runs/recent?workspaceId=&projectId=&limit=
      List the current user's recent runs. Filters narrow scope.

  GET /api/runs/similar?goal=&limit=
      Fuzzy-match past runs by keywords in the goal text. Mirrors
      backend/brahma_memory.BrahmaMemory.get_similar_runs.

  GET /api/runs/stats?workspaceId=&projectId=
      Aggregate stats for the Memory tab dashboard:
      total_runs, complete_count, by_problem_type, last_completed_at,
      best_metric_per_scenario.

All endpoints filter to runs in workspaces the user is a member of.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .auth_core import current_user
from .db import Membership, PipelineRun, Project, User, db_dependency

router = APIRouter(prefix="/api/runs", tags=["memory"])


# ── Schemas ──────────────────────────────────────────────────────────────


class RunOut(BaseModel):
    id: str
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    scenario_id: str
    problem_type: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    started_by: Optional[int] = None
    started_by_name: Optional[str] = None
    goal: Optional[str] = None
    source_type: Optional[str] = None
    best_model: Optional[str] = None
    primary_metric: Optional[str] = None
    primary_value: Optional[float] = None
    similarity: Optional[float] = None  # only set for /similar


class RunStatsOut(BaseModel):
    total_runs: int
    complete_count: int
    running_count: int
    by_problem_type: dict[str, int]
    by_scenario: dict[str, int]
    last_completed_at: Optional[datetime]
    accuracy_panel_eligible: bool  # true if there's at least one complete run


# ── Helpers ──────────────────────────────────────────────────────────────


def _user_workspace_ids(db: Session, user_id: int) -> list[int]:
    return [
        ws_id for (ws_id,) in
        db.query(Membership.workspace_id).filter(Membership.user_id == user_id).all()
    ]


def _accessible_run_filter(db: Session, user: User):
    """
    SQLAlchemy filter expression that limits queries to runs the user can see:
      • runs they started themselves, OR
      • runs whose project belongs to a workspace they are a member of.
    """
    workspace_ids = _user_workspace_ids(db, user.id)
    project_ids = (
        [
            pid for (pid,) in
            db.query(Project.id).filter(Project.workspace_id.in_(workspace_ids)).all()
        ]
        if workspace_ids
        else []
    )
    if project_ids:
        return or_(PipelineRun.started_by == user.id, PipelineRun.project_id.in_(project_ids))
    return PipelineRun.started_by == user.id


def _row_to_out(run: PipelineRun, project: Optional[Project] = None, started_by_user: Optional[User] = None) -> RunOut:
    return RunOut(
        id=run.id,
        project_id=run.project_id,
        project_name=project.name if project else None,
        scenario_id=run.scenario_id,
        problem_type=run.problem_type,
        status=run.status,
        started_at=run.started_at,
        completed_at=run.completed_at,
        started_by=run.started_by,
        started_by_name=started_by_user.name if started_by_user else None,
        goal=run.goal,
        source_type=run.source_type,
        best_model=run.best_model,
        primary_metric=run.primary_metric,
        primary_value=run.primary_value,
    )


def _hydrate(db: Session, runs: list[PipelineRun]) -> list[tuple[PipelineRun, Optional[Project], Optional[User]]]:
    """Bulk-load related Project + User rows for a list of runs."""
    project_ids = {r.project_id for r in runs if r.project_id is not None}
    user_ids = {r.started_by for r in runs if r.started_by is not None}
    projects = (
        {p.id: p for p in db.query(Project).filter(Project.id.in_(project_ids)).all()}
        if project_ids else {}
    )
    users = (
        {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
        if user_ids else {}
    )
    return [(r, projects.get(r.project_id), users.get(r.started_by)) for r in runs]


# ── Endpoints ────────────────────────────────────────────────────────────


@router.get("/recent", response_model=list[RunOut])
def recent_runs(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
    workspaceId: Optional[int] = Query(default=None),
    projectId: Optional[int] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[RunOut]:
    q = db.query(PipelineRun).filter(_accessible_run_filter(db, user))

    if projectId is not None:
        q = q.filter(PipelineRun.project_id == projectId)
    elif workspaceId is not None:
        ids = [pid for (pid,) in db.query(Project.id).filter(Project.workspace_id == workspaceId).all()]
        if not ids:
            return []
        q = q.filter(PipelineRun.project_id.in_(ids))

    runs = q.order_by(PipelineRun.started_at.desc()).limit(limit).all()
    return [_row_to_out(r, p, u) for (r, p, u) in _hydrate(db, runs)]


@router.get("/similar", response_model=list[RunOut])
def similar_runs(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
    goal: str = Query(..., min_length=3),
    limit: int = Query(default=5, ge=1, le=20),
) -> list[RunOut]:
    keywords = [w.lower() for w in goal.split() if len(w) > 3]
    if not keywords:
        return []
    base = db.query(PipelineRun).filter(_accessible_run_filter(db, user))
    clauses = [PipelineRun.goal.ilike(f"%{kw}%") for kw in keywords]
    runs = base.filter(or_(*clauses)).order_by(PipelineRun.started_at.desc()).limit(limit * 2).all()

    # Score by keyword overlap, prefer complete runs, return top N
    def score(run: PipelineRun) -> float:
        if not run.goal:
            return 0
        text = run.goal.lower()
        hits = sum(1 for kw in keywords if kw in text)
        complete_bonus = 0.5 if run.status == "complete" else 0.0
        return hits + complete_bonus

    runs.sort(key=score, reverse=True)
    runs = runs[:limit]
    hydrated = _hydrate(db, runs)
    out = [_row_to_out(r, p, u) for (r, p, u) in hydrated]
    # Attach a normalized similarity score (0..1) for the UI
    if out:
        max_score = max(score(r) for r in runs)
        if max_score > 0:
            for r, run_obj in zip(out, runs):
                r.similarity = score(run_obj) / max_score
    return out


@router.get("/stats", response_model=RunStatsOut)
def runs_stats(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
    workspaceId: Optional[int] = Query(default=None),
    projectId: Optional[int] = Query(default=None),
) -> RunStatsOut:
    q = db.query(PipelineRun).filter(_accessible_run_filter(db, user))
    if projectId is not None:
        q = q.filter(PipelineRun.project_id == projectId)
    elif workspaceId is not None:
        ids = [pid for (pid,) in db.query(Project.id).filter(Project.workspace_id == workspaceId).all()]
        if ids:
            q = q.filter(PipelineRun.project_id.in_(ids))
        else:
            return RunStatsOut(
                total_runs=0, complete_count=0, running_count=0,
                by_problem_type={}, by_scenario={}, last_completed_at=None,
                accuracy_panel_eligible=False,
            )

    runs = q.all()
    by_pt: dict[str, int] = {}
    by_sc: dict[str, int] = {}
    complete_count = 0
    running_count = 0
    last_completed_at = None
    for r in runs:
        by_pt[r.problem_type] = by_pt.get(r.problem_type, 0) + 1
        by_sc[r.scenario_id] = by_sc.get(r.scenario_id, 0) + 1
        if r.status == "complete":
            complete_count += 1
            if r.completed_at and (last_completed_at is None or r.completed_at > last_completed_at):
                last_completed_at = r.completed_at
        elif r.status == "running":
            running_count += 1

    return RunStatsOut(
        total_runs=len(runs),
        complete_count=complete_count,
        running_count=running_count,
        by_problem_type=by_pt,
        by_scenario=by_sc,
        last_completed_at=last_completed_at,
        accuracy_panel_eligible=complete_count > 0,
    )


@router.get("/{run_id}", response_model=RunOut)
def get_run(
    run_id: str,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
) -> RunOut:
    run = db.query(PipelineRun).filter(PipelineRun.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found.")
    accessible = (
        run.started_by == user.id
        or (
            run.project_id is not None
            and db.query(Project)
                .join(Membership, Membership.workspace_id == Project.workspace_id)
                .filter(Project.id == run.project_id, Membership.user_id == user.id)
                .first() is not None
        )
    )
    if not accessible:
        raise HTTPException(403, "This run is not in any of your workspaces.")
    project = db.query(Project).filter(Project.id == run.project_id).first() if run.project_id else None
    started_by = db.query(User).filter(User.id == run.started_by).first() if run.started_by else None
    return _row_to_out(run, project, started_by)
