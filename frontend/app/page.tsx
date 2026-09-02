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
    <div className="pb-16">
      {/* ---------------- Hero — Apple-style centered ---------------- */}
      <section className="mx-auto max-w-3xl pt-16 text-center sm:pt-24">
        <p className="text-[17px] font-semibold text-verdict-600">
          GenLayer Intelligent Contract
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.07] tracking-tight text-ink-50 sm:text-[56px]">
          Trustless milestone
          <br />
          escrow.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[19px] leading-relaxed text-ink-400">
          AI-powered on-chain adjudication. A client funds a milestone and
          writes acceptance criteria in plain language — the network decides
          when the work is done.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/create"
            className="btn-pill bg-verdict-400 px-6 py-3 text-[15px] font-medium text-white hover:bg-verdict-600"
          >
            Create a milestone
          </Link>
          <Link
            href="/dashboard"
            className="text-[15px] text-verdict-600 transition-colors hover:text-verdict-500 hover:underline"
          >
            Open dashboard ›
          </Link>
        </div>
      </section>

      {/* ---------------- Feature trio ---------------- */}
      <section className="mx-auto mt-16 max-w-5xl">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            ["Escrow", "Real GEN held by the contract until a consensus verdict settles it."],
            ["Judgment", "LLM evaluation of natural-language acceptance criteria, criterion by criterion."],
            ["Consensus", "Validators independently re-run the evaluation; the decision must reproduce."],
          ].map(([term, def]) => (
            <div
              key={term}
              className="rounded-apple bg-white px-6 py-6 shadow-card"
            >
              <dt className="text-[15px] font-semibold text-ink-50">
                {term}
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-ink-400">
                {def}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------- Trust problem ---------------- */}
      <section className="mx-auto mt-20 max-w-5xl">
        <h2 className="text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
          The trust problem.
        </h2>
        <p className="mt-3 max-w-2xl text-[17px] text-ink-400">
          Paying for digital work before you can verify it — and adjudicating
          it after — is a human problem every platform re-solves with humans.
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {TRUST_PROBLEMS.map(({ q, a }) => (
            <div
              key={q}
              className="rounded-apple bg-white p-6 shadow-card"
            >
              <p className="text-[15px] font-semibold leading-snug text-ink-50">
                {q}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-400">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Adjudication pipeline ---------------- */}
      <section className="mx-auto mt-20 max-w-5xl">
        <h2 className="text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
          How adjudication works.
        </h2>
        <p className="mt-3 max-w-2xl text-[17px] text-ink-400">
          The important part is not “AI decides.” It is that the AI evaluation
          happens inside an Intelligent Contract, and GenLayer validators must
          reach consensus on the result before any money can move.
        </p>
        <div className="mt-10 rounded-apple bg-white p-8 shadow-card sm:p-10">
          <ol className="mx-auto max-w-2xl space-y-0">
            {PIPELINE.map((step) => (
              <li key={step.n} className="relative flex gap-5 pb-8 last:pb-0">
                <div className="flex flex-col items-center">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-verdict-400/10 text-xs font-semibold text-verdict-600">
                    {step.n}
                  </span>
                  {step.n < PIPELINE.length && (
                    <span
                      aria-hidden
                      className="mt-1.5 w-px flex-1 bg-black/[0.09]"
                    />
                  )}
                </div>
                <div className="pt-1">
                  <p className="text-[15px] font-semibold text-ink-50">
                    {step.title}
                  </p>
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-400">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-4 rounded-apple bg-white p-6 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
            Why the split matters
          </p>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-400">
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
      <section className="mx-auto mt-20 max-w-5xl">
        <h2 className="text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
          Disputes, honestly framed.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-apple bg-white p-6 shadow-card">
            <p className="text-[15px] font-semibold text-ink-50">
              Application dispute
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-400">
              Either party can dispute a verdict during the dispute window.
              The dispute does not overwrite anything: the original decision,
              evidence, and reasoning stay on-chain, and a fresh consensus
              round re-adjudicates everything with the dispute context added.
            </p>
          </div>
          <div className="rounded-apple bg-white p-6 shadow-card">
            <p className="text-[15px] font-semibold text-ink-50">
              Protocol finality
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-400">
              Separately, GenLayer's Optimistic Democracy gives every
              transaction an appeal window at the protocol level before it
              becomes final. MilestoneJudge releases escrow only after both
              windows are respected.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="mx-auto mt-20 max-w-5xl rounded-apple bg-ink-50 px-8 py-14 text-center text-white shadow-pop sm:px-12">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Put your milestone in front of the network.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[17px] text-white/60">
          Define criteria in plain language, fund the escrow, and let
          validator consensus — not a platform moderator — decide whether the
          work is done.
        </p>
        <Link
          href="/create"
          className="btn-pill mt-7 inline-block bg-white px-6 py-3 text-[15px] font-medium text-ink-50 hover:bg-white/90"
        >
          Create a milestone
        </Link>
      </section>
    </div>
  );
}
