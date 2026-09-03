#!/usr/bin/env python3
"""Post-window dispute resolution — LIVE completion of smoke points 8-10.

Runs after the 24h response window on milestone 2 (final contract
0x0872B4be) closes. Performs resolve_dispute, then verifies:
  8.  resolution works after the deadline
  9.  a fresh consensus round occurred (adjudication history grew)
  10. final settlement executed (escrow moved, statuses settled)
Appends results to docs/deployment_log.json under smoke.dispute_resolution.
Exit 0 only if all pass.
"""
import json
import sys
import time
from pathlib import Path

from genlayer_py import create_client, create_account
from genlayer_py.chains import studionet

ROOT = Path("/home/ubuntu/milestone-judge")
ADDR = "0x0872B4be1bcB6234f336d9A7C99cefc606Ea15d1"
KEYFILE = ROOT / "scripts" / "smoke_deployer.json"
LOG = ROOT / "docs" / "deployment_log.json"
MID = "2"

acc = create_account(account_private_key=json.loads(
    KEYFILE.read_text())["private_key"])
client = create_client(chain=studionet, account=acc)


def rd(fn, args):
    raw = client.read_contract(address=ADDR, function_name=fn, args=args)
    return json.loads(raw) if isinstance(raw, str) else raw


deadline = int(rd("get_dispute", [MID])["response_deadline"])
# safety: confirm window closed on-chain
if time.time() < deadline:
    print("window still open; closes at", deadline)
    sys.exit(3)

pre_worker_bal = client.get_balance(
    "0x457703EE8B709449A0609a7E100F27082BD4Bdcc")
pre_hist = len(rd("get_adjudications", [MID]))

tx = client.write_contract(
    address=ADDR, function_name="resolve_dispute", args=[MID],
    account=acc)
receipt = client.wait_for_transaction_receipt(tx, retries=100, interval=3000)
leader = (receipt.get("consensus_data") or {}).get("leader_receipt", [{}])
exec_res = (leader[0] if leader else {}).get("execution_result")
print("resolve tx:", tx, "leader execution:", exec_res)
if exec_res not in (None, "SUCCESS"):
    print("resolution failed:", str(leader)[:400])
    sys.exit(1)

d = rd("get_dispute", [MID])
m = rd("get_milestone", [MID])
hist = rd("get_adjudications", [MID])
worker_bal = client.get_balance(
    "0x457703EE8B709449A0609a7E100F27082BD4Bdcc")

settled_status = m["status"] in ("RELEASED", "REFUNDED") and m["balance_wei"] == "0"
worker_paid = m["status"] == "RELEASED" and int(worker_bal) > int(pre_worker_bal)
client_refunded = m["status"] == "REFUNDED"

res = {
    "milestone": MID,
    "tx_resolve": tx,
    "8_resolution_after_deadline_worked": d["status"] == "RESOLVED",
    "9_fresh_consensus_round": len(hist) == pre_hist + 1
    and hist[-1]["trigger"] == "dispute",
    "decision": d.get("resolution", {}).get("decision"),
    "10_final_settlement": settled_status and (worker_paid or client_refunded),
    "milestone_status": m["status"],
    "rounds_total": len(hist),
    "worker_balance_before": str(pre_worker_bal),
    "worker_balance_after": str(worker_bal),
    "verdict_rule": m["verdict"].get("rule", ""),
}
ok = (res["8_resolution_after_deadline_worked"]
      and res["9_fresh_consensus_round"]
      and res["10_final_settlement"])
res["ok"] = ok

log = json.loads(LOG.read_text())
log.setdefault("smoke", {})["dispute_resolution"] = res
LOG.write_text(json.dumps(log, indent=2))

print(json.dumps(res, indent=1))
print("POST_WINDOW_LIVE:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
