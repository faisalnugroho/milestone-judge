# SUBMISSION DRAFT — MilestoneJudge

(Submission-ready package for the GenLayer Builder Portal. Submitting via
the Portal is the owner's task — this document contains everything needed,
field by field. Every claim below is backed by verifiable evidence in this
repository: the contract source, `docs/deployment_log.json`, and the live
Studionet deployment.)

## Contribution Type

Builder

## Category

Intelligent Contracts

## Title

MilestoneJudge — Trustless Milestone Escrow with AI-Powered On-Chain Adjudication

## Portal-ready one-liner (short description field)

Trustless escrow for digital-work milestones: the client escrows GEN behind
plain-language acceptance criteria, the worker submits public evidence URLs,
and GenLayer validators independently re-run an LLM evaluation of every
criterion before the contract — not the model — deterministically releases
or refunds the funds.

## Notes / Description (full field)

Milestone work (freelance deliverables, agencies, B2B engagements) needs a
judge for "was the deliverable actually what we agreed?" — a judgment over
natural-language criteria and real-world evidence that deterministic smart
contracts cannot make, and that a single arbiter or API would centralize.
MilestoneJudge turns that judgment into a trustless primitive on GenLayer:

1. A client creates a milestone with acceptance criteria in plain language,
   a worker address, a deadline, and an escrow amount in GEN.
2. The client funds the escrow (exact amount only — over, under, and double
   funding are all rejected), and the funds are held by the contract.
3. The worker submits public evidence URLs (deployment, GitHub PR, docs,
   API) plus a statement of how the evidence proves completion.
4. `start_adjudication` (callable by either party) triggers GenLayer
   consensus: a bounded web fetch retrieves the evidence, the leader LLM
   evaluates every acceptance criterion independently (PASS / FAIL /
   INSUFFICIENT_EVIDENCE per criterion), and every validator independently
   re-runs the same evaluation. Consensus compares the semantic decision —
   the per-criterion statuses and evidence quality — never raw prose.
5. Only after consensus does deterministic contract code derive the final
   verdict (APPROVED / REJECTED / INSUFFICIENT_EVIDENCE) and, after the
   3-day dispute window, execute the escrow rules via `emit_transfer`
   (checks-effects-interactions). The LLM never directly moves money.
6. Either party can dispute within the window: the original decision is
   preserved and a fresh consensus round re-adjudicates all evidence with
   the dispute context.

Security architecture (full details in `docs/security.md`):

- The non-deterministic block never writes storage, never transfers value,
  never emits — it only returns a structured verdict for consensus.
- The LLM only labels criteria; contract code derives every outcome
  (e.g. any mandatory FAIL → REJECTED, any mandatory INSUFFICIENT →
  INSUFFICIENT_EVIDENCE, all mandatory PASS + HIGH/MEDIUM quality →
  APPROVED), so consensus compares stable substance, not free text.
- External web content is untrusted evidence: the prompt forbids following
  instructions found inside it, evidence volume is hard-bounded, and a
  fooled LLM still leaves a complete on-chain audit trail with escrow
  locked during the dispute window.
- Integer-only money (u256/wei), exact-amount funding, single-settlement
  invariants, authorization on every state transition.

Honest scope notes: the dispute flow is an application-level second
adjudication round, not GenLayer's protocol-level Optimistic Democracy
appeal (which the settlement additionally benefits from, since
`emit_transfer` waits for protocol finality). Direct-mode tests mock web
and LLM; live multi-validator consensus was verified separately on
Studionet (below).

## Repository Link

https://github.com/faisalnugroho/milestone-judge

## Live Contract Link

https://explorer-studio.genlayer.com/address/0x0872B4be1bcB6234f336d9A7C99cefc606Ea15d1

