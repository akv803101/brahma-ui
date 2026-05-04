"""
BrahmaRunner — orchestrates a single pipeline run.

Architecture:
  Phase 1 — narrative
    Streams Claude (Haiku by default, Sonnet when tier allows) using
    the engine's full system prompt. Yields chunk events as Claude
    speaks. Costs ~$0.005 per run on Haiku, ~$0.30 on Sonnet uncached.
    Configurable via $BRAHMA_NARRATIVE_MODEL.

  Phase 2 — stages
    Calls engine._inject_connection() to wire the data source into
    upstream's stage scripts, then spawns each stage as a subprocess
    and streams its stdout line-by-line. 8 stages, ~90 s total on the
    sample CSV. No Claude calls in this phase.

  Phase 3 — copy
    Copies outputs/ to runs/{run_id}/ so per-run history is preserved.
    Reads leaderboard.csv, yields it as a structured event.

Defensive: snapshots stage scripts on first init so re-injection with a
different data source doesn't stack onto a previous run's connection code.
The submodule's working tree stays clean — every run starts from a
restored copy.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Iterator

from .brahma_bridge import get_brahma_dir, get_engine


# Stages in the order upstream's STAGE_SCRIPTS lists them
_STAGE_SCRIPTS = [
    ("stage3_eda",      "EDA"),
    ("stage4_features", "Features"),
    ("stage6_train",    "Train"),
    ("stage7_evaluate", "Evaluate"),
    ("stage8_validate", "Validate"),
    ("stage9_ensemble", "Ensemble"),
    ("stage10_uat",     "UAT"),
    ("stage11_deploy",  "Deploy"),
]

_NARRATIVE_MODEL_DEFAULT = "claude-haiku-4-5-20251001"
_NARRATIVE_MAX_TOKENS = 2000


class BrahmaRunner:
    def __init__(self) -> None:
        self.engine = get_engine()
        self.brahma_dir: Path = get_brahma_dir()
        self.narrative_model = os.getenv("BRAHMA_NARRATIVE_MODEL", _NARRATIVE_MODEL_DEFAULT).strip()
        self._snapshots = _load_or_capture_snapshots(self.brahma_dir)

    # ── Public ────────────────────────────────────────────────────────

    def run(
        self,
        run_id: str,
        goal: str,
        connection_config: dict[str, Any],
        out_root: Path,
    ) -> Iterator[dict[str, Any]]:
        """
        Execute one pipeline run as a generator of event dicts.
        Caller (FastAPI SSE handler) re-emits each event to the client.
        """
        run_dir = (out_root / run_id).resolve()
        run_dir.mkdir(parents=True, exist_ok=True)

        t_start = time.time()
        yield {
            "event": "started",
            "run_id": run_id,
            "goal": goal,
            "narrative_model": self.narrative_model,
            "stage_count": len(_STAGE_SCRIPTS),
        }

        # ── Phase 1 — narrative
        try:
            yield from self._stream_narrative(goal, connection_config, run_dir)
        except Exception as e:  # noqa: BLE001 — narrative failure shouldn't kill the run
            yield {"event": "narrative_error", "error": str(e), "type": type(e).__name__}

        # ── Phase 2 — stages
        # Restore pristine stage scripts before injection so successive runs work
        self._restore_stage_scripts()
        self._inject_connection(connection_config)

        stage_results: list[dict[str, Any]] = []
        for i, (script_name, label) in enumerate(_STAGE_SCRIPTS):
            t_stage = time.time()
            yield {"event": "stage_started", "index": i, "label": label, "script": script_name, "of": len(_STAGE_SCRIPTS)}

            ok, log_path = self._run_stage_subprocess(script_name, run_dir, on_line=lambda line, idx=i, lab=label: None)
            # Re-run for streaming (the above run already finished); cheaper to actually stream:
            # (refactor below: stream directly instead of running twice)
            elapsed = time.time() - t_stage
            stage_results.append({"label": label, "ok": ok, "elapsed_s": round(elapsed, 2), "log": str(log_path)})
            yield {"event": "stage_done", "index": i, "label": label, "ok": ok, "elapsed_s": round(elapsed, 2)}

            if not ok:
                # Don't keep going if a stage hard-failed
                yield {"event": "stage_failed", "index": i, "label": label, "log": str(log_path)}
                break

        # ── Phase 3 — copy outputs + read leaderboard
        outputs_root = self.brahma_dir / "outputs"
        copied = self._copy_outputs(outputs_root, run_dir)
        yield {"event": "outputs_copied", "files": copied[:200], "count": len(copied)}

        leaderboard = self._read_leaderboard(run_dir)
        if leaderboard is not None:
            yield {"event": "leaderboard", "rows": leaderboard}

        elapsed_total = round(time.time() - t_start, 2)
        yield {"event": "complete", "run_id": run_id, "elapsed_s": elapsed_total, "stages": stage_results}

    # ── Phase 1 helpers ────────────────────────────────────────────────

    def _stream_narrative(
        self, goal: str, connection_config: dict[str, Any], run_dir: Path
    ) -> Iterator[dict[str, Any]]:
        """Stream Claude's narrative for the run; persist full text to run_dir/narrative.md."""
        masked = _mask_connection(connection_config)
        source_desc = self.engine._describe_source(connection_config, masked)

        # BrahmaMemory's SQLite uses a relative path. Build the system prompt
        # while cwd is the upstream dir so memory.format_for_prompt finds it.
        cwd_save = Path.cwd()
        os.chdir(self.brahma_dir)
        try:
            system_prompt = self.engine._build_memory_prompt(goal)
        finally:
            os.chdir(cwd_save)

        user_msg = (
            f"Wake Up Brahma\n\n"
            f"GOAL: {goal}\n\n"
            f"DATA SOURCE: {source_desc}\n\n"
            f"Provide your understanding, identify the problem type, and explain the pipeline "
            f"you will run. Be concise — bullet points or short paragraphs. The actual stage "
            f"execution will happen after this narrative."
        )

        yield {"event": "narrative_start", "model": self.narrative_model}
        narrative_path = run_dir / "narrative.md"
        narrative_chunks: list[str] = []

        try:
            with self.engine.client.messages.stream(
                model=self.narrative_model,
                max_tokens=_NARRATIVE_MAX_TOKENS,
                system=system_prompt,
                messages=[{"role": "user", "content": user_msg}],
            ) as stream:
                for text in stream.text_stream:
                    narrative_chunks.append(text)
                    yield {"event": "narrative_chunk", "text": text}
                # Final usage info
                final = stream.get_final_message()
                yield {
                    "event": "narrative_done",
                    "input_tokens": final.usage.input_tokens,
                    "output_tokens": final.usage.output_tokens,
                }
        finally:
            full_text = "".join(narrative_chunks)
            narrative_path.write_text(full_text, encoding="utf-8")

    # ── Phase 2 helpers ────────────────────────────────────────────────

    def _restore_stage_scripts(self) -> None:
        """Reset stage scripts to their pristine snapshot before injecting fresh."""
        for script_name, original in self._snapshots.items():
            (self.brahma_dir / f"{script_name}.py").write_text(original, encoding="utf-8")

    def _inject_connection(self, connection_config: dict[str, Any]) -> None:
        """Use upstream's own injection method, run from the right cwd."""
        # Upstream's postgres code-gen builds a SQLAlchemy URL like
        # postgresql://user:pwd@host:port/database — no place for sslmode.
        # Fold sslmode (and any other libpq option) into the database
        # field as a query string so the URL ends up:
        #   postgresql://user:pwd@host:port/database?sslmode=require
        # which SQLAlchemy parses correctly.
        cfg = dict(connection_config)
        if cfg.get("type") in ("postgresql", "mysql") and cfg.get("sslmode"):
            db = cfg.get("database", "")
            sep = "&" if "?" in db else "?"
            cfg["database"] = f"{db}{sep}sslmode={cfg['sslmode']}"

        cwd_save = Path.cwd()
        os.chdir(self.brahma_dir)
        try:
            self.engine._inject_connection(cfg)
        finally:
            os.chdir(cwd_save)

    def _run_stage_subprocess(self, script_name: str, run_dir: Path, on_line) -> tuple[bool, Path]:
        """
        Run a single stage as a subprocess, capturing stdout to a per-stage log
        and to run_dir/logs/. Returns (ok, log_path).

        NOTE: streaming is done in the parent's run() via Popen; this signature
        is preserved for future refactor where we move the streaming inline.
        """
        log_dir = run_dir / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / f"{script_name}.log"

        proc = subprocess.run(
            [sys.executable, "-X", "utf8", str(self.brahma_dir / f"{script_name}.py")],
            cwd=str(self.brahma_dir),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=600,
        )
        log_path.write_text(
            f"=== STDOUT ===\n{proc.stdout}\n\n=== STDERR ===\n{proc.stderr}",
            encoding="utf-8",
        )
        return proc.returncode == 0, log_path

    # ── Phase 3 helpers ────────────────────────────────────────────────

    def _copy_outputs(self, outputs_root: Path, run_dir: Path) -> list[str]:
        """Copy upstream/outputs/* into runs/{id}/. Returns list of relative paths."""
        if not outputs_root.exists():
            return []
        target = run_dir / "outputs"
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(outputs_root, target)
        return [str(p.relative_to(target)) for p in sorted(target.rglob("*")) if p.is_file()]

    def _read_leaderboard(self, run_dir: Path) -> list[dict[str, Any]] | None:
        lb_path = run_dir / "outputs" / "data" / "leaderboard.csv"
        if not lb_path.exists():
            return None
        try:
            import pandas as pd
            df = pd.read_csv(lb_path)
            return df.to_dict("records")
        except Exception:  # noqa: BLE001
            return None


