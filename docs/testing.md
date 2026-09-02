# Testing

## Test strategy

| Layer | Tool | What it proves |
|---|---|---|
| Static analysis | `genvm-lint check` | GenVM rule compliance: storage types, nondet placement, decorators, event topics |
| Direct-mode unit tests | `gltest` (pytest, in-memory) | Full business logic: state machine, auth, escrow accounting, adjudication rules, consensus comparison, disputes, deadlines — with mocked web/LLM |
| Production build | `next build` + `tsc --noEmit` + route smoke | Frontend type-safety and that every page renders |
| Live consensus (recommended before submission) | Studionet/Bradbury smoke | Real multi-validator consensus on the real network |

## Running the suite

```bash
# 1. Environment (Python 3.12 required)
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python genlayer-test genlayer-py pytest eth_utils

# 2. Lint
GENVMROOT=/tmp/genvmroot genvm-lint check contracts/milestone_judge.py
# (expected: ✓ Lint passed (3 checks) / ✓ Validation passed)

# 3. Direct-mode tests
.venv/bin/python -m pytest tests/test_milestone_judge.py -v
# (expected: 69 passed)
```

Note: `genvm-lint` ships inside the `genlayer` pip distribution; any
environment that has it works (`pip show genlayer`).

## What the 69 tests cover

**Creation (8)** — full record fields; rejects short titles, invalid/empty
criteria JSON, past deadlines, worker==client, dust amounts, duplicate
criterion ids; both party indexes updated; ids increment.

**Funding (7)** — exact-amount funding; zero/under/over-funding revert;
non-client cannot fund; double-funding reverts (balance never doubles);
nonexistent milestone reverts.

**Cancel/Expire (7)** — pre-submission cancel refunds the client (verified
via PostMessage transfer hook balance deltas); unfunded cancel marks only;
worker/stranger cannot cancel; cancel blocked after submission; cancelled
milestone refuses funding.

**Evidence submission (8)** — worker-only; URL/statement validation
(non-http, empty, short statement); before-funding and stranger rejected;
unknown evidence kind normalized to OTHER.

**Deadlines (4)** — late submission reverts; expiry crank refunds client
(even when triggered by the worker — crank is permissionless and safe);
expiry before deadline reverts; expiry blocked after submission.

**Adjudication (15)** — all-PASS + HIGH quality → APPROVED; any mandatory
FAIL → REJECTED (with `mandatory_fail:c1` rule trace); INSUFFICIENT
statuses route correctly; LOW quality blocks approval even with all-PASS;
missing criterion id → INSUFFICIENT for that criterion; unknown LLM status
values normalized; both parties authorized, stranger rejected;
SUBMITTED-state gate; double adjudication blocked; resubmission after
REJECTED and after INSUFFICIENT (round counter + history preserved);
prompt-injection attempt yields full on-chain audit trail while escrow
stays locked; unfetchable URL → INSUFFICIENT (no crash); client-provided
reference URLs included in the adjudication evidence set.

**Finalization (6)** — APPROVED → escrow released to the worker (balance
delta verified); REJECTED → client refunded; INSUFFICIENT → client
refunded; blocked during dispute window; double-finalize reverts; the
worker cannot shortcut the window.

**Disputes (9)** — full overturn flow: dispute an approval, other party
adds evidence, fresh consensus round REJECTS, client refunded, history
shows both rounds with original decision preserved; dispute can also
confirm the original; stranger rejected; window enforced; one dispute per
milestone; undecided milestone cannot be disputed; dispute blocks
finalization; the worker can dispute a rejection; resolve requires an open
dispute.

**Invariants (5)** — `get_stats` locked-wei tracking; adjudication rounds
capped at 3; end-to-end value conservation (exactly one party ends with
the escrow, contract keeps nothing, stats locked returns to zero);
id listing; not-found views return well-formed error JSON.

## Direct-mode specifics

- **Fixtures**: `direct_vm`, `direct_deploy`, `direct_alice` (client),
  `direct_bob` (worker), `direct_charlie` (stranger) from
  `gltest.direct.pytest_plugin`.
- **Web/LLM mocks**: `vm.mock_web(url, body)` / `vm.mock_llm(".*", json)`;
  first-match-wins, so tests call `vm.clear_mocks()` before re-registering
  (visible in the resubmission tests).
- **Time control**: `set_time()` warps the VM *and* patches the loaded
  contract's `gl.message_raw["datetime"]` (gltest's `vm.warp` alone does
  not propagate — a documented pitfall) so deadline/dispute-window tests
  exercise the real node-clock code path.
- **Value transfers**: `emit_transfer` PostMessages are intercepted with a
  `vm._gl_call_hook` that mirrors real child-transaction accounting
  (deduct sender, credit recipient), and the contract is funded with
  `vm.deal`. Balance assertions are therefore real ledger deltas, not
  internal flags.
- **Addresses**: gltest addresses are raw bytes while the contract stores
  checksummed hex; helpers normalize both ways (`addr_str` in tests,
  `_addr_str` in the contract) — the equality bugs this prevents are
  covered by `test_creates_with_full_record` and every authorization test.

## Live smoke test (pre-submission)

After deploying to Studionet/Bradbury, run the determinism protocol:

1. Create + fund a milestone (evidence: a real public URL).
2. Submit evidence.
3. Call `start_adjudication` **3 consecutive times on fresh milestones** —
   consensus must ACCEPT every run and the verdict must repeat.
4. Run **1 negative case** (evidence that clearly fails a criterion) —
   the verdict must flip to REJECTED.

Template: `scripts/deploy_smoke_studionet.py` (adapts the battle-tested
pattern: robust receipt parsing, execution-result verification, JSON
evidence log to `docs/deployment_log.json`).

## Frontend verification performed

- `npx tsc --noEmit` — 0 errors (strict mode).
- `npx next build` — production build of all 7 routes.
- Route smoke against `next start` — every route 200 with correct content
  (landing, dashboard, create, evidence, dispute, history, milestone
  detail, including the unconfigured-contract error path).