(Contract `0x0872B4be1bcB6234f336d9A7C99cefc606Ea15d1`, GenLayer Studionet,
deployed 2026-09-03 with the steward-requested dispute hardening
(blank-evidence policy, both-party rebuttal evidence, 24h on-chain
response window, fair 14000/6000 fetch-budget split), full-consensus
deploy tx `0xa7add21458a34612774b557e5ff066ff41b39237c5eb3bbaa664fef10958f4eb`,
recorded in `docs/deployment_log.json`. An earlier deployment
`0x7C6e5151...0814` from 2026-09-02 is superseded and remains on-chain
for audit.)

## Live dApp

https://milestone-judge.vercel.app — Next.js 14 + TypeScript + Tailwind,
genlayer-js client, MetaMask (EIP-1193). Pages: landing, dashboard, create,
evidence submission, dispute, history, milestone detail. Reads live contract
state; every write is a real consensus transaction surfaced with its
receipt. The dispute UI shows per-item evidence provenance (who submitted
what and when), a live response-window countdown, and a rebuttal-evidence
form available to BOTH parties while a dispute is open; the resolve action
is gated on the on-chain response deadline.

## Test / Deployment Proof

Local evidence (reproducible from the repo):

- Tests: `.venv/bin/python -m pytest tests/direct/ -q` → 95/95 passed
  (69 core + 26 dispute-hardening regressions). Coverage: state machine,
  authorization, escrow accounting (exact-amount, double-funding, refunds),
  adjudication decision derivation, consensus comparison semantics,
  disputes, deadlines, prompt-injection audit trail, funds-conservation
  invariants — plus, per the steward review: empty-evidence policy,
  immediate-resolution rejection, response-window boundaries
  (deadline-1s / exactly-at / deadline+1s), other-party rebuttal access,
  stranger rejection, evidence-order exhaustion / fair fetch budget
  (rebuttal keeps its reserved 3000-char share against 4×5000-char base
  URLs; 20000-char hard cap), and original-adjudication immutability.
- Lint: `genvm-lint check contracts/milestone_judge.py` → Lint passed
  (3 checks), Validation passed, 18 methods (8 view, 10 write).

Live smoke on Studionet, full protocol (2026-09-03, all consensus
rounds with real validators and real LLM; complete log with tx hashes
and full verdict payloads in `docs/deployment_log.json`; pre-window
points ALL PASS, post-window resolution auto-executes after the
response deadline):

1. Deploy: full consensus, verified leader receipt, address
   `0x0872B4be...15d1` (tx `0xa7add214...58f4eb`).
2. Determinism: 3 consecutive adjudications on fresh milestones, all
   APPROVED with identical rule traces (22–64 s per consensus round).
3. Negative case: criterion requiring the secret word `ZEBRA_7f3a` on a
   page that lacks it → REJECTED (tx in log).
4. Dispute-hardening protocol on an APPROVED milestone: dispute opened
   by the client → the OTHER party (worker) added rebuttal evidence
   (accepted, provenance on-chain) → immediate `resolve_dispute` REFUSED
   by the 24h on-chain response window (leader payload: "dispute
   response window is still open") → escrow stays locked in DISPUTED.
5. Window enforcement: `finalize_milestone` inside the 3-day window
   correctly refused ("dispute window is still open"), proven by a live
   negative-check transaction.
6. All of the above recorded machine-readably in
   `docs/deployment_log.json` with `all_pass: true`.

## Evidence List (attach to the portal, in priority order)

1. GitHub repository (contract + 95 direct-mode tests + smoke/deploy
   scripts + docs): https://github.com/faisalnugroho/milestone-judge
2. Studionet explorer, contract page:
   https://explorer-studio.genlayer.com/address/0x0872B4be1bcB6234f336d9A7C99cefc606Ea15d1
3. Live dApp: https://milestone-judge.vercel.app
4. Machine-readable smoke evidence: `docs/deployment_log.json` in the repo
5. Design documentation: `docs/architecture.md`, `docs/adjudication.md`,
   `docs/security.md`, `docs/testing.md`, `docs/deployment.md`

## Tags

escrow, milestone payments, dispute resolution, AI adjudication,
consensus verification, freelancing, trustless settlement
