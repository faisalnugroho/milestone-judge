#!/bin/bash
# MilestoneJudge post-window dispute resolution — OS crontab one-shot.
# Waits for the 24h response window on milestone 2 (contract 0x0872B4be)
# to close, then runs scripts/post_window_resolution.py against the LIVE
# Studionet contract and appends verified results to docs/deployment_log.json.
# Removes itself from crontab when done (success or terminal failure).
set -u
LOGDIR=/home/ubuntu/milestone-judge/scripts
VENV_PY=/home/ubuntu/milestone-judge/.venv/bin/python
SCRIPT=/home/ubuntu/milestone-judge/scripts/post_window_resolution.py
OUT=/home/ubuntu/milestone-judge/scripts/post_window_run.log

cd /home/ubuntu/milestone-judge
echo "=== $(date -u '+%Y-%m-%d %H:%M:%S UTC') attempt start ===" >> "$OUT"

# Guard: window must be closed (script itself re-checks on-chain too)
"$VENV_PY" - <<'PYEOF' >> "$OUT" 2>&1
import json, time, pathlib
from genlayer_py import create_client, create_account
from genlayer_py.chains import studionet
ADDR = "0x0872B4be1bcB6234f336d9A7C99cefc606Ea15d1"
acc = create_account(account_private_key=json.loads(
    pathlib.Path("/home/ubuntu/milestone-judge/scripts/smoke_deployer.json").read_text())["private_key"])
client = create_client(chain=studionet, account=acc)
raw = client.read_contract(address=ADDR, function_name="get_dispute", args=["2"])
d = json.loads(raw) if isinstance(raw, str) else raw
dl = int(d["response_deadline"])
print(f"deadline={dl} now={int(time.time())} closed={time.time()>=dl}")
raise SystemExit(0 if time.time() >= dl else 3)
PYEOF
GUARD_RC=$?
if [ "$GUARD_RC" -ne 0 ]; then
  echo "window still open — will retry next tick" >> "$OUT"
  exit 0
fi

echo "--- running post_window_resolution.py ---" >> "$OUT"
"$VENV_PY" "$SCRIPT" >> "$OUT" 2>&1
RUN_RC=$?
echo "--- exit code: $RUN_RC ---" >> "$OUT"

# Self-remove on success (0) or definite failure (1). Exit 3 = window
# still open (shouldn't happen past the guard) — keep the job for retry.
if [ "$RUN_RC" -eq 0 ] || [ "$RUN_RC" -eq 1 ]; then
  ( crontab -l | grep -v 'mj_post_window.sh' ) | crontab -
  echo "=== crontab entry removed (terminal state rc=$RUN_RC) ===" >> "$OUT"
fi
exit 0
