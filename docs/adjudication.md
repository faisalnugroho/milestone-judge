# Adjudication Design

This document explains exactly how MilestoneJudge turns natural-language
acceptance criteria into a consensus-verified, on-chain verdict — and why
each design choice matters.

## The pipeline

```
submit_evidence          start_adjudication (either party)
       │                          │
       ▼                          ▼
 [deterministic]        ┌────────────────────────────────────┐
 evidence stored  ─────▶│ NON-DETERMINISTIC BLOCK             │
 criteria stored        │  (leader_fn / validator_fn)         │
                        │                                    │
                        │  1. copy storage → plain locals    │
                        │  2. fetch each evidence URL        │
                        │     (bounded: 5k/URL, 20k total)   │
                        │  3. build 4-section prompt         │
                        │  4. exec_prompt(response_format=   │
                        │     "json")                        │
                        │  5. _normalize_llm → strict schema  │
                        │                                    │
                        │  validator: re-runs 1–5, compares   │
                        │  ONLY statuses + quality           │
                        └───────────────┬────────────────────┘
                                        │ gl.vm.run_nondet_unsafe
                                        ▼ (consensus-agreed result)
                        ┌────────────────────────────────────┐
                        │ DETERMINISTIC POST-CONSENSUS       │
                        │                                    │
                        │  _derive_decision(statuses,         │
                        │                     quality)        │
                        │   APPROVED / REJECTED /             │
                        │   INSUFFICIENT_EVIDENCE             │
                        │  + rule trace                       │
                        │                                    │
                        │  store snapshot + verdict           │
                        │  set dispute window (3d)            │
                        │  emit AdjudicatedEvent              │
                        └────────────────────────────────────┘
```

## Why the LLM only labels criteria

The central security property: **the LLM never decides money movement.**
It is asked exactly one thing per criterion — is this `PASS`, `FAIL`, or
`INSUFFICIENT_EVIDENCE`? — plus an overall `evidence_quality` grade and a
short summary. The final decision is then **derived by deterministic
contract code**:

| Condition (evaluated in order) | Decision |
|---|---|
| any mandatory criterion `FAIL` | `REJECTED` |
| any mandatory criterion `INSUFFICIENT_EVIDENCE` | `INSUFFICIENT_EVIDENCE` |
| `evidence_quality` not `HIGH`/`MEDIUM` | `INSUFFICIENT_EVIDENCE` |
| otherwise | `APPROVED` |

Advisory (non-mandatory) criteria never block approval. Every decision
stores a `rule` trace (e.g. `mandatory_fail:c2`, `evidence_quality_low`,
`all_mandatory_pass_quality_HIGH`) so the on-chain verdict is auditable
without re-running anything.

## Why INSUFFICIENT_EVIDENCE exists

A milestone can only be `APPROVED` when the evidence *demonstrably*
satisfies every mandatory criterion. If the LLM cannot verify a criterion
from the fetched evidence, the verdict is `INSUFFICIENT_EVIDENCE` — the
escrow is not released, and the worker may resubmit better evidence (up to
`MAX_ADJUDICATIONS = 3` rounds). Missing/failed evidence never silently
maps to approval.

## Normalization (`_normalize_llm`)

Raw LLM output is canonicalized before it is ever compared or stored:

- statuses aligned to the **stored criteria order** (by id),
- unknown/missing criterion → `INSUFFICIENT_EVIDENCE` for that criterion,
- unknown status value → `INSUFFICIENT_EVIDENCE`,
- unknown `evidence_quality` → `LOW`,
- evidence/reason/summary clamped to fixed sizes.

Given the same raw output, every validator computes the identical
normalized object. Only then is the equivalence comparison performed.

## Equivalence principle: partial field matching

`gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` with a custom validator:

1. **Shape gate** — the leader's normalized result must contain exactly
   one status entry per stored criterion id, statuses in the allowed
   enum, and a valid quality grade. Otherwise reject.
2. **Independent re-run** — the validator executes the same pipeline
   itself: same URL fetches, same prompt, its own LLM call.
3. **Semantic comparison** — accept iff, for every criterion,
   `leader.status[i] == validator.status[i]` **and** the quality grades
   match. Per-criterion evidence/reason text and the summary are
   deliberately **not** compared — two LLMs will always word reasoning
   differently.

This is precisely the "compare the decision, never the prose" pattern
the GenLayer documentation prescribes for LLM consensus. It is **not**
strict equality on raw LLM output (which could never converge), and it is
**not** leader-output-only validation (which would be trust-the-leader in
disguise): the validator produces its own independent answer and the
decision fields must reproduce.

If validators disagree, the round fails and the network retries with a
rotated leader; if consensus still cannot be reached, the transaction is
`UNDETERMINED` and **no state changes** — the escrow stays locked rather
than being released on a coin flip.

