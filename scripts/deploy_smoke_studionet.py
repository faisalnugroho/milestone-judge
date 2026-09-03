#!/usr/bin/env python3
"""MilestoneJudge — pre-submission live smoke test on GenLayer Studionet.

Protocol (per docs/deployment.md):
  1. deploy with FULL consensus (not leader_only)
  2. run the core adjudication flow on 3 fresh milestones — the verdict
     must REPEAT across consecutive consensus rounds (determinism)
  3. one negative case — evidence that fails a criterion must flip the
     verdict to REJECTED
  4. dispute an APPROVED milestone: the other party adds rebuttal
     evidence, then an IMMEDIATE resolve_dispute is refused by the 24h
     on-chain response window and the escrow stays locked (steward fix)
  5. finalize crank proven window-locked (3-day dispute window)
  6. everything logged to docs/deployment_log.json as submission evidence

Roles (distinct accounts, gitignored keyfiles):
  scripts/smoke_deployer.json  {"private_key": "0x..."}   client/deployer
  scripts/smoke_worker.json    {"private_key": "0x..."}   worker
All roles faucet-funded by the script.

Usage:
  ~/milestone-judge/.venv/bin/python scripts/deploy_smoke_studionet.py
"""
import json
import sys
import time
from pathlib import Path

from genlayer_py import create_client, create_account
from genlayer_py.chains import studionet

ROOT = Path(__file__).resolve().parents[1]
CODE_PATH = ROOT / "contracts" / "milestone_judge.py"
KEYFILE_CLIENT = ROOT / "scripts" / "smoke_deployer.json"
KEYFILE_WORKER = ROOT / "scripts" / "smoke_worker.json"
LOG_PATH = ROOT / "docs" / "deployment_log.json"

DETERMINISM_RUNS = 3
AMOUNT = 10 ** 16  # 0.01 GEN — smoke-scale escrow
FAUCET_TOPUP = 10 ** 18

# Real, publicly-reachable evidence pages (fetched on-chain by the
# contract's nondet block, re-fetched independently by validators).
EVIDENCE_URL = "https://faisalnugroho.github.io/escrow-evidence/index-approved.html"
EVIDENCE_BAD = "https://faisalnugroho.github.io/escrow-evidence/index-rejected.html"

CRITERIA_PASS = json.dumps([
    {"id": "c1",
     "text": "landing page is live at the submitted HTTPS URL and shows the "
             "hero headline 'Ship Faster'",
     "mandatory": True},
    {"id": "c2",
     "text": "contact form is wired up: the page states a test submission "
             "receipt was received by the ops inbox",
     "mandatory": True},
])
CRITERIA_FAIL = json.dumps([
    {"id": "c1",
     "text": "page mentions the secret word ZEBRA_7f3a", "mandatory": True},
])

STATEMENT_OK = ("The Q3 landing page is deployed and live at the submitted "
                "URL. It contains the agreed hero headline 'Ship Faster', "
                "and the contact form is wired to the ops inbox with test "
                "receipt #42.")
STATEMENT_BAD = ("The page is deployed at the submitted URL and everything "
                 "requested was delivered.")


def ev_json(url):
    return json.dumps([{"url": url, "kind": "WEBSITE", "note": "smoke"}])


def load_role(path, client, label):
    if path.exists():
        pk = json.loads(path.read_text())["private_key"]
    else:
        acct = create_account()
        from hexbytes import HexBytes
        pk = acct._private_key
        pk = "0x" + bytes(pk).hex() if isinstance(pk, HexBytes) else str(pk)
        path.write_text(json.dumps({"private_key": pk}, indent=2))
        print(f"[keys] generated {label}: {path.name}", flush=True)
    account = create_account(account_private_key=pk)
    bal = client.get_balance(account.address)
    if bal < 5 * AMOUNT:
        print(f"[faucet] topping up {label} {account.address} "
              f"(balance {bal})", flush=True)
        client.fund_account(account.address, FAUCET_TOPUP)
    return account


def wait_final(client, tx_hash, label, expect_error=False):
    last = None
    for attempt in range(6):
        try:
            receipt = client.wait_for_transaction_receipt(
                transaction_hash=tx_hash, retries=100, interval=3000)
            break
        except Exception as e:  # rpc hiccup — retry
            last = e
            print(f"[{label}] rpc retry: {str(e)[:80]}", flush=True)
            time.sleep(10)
    else:
        raise RuntimeError(f"{label}: rpc failed: {last}")
    if not isinstance(receipt, dict):
        return {}
    leader = (receipt.get("consensus_data") or {}).get("leader_receipt", [{}])
    exec_result = (leader[0] if leader else {}).get("execution_result")
    payload = ((leader[0] or {}).get("result") or {})
    err = ""
    if exec_result not in (None, "SUCCESS"):
        p = payload.get("payload") or payload.get("status") or ""
        err = str(p)[:200]
        print(f"[{label}] leader_execution={exec_result} payload={err}",
              flush=True)
        if not expect_error:
            raise RuntimeError(f"{label}: execution failed: {err}")
    return receipt


