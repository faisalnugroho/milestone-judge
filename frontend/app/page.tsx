"use client";

import Link from "next/link";

const PIPELINE = [
  {
    n: 1,
    title: "Evidence submitted",
    body: "The worker files public URLs — a deployment, a pull request, a docs page — with a statement of how they prove completion.",
  },
  {
    n: 2,
    title: "Live sources retrieved",
    body: "The Intelligent Contract itself fetches each URL inside its non-deterministic execution block. Content is bounded and normalized.",
  },
  {
    n: 3,
    title: "AI evaluates each criterion",
    body: "An LLM judges every acceptance criterion independently: PASS, FAIL, or INSUFFICIENT_EVIDENCE — citing the exact evidence it relied on.",
  },
  {
    n: 4,
    title: "Validators independently verify",
    body: "Every validator re-fetches the same sources and re-runs the same evaluation. Nobody trusts the leader's answer.",
  },
  {
    n: 5,
    title: "Consensus reached",
    body: "GenLayer's Equivalence Principle compares the semantic decision — the per-criterion statuses — never the prose. Majority agrees or the transaction is undetermined.",
  },
  {
    n: 6,
    title: "Contract executes deterministic outcome",
    body: "Only after consensus, deterministic contract code derives APPROVED / REJECTED / INSUFFICIENT_EVIDENCE from the agreed statuses.",
  },
  {
    n: 7,
    title: "Escrow released or refunded",
    body: "The final state transition moves real GEN: to the worker on approval, back to the client on rejection. The contract never releases during consensus.",
  },
];

const TRUST_PROBLEMS = [
  {
    q: "The client must pay before knowing the work is real.",
    a: "Traditional platforms hold the money, but a human moderator decides whether it's done. MilestoneJudge holds the money in an Intelligent Contract — and lets the network decide.",
  },
  {
    q: "A plain smart contract can't read a deliverable.",
    a: "Deterministic code can check a number or a hash. It cannot check 'the deployed site implements the acceptance criteria'. That judgment is exactly what GenLayer's validator consensus exists to produce.",
  },
  {
    q: "A single AI call is not a neutral arbiter.",
    a: "One LLM answer is one party's opinion — whoever controls it, controls the money. Under GenLayer, the leader's verdict only counts if independent validators reproduce the same judgment from the same public evidence.",
  },
];

export default function LandingPage() {
  return (
    <div className="space-y-20 pb-10">
      {/* ---------------- Hero ---------------- */}
      <section className="pt-10 sm:pt-16">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-verdict-400">
          GenLayer Intelligent Contract
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-ink-50 sm:text-5xl">
          Trustless milestone escrow with AI-powered on-chain adjudication.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-300">
          A client funds a milestone and writes acceptance criteria in plain
          language. The worker submits public evidence. A GenLayer Intelligent
          Contract fetches that evidence, has an LLM evaluate every criterion,
          and reaches validator consensus on the verdict — then moves the
          escrow exactly as the rules require. No platform in the middle. No
          trusting a single AI answer.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/create"
            className="rounded border border-verdict-500/70 bg-verdict-500/15 px-5 py-2.5 text-sm font-medium text-verdict-400 transition-colors hover:bg-verdict-500/25"
          >
            Create a milestone
          </Link>
          <Link
            href="/dashboard"
            className="rounded border border-ink-600 px-5 py-2.5 text-sm text-ink-200 transition-colors hover:border-ink-500 hover:text-ink-100"
          >
            Open dashboard
          </Link>
        </div>
        <dl className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            ["Escrow", "Real GEN held by the contract until a consensus verdict settles it."],
            ["Judgment", "LLM evaluation of natural-language acceptance criteria, criterion by criterion."],
            ["Consensus", "Validators independently re-run the evaluation; the decision must reproduce."],
          ].map(([term, def]) => (
            <div
              key={term}
              className="rounded-lg border border-ink-700 bg-ink-900 px-4 py-4"
            >
              <dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                {term}
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-ink-300">
                {def}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------- Trust problem ---------------- */}
      <section>
        <h2 className="text-2xl font-semibold tracking-tight text-ink-50">
          The trust problem
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-400">
          Paying for digital work before you can verify it — and adjudicating
          it after — is a human problem every platform re-solves with humans.
        </p>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {TRUST_PROBLEMS.map(({ q, a }) => (
            <div
              key={q}
              className="rounded-lg border border-ink-700 bg-ink-900 p-5"
            >
              <p className="text-sm font-medium leading-snug text-ink-100">
                {q}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-400">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Adjudication pipeline (signature) ---------------- */}
      <section>
        <h2 className="text-2xl font-semibold tracking-tight text-ink-50">
          How adjudication works
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-400">
          The important part is not “AI decides.” It is that the AI evaluation
          happens inside an Intelligent Contract, and GenLayer validators must
          reach consensus on the result before any money can move.
        </p>
        <ol className="mt-8 space-y-0">
          {PIPELINE.map((step) => (
            <li key={step.n} className="relative flex gap-4 pb-6 last:pb-0">
              <div className="flex flex-col items-center">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-verdict-500/50 bg-ink-900 font-mono text-xs font-semibold text-verdict-400">
                  {step.n}
                </span>
                {step.n < PIPELINE.length && (
                  <span
                    aria-hidden
                    className="mt-1 w-px flex-1 bg-gradient-to-b from-verdict-500/40 to-ink-700"
                  />
                )}
              </div>
              <div className="pt-1">
                <p className="text-sm font-medium text-ink-100">
                  {step.title}
                </p>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-400">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 rounded-lg border border-ink-700 bg-ink-900 p-5">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
            Why the split matters
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-300">
            The non-deterministic block — web fetches and LLM calls — never
            writes storage and never moves funds. It can only return a
            structured verdict for the validators to check. Once consensus
            accepts that verdict, deterministic code derives the decision from
            per-criterion statuses and executes the escrow rules. An LLM can
            never directly cause a transfer.
          </p>
        </div>
      </section>

      {/* ---------------- Dispute / finality ---------------- */}
      <section>
        <h2 className="text-2xl font-semibold tracking-tight text-ink-50">
          Disputes, honestly framed
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-verdict-400">
              Application dispute
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">
              Either party can dispute a verdict during the dispute window.
              The dispute does not overwrite anything: the original decision,
              evidence, and reasoning stay on-chain, and a fresh consensus
              round re-adjudicates everything with the dispute context added.
            </p>
          </div>
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
              Protocol finality
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">
              Separately, GenLayer's Optimistic Democracy gives every
              transaction an appeal window at the protocol level before it
              becomes final. MilestoneJudge releases escrow only after both
              windows are respected.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="rounded-xl border border-verdict-500/30 bg-gradient-to-b from-verdict-500/10 to-transparent p-8">
        <h2 className="text-xl font-semibold tracking-tight text-ink-50">
          Put your milestone in front of the network.
        </h2>
        <p className="mt-2 max-w-xl text-sm text-ink-300">
          Define criteria in plain language, fund the escrow, and let
          validator consensus — not a platform moderator — decide whether the
          work is done.
        </p>
        <Link
          href="/create"
          className="mt-5 inline-block rounded border border-verdict-500/70 bg-verdict-500/15 px-5 py-2.5 text-sm font-medium text-verdict-400 transition-colors hover:bg-verdict-500/25"
        >
          Create a milestone
        </Link>
      </section>
    </div>
  );
}
