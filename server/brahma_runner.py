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
        project_id: int | None = None,
    ) -> Iterator[dict[str, Any]]:
        """
        Execute one pipeline run as a generator of event dicts.
        Caller (FastAPI SSE handler) re-emits each event to the client.

        project_id (H3): when set, the runner queries feedback rows for
        that project and includes a calibration block in Claude's
        narrative prompt — so each new narrative knows where the model
        has been wrong and can hedge accordingly.
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
            yield from self._stream_narrative(goal, connection_config, run_dir, project_id)
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

            ok = True
            log_path = run_dir / "logs" / f"{script_name}.log"
            for ev in self._stream_stage(script_name, run_dir, i, label):
                if ev["event"] == "stage_log":
                    yield ev
                elif ev["event"] == "_stage_result":
                    ok = ev["ok"]
                    log_path = Path(ev["log_path"])

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
        self,
        goal: str,
        connection_config: dict[str, Any],
        run_dir: Path,
        project_id: int | None = None,
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

        feedback_block = _build_feedback_block(project_id) if project_id else ""

        user_msg = (
            f"Wake Up Brahma\n\n"
            f"GOAL: {goal}\n\n"
            f"DATA SOURCE: {source_desc}\n\n"
            f"{feedback_block}"
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

    def _stream_stage(
        self, script_name: str, run_dir: Path, index: int, label: str
    ) -> Iterator[dict[str, Any]]:
        """
        Run a single stage as a subprocess, streaming each stdout line as a
        `stage_log` event. Final result is delivered as an internal
        `_stage_result` event so the caller knows ok + log_path.

        Lines are also persisted to runs/{id}/logs/{script}.log on the fly
        so a refresh after the run shows the same content.
        """
        log_dir = run_dir / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / f"{script_name}.log"

        env = dict(os.environ)
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"

        proc = subprocess.Popen(
            [sys.executable, "-X", "utf8", "-u", str(self.brahma_dir / f"{script_name}.py")],
            cwd=str(self.brahma_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,  # line-buffered
            env=env,
        )

        log_lines: list[str] = []
        emitted = 0
        # Don't flood SSE with thousands of trivial lines — cap per stage.
        MAX_EMITTED = 200
        try:
            assert proc.stdout is not None
            for raw in proc.stdout:
                line = raw.rstrip("\n")
                log_lines.append(line)
                if line.strip() and emitted < MAX_EMITTED:
                    emitted += 1
                    yield {
                        "event": "stage_log",
                        "index": index,
                        "label": label,
                        "text": line[:500],  # cap individual line length too
                    }
            proc.wait(timeout=600)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

        log_path.write_text("\n".join(log_lines), encoding="utf-8")

        ok = proc.returncode == 0
        if emitted >= MAX_EMITTED:
            yield {
                "event": "stage_log",
                "index": index,
                "label": label,
                "text": f"… (truncated, {len(log_lines) - MAX_EMITTED} more lines in {log_path.name})",
            }
        yield {"event": "_stage_result", "ok": ok, "log_path": str(log_path)}

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


def _build_feedback_block(project_id: int) -> str:
    """
    Pull feedback stats for a project and format them as a calibration
    section to inject into Claude's narrative user_msg. Empty string
    returned when no feedback exists yet (clean noop on first run).

    Sample output:
        PRIOR HUMAN FEEDBACK ON THIS PROJECT (last 12 corrections):
          - accuracy: 67% (8 / 12)
          - by tier: HIGH 4/6 correct, MEDIUM 3/4, LOW 1/2
          - latest 3 misses:
            * predicted CHURN (HIGH, p=0.82) → actual: retain
            * predicted CHURN (HIGH, p=0.74) → actual: retain
            * predicted retain (LOW, p=0.18) → actual: CHURN

        Use this to calibrate confidence in the narrative — flag known
        weaknesses, hedge tier boundaries, suggest threshold tuning if
        a tier has > 30% miss rate.
    """
    try:
        from .db import SessionLocal, Feedback
    except Exception:  # noqa: BLE001
        return ""

    session = SessionLocal()
    try:
        rows = (
            session.query(Feedback)
            .filter(Feedback.project_id == project_id)
            .order_by(Feedback.created_at.desc())
            .limit(50)
            .all()
        )
    finally:
        session.close()

    if not rows:
        return ""

    total = len(rows)
    correct = sum(1 for r in rows if r.was_correct)
    by_tier: dict[str, dict[str, int]] = {}
    for r in rows:
        tier = (r.predicted_tier or "—").upper()
        slot = by_tier.setdefault(tier, {"correct": 0, "incorrect": 0})
        slot["correct" if r.was_correct else "incorrect"] += 1
    misses = [r for r in rows if not r.was_correct][:3]

    by_tier_lines = ", ".join(
        f"{t} {v['correct']}/{v['correct']+v['incorrect']} correct"
        for t, v in by_tier.items()
    )

    miss_lines = ""
    if misses:
        formatted_misses = []
        for m in misses:
            pred = m.predicted_label or ("positive" if (m.predicted_score or 0) >= 0.5 else "negative")
            actual = m.actual_value or "different from prediction"
            formatted_misses.append(
                f"    * predicted {pred} ({(m.predicted_tier or '—').upper()}, "
                f"p={m.predicted_score:.2f}) → actual: {actual}"
            )
        miss_lines = "  - latest 3 misses:\n" + "\n".join(formatted_misses) + "\n"

    return (
        f"PRIOR HUMAN FEEDBACK ON THIS PROJECT (last {total} corrections):\n"
        f"  - accuracy: {(correct / total * 100):.0f}% ({correct}/{total})\n"
        f"  - by tier: {by_tier_lines}\n"
        f"{miss_lines}"
        f"\nUse this to calibrate confidence in the narrative — flag known "
        f"weaknesses, hedge tier boundaries, suggest threshold tuning if a "
        f"tier has > 30% miss rate.\n\n"
    )


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