def create_funded(client, addr, client_acc, worker_acc, deadline_epoch,
                  criteria):
    tx = client.write_contract(
        address=addr, function_name="create_milestone",
        args=["Smoke test milestone", "Live consensus smoke",
              worker_acc.address, criteria,
              "Public URL", deadline_epoch, AMOUNT, "[]"],
        account=client_acc)
    wait_final(client, tx, "create")
    ids = client.read_contract(address=addr, function_name="get_milestone_ids",
                              args=[])
    mid = ids[-1]
    tx = client.write_contract(
        address=addr, function_name="fund_milestone", args=[mid],
        account=client_acc, value=AMOUNT)
    wait_final(client, tx, "fund")
    return mid


def read_rec(client, addr, mid):
    raw = client.read_contract(address=addr, function_name="get_milestone",
                               args=[mid])
    return json.loads(raw)


def submit_and_adjudicate(client, addr, mid, worker_acc, url, statement,
                          label):
    tx = client.write_contract(
        address=addr, function_name="submit_evidence",
        args=[mid, ev_json(url), statement], account=worker_acc)
    wait_final(client, tx, f"submit#{label}")
    t0 = time.time()
    tx = client.write_contract(
        address=addr, function_name="start_adjudication", args=[mid],
        account=worker_acc)
    wait_final(client, tx, f"adjudicate#{label}")
    rec = read_rec(client, addr, mid)
    verdict = rec.get("verdict", {}).get("decision", "?")
    secs = round(time.time() - t0, 1)
    print(f"case#{label}: {verdict} [{secs}s]", flush=True)
    for s in rec.get("verdict", {}).get("statuses", []):
        print(f"    [{s.get('status')}] {s.get('id')}: "
              f"{str(s.get('reason'))[:100]}", flush=True)
    return {"milestone": mid, "verdict": verdict, "secs": secs,
            "verdict_full": rec.get("verdict", {}),
            "tx_adjudicate": tx}


