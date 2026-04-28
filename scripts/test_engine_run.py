"""
C3 smoke test — run the real BrahmaEngine on the bundled sample CSV.

This is a STANDALONE script (not part of the deployed backend).
It chdirs into vendor/brahma/ and calls engine.run() like upstream's
app.py does, capturing the generator output to stdout and a JSON log.

Verification gate (handled by run_c3.sh wrapper):
- Stages 3..11 execute (no 'Script not found' errors)
- vendor/brahma/outputs/data/leaderboard.csv exists with multiple rows
- vendor/brahma/outputs/charts/ has at least one .png
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Force UTF-8 stdout on Windows so streaming text doesn't crash on em-dashes.
# reconfigure() (Py 3.7+) is non-destructive — doesn't replace the stream.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Load .env (same as our backend)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv

load_dotenv(ROOT / "server" / ".env", override=True)

if not os.getenv("ANTHROPIC_API_KEY"):
    sys.exit("ANTHROPIC_API_KEY missing")


BRAHMA_DIR = (ROOT / "vendor" / "brahma").resolve()
sys.path.insert(0, str(BRAHMA_DIR))

# chdir for relative-path reads
os.chdir(BRAHMA_DIR)

from brahma_engine import BrahmaEngine  # noqa: E402

print("=" * 72)
print("C3 — Real BrahmaEngine smoke test")
print("=" * 72)
print(f"  cwd: {os.getcwd()}")
print(f"  csv exists: {(BRAHMA_DIR / 'data' / 'credit_card_customers.csv').exists()}")
print()

print("Initializing BrahmaEngine...")
t0 = time.time()
engine = BrahmaEngine()
print(f"  init in {time.time() - t0:.2f}s · system prompt {len(engine._base_system_prompt):,} chars")
print()

connection_config = {
    "type": "file",
    "filename": "credit_card_customers.csv",
    "temp_path": "data/credit_card_customers.csv",  # relative to cwd = BRAHMA_DIR
}
masked_config = {
    "type": "file",
    "filename": "credit_card_customers.csv",
}

goal = "Predict which credit card customers will churn next month"

print(f"GOAL: {goal}")
print(f"DATA: {connection_config['filename']}")
print()
print("-" * 72)
print("Brahma's response (streamed):")
print("-" * 72)

t_run_start = time.time()
events = []
phase = "claude_stream"
last_stage = -2
total_text = []

try:
    for chunk_text, stage_idx in engine.run(goal, connection_config, masked_config):
        events.append({"text": chunk_text, "stage": stage_idx, "ts": time.time() - t_run_start})
        if stage_idx != last_stage:
            if last_stage == -1 and stage_idx >= 0:
                print()
                print("-" * 72)
                print("Stage scripts running:")
                print("-" * 72)
            last_stage = stage_idx
        # Print text as it streams
        sys.stdout.write(chunk_text)
        sys.stdout.flush()
        total_text.append(chunk_text)
except Exception as e:
    print()
    print(f"\n[ERROR] {type(e).__name__}: {e}")
    raise
finally:
    elapsed = time.time() - t_run_start
    print()
    print("-" * 72)
    print(f"Run finished in {elapsed:.1f}s · {len(events)} events")

# Dump events log
log_path = ROOT / "scripts" / "c3_run_log.json"
log_path.write_text(
    json.dumps(
        {
            "ran_at": datetime.utcnow().isoformat(),
            "elapsed_seconds": elapsed,
            "n_events": len(events),
            "total_text_chars": sum(len(e["text"]) for e in events),
            "goal": goal,
            "connection_config": connection_config,
            "events_summary": [{"stage": e["stage"], "ts": round(e["ts"], 2), "len": len(e["text"])} for e in events[:50]],
        },
        indent=2,
    ),
    encoding="utf-8",
)
print(f"  log: {log_path}")

# Verify outputs
outputs = BRAHMA_DIR / "outputs"
print()
print("-" * 72)
print("Output verification:")
print("-" * 72)
for sub in ["data", "charts", "models", "data/eda"]:
    d = outputs / sub
    if d.exists():
        files = list(d.iterdir())
        print(f"  {str(d.relative_to(BRAHMA_DIR))}: {len(files)} file(s)")
        for f in files[:5]:
            print(f"    - {f.name} ({f.stat().st_size:,} bytes)")
    else:
        print(f"  {str(d.relative_to(BRAHMA_DIR))}: MISSING")
