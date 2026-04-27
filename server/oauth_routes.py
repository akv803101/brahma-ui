"""
Google OAuth — sign in with a Google account.

Flow:
    GET /api/auth/google/start
        → 302 to accounts.google.com (authlib stores the OAuth state in session)

    GET /api/auth/google/callback?code=…&state=…
        → exchange code for ID token + userinfo
        → find-or-create User (link by google_id, fall back to email)
        → set session cookie (same JWT cookie email/password users get)
        → 302 to {FRONTEND_ORIGIN}/?signin=ok       (success)
        → 302 to {FRONTEND_ORIGIN}/?signin=error&reason=…   (failure)

If GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing, /start returns 503
so the frontend can degrade the "Continue with Google" button gracefully.
"""

from __future__ import annotations

import os
from typing import Annotated, Optional

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .auth_core import set_session_cookie
from .db import User, db_dependency

router = APIRouter(prefix="/api/auth", tags=["oauth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
BACKEND_ORIGIN = os.getenv("BACKEND_ORIGIN", "http://localhost:8000")

# Authlib OAuth registry — registered once at import time.
oauth = OAuth()
if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
    oauth.register(
        name="google",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


def _frontend_redirect(query: str) -> RedirectResponse:
    """Bounce the user back to the React app with a status query param."""
    return RedirectResponse(url=f"{FRONTEND_ORIGIN}/?{query}", status_code=302)


@router.get("/google/start")
async def google_start(request: Request):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        # Frontend should disable the button when health says google_oauth=false,
        # but if it gets called anyway, return a clear 503.
        raise HTTPException(503, "Google OAuth not configured.")

    redirect_uri = f"{BACKEND_ORIGIN}/api/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: Annotated[Session, Depends(db_dependency)],
):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return _frontend_redirect("signin=error&reason=not_configured")

    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError as e:
        # Common causes: state mismatch, user clicked Cancel, expired code
        return _frontend_redirect(f"signin=error&reason={e.error or 'oauth_failed'}")

    userinfo: Optional[dict] = token.get("userinfo")
    if not userinfo or not userinfo.get("email"):
        return _frontend_redirect("signin=error&reason=no_userinfo")

    google_id = str(userinfo["sub"])
    email = userinfo["email"].lower()
    name = userinfo.get("name") or email.split("@")[0]
    avatar_url = userinfo.get("picture")
    email_verified = userinfo.get("email_verified", True)

    if not email_verified:
        return _frontend_redirect("signin=error&reason=unverified_email")

    user = _find_or_create_google_user(db, google_id=google_id, email=email, name=name, avatar_url=avatar_url)

    # Build the redirect first, then attach the auth cookie to it.
    response = _frontend_redirect("signin=ok")
    set_session_cookie(response, user.id)
    return response


def _find_or_create_google_user(
    db: Session,
    *,
    google_id: str,
    email: str,
    name: str,
    avatar_url: Optional[str],
) -> User:
    # 1. Existing Google sign-in
    user = db.query(User).filter(User.google_id == google_id).first()
    if user:
        # Refresh latest profile bits Google may have changed
        if avatar_url and user.avatar_url != avatar_url:
            user.avatar_url = avatar_url
        db.commit()
        db.refresh(user)
        return user

    # 2. Existing email/password account — link Google to it
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.google_id = google_id
        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url
        db.commit()
        db.refresh(user)
        return user

    # 3. Brand-new user — Google-only, no password
    user = User(
        email=email,
        name=name,
        google_id=google_id,
        avatar_url=avatar_url,
        password_hash=None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