def main() -> int:
    for kf in (KEYFILE_CLIENT, KEYFILE_WORKER):
        if not kf.exists():
            print(f"keyfile missing: {kf}", file=sys.stderr)
            return 1
    client_acc = create_account(account_private_key=json.loads(
        KEYFILE_CLIENT.read_text())["private_key"])
    client = create_client(chain=studionet, account=client_acc)
    worker_acc = load_role(KEYFILE_WORKER, client, "worker")

    print("client/deployer:", client_acc.address, flush=True)
    print("worker:", worker_acc.address, flush=True)

    log = {}
    tx = client.deploy_contract(
        code=CODE_PATH.read_text(), account=client_acc,
        args=[], leader_only=False)
    r = wait_final(client, tx, "deploy")
    addr = (r.get("data") or {}).get("contract_address") or r.get("to_address")
    if not addr:
        print("no contract address in receipt", file=sys.stderr)
        return 1
    log["deploy"] = {"tx_hash": tx, "address": addr,
                     "client": client_acc.address,
                     "worker": worker_acc.address}
    print("CONTRACT:", addr, flush=True)
    print("explorer: https://explorer-studio.genlayer.com/address/" + addr,
          flush=True)

    deadline = int(time.time()) + 30 * 86400

    # ---- 3x APPROVED determinism ------------------------------------
    results = []
    for i in range(DETERMINISM_RUNS):
        mid = create_funded(client, addr, client_acc, worker_acc, deadline,
                            CRITERIA_PASS)
        r = submit_and_adjudicate(client, addr, mid, worker_acc,
                                  EVIDENCE_URL, STATEMENT_OK, f"A{i+1}")
        r["expected"] = "APPROVED"
        r["match"] = r["verdict"] == "APPROVED"
        results.append(r)
    det_ok = all(r["match"] for r in results)

    # ---- negative case: must REJECT ---------------------------------
    mid_neg = create_funded(client, addr, client_acc, worker_acc, deadline,
                            CRITERIA_FAIL)
    neg = submit_and_adjudicate(client, addr, mid_neg, worker_acc,
                                EVIDENCE_URL, STATEMENT_BAD, "NEG")
    neg["expected"] = "REJECTED"
    neg["match"] = neg["verdict"] == "REJECTED"
    neg_ok = neg["match"]
    results.append(neg)

    # ---- dispute round on an APPROVED milestone -----------------------
    # NEW dispute-hardening protocol (2026-09-03): open_dispute → the OTHER
    # party (worker) adds rebuttal evidence → immediate resolve_dispute MUST
    # be refused by the 24h on-chain response window (steward fix #3) →
    # escrow stays DISPUTED/locked. The 3-day dispute window still blocks
    # finalize, so the locked state is doubly proven.
    dispute = None
    if det_ok:
        mid_d = results[1]["milestone"]
        tx_open = client.write_contract(
            address=addr, function_name="open_dispute",
            args=[mid_d,
                  "The client disputes this approval: the contact form "
                  "receipt claim needs re-verification against the page.",
                  ev_json(EVIDENCE_URL)],
            account=client_acc)
        wait_final(client, tx_open, "open_dispute")
        # other party adds rebuttal evidence during the response window
        tx_reb = client.write_contract(
            address=addr, function_name="submit_dispute_evidence",
            args=[mid_d, ev_json(EVIDENCE_URL)],
            account=worker_acc)
        wait_final(client, tx_reb, "rebuttal_evidence")
        # immediate resolution MUST be refused (response window open)
        tx_res = client.write_contract(
            address=addr, function_name="resolve_dispute", args=[mid_d],
            account=client_acc)
        r_res = wait_final(client, tx_res, "resolve-early-refused",
                           expect_error=True)
        leader = (r_res.get("consensus_data") or {}).get("leader_receipt",
                                                         [{}])
        payload = str(((leader[0] or {}).get("result") or {}).get("payload")
                      or "")
        refused = "response window" in payload
        rec = read_rec(client, addr, mid_d)
        dis = json.loads(client.read_contract(
            address=addr, function_name="get_dispute", args=[mid_d]))
        contract_balance = client.get_balance(addr)
        dispute = {
            "milestone": mid_d,
            "original_decision": dis.get("original_decision"),
            "dispute_status": dis.get("status"),
            "rebuttal_evidence_items": len(dis.get("evidence", [])),
            "rebuttal_actor": (dis.get("evidence") or [{}])[-1].get("actor")
                if dis.get("evidence") else None,
            "early_resolution_refused": refused,
            "refusal_payload": payload[:100],
            "milestone_status_after": rec["status"],
            "escrow_locked": rec["status"] == "DISPUTED",
            "response_deadline": dis.get("response_deadline"),
            "contract_balance_locked_wei": str(contract_balance),
            "tx_open": tx_open,
            "tx_rebuttal": tx_reb,
            "tx_resolve_refused": tx_res,
        }
        dispute["ok"] = (refused
                         and dis.get("status") == "OPEN"
                         and rec["status"] == "DISPUTED"
                         and dispute["rebuttal_evidence_items"] >= 1)
        print(f"dispute: early-resolve refused={refused} "
              f"status={rec['status']} rebuttals="
              f"{dispute['rebuttal_evidence_items']} "
              f"escrow_locked={dispute['escrow_locked']}", flush=True)

    # ---- finalize window enforcement (live negative check) ------------
    # 3-day window means finalize MUST refuse right now. UserError arrives
    # as execution ERROR in the receipt (not a client exception), so we
    # read the leader receipt payload and match the refusal message.
    window = None
    if det_ok:
        mid_f = results[0]["milestone"]
        tx = client.write_contract(
            address=addr, function_name="finalize_milestone",
            args=[mid_f], account=worker_acc)
        r = wait_final(client, tx, "finalize-negative", expect_error=True)
        leader = (r.get("consensus_data") or {}).get("leader_receipt", [{}])
        payload = str(((leader[0] or {}).get("result") or {}).get("payload")
                      or "")
        refused = "dispute window is still open" in payload
        window = {"milestone": mid_f, "refused": refused, "ok": refused,
                  "payload": payload[:100]}
        print(f"finalize-window-enforced: {window['ok']}", flush=True)

    log["smoke"] = {
        "determinism_consistent": det_ok,
        "negative_case_rejected": neg_ok,
        "dispute": dispute,
        "finalize_window_enforced": window,
        "cases": results,
    }
    all_ok = det_ok and neg_ok \
        and (dispute or {}).get("ok") is True \
        and (window or {}).get("ok") is True
    log["summary"] = {"all_pass": all_ok}

    if LOG_PATH.exists():
        try:
            prev = json.loads(LOG_PATH.read_text())
            prev.update(log)
            log = prev
        except Exception:
            pass
    LOG_PATH.write_text(json.dumps(log, indent=2))
    print(f"DETERMINISM_CONSISTENT: {det_ok}  NEGATIVE_REJECTED: {neg_ok}")
    if dispute:
        print(f"DISPUTE_WINDOW_ENFORCED: {dispute['ok']}")
    if window:
        print(f"FINALIZE_WINDOW_ENFORCED: {window['ok']}")
    print("ALL_SMOKE_PASS:", all_ok)
    print("log:", LOG_PATH)
    return 0 if all_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
