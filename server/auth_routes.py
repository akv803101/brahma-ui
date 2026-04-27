"""
Auth endpoints — signup, login, logout, me.

  POST /api/auth/signup    body: {email, password, name}      → user + cookie
  POST /api/auth/login     body: {email, password}            → user + cookie
  POST /api/auth/logout                                       → clears cookie
  GET  /api/me                                                → user + workspaces (or 401)

Google OAuth lives in oauth_routes.py (Phase A2). Workspace + project CRUD
lives in workspace_routes.py (Phase A3). This module is the email/password
core only.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .auth_core import (
    clear_session_cookie,
    current_user,
    current_user_optional,
    email_shape_ok,
    hash_password,
    set_session_cookie,
    validate_email_strict,
    verify_password,
)
from .db import Membership, User, Workspace, db_dependency

router = APIRouter(prefix="/api", tags=["auth"])


# ── Schemas ──────────────────────────────────────────────────────────────


class SignupBody(BaseModel):
    email: str = Field(..., max_length=254)
    password: str = Field(..., min_length=8, max_length=200)
    name: str = Field(..., min_length=1, max_length=120)


class LoginBody(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    avatar_url: str | None = None
    created_at: datetime
    has_password: bool

    @classmethod
    def of(cls, u: User) -> "UserOut":
        return cls(
            id=u.id,
            email=u.email,
            name=u.name,
            avatar_url=u.avatar_url,
            created_at=u.created_at,
            has_password=bool(u.password_hash),
        )


class WorkspaceLite(BaseModel):
    id: int
    name: str
    role: str
    is_owner: bool


class MeOut(BaseModel):
    user: UserOut
    workspaces: list[WorkspaceLite]
    needs_onboarding: bool


# ── Endpoints ────────────────────────────────────────────────────────────


@router.post("/auth/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def signup(
    body: SignupBody,
    response: Response,
    db: Annotated[Session, Depends(db_dependency)],
) -> UserOut:
    if not email_shape_ok(body.email):
        raise HTTPException(400, "Invalid email format.")
    email = validate_email_strict(body.email)

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(409, "An account with this email already exists.")

    user = User(
        email=email,
        password_hash=hash_password(body.password),
        name=body.name.strip(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    set_session_cookie(response, user.id)
    return UserOut.of(user)


@router.post("/auth/login", response_model=UserOut)
def login(
    body: LoginBody,
    response: Response,
    db: Annotated[Session, Depends(db_dependency)],
) -> UserOut:
    if not email_shape_ok(body.email):
        raise HTTPException(401, "Invalid email or password.")
    email = body.email.strip().lower()

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(body.password, user.password_hash):
        # Identical error for both branches — don't leak whether the email exists
        raise HTTPException(401, "Invalid email or password.")

    set_session_cookie(response, user.id)
    return UserOut.of(user)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> Response:
    clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=MeOut)
def me(
    user: Annotated[User | None, Depends(current_user_optional)],
    db: Annotated[Session, Depends(db_dependency)],
) -> MeOut:
    if user is None:
        # We respond with 401 instead of 200+null so the frontend can branch cleanly
        raise HTTPException(401, "Not authenticated.")

    rows = (
        db.query(Membership, Workspace)
        .join(Workspace, Membership.workspace_id == Workspace.id)
        .filter(Membership.user_id == user.id)
        .all()
    )
    workspaces = [
        WorkspaceLite(
            id=w.id,
            name=w.name,
            role=m.role,
            is_owner=w.owner_user_id == user.id,
        )
        for (m, w) in rows
    ]
    return MeOut(
        user=UserOut.of(user),
        workspaces=workspaces,
        needs_onboarding=len(workspaces) == 0,
    )
