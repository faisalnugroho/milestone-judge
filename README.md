# MILESTONE JUDGE

**Trustless milestone escrow with AI-powered on-chain adjudication.**

A GenLayer project: a decentralized escrow and dispute-resolution platform
for digital work, implemented as a GenLayer Intelligent Contract with a
production Next.js dApp on top.

**Live (Studionet):** contract
[`0x7C6e515187c47202c7330384613229F75B180814`](https://explorer-studio.genlayer.com/address/0x7C6e515187c47202c7330384613229F75B180814)
· dApp https://milestone-judge.vercel.app · smoke 6/6 PASS
(3× APPROVED determinism, negative → REJECTED, dispute round → live
`emit_transfer` release, window enforcement)

---

## What it does

1. A **client** creates a milestone: acceptance criteria in plain
   language, a worker address, a deadline, and an escrow amount in GEN.
2. The client **funds** the escrow — real GEN, held by the Intelligent
   Contract (exact-amount funding; no over/under/double funding).
3. The **worker** submits public evidence URLs (deployment, GitHub PR,
   docs, API) plus a statement of how the evidence proves completion.
4. **Adjudication** runs *inside the Intelligent Contract*: the contract
   fetches the evidence, an LLM evaluates every acceptance criterion
   independently (PASS / FAIL / INSUFFICIENT_EVIDENCE), and GenLayer
   validators independently re-run the same evaluation and vote on the
   result — consensus compares the **semantic decision** (per-criterion
   statuses), never raw prose.
5. Only **after consensus**, deterministic contract code derives
   APPROVED / REJECTED / INSUFFICIENT_EVIDENCE and executes the escrow
   rules: released to the worker, or protected/refunded per the rules.
   The LLM never directly moves money.
6. Either party can **dispute** within the dispute window; the original
   decision is preserved and a fresh consensus round re-adjudicates all
   evidence with the dispute context.

### Why GenLayer (not just "an AI call")

- A plain smart contract cannot judge "the deployed site satisfies these
  natural-language criteria" — that requires judgment over real-world
  evidence.
- A single LLM answer is one party's infrastructure. Under GenLayer, the
  evaluation runs inside an Intelligent Contract and only takes effect if
  independent validators reproduce the same verdict from the same public
  evidence (Equivalence Principle + Optimistic Democracy).
- Every verdict, its deterministic rule trace, and every evidence
  reference is stored on-chain and auditable.

## Repository layout

```
contracts/
  milestone_judge.py        the Intelligent Contract (single deployable unit;
                           validation / adjudication engine / state machine
                           separated into documented sections)
tests/
  helpers.py               direct-mode helpers (transfer hook, time warp,
                           LLM/web mock builders)
  conftest.py              path setup
  test_milestone_judge.py  69 direct-mode tests (state machine, auth, escrow
                           accounting, adjudication, disputes, deadlines,
                           prompt-injection audit, invariants)
frontend/                  Next.js 14 + TypeScript + Tailwind dApp
  app/                     pages: / /dashboard /create /evidence /dispute
                           /history /milestone/[id]
  lib/                     genlayer-js contract binding, wallet provider,
                           BigInt money utils, domain types
  components/              NavBar + shared UI (badges, tx tracker, cards)
scripts/
  deploy_studionet.py      full-consensus deploy + address log
  deploy_smoke_studionet.py  pre-submission smoke: 3× determinism + negative
docs/
  architecture.md          state machine, storage schema, value flow
  adjudication.md          the full adjudication design + consensus
  security.md              threat model, nondet/det split, injection defense
  testing.md               what the 69 tests cover + live protocol
  deployment.md            step-by-step deploy + acceptance walkthrough
```

## Quick start

### Contract

```bash
# Python 3.12 required
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python genlayer-test genlayer-py pytest eth_utils

# lint (expected: ✓ Lint passed (3 checks) / ✓ Validation passed, 18 methods)
GENVMROOT=/tmp/genvmroot genvm-lint check contracts/milestone_judge.py

# tests (expected: 69 passed)
.venv/bin/python -m pytest tests/test_milestone_judge.py -v
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local      # set NEXT_PUBLIC_CONTRACT_ADDRESS after deploy
npm run dev                    # http://localhost:3000
```

### Deploy

See `docs/deployment.md` — Studio (browser), `scripts/deploy_studionet.py`
(programmatic), or `scripts/deploy_smoke_studionet.py` (deploy + 3×
determinism runs + negative case, logged to `docs/deployment_log.json` as
submission evidence).

## The contract in one glance

| | |
|---|---|
| Client methods | `create_milestone`, `fund_milestone` (payable, exact amount), `cancel_milestone` |
| Worker methods | `submit_evidence` (public URLs + statement, pre-deadline) |
| Adjudication | `start_adjudication` (either party) — nondet block: bounded web fetch → 4-section prompt → LLM per-criterion statuses; custom validator re-runs the pipeline and compares statuses + quality; `_derive_decision` maps statuses to the final verdict deterministically |
| Settlement | `finalize_milestone` (permissionless crank, post-window) — `emit_transfer(value, on="finalized")` with checks-effects-interactions |
| Disputes | `open_dispute` (either party, 3-day window, once) → `submit_dispute_evidence` → `resolve_dispute` (fresh consensus round, original decision preserved) |
| Views | `get_milestone`, `get_milestone_ids`, `get_milestones_for`, `get_adjudications`, `get_dispute`, `get_params`, `get_contract_balance`, `get_stats` |
| Storage | uniform `TreeMap[str, str]` JSON records, `u256` counter, node-assigned timestamps (pure integer math), wei as decimal strings |

Security architecture summary (see `docs/security.md`):

- the non-deterministic block never writes storage, never transfers
  value, never emits — it only returns a structured verdict for consensus;
- the LLM only labels criteria; contract code derives the decision;
- external web content is untrusted evidence; the prompt forbids
  following instructions found inside it, and a fooled LLM still leaves a
  complete on-chain audit trail with the escrow locked during the
  dispute window;
- integer-only money (u256/wei, BigInt in the frontend); exact-amount
  funding; single-settlement invariants; authorization on every
  transition.

## Honest scope notes

- The dispute flow is an **application-level** second adjudication round —
  it is not, and does not claim to be, GenLayer's protocol-level
  Optimistic Democracy appeal process (which the contract additionally
  benefits from, since `emit_transfer(on="finalized")` waits for
  protocol finality).
- Direct-mode tests mock web/LLM; live multi-validator consensus has been
  verified on Studionet — `scripts/deploy_smoke_studionet.py` runs the
  full protocol (determinism ×3, negative case, dispute round with live
  escrow release, window enforcement) and writes
  `docs/deployment_log.json`.
- Frontend wallet support targets MetaMask (EIP-1193), matching the
  official GenLayer boilerplate integration pattern.
