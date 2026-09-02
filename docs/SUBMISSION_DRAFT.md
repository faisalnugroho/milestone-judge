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

https://explorer-studio.genlayer.com/address/0x7C6e515187c47202c7330384613229F75B180814

(Contract `0x7C6e515187c47202c7330384613229F75B180814`, GenLayer Studionet,
deployed 2026-09-02, full-consensus deploy tx
`0xedacbd965eaa08c5f6970598dc7625e12812307c863e70d7a464687b19cb6aae`,
recorded in `docs/deployment_log.json`.)

## Live dApp

https://milestone-judge.vercel.app — Next.js 14 + TypeScript + Tailwind,
genlayer-js client, MetaMask (EIP-1193). Pages: landing, dashboard, create,
evidence submission, dispute, history, milestone detail. Reads live contract
state; every write is a real consensus transaction surfaced with its
receipt.

## Test / Deployment Proof

Local evidence (reproducible from the repo):

- Tests: `pytest tests/direct -q` → 69/69 passed. Coverage: state machine,
  authorization, escrow accounting (exact-amount, double-funding, refunds),
  adjudication decision derivation, consensus comparison semantics,
  disputes, deadlines, prompt-injection audit trail, and funds-conservation
  invariants.
- Lint: `genvm-lint check contracts/milestone_judge.py` → Lint passed
  (3 checks), Validation passed, 18 methods (8 view, 10 write).

Live smoke on Studionet, full protocol, 6/6 PASS (2026-09-02, all consensus
rounds with real validators and real LLM; complete log with tx hashes and
full verdict payloads in `docs/deployment_log.json`):

1. Deploy: full consensus, verified leader receipt, address
   `0x7C6e5151...0814` (tx `0xedacbd96...cb6aae`).
2. Determinism: 3 consecutive adjudications on fresh milestones, all
   APPROVED with identical rule traces (17–38 s per consensus round).
   Milestone 1 tx `0xe234b7fa...dadd21d`, milestone 2 tx
   `0x03cb883c...8237079`, milestone 3 tx `0xfa72a224...253c1da`.
3. Negative case: criterion requiring the secret word `ZEBRA_7f3a` on a
   page that lacks it → REJECTED, rule `mandatory_fail:c1` (tx
   `0x9e1de779...d0af2a1`).
4. Dispute round on an APPROVED milestone inside the window: fresh
   consensus round → APPROVED again → escrow RELEASED live (real
   `emit_transfer`, 0.01 GEN paid out to the worker) (tx
   `0x89eac443...c71fad77`).
5. Window enforcement: `finalize_milestone` inside the 3-day window
   correctly refused (`"dispute window is still open"`), proven by a live
   negative-check transaction.
6. All of the above recorded machine-readably in `docs/deployment_log.json`
   with `all_pass: true`.

## Evidence List (attach to the portal, in priority order)

1. GitHub repository (contract + 69 direct-mode tests + smoke/deploy
   scripts + docs): https://github.com/faisalnugroho/milestone-judge
2. Studionet explorer, contract page:
   https://explorer-studio.genlayer.com/address/0x7C6e515187c47202c7330384613229F75B180814
3. Live dApp: https://milestone-judge.vercel.app
4. Machine-readable smoke evidence: `docs/deployment_log.json` in the repo
5. Design documentation: `docs/architecture.md`, `docs/adjudication.md`,
   `docs/security.md`, `docs/testing.md`, `docs/deployment.md`

## Tags

escrow, milestone payments, dispute resolution, AI adjudication,
consensus verification, freelancing, trustless settlement
