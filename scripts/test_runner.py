"""
D1a verification — run BrahmaRunner end-to-end on the sample CSV.

Does NOT touch the FastAPI app. Just exercises BrahmaRunner standalone:
- Phase 1: real Claude narrative streamed (Haiku by default)
- Phase 2: 8 stage subprocesses on the real CSV
- Phase 3: outputs copied to runs/{run_id}/, leaderboard read

Verification gate:
- 'started' event fired
- 'narrative_chunk' events stream from Claude
- All 8 stages emit 'stage_done' with ok=true
- 'complete' event has elapsed_total
- runs/{id}/outputs/ contains charts + models + leaderboard
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Force UTF-8 stdout (Windows console fix)
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from dotenv import load_dotenv
load_dotenv(ROOT / "server" / ".env", override=True)

from server.brahma_runner import BrahmaRunner

run_id = uuid.uuid4().hex[:12]
runs_root = ROOT / "runs"
runs_root.mkdir(parents=True, exist_ok=True)

print(f"=" * 72)
print(f"D1a -- BrahmaRunner end-to-end test")
print(f"=" * 72)
print(f"  run_id:     {run_id}")
print(f"  runs_root:  {runs_root}")
print()

runner = BrahmaRunner()
print(f"  narrative model: {runner.narrative_model}")
print(f"  stage scripts snapshotted: {len(runner._snapshots)}")
print()
print("=" * 72)
print("Streaming events:")
print("=" * 72)

events_path = runs_root / run_id / "events.jsonl"
events_path.parent.mkdir(parents=True, exist_ok=True)
event_log = events_path.open("w", encoding="utf-8")

connection_config = {
    "type": "file",
    "filename": "credit_card_customers.csv",
    "temp_path": "data/credit_card_customers.csv",
}
goal = "Predict which credit card customers will churn next month"

n_narrative_chunks = 0
n_stages_done = 0
n_stages_failed = 0

try:
    for event in runner.run(run_id, goal, connection_config, runs_root):
        # Persist every event
        event_log.write(json.dumps(event) + "\n")
        event_log.flush()

        kind = event.get("event")
        if kind == "started":
            print(f"  [started] run_id={event['run_id']} stages={event['stage_count']} model={event['narrative_model']}")
        elif kind == "narrative_start":
            print(f"  [narrative_start] {event['model']}")
        elif kind == "narrative_chunk":
            n_narrative_chunks += 1
            sys.stdout.write(event["text"])
            sys.stdout.flush()
        elif kind == "narrative_done":
            print()
            print(f"  [narrative_done] in={event.get('input_tokens')} out={event.get('output_tokens')}")
        elif kind == "narrative_error":
            print(f"  [narrative_error] {event.get('type')}: {event.get('error')}")
        elif kind == "stage_started":
            print(f"  [{event['index']+1}/{event['of']}] {event['label']} ...", end="", flush=True)
        elif kind == "stage_done":
            ok = event["ok"]
            mark = "OK" if ok else "FAIL"
            print(f"  {mark} ({event['elapsed_s']}s)")
            if ok:
                n_stages_done += 1
            else:
                n_stages_failed += 1
        elif kind == "stage_failed":
            print(f"  [stage_failed] log: {event['log']}")
        elif kind == "outputs_copied":
            print(f"  [outputs_copied] {event['count']} files")
        elif kind == "leaderboard":
            print(f"  [leaderboard] {len(event['rows'])} rows")
        elif kind == "complete":
            print(f"  [complete] {event['elapsed_s']}s total")
finally:
    event_log.close()

print()
print("=" * 72)
print(f"Summary")
print("=" * 72)
print(f"  narrative chunks:     {n_narrative_chunks}")
print(f"  stages succeeded:     {n_stages_done}")
print(f"  stages failed:        {n_stages_failed}")
print(f"  events log:           {events_path}")
print(f"  run dir:              {runs_root / run_id}")
print()
print("Run dir contents:")
for p in sorted((runs_root / run_id).rglob("*")):
    if p.is_file():
        rel = p.relative_to(runs_root / run_id)
        print(f"  - {rel} ({p.stat().st_size:,} bytes)")
