"""
Brahma agent bridge — adapts the upstream `vendor/brahma/` submodule
to our FastAPI process.

Upstream's `BrahmaEngine.__init__` reads files via relative paths
(SKILLS_DIR = "skills", AGENTS_DIR = "agents", CLAUDE.md). To make
that work without touching upstream code, we chdir to vendor/brahma/
during initialization, then chdir back. The system prompt is held in
memory after that, so subsequent calls don't depend on cwd.

The engine instance is cached at module level — system prompt is
~76 K tokens, no need to reload it per request.
"""

from __future__ import annotations

import os
import sys
import threading
from pathlib import Path
from typing import Any

_BRAHMA_DIR = (Path(__file__).resolve().parent.parent / "vendor" / "brahma").resolve()
_engine = None
_lock = threading.Lock()


def get_brahma_dir() -> Path:
    return _BRAHMA_DIR


def get_engine():
    """
    Return a cached BrahmaEngine instance. Thread-safe lazy init.
    Raises if ANTHROPIC_API_KEY is missing or upstream is missing.
    """
    global _engine
    if _engine is not None:
        return _engine

    with _lock:
        if _engine is not None:
            return _engine
        _engine = _build_engine()
    return _engine


def _build_engine():
    if not _BRAHMA_DIR.exists():
        raise RuntimeError(
            f"Upstream Brahma not found at {_BRAHMA_DIR}. "
            "Did you run `git submodule update --init`?"
        )

    # Make upstream importable + chdir for relative path reads
    if str(_BRAHMA_DIR) not in sys.path:
        sys.path.insert(0, str(_BRAHMA_DIR))

    orig_cwd = Path.cwd()
    os.chdir(_BRAHMA_DIR)
    try:
        from brahma_engine import BrahmaEngine  # noqa: WPS433
        engine = BrahmaEngine()
    finally:
        os.chdir(orig_cwd)
    return engine
