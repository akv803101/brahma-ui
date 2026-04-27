"""
Auth primitives — password hashing, JWT issue/verify, current-user dependency.

Strategy:
  - Passwords hashed with bcrypt (12 rounds — default).
  - Sessions are signed JWTs in an httpOnly cookie.
  - Email validation uses the email-validator package (strict mode).
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timedelta
from typing import Annotated, Optional

import bcrypt
from email_validator import EmailNotValidError, validate_email
from fastapi import Cookie, Depends, HTTPException, Request, Response, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .db import User, db_dependency

# ── Env / config ─────────────────────────────────────────────────────────

JWT_SECRET = os.getenv("JWT_SECRET") or "dev-only-do-not-use-in-prod"
JWT_ALG = "HS256"
JWT_EXPIRY_DAYS = int(os.getenv("JWT_EXPIRY_DAYS", "30"))
COOKIE_NAME = os.getenv("COOKIE_NAME", "brahma_session")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")


# ── Password hashing ─────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    """bcrypt with 12 rounds. Returns a UTF-8 string suitable for SQLAlchemy."""
    if not plain or len(plain) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: Optional[str]) -> bool:
    if not plain or not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:  # noqa: BLE001 — malformed hashes shouldn't crash the request
        return False


# ── Email validation (strict) ────────────────────────────────────────────


def validate_email_strict(raw: str) -> str:
    """Returns the normalized email or raises HTTPException."""
    if not raw or len(raw) > 254:
        raise HTTPException(400, "Invalid email.")
    try:
        info = validate_email(raw, check_deliverability=False)
    except EmailNotValidError as e:
        raise HTTPException(400, f"Invalid email: {e}") from e
    return info.normalized.lower()


# Keep a fast pre-check for non-empty, single-@ shape — saves a roundtrip on signup
_EMAIL_SHAPE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def email_shape_ok(raw: str) -> bool:
    return bool(raw and _EMAIL_SHAPE.match(raw))


# ── JWT session tokens ───────────────────────────────────────────────────


def issue_token(user_id: int) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_EXPIRY_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> Optional[int]:
    """Returns the user_id on success, None if invalid/expired."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        sub = payload.get("sub")
        return int(sub) if sub is not None else None
    except (JWTError, ValueError):
        return None


def set_session_cookie(response: Response, user_id: int) -> str:
    token = issue_token(user_id)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=JWT_EXPIRY_DAYS * 24 * 3600,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )
    return token


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
    )


# ── FastAPI dependencies ─────────────────────────────────────────────────


def current_user_optional(
    db: Annotated[Session, Depends(db_dependency)],
    session: Annotated[Optional[str], Cookie(alias=COOKIE_NAME)] = None,
) -> Optional[User]:
    """Returns the User if the cookie is valid, otherwise None. Never raises."""
    user_id = decode_token(session) if session else None
    if user_id is None:
        return None
    return db.query(User).filter(User.id == user_id).one_or_none()


def current_user(
    user: Annotated[Optional[User], Depends(current_user_optional)],
) -> User:
    """Returns the User or raises 401. Use this on protected endpoints."""
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated.")
    return user
