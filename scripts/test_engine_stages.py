"""
C3a — run upstream's stage scripts on the real CSV.

Each stage runs in its OWN subprocess to isolate stdout / matplotlib /
sklearn side effects. This is also the production-safe pattern — we'll
run real pipelines from FastAPI the same way.

Verification gate:
- Each stage subprocess returns 0 (no errors)
- vendor/brahma/outputs/data/leaderboard.csv exists
- vendor/brahma/outputs/charts/ has multiple PNGs
- vendor/brahma/outputs/models/ has at least one .pkl
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv

load_dotenv(ROOT / "server" / ".env", override=True)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BRAHMA_DIR = (ROOT / "vendor" / "brahma").resolve()

# Stages in execution order (matches upstream's STAGE_SCRIPTS)
STAGE_ORDER = [
    ("stage3_eda",       "EDA"),
    ("stage4_features",  "Features"),
    ("stage6_train",     "Train"),
    ("stage7_evaluate",  "Evaluate"),
    ("stage8_validate",  "Validate"),
    ("stage9_ensemble",  "Ensemble"),
    ("stage10_uat",      "UAT"),
    ("stage11_deploy",   "Deploy"),
]

# Inject the connection code first (uses BrahmaEngine method, no Claude call)
sys.path.insert(0, str(BRAHMA_DIR))
orig_cwd = Path.cwd()
os.chdir(BRAHMA_DIR)
try:
    from brahma_engine import BrahmaEngine
    engine = BrahmaEngine()
    connection_config = {
        "type": "file",
        "filename": "credit_card_customers.csv",
        "temp_path": "data/credit_card_customers.csv",
    }
    engine._inject_connection(connection_config)
    print("Connection code injected into all stage scripts.")
finally:
    os.chdir(orig_cwd)

print()
print("=" * 72)
print("Running 8 stages as subprocesses")
print("=" * 72)

logs_dir = ROOT / "scripts" / "stage_logs"
logs_dir.mkdir(exist_ok=True)

results = []
total_start = time.time()
for i, (script_name, label) in enumerate(STAGE_ORDER):
    script_path = BRAHMA_DIR / f"{script_name}.py"
    if not script_path.exists():
        print(f"  [{i+1}] {label:>10} SKIP - script missing")
        results.append({"stage": label, "status": "missing"})
        continue

    log_file = logs_dir / f"{script_name}.log"
    t = time.time()
    print(f"  [{i+1}] {label:>10} ...", end="", flush=True)

    proc = subprocess.run(
        [sys.executable, "-X", "utf8", str(script_path)],
        cwd=str(BRAHMA_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=300,
    )
    elapsed = time.time() - t
    log_file.write_text(
        f"=== STDOUT ===\n{proc.stdout}\n\n=== STDERR ===\n{proc.stderr}",
        encoding="utf-8",
    )

    status = "OK" if proc.returncode == 0 else f"FAIL (exit {proc.returncode})"
    print(f"  {status}  ({elapsed:.1f}s)  -> log: {log_file.name}")
    if proc.returncode != 0:
        # Show last 10 lines of stderr for triage
        stderr_tail = "\n".join(proc.stderr.splitlines()[-10:])
        print(f"      stderr tail:\n{stderr_tail}")
    results.append({
        "stage": label,
        "status": status,
        "returncode": proc.returncode,
        "elapsed_s": round(elapsed, 1),
    })

print()
print("=" * 72)
print(f"Pipeline finished in {time.time() - total_start:.1f}s")
print("=" * 72)

# Output verification
print()
outputs = BRAHMA_DIR / "outputs"
print("Output verification:")
for sub in ["data", "charts", "models"]:
    d = outputs / sub
    if not d.exists():
        print(f"  {sub}/ MISSING")
        continue
    files = sorted(d.rglob("*.*"))
    print(f"  {sub}/  {len(files)} file(s)")
    for f in files[:8]:
        rel = f.relative_to(outputs)
        size = f.stat().st_size
        print(f"    - {rel} ({size:,} bytes)")
    if len(files) > 8:
        print(f"    ... +{len(files) - 8} more")

# Leaderboard preview
lb_path = outputs / "data" / "leaderboard.csv"
if lb_path.exists():
    print()
    print("Leaderboard preview:")
    import pandas as pd
    lb = pd.read_csv(lb_path)
    print(lb.to_string(index=False))
