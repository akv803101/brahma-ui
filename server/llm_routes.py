"""
LLM endpoints — direct Claude calls via the BrahmaEngine bridge.

For now: a single `/api/llm/ping` endpoint that proves the agent is wired
end-to-end. The engine's system prompt (CLAUDE.md + 4 agents + 12 skills)
gets sent on every call, so Claude responds in-character as Brahma.

Later phases add real pipeline endpoints that use engine.run(...).
"""

from __future__ import annotations

import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .auth_core import current_user
from .brahma_bridge import get_engine
from .db import User

router = APIRouter(prefix="/api/llm", tags=["llm"])


class PingBody(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    model: str = Field(default="claude-haiku-4-5-20251001")
    max_tokens: int = Field(default=200, ge=1, le=4000)


class PingOut(BaseModel):
    response: str
    model: str
    input_tokens: int
    output_tokens: int


@router.post("/ping", response_model=PingOut)
def ping(
    body: PingBody,
    user: Annotated[User, Depends(current_user)],
) -> PingOut:
    """
    Send a single prompt to Claude with Brahma's full system prompt.
    Returns Claude's response — should always speak as Brahma since
    the upstream CLAUDE.md is in the system prompt.
    """
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(503, "ANTHROPIC_API_KEY not configured.")

    try:
        engine = get_engine()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"BrahmaEngine init failed: {e}") from e

    try:
        response = engine.client.messages.create(
            model=body.model,
            max_tokens=body.max_tokens,
            system=engine._base_system_prompt,  # noqa: SLF001 — upstream API
            messages=[{"role": "user", "content": body.prompt}],
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Claude API call failed: {e}") from e

    text = response.content[0].text if response.content else ""
    return PingOut(
        response=text,
        model=response.model,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )
