#!/usr/bin/env python3
"""Deploy MilestoneJudge to GenLayer Studionet with FULL consensus.

Requires: Python 3.12 + genlayer-py (see docs/deployment.md).
Writes the deployed address + tx hash to docs/deployment_log.json.

Usage:
  ~/genlayer-env/bin/python scripts/deploy_studionet.py
"""
import json
import sys
from pathlib import Path

from genlayer_py import create_client, create_account
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

ROOT = Path(__file__).resolve().parents[1]
CODE_PATH = ROOT / "contracts" / "milestone_judge.py"
LOG_PATH = ROOT / "docs" / "deployment_log.json"


def main() -> int:
    code = CODE_PATH.read_text()
    account = create_account()
    client = create_client(chain=studionet, account=account)
    print("deployer:", account.address, flush=True)

    tx_hash = client.deploy_contract(
        code=code, account=client.local_account, args=[], leader_only=False
    )
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        status=TransactionStatus.FINALIZED,
        retries=100,
        interval=3000,
    )

    data = receipt.get("data") or {} if isinstance(receipt, dict) else {}
    addr = data.get("contract_address") if isinstance(data, dict) else None
    if addr is None and isinstance(receipt, dict):
        addr = receipt.get("to_address")

    leader = (receipt.get("consensus_data") or {}).get("leader_receipt", [{}]) \
        if isinstance(receipt, dict) else []
    exec_result = (leader[0] if leader else {}).get("execution_result")

    print("tx:", tx_hash, flush=True)
    print("leader execution:", exec_result, flush=True)
    if not addr:
        print("ERROR: no contract address in receipt", file=sys.stderr)
        if isinstance(receipt, dict):
            print(json.dumps(receipt.get("consensus_data"), default=str)[:2000])
        return 1

    log = {}
    if LOG_PATH.exists():
        try:
            log = json.loads(LOG_PATH.read_text())
        except Exception:
            log = {}
    log["deploy"] = {
        "network": "studionet",
        "tx_hash": tx_hash,
        "contract_address": addr,
        "leader_execution": exec_result,
        "deployer": account.address,
    }
    LOG_PATH.write_text(json.dumps(log, indent=2))
    print("CONTRACT:", addr)
    print("explorer: https://explorer-studio.genlayer.com/address/" + addr)
    print("set frontend/.env.local:")
    print(f"  NEXT_PUBLIC_CONTRACT_ADDRESS={addr}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
