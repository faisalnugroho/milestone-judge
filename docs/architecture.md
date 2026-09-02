# Architecture

MilestoneJudge is a GenLayer contribution consisting of three tightly
coupled layers:

```
┌────────────────────────────────────────────────────────────┐
│ frontend/  Next.js 14 dApp (genlayer-js + MetaMask)         │
│           pages: / /dashboard /create /evidence            │
│           /dispute /history /milestone/[id]                 │
└──────────────────────────┬─────────────────────────────────┘
                           │ readContract / writeContract
                           │ (gen_* JSON-RPC over the GenLayer RPC)
┌──────────────────────────▼─────────────────────────────────┐
│ contracts/milestone_judge.py  MilestoneJudge               │
│ GenLayer Intelligent Contract (GenVM, py-genlayer SDK)      │
│                                                            │
│  deterministic core: state machine, auth, escrow ledger    │
│  non-deterministic block: web fetch + LLM adjudication    │
│  equivalence principle: custom leader/validator pair        │
└──────────────────────────┬─────────────────────────────────┘
                           │ GEN value transfers (emit_transfer)
                           ▼
                 GenLayer chain layer (ghost contract balances)
```

## Contract layout

The contract is a single class `MilestoneJudge(gl.Contract)` in
`contracts/milestone_judge.py`, organized into clearly separated sections:

| Section | Contents |
|---|---|
| Events | 10 event classes, each exactly one indexed positional field (`milestone_id: u256`) plus str/int blob kwargs — respects the GenVM `EVENT_MAX_TOPICS` constraint |
| Constants | hard bounds: criteria/URL caps, content-size limits, dispute window, dust limit |
| Pure helpers | `_parse_iso_epoch` (integer-math civil-date conversion), `_url_ok`, `_addr_str` (address normalization), criteria/evidence validation |
| Adjudication engine | `_build_prompt` (4 clearly separated prompt sections), `_fetch_evidence` (bounded fetch), `_normalize_llm` (strict canonicalization), `_derive_decision` (deterministic decision rules) |
| Storage | uniform `TreeMap[str, str]` maps holding JSON records + `u256` id counter |
| Client API | `create_milestone`, `fund_milestone` (payable), `cancel_milestone`, `mark_expired` |
| Worker API | `submit_evidence` |
| Adjudication API | `start_adjudication`, `finalize_milestone` |
| Dispute API | `open_dispute`, `submit_dispute_evidence`, `resolve_dispute` |
| Views | `get_milestone`, `get_milestone_ids`, `get_milestones_for`, `get_adjudications`, `get_dispute`, `get_params`, `get_contract_balance`, `get_stats` |

### Why one file?

The prompt's suggested `contracts/{milestone_judge,types,adjudication,validation}.py`
split was evaluated against the current GenVM deployment model: the
`# { "Depends": ... }` header and the contract class must load as a single
module, and the official boilerplate ships single-file contracts. The
sections above provide the same separation of concerns *inside* one
deployable unit (validation helpers, adjudication engine, state machine,
API). This also keeps `genvm-lint` and Studio debugging trivial.

## Storage schema

All persistent state uses the GenVM-recommended uniform pattern:
`TreeMap[str, str]` with JSON-serialized records (avoids the heterogeneous
TreeMap pitfalls in tooling and keeps the on-chain schema inspectable in
one glance).

| Field | Key | Value |
|---|---|---|
| `milestones` | milestone id (decimal str) | milestone record JSON (see below) |
| `client_index` / `worker_index` | address (checksummed hex) | JSON array of milestone ids |
| `adjudications` | milestone id | JSON array of adjudication snapshots (full history, never overwritten) |
| `disputes` | milestone id | dispute record JSON (one dispute per milestone) |
| `params` | — (plain `str`) | protocol parameter JSON, set once in constructor |
| `next_milestone_id` | `u256` counter | monotonic id source |

