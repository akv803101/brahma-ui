"""
SQLite + SQLAlchemy data layer for Brahma backend.

Tables:
  users           — auth principals (email/password or Google OAuth)
  workspaces      — top-level container; a user can own/belong to many
  memberships     — user × workspace × role (admin / member / viewer)
  projects        — workspace-scoped containers for pipeline runs
  pipeline_runs   — kept lightweight for now; stores runId + scenario + status

The DB file lives at server/brahma.db (git-ignored). Schema is created on
first start via Base.metadata.create_all(); for production, swap to Alembic.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Iterator

from sqlalchemy import (
    Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker


_DB_DIR = Path(__file__).resolve().parent
_DB_PATH = _DB_DIR / "brahma.db"
_DB_URL = f"sqlite:///{_DB_PATH}"

engine = create_engine(
    _DB_URL,
    connect_args={"check_same_thread": False},  # FastAPI's threadpool can hop threads
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


# ════════════════════════════════════════════════════════════════════════
# Models
# ════════════════════════════════════════════════════════════════════════


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True)
    email         = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)             # null = Google-only
    name          = Column(String(120), nullable=False)
    google_id     = Column(String(64),  unique=True, nullable=True, index=True)
    avatar_url    = Column(String(512), nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    memberships   = relationship("Membership", back_populates="user", cascade="all, delete-orphan")


class Workspace(Base):
    __tablename__ = "workspaces"

    id             = Column(Integer, primary_key=True)
    name           = Column(String(120), nullable=False)
    owner_user_id  = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)

    memberships    = relationship("Membership", back_populates="workspace", cascade="all, delete-orphan")
    projects       = relationship("Project",    back_populates="workspace", cascade="all, delete-orphan")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "workspace_id", name="uq_membership_user_workspace"),)

    id            = Column(Integer, primary_key=True)
    user_id       = Column(Integer, ForeignKey("users.id",       ondelete="CASCADE"), nullable=False, index=True)
    workspace_id  = Column(Integer, ForeignKey("workspaces.id",  ondelete="CASCADE"), nullable=False, index=True)
    role          = Column(String(16), nullable=False, default="member")  # admin | member | viewer
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)

    user          = relationship("User",      back_populates="memberships")
    workspace     = relationship("Workspace", back_populates="memberships")


class Project(Base):
    __tablename__ = "projects"

    id             = Column(Integer, primary_key=True)
    workspace_id   = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    name           = Column(String(120), nullable=False)
    scenario_type  = Column(String(32),  nullable=True)  # optional preselect: churn|ltv|... or null
    description    = Column(Text,        nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace      = relationship("Workspace", back_populates="projects")


class PipelineRun(Base):
    """
    Bookkeeping for runs spawned through /api/pipelines.
    Mirrors the in-memory _RUNS dict so survivors persist across restarts.
    Phase A3 attaches each run to a project.
    """

    __tablename__ = "pipeline_runs"

    id             = Column(String(32), primary_key=True)  # uuid hex
    project_id     = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    scenario_id    = Column(String(32), nullable=False)
    started_by     = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    started_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at   = Column(DateTime, nullable=True)


# ════════════════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════════════════


def init_db() -> None:
    """Create tables if they don't exist. Idempotent."""
    Base.metadata.create_all(bind=engine)


@contextmanager
def get_session() -> Iterator[Session]:
    """Context manager — explicit commit on success, rollback on error."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def db_dependency() -> Iterator[Session]:
    """FastAPI dependency — `Depends(db_dependency)` gives you a session per request."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# Add the SQLite db file path to .gitignore guard — informational only
if __name__ == "__main__":
    init_db()
    print(f"Initialized {_DB_PATH}")
