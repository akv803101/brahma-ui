"""
Forgot-password flow.

  POST /api/auth/forgot          body: {email}
       Always returns 204 — does NOT leak whether the email exists.
       Generates a token, hashes it, stores in DB, sends an email
       with the reset link. Email send is provider-agnostic:
       - If RESEND_API_KEY is set, dispatches via Resend's HTTP API.
       - Else, logs the link to stdout (dev-friendly fallback).

  POST /api/auth/reset-password  body: {token, password}
       Validates the token (unused, unexpired), updates the user's
       password_hash, marks the token used. Returns 204.

The frontend reads ?reset=<token> from the URL and shows a reset form.
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .auth_core import (
    email_shape_ok,
    hash_password,
    validate_email_strict,
)
from .db import PasswordResetToken, User, db_dependency

router = APIRouter(prefix="/api/auth", tags=["password-reset"])
log = logging.getLogger("brahma.password_reset")

TOKEN_TTL_MINUTES = 30
RESEND_API_URL = "https://api.resend.com/emails"
RESEND_FROM = os.getenv("RESEND_FROM", "Brahma <onboarding@resend.dev>")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")


# ── Schemas ──────────────────────────────────────────────────────────────


class ForgotBody(BaseModel):
    email: str = Field(..., max_length=254)


class ResetBody(BaseModel):
    token: str = Field(..., min_length=16, max_length=128)
    password: str = Field(..., min_length=8, max_length=200)


# ── Helpers ──────────────────────────────────────────────────────────────


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _build_reset_link(token: str) -> str:
    return f"{FRONTEND_ORIGIN}/?reset={token}"


def _send_email(to_email: str, name: str, link: str) -> None:
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    subject = "Reset your Brahma password"
    text_body = (
        f"Hi {name or 'there'},\n\n"
        f"Use this link to reset your Brahma password. The link expires in {TOKEN_TTL_MINUTES} minutes.\n\n"
        f"{link}\n\n"
        f"If you didn't request this, you can ignore this email.\n\n"
        f"— Brahma\n"
    )
    html_body = f"""
    <div style="font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#111827;line-height:1.6">
      <p>Hi {name or 'there'},</p>
      <p>Use the link below to reset your <b>Brahma</b> password. It expires in {TOKEN_TTL_MINUTES} minutes.</p>
      <p>
        <a href="{link}" style="display:inline-block;padding:11px 18px;background:#2563EB;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">
          Reset password
        </a>
      </p>
      <p style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#6B7280;word-break:break-all">{link}</p>
      <p style="font-size:12px;color:#6B7280">If you didn't request this, you can ignore this email.</p>
      <p>— Brahma</p>
    </div>
    """

    if not api_key:
        # Dev fallback: log the link, don't try to send
        log.warning("RESEND_API_KEY not set — printing reset link to stdout instead")
        print("\n[brahma password-reset]")
        print(f"  to:    {to_email}")
        print(f"  link:  {link}")
        print(f"  expires in {TOKEN_TTL_MINUTES} minutes\n")
        return

    try:
        r = httpx.post(
            RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": RESEND_FROM,
                "to": [to_email],
                "subject": subject,
                "text": text_body,
                "html": html_body,
            },
            timeout=10.0,
        )
        if r.status_code >= 400:
            log.error("Resend API error %d: %s", r.status_code, r.text)
    except httpx.HTTPError as e:
        log.error("Resend HTTP failure: %s", e)


# ── Endpoints ────────────────────────────────────────────────────────────


@router.post("/forgot", status_code=status.HTTP_204_NO_CONTENT)
def forgot(
    body: ForgotBody,
    response: Response,
    db: Annotated[Session, Depends(db_dependency)],
) -> Response:
    # Always 204, never leak whether the address exists in DB
    response.status_code = status.HTTP_204_NO_CONTENT

    if not email_shape_ok(body.email):
        return response
    try:
        email = validate_email_strict(body.email)
    except HTTPException:
        return response

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return response

    token = secrets.token_urlsafe(32)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(token),
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=TOKEN_TTL_MINUTES),
        )
    )
    db.commit()

    _send_email(user.email, user.name, _build_reset_link(token))
    return response


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    body: ResetBody,
    response: Response,
    db: Annotated[Session, Depends(db_dependency)],
) -> Response:
    row = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == _hash_token(body.token))
        .first()
    )
    if not row or row.used_at is not None or row.expires_at < datetime.utcnow():
        raise HTTPException(400, "Reset link is invalid or has expired.")

    user = db.query(User).filter(User.id == row.user_id).first()
    if not user:
        raise HTTPException(400, "Reset link is invalid or has expired.")

    user.password_hash = hash_password(body.password)
    row.used_at = datetime.utcnow()
    db.commit()

    response.status_code = status.HTTP_204_NO_CONTENT
    return response