Monetary values are stored as **decimal strings of wei** (integers; no
floats anywhere). Timestamps are epoch-second strings computed from the
node-assigned `gl.message_raw["datetime"]` via pure integer math (Howard
Hinnant's `days_from_civil`), so every validator derives the identical
value.

### Milestone record fields

`id, title, description, client, worker, criteria (JSON), evidence_requirements,
evidence_urls_client, evidence (list), worker_statement, deadline_epoch,
amount_wei, balance_wei, status, created_at, submitted_at, adjudicated_at,
dispute_deadline, resolved_at, adjudication_count, verdict, released,
refunded, timeline (list)`

## State machine

```
                ┌──────────┐  fund (exact amount, client)
     create     │ CREATED  │───────────────────────────┐
   ────────────▶│          │                           │
                └────┬─────┘                           ▼
                     │ cancel (no funds)         ┌──────────┐
                     ▼                           │  FUNDED  │
                ┌──────────┐   deadline passed,  │          │── cancel ─▶ CANCELLED (refund)
                │CANCELLED │   no submission    └────┬─────┘
                └──────────┘        │ mark_expired     │ submit_evidence (worker, pre-deadline)
                                    ▼                 ▼
                               ┌──────────┐    ┌───────────┐
                               │ EXPIRED  │    │ SUBMITTED │
                               │(refund)  │    └─────┬─────┘
                               └──────────┘          │ start_adjudication (either party)
                                                     ▼
                    ┌────────────────────────────────┼─────────────────────┐
                    ▼                                ▼                     ▼
             ┌───────────┐                  ┌────────────────┐   ┌───────────────┐
             │ APPROVED  │                  │ INSUFFICIENT_  │   │ REJECTED      │
             └─────┬─────┘                  │ EVIDENCE       │   └──────┬────────┘
                   │  dispute window        └───────┬────────┘          │ (same dispute window)
                   │                                │ resubmit (≤3 rounds)│
                   │         ┌──────────────────────┘                    │
                   │         ▼                                            │
                   │   ┌──────────┐  open_dispute (either party, 3d)     │
                   │   │ DISPUTED │◀──────────────────────────────────────┘
                   │   └────┬─────┘
                   │        │ resolve_dispute (fresh consensus) → RELEASED/REFUNDED
                   │        ▼
                   │  finalize (permissionless, post-window)
                   ▼
             ┌──────────┐        ┌──────────┐
             │ RELEASED │        │ REFUNDED │
             └──────────┘        └──────────┘
```

Authorization rules (enforced by `_require_client` / `_require_worker` /
`_require_party` and per-method status guards):

- **create / fund / cancel**: client only. Cancel only before worker
  submission. Fund must send *exactly* the milestone amount.
- **submit_evidence / resubmit**: the assigned worker only, pre-deadline.
- **start_adjudication / open_dispute / submit_dispute_evidence /
  resolve_dispute**: either party only.
- **finalize_milestone / mark_expired**: permissionless cranks — the money
  destination is fixed entirely by contract state (APPROVED → worker,
  otherwise → client), so a stranger triggering them cannot redirect funds.

## Value flow

1. `fund_milestone` is `@gl.public.write.payable`; the client sends exactly
   `amount_wei`. The GEN is held by the contract (ghost-contract balance
   on the chain layer).
2. Every settlement path goes through `_release`/`_refund`, which:
   - checks `balance_wei > 0` and `not released/refunded` (no double-pay),
   - zeroes the bookkeeping FIRST (checks-effects-interactions),
   - then emits `gl.get_contract_at(addr).emit_transfer(value, on="finalized")`.
3. `emit_transfer` value is deducted immediately and credited when the
   child transaction activates — the reason bookkeeping is committed to
   storage *before* the emit.

## Frontend architecture

- **Next.js 14 App Router**, fully client-rendered pages, TypeScript
  strict, Tailwind CSS.
- **Wallet**: MetaMask EIP-1193 provider; `genlayer-js` `createClient`
  with `chain` + `account` (the official boilerplate integration pattern).
- **Money**: `bigint` end-to-end (`parseGenToWei`, `formatWeiAsGen`); no
  JavaScript number ever touches a wei value.
- **Transaction lifecycle**: writes go through `writeContract` →
  `waitForTransactionReceipt(FINALIZED)`, with raw GenLayer states
  (signing → pending → consensus → FINALIZED, plus error receipt
  detection via `leader_receipt[0].execution_result === "ERROR"` so a
  reverted-but-finalized transaction is *never* shown as success).
- **Config**: `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_GENLAYER_*`
  env vars (see `frontend/.env.example`).