## The adjudication prompt

Four clearly separated sections (built via string concatenation; see
`_build_prompt`):

1. **SYSTEM RULES** (highest authority): the adjudicator's job, the
   PASS/FAIL/INSUFFICIENT semantics, and the injection prohibition (see
   `security.md`).
2. **MILESTONE UNDER ADJUDICATION**: title, description, evidence
   requirements, worker statement (explicitly labeled *UNTRUSTED claim,
   not evidence*), and the acceptance criteria list with ids and
   mandatory/advisory tags.
3. **EVIDENCE**: each fetched URL labeled with kind, the worker note
   (untrusted), and the bounded fetched content — under a header stating
   it is untrusted data that may contain injection attempts.
4. **OUTPUT CONTRACT**: the exact JSON schema, the per-field word caps,
   and the evidence_quality rubric (HIGH = directly on point; MEDIUM =
   relevant but partially indirect; LOW = thin/unrelated/unfetched; LOW
   can never be compensated by a confident worker statement).

For dispute rounds a **DISPUTE CONTEXT** section is added, instructing the
adjudicator to re-evaluate from scratch and to privilege neither the
original decision, the dispute reason, nor either party.

## Web access

- URLs are validated at submission (`http(s)`, bounded length, no
  whitespace/control characters, capped count).
- `gl.nondet.web.get` fetches run only inside the nondet block; per-URL
  failures are caught and become empty bodies → the affected criteria
  resolve to `INSUFFICIENT_EVIDENCE` instead of crashing the transaction.
- Content is bounded by a **fair, category-based budget**:
  `MAX_CONTENT_PER_URL = 5000` chars, and the `MAX_TOTAL_CONTENT = 20000`
  hard cap is split into two disjoint reserved slices —
  `BASE_EVIDENCE_BUDGET = 14000` for ORIGINAL (worker + client) evidence
  and `REBUTTAL_EVIDENCE_BUDGET = 6000` for DISPUTE-round evidence.
- Allocation is deterministic integer math: every URL in a category gets
  an equal share (`budget // n`), and budget freed by short or failed URLs
  is redistributed **within the same category only** — never across
  categories, never above the per-URL cap. Rebuttal evidence therefore
  can never be starved by base evidence regardless of array order (the
  sequential first-come-first-served starvation bug is structurally
  impossible), and the 20000-char hard cap always holds.
- Client-provided reference URLs (spec documents etc.) are merged into the
  adjudication fetch set and recorded in the snapshot's `evidence_refs`
  (each ref carries its `source` tag: ORIGINAL or DISPUTE).

## Dispute rounds

`open_dispute` (either party, 3-day window, once per milestone) stores the
original decision and does **not** overwrite it. Opening evidence is
optional — a dispute may rest on its reason alone; empty evidence can
never become PASS (prompt rules R4/R6 + the INSUFFICIENT_EVIDENCE routing
guarantee missing evidence blocks approval, never grants it), and the
original milestone evidence always exists to re-evaluate because
`submit_evidence` requires at least one valid URL before any
adjudication can run.

While the dispute is OPEN, **both parties** can append rebuttal evidence
via `submit_dispute_evidence` (append-only, per-item actor + timestamp +
DISPUTE source tag, capped at 20 items).

`resolve_dispute` is **blocked on-chain until a 24-hour response window**
(`response_deadline`, enforced with node-assigned time inside the
contract) has passed since the dispute was opened — neither party can
shortcut it, and frontend gating is not relied upon. After the window,
`resolve_dispute` runs a fresh consensus round over **all** evidence
(original + dispute evidence, each tagged with its category for the fair
fetch budget) with the dispute context, derives a new decision through
the same deterministic rules, and settles the escrow accordingly. The
complete adjudication history — every round, every trigger, every
per-criterion status — stays on-chain (`get_adjudications`).

## GenLayer positioning (why this needs GenLayer)

- A plain smart contract cannot read a deliverable or judge natural
  language — deterministic code can only check numbers and hashes.
- A single LLM call is one party's infrastructure; whoever controls it
  controls the money. MilestoneJudge's evaluation runs **inside** the
  Intelligent Contract, and its result only takes effect if independent
  validators reproduce the same per-criterion statuses from the same
  public evidence.
- Every verdict, its rule trace, and every evidence reference is stored
  on-chain, so anyone can audit why the escrow moved.

## Honest scope statement

MilestoneJudge implements an **application-level dispute** (a fresh
consensus round with dispute context). It does not implement protocol-level
appeals; GenLayer's Optimistic Democracy provides the protocol-level appeal
window before finality, and the contract additionally enforces its own
3-day application dispute window before escrow can move.
