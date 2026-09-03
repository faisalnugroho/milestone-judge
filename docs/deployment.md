# Deployment

## Live deployment (2026-09-03, Studionet — dispute-hardening resubmission)

| Item | Value |
|---|---|
| Contract | `0x0872B4be1bcB6234f336d9A7C99cefc606Ea15d1` |
| Explorer | https://explorer-studio.genlayer.com/address/0x0872B4be1bcB6234f336d9A7C99cefc606Ea15d1 |
| Frontend | https://milestone-judge.vercel.app |
| Smoke protocol | see `docs/deployment_log.json` (updated by each run) |

The 2026-09-03 redeploy carries the steward-requested dispute hardening
(blank-evidence policy, both-party rebuttal evidence, 24h on-chain
response window, fair 14000/6000 fetch budget split). The previous
contract (`0x7C6e515187c47202c7330384613229F75B180814`, deployed
2026-09-02, 6/6 smoke PASS) remains on-chain for audit but is
superseded — the frontend now targets the new address.

Smoke results (all with FULL consensus, real validators, real LLM):

- 3× APPROVED determinism on fresh milestones (17–38 s per consensus round)
- Negative case → REJECTED (criterion requiring `ZEBRA_7f3a` on a page that
  lacks it)
- Dispute round on an APPROVED milestone → second consensus round, verdict
  APPROVED, escrow RELEASED live (real `emit_transfer`: contract balance
  dropped from 5×0.01 to 4×0.01 GEN, worker paid)
- `finalize_milestone` correctly refused inside the 3-day dispute window
  (leader payload: `"dispute window is still open"`)

## Environments

| Environment | RPC | Chain ID | Use |
|---|---|---|---|
| Studio (local) | `http://localhost:4000/api` | 61127 | Docker-based local full consensus |
| Studionet | `https://studio.genlayer.com/api` | 61999 | Browser Studio + built-in faucet — **first live target** |
| Bradbury | `https://rpc-bradbury.genlayer.com` | 4221 | Production-like testnet (faucet requires GitHub login) |

## Step 1 — lint + tests must be green

```bash
GENVMROOT=/tmp/genvmroot genvm-lint check contracts/milestone_judge.py
.venv/bin/python -m pytest tests/direct/ -v   # 95 passed
```

## Step 2 — deploy the contract

### Option A: GenLayer Studio (browser)

1. Open https://studio.genlayer.com (or your local Studio).
2. Contracts → Add From File → upload `contracts/milestone_judge.py`.
3. Run & Debug → Execution Mode “Normal (Full Consensus)” → Deploy.
4. Watch the consensus log for `ACCEPTED … Contract deployed`; copy the
   deployed address.

### Option B: programmatic (genlayer-py, Python 3.12)

```bash
uv venv --python 3.12 ~/genlayer-env 2>/dev/null
uv pip install --python ~/genlayer-env/bin/python genlayer-py
~/genlayer-env/bin/python scripts/deploy_studionet.py
```

`scripts/deploy_studionet.py` deploys with full consensus (not
`leader_only`), verifies the leader receipt's execution result, and writes
the address + tx hash to `docs/deployment_log.json`.

### Option C: smoke deploy + determinism protocol

`scripts/deploy_smoke_studionet.py` runs the full pre-submission protocol:
deploy → 3 consecutive consensus verdicts on fresh milestones (must
repeat) → 1 negative case (must flip) → JSON evidence log. Requires a
funded keyfile at `scripts/smoke_deployer.json`:

```json
{"address": "0x…", "private_key": "0x…"}
```

**Never commit keyfiles.** `scripts/smoke_deployer.json` is gitignored by
`.gitignore`.

## Step 3 — configure the frontend

```bash
cd frontend
cp .env.example .env.local
# then set:
#   NEXT_PUBLIC_CONTRACT_ADDRESS=0x<deployed address>
#   (optionally NEXT_PUBLIC_GENLAYER_CHAIN_ID=4221 + Bradbury RPC for testnet)
```

## Step 4 — run the dApp

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
# or production:
npm run build && npm start
```

In MetaMask, add the GenLayer network if prompted (the dApp's connect
flow requests it): RPC `https://studio.genlayer.com/api`, chain `61999`,
symbol `GEN`. For Studionet testing, use the Studio's faucet (💧) to fund
your wallet.

## Step 5 — end-to-end acceptance walkthrough

1. **Create** — connect wallet A (client), create a milestone with 2
   criteria, worker = wallet B address, escrow e.g. 1 GEN, deadline ~1 h
   out. Note the milestone id.
2. **Fund** — click Fund escrow; confirm the exact 1 GEN value in
   MetaMask; wait for FINALIZED; status shows FUNDED.
3. **Submit evidence** — switch MetaMask to wallet B, open the milestone
   (or /evidence), submit a public URL + statement. Status → SUBMITTED.
4. **Adjudicate** — either wallet clicks Start adjudication. The
   adjudication view shows the consensus phase; when FINALIZED the
   verdict appears: decision badge, per-criterion PASS/FAIL/INSUFFICIENT
   pills, evidence references, quality grade, reasoning summary, and the
   deterministic rule trace.
5. **Dispute window** — immediately after, Finalize is correctly blocked.
   Try Open dispute (as either party) → fresh consensus round → settled
   RELEASED/REFUNDED. (For a quick local demo of the window closing, the
   dispute window is 3 days; on Studionet you can simply verify the
   blocked/allowed transitions instead of waiting.)
6. **Finalize** — after the window, anyone can finalize; the escrow moves
   on-chain (worker on APPROVED, client otherwise). Verify on the
   explorer: contract balance drops, recipient balance rises.
7. **Expiry path** — create a milestone with a deadline a few minutes
   out, don't submit, wait past the deadline, click Trigger expiry from
   the milestone page → REFUNDED to client.

## Updating the contract

Re-deploy produces a **new address** (Intelligent Contracts are not
in-place-upgradable); set the new `NEXT_PUBLIC_CONTRACT_ADDRESS`. Old
milestones remain settled by the old contract instance.

## Notes

- Studionet rate limit: 500 `gen_call`/hour/IP — the dApp only reads on
  page load/refresh, not in a polling loop.
- A FINALIZED consensus can still carry a failed execution; the frontend
  checks `leader_receipt[0].execution_result` and surfaces real failures
  (never shows a reverted tx as success).
- LLM consensus rounds on public networks take roughly 45–60 s — the
  adjudication view's live phase indicator reflects the real states.
