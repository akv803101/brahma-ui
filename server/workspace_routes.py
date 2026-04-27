"""
Workspace + Project CRUD.

  POST /api/workspaces                          — create (becomes admin)
  GET  /api/workspaces                          — list mine
  GET  /api/workspaces/{id}                     — details + projects
  POST /api/workspaces/{id}/members             — add member by email (admin only)

  GET  /api/workspaces/{id}/projects            — list projects
  POST /api/workspaces/{id}/projects            — create project
  GET  /api/projects/{id}                       — project details

All endpoints require a valid session cookie. Membership is enforced
per-workspace; admin role is required for adding members.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .auth_core import current_user
from .db import Membership, Project, User, Workspace, db_dependency

router = APIRouter(prefix="/api", tags=["workspaces"])


# ── Schemas ──────────────────────────────────────────────────────────────


class CreateWorkspaceBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class AddMemberBody(BaseModel):
    email: str
    role: str = Field(default="member", pattern="^(admin|member|viewer)$")


class CreateProjectBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    scenario_type: Optional[str] = Field(default=None, max_length=32)
    description: Optional[str] = Field(default=None, max_length=2000)


class WorkspaceOut(BaseModel):
    id: int
    name: str
    role: str           # current user's role
    is_owner: bool      # whether current user is the owner
    created_at: datetime
    member_count: int


class ProjectOut(BaseModel):
    id: int
    workspace_id: int
    name: str
    scenario_type: Optional[str]
    description: Optional[str]
    created_at: datetime


class WorkspaceDetailOut(WorkspaceOut):
    projects: list[ProjectOut]


class MemberOut(BaseModel):
    user_id: int
    email: str
    name: str
    role: str
    is_owner: bool


# ── Helpers ──────────────────────────────────────────────────────────────


def _membership_or_403(db: Session, user: User, workspace_id: int) -> Membership:
    m = (
        db.query(Membership)
        .filter(Membership.user_id == user.id, Membership.workspace_id == workspace_id)
        .first()
    )
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found.")
    return m


def _admin_or_403(db: Session, user: User, workspace_id: int) -> Membership:
    m = _membership_or_403(db, user, workspace_id)
    if m.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only.")
    return m


def _workspace_to_out(db: Session, w: Workspace, my_role: str, is_owner: bool) -> WorkspaceOut:
    member_count = db.query(Membership).filter(Membership.workspace_id == w.id).count()
    return WorkspaceOut(
        id=w.id, name=w.name, role=my_role, is_owner=is_owner,
        created_at=w.created_at, member_count=member_count,
    )


def _project_to_out(p: Project) -> ProjectOut:
    return ProjectOut(
        id=p.id, workspace_id=p.workspace_id, name=p.name,
        scenario_type=p.scenario_type, description=p.description,
        created_at=p.created_at,
    )


# ── Workspace endpoints ──────────────────────────────────────────────────


@router.post("/workspaces", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
def create_workspace(
    body: CreateWorkspaceBody,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
) -> WorkspaceOut:
    workspace = Workspace(name=body.name.strip(), owner_user_id=user.id)
    db.add(workspace)
    db.flush()  # get workspace.id

    # Owner is automatically an admin member
    db.add(Membership(user_id=user.id, workspace_id=workspace.id, role="admin"))
    db.commit()
    db.refresh(workspace)

    return _workspace_to_out(db, workspace, my_role="admin", is_owner=True)


@router.get("/workspaces", response_model=list[WorkspaceOut])
def list_workspaces(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
) -> list[WorkspaceOut]:
    rows = (
        db.query(Membership, Workspace)
        .join(Workspace, Membership.workspace_id == Workspace.id)
        .filter(Membership.user_id == user.id)
        .order_by(Workspace.created_at.desc())
        .all()
    )
    return [
        _workspace_to_out(db, w, my_role=m.role, is_owner=w.owner_user_id == user.id)
        for (m, w) in rows
    ]


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceDetailOut)
def get_workspace(
    workspace_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
) -> WorkspaceDetailOut:
    membership = _membership_or_403(db, user, workspace_id)
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).one()
    projects = (
        db.query(Project)
        .filter(Project.workspace_id == workspace_id)
        .order_by(Project.created_at.desc())
        .all()
    )
    base = _workspace_to_out(db, workspace, my_role=membership.role, is_owner=workspace.owner_user_id == user.id)
    return WorkspaceDetailOut(
        **base.model_dump(),
        projects=[_project_to_out(p) for p in projects],
    )


@router.get("/workspaces/{workspace_id}/members", response_model=list[MemberOut])
def list_members(
    workspace_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
) -> list[MemberOut]:
    _membership_or_403(db, user, workspace_id)
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).one()
    rows = (
        db.query(Membership, User)
        .join(User, Membership.user_id == User.id)
        .filter(Membership.workspace_id == workspace_id)
        .order_by(Membership.created_at.asc())
        .all()
    )
    return [
        MemberOut(
            user_id=u.id, email=u.email, name=u.name, role=m.role,
            is_owner=workspace.owner_user_id == u.id,
        )
        for (m, u) in rows
    ]


@router.post("/workspaces/{workspace_id}/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def add_member(
    workspace_id: int,
    body: AddMemberBody,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
) -> MemberOut:
    _admin_or_403(db, user, workspace_id)

    target = db.query(User).filter(User.email == body.email.lower()).first()
    if not target:
        raise HTTPException(404, "No account with that email. Ask them to sign up first.")

    existing = (
        db.query(Membership)
        .filter(Membership.user_id == target.id, Membership.workspace_id == workspace_id)
        .first()
    )
    if existing:
        raise HTTPException(409, "Already a member.")

    membership = Membership(user_id=target.id, workspace_id=workspace_id, role=body.role)
    db.add(membership)
    db.commit()

    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).one()
    return MemberOut(
        user_id=target.id, email=target.email, name=target.name,
        role=body.role, is_owner=workspace.owner_user_id == target.id,
    )


# ── Project endpoints ────────────────────────────────────────────────────


@router.get("/workspaces/{workspace_id}/projects", response_model=list[ProjectOut])
def list_projects(
    workspace_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
) -> list[ProjectOut]:
    _membership_or_403(db, user, workspace_id)
    rows = (
        db.query(Project)
        .filter(Project.workspace_id == workspace_id)
        .order_by(Project.created_at.desc())
        .all()
    )
    return [_project_to_out(p) for p in rows]


@router.post(
    "/workspaces/{workspace_id}/projects",
    response_model=ProjectOut,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    workspace_id: int,
    body: CreateProjectBody,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
) -> ProjectOut:
    _membership_or_403(db, user, workspace_id)
    project = Project(
        workspace_id=workspace_id,
        name=body.name.strip(),
        scenario_type=body.scenario_type,
        description=body.description,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_to_out(project)


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_dependency)],
) -> ProjectOut:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found.")
    _membership_or_403(db, user, project.workspace_id)
    return _project_to_out(project)