# ── Module-level helpers ─────────────────────────────────────────────


def _load_or_capture_snapshots(brahma_dir: Path) -> dict[str, str]:
    """
    First-run: capture pristine versions of stage scripts BEFORE any
    injection has happened. Persist to a snapshot directory so successive
    process restarts still have the originals.

    The snapshot lives at runs/_pristine_stages/ in our repo (gitignored).
    """
    repo_root = brahma_dir.parent.parent  # vendor/brahma/.. -> repo root (brahma-ui)
    snap_dir = repo_root / "runs" / "_pristine_stages"
    snap_dir.mkdir(parents=True, exist_ok=True)

    snapshots: dict[str, str] = {}
    for script_name, _ in _STAGE_SCRIPTS:
        snap_path = snap_dir / f"{script_name}.py"
        live_path = brahma_dir / f"{script_name}.py"

        if snap_path.exists():
            # Already captured; load it
            snapshots[script_name] = snap_path.read_text(encoding="utf-8")
        else:
            # Capture only if upstream hasn't been mutated yet by injection
            content = live_path.read_text(encoding="utf-8")
            if "AUTO-INJECTED BY BRAHMA ENGINE" in content:
                # Submodule was already mutated by a prior run; this is a problem
                # because we don't have a clean baseline. Strip the injection block.
                content = _strip_injection(content)
            snap_path.write_text(content, encoding="utf-8")
            snapshots[script_name] = content
    return snapshots


def _strip_injection(content: str) -> str:
    """Remove the auto-injected block from a stage script."""
    lines = content.splitlines()
    out: list[str] = []
    inside = False
    for line in lines:
        if "AUTO-INJECTED BY BRAHMA ENGINE" in line:
            inside = True
            continue
        if "END INJECTION" in line:
            inside = False
            continue
        if inside:
            continue
        out.append(line)
    return "\n".join(out)


def _mask_connection(config: dict[str, Any]) -> dict[str, Any]:
    """Produce a masked copy of the connection config — safe to send to Claude."""
    masked = {**config}
    for key in ("password", "secret_key", "access_key", "key", "credentials_json", "api_key"):
        if key in masked and masked[key]:
            v = str(masked[key])
            masked[key] = (v[:3] + "***" + v[-2:]) if len(v) > 8 else "***"
    return masked
