"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet, useWriteContract } from "@/lib/wallet";
import {
  getReadContract,
  explorerAddress,
  explorerTx,
} from "@/lib/contract";
import type {
  AdjudicationSnapshot,
  Criterion,
  DisputeRecord,
  Milestone,
  TxState,
} from "@/lib/types";
import {
  Card,
  CriterionStatusPill,
  DecisionBadge,
  EmptyState,
  GenAmount,
  SectionLabel,
  StatusBadge,
  TxTracker,
} from "@/components/ui";
import { formatEpoch, shortAddress, timeLeft } from "@/lib/money";

const KINDS = ["WEBSITE", "GITHUB", "DOCUMENTATION", "API", "OTHER"] as const;

export default function MilestoneDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { address, isConnected } = useWallet();
  const write = useWriteContract();

  const [m, setM] = useState<Milestone | null>(null);
  const [history, setHistory] = useState<AdjudicationSnapshot[]>([]);
  const [dispute, setDispute] = useState<DisputeRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<TxState>({ phase: "idle" });
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    const contract = getReadContract();
    if (!contract) {
      setError("Contract not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS.");
      return;
    }
    try {
      const [rec, hist, disp] = await Promise.all([
        contract.getMilestone(id),
        contract.getAdjudications(id),
        contract.getDispute(id),
      ]);
      if ("error" in rec) {
        setError("Milestone not found.");
        setM(null);
        return;
      }
      setM(rec);
      setHistory(hist);
      setDispute("error" in disp ? null : disp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load milestone");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const criteria: Criterion[] = useMemo(() => {
    if (!m) return [];
    try {
      return JSON.parse(m.criteria);
    } catch {
      return [];
    }
  }, [m]);

  const role = useMemo(() => {
    if (!m || !address) return null;
    if (m.client.toLowerCase() === address.toLowerCase()) return "client";
    if (m.worker.toLowerCase() === address.toLowerCase()) return "worker";
    return null;
  }, [m, address]);

  const nowSec = Math.floor(Date.now() / 1000);
  const disputeWindowOpen =
    m &&
    ["APPROVED", "REJECTED", "INSUFFICIENT_EVIDENCE"].includes(m.status) &&
    !dispute &&
    Number(m.dispute_deadline) > nowSec;
  // 24h on-chain response window: resolve_dispute reverts before it ends,
  // rebuttal evidence can be added by BOTH parties any time the dispute is OPEN.
  const responseWindowOpen =
    m &&
    m.status === "DISPUTED" &&
    dispute?.status === "OPEN" &&
    Number(dispute.response_deadline) > nowSec;
  const canFinalize =
    m &&
    ["APPROVED", "REJECTED", "INSUFFICIENT_EVIDENCE"].includes(m.status) &&
    !dispute &&
    Number(m.dispute_deadline) <= nowSec;

  // ---------------- action form states ----------------
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceKind, setEvidenceKind] = useState<string>("WEBSITE");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [statement, setStatement] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeUrl, setDisputeUrl] = useState("");
  const [rebuttalUrl, setRebuttalUrl] = useState("");
  const [rebuttalKind, setRebuttalKind] = useState<string>("WEBSITE");
  const [rebuttalNote, setRebuttalNote] = useState("");

  async function run(fn: (c: NonNullable<typeof write>) => Promise<unknown>) {
    if (!write) return;
    setActionError(null);
    setTx({ phase: "signing" });
    try {
      await fn(write);
      await load();
      setTx((s) => ({ ...s }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
      setTx({ phase: "failed", error: e instanceof Error ? e.message : "" });
    }
  }

  const inputCls =
    "w-full rounded-[12px] border border-black/10 bg-white px-3.5 py-2.5 text-[15px] text-ink-50 placeholder:text-ink-400 transition-shadow focus:border-verdict-400";
  const btnCls =
    "btn-pill bg-verdict-400 px-5 py-2.5 text-sm font-medium text-white hover:bg-verdict-600 disabled:cursor-not-allowed disabled:opacity-30";
  const ghostBtn =
    "rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-medium text-ink-50 shadow-card transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-40";

  if (error && !m) {
    return (
      <EmptyState
        title={error}
        hint="Check the milestone id and contract configuration."
        action={
          <Link href="/dashboard" className={ghostBtn}>
            Back to dashboard
          </Link>
        }
      />
    );
  }
  if (!m) return <p className="text-sm text-ink-400">Loading…</p>;

  return (
    <div className="space-y-5">
      {/* ---------------- header ---------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs text-ink-400">#{m.id}</span>
            <StatusBadge status={m.status} />
          </div>
          <h1 className="mt-2.5 text-3xl font-semibold tracking-tight text-ink-50">
            {m.title}
          </h1>
          <p className="mt-1.5 max-w-2xl text-[15px] text-ink-400">{m.description}</p>
        </div>
        <Card className="px-6 py-4 text-right">
          <SectionLabel>Escrow</SectionLabel>
          <GenAmount wei={m.amount_wei} size="lg" />
          <p className="mt-1 text-xs text-ink-400">
            {m.balance_wei === m.amount_wei
              ? "held by contract"
              : m.balance_wei === "0"
                ? "settled"
                : `balance ${m.balance_wei} wei`}
          </p>
        </Card>
      </div>

      {role && (
        <p className="text-xs text-ink-400">
          You are the <span className="font-medium text-verdict-600">{role}</span> of this
          milestone.
        </p>
      )}

      {/* ---------------- parties + timing ---------------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <SectionLabel>Client</SectionLabel>
          <a
            href={explorerAddress(m.client)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-ink-200 transition-colors hover:text-verdict-600"
          >
            {shortAddress(m.client, 6)}
          </a>
        </Card>
        <Card className="p-5">
          <SectionLabel>Worker</SectionLabel>
          <a
            href={explorerAddress(m.worker)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-ink-200 transition-colors hover:text-verdict-600"
          >
            {shortAddress(m.worker, 6)}
          </a>
        </Card>
        <Card className="p-5">
          <SectionLabel>Deadline</SectionLabel>
          <p className="text-xs text-ink-200">{formatEpoch(m.deadline_epoch)}</p>
          <p className="mt-0.5 text-[11px] text-ink-400">
            {timeLeft(m.deadline_epoch)}
          </p>
        </Card>
        <Card className="p-5">
          <SectionLabel>Dispute window</SectionLabel>
          <p className="text-xs text-ink-200">
            {m.dispute_deadline ? formatEpoch(m.dispute_deadline) : "—"}
          </p>
          {disputeWindowOpen && (
            <p className="mt-0.5 text-[11px] text-verdict-600">
              {timeLeft(m.dispute_deadline)}
            </p>
          )}
        </Card>
      </div>

      {/* ---------------- criteria ---------------- */}
      <Card className="p-6">
        <SectionLabel>Acceptance criteria</SectionLabel>
        <ul className="space-y-2.5">
          {criteria.map((c) => {
            const verdictStatus = (m.verdict as { statuses?: { id: string; status: string }[] })
              .statuses?.find((s) => s.id === c.id);
            return (
              <li
                key={c.id}
                className="flex items-start justify-between gap-3 rounded-[12px] bg-black/[0.03] px-4 py-3"
              >
                <div>
                  <span className="font-mono text-[11px] text-ink-400">
                    [{c.id}]
                  </span>{" "}
                  <span className="text-sm text-ink-50">{c.text}</span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      c.mandatory
                        ? "bg-verdict-400/10 text-verdict-600"
                        : "bg-black/[0.05] text-ink-400"
                    }`}
                  >
                    {c.mandatory ? "mandatory" : "advisory"}
                  </span>
                </div>
                {verdictStatus && (
                  <CriterionStatusPill status={verdictStatus.status} />
                )}
              </li>
            );
          })}
        </ul>
        {m.evidence_requirements && (
          <p className="mt-3 text-xs text-ink-400">
            Evidence requirements: {m.evidence_requirements}
          </p>
        )}
      </Card>

      {/* ---------------- evidence ---------------- */}
      <Card className="p-6">
        <SectionLabel>Submitted evidence</SectionLabel>
        {m.evidence.length === 0 ? (
          <p className="text-sm text-ink-400">
            No evidence submitted yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {m.evidence.map((e, i) => (
              <a
                key={i}
                href={e.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-[12px] bg-black/[0.03] p-4 transition-colors hover:bg-black/[0.06]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-500 shadow-card">
                    {e.kind}
                  </span>
                  <span className="text-[10px] text-ink-400">
                    {formatEpoch(e.at)}
                  </span>
                </div>
                <p className="mt-2 truncate font-mono text-xs text-verdict-600">
                  {e.url}
                </p>
                {e.note && (
                  <p className="mt-1 line-clamp-2 text-xs text-ink-400">
                    {e.note}
                  </p>
                )}
              </a>
            ))}
          </div>
        )}
        {m.worker_statement && (
          <div className="mt-4 rounded-[12px] bg-black/[0.03] p-4">
            <SectionLabel>Worker statement</SectionLabel>
            <p className="text-sm leading-relaxed text-ink-300">
              {m.worker_statement}
            </p>
          </div>
        )}
        {m.evidence_urls_client.length > 0 && (
          <p className="mt-3 text-xs text-ink-400">
            Client references: {m.evidence_urls_client.join(", ")}
          </p>
        )}
      </Card>

      {/* ---------------- adjudication result ---------------- */}
      {history.length > 0 && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionLabel>Adjudication</SectionLabel>
            <div className="flex flex-wrap items-center gap-3">
              <DecisionBadge decision={history[history.length - 1].decision} />
              <span className="text-xs text-ink-400">
                round {history[history.length - 1].round} ·{" "}
                {history[history.length - 1].trigger} · quality{" "}
                {history[history.length - 1].evidence_quality}
              </span>
            </div>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-300">
            {history[history.length - 1].summary}
          </p>
          <p className="mt-2 font-mono text-[11px] text-ink-400">
            rule: {history[history.length - 1].rule}
          </p>
          <div className="mt-5 space-y-2.5">
            {history[history.length - 1].statuses.map((s) => {
              const c = criteria.find((x) => x.id === s.id);
              return (
                <div
                  key={s.id}
                  className="rounded-[12px] bg-black/[0.03] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-ink-50">
                      <span className="font-mono text-[11px] text-ink-400">
                        [{s.id}]
                      </span>{" "}
                      {c?.text ?? ""}
                    </span>
                    <CriterionStatusPill status={s.status} />
                  </div>
                  {s.evidence && (
                    <p className="mt-1.5 text-xs text-ink-400">
                      evidence: {s.evidence}
                    </p>
                  )}
                  {s.reason && (
                    <p className="mt-1 text-xs text-ink-400/80">
                      reason: {s.reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {history.length > 1 && (
            <details className="mt-5">
              <summary className="cursor-pointer text-xs font-medium text-verdict-600">
                Earlier rounds ({history.length - 1})
              </summary>
              <div className="mt-3 space-y-3">
                {history.slice(0, -1).map((h) => (
                  <div
                    key={h.round}
                    className="rounded-[12px] bg-black/[0.02] px-4 py-3"
                  >
                    <p className="text-[11px] text-ink-400">
                      round {h.round} ({h.trigger}) → {h.decision}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">{h.summary}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
          <p className="mt-5 text-[10px] text-ink-400/80">
            decided by GenLayer validator consensus —{" "}
            {["APPROVED", "REJECTED", "INSUFFICIENT_EVIDENCE"].includes(
              m.status
            )
              ? `dispute window open until ${formatEpoch(m.dispute_deadline)}`
              : "window closed"}
          </p>
        </Card>
      )}

      {/* ---------------- dispute ---------------- */}
      {dispute && (
        <Card className="p-6">
          <SectionLabel>Dispute</SectionLabel>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={`DISPUTE_${dispute.status}`} />
            <span className="text-xs text-ink-400">
              opened {formatEpoch(dispute.opened_at)} by{" "}
              {shortAddress(dispute.opened_by, 4)} · original decision{" "}
              {dispute.original_decision}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-300">
            {dispute.reason}
          </p>

          {/* dispute evidence with per-item provenance */}
          {dispute.evidence.length > 0 && (
            <div className="mt-4 space-y-2">
              <SectionLabel>Dispute / rebuttal evidence</SectionLabel>
              {dispute.evidence.map((e, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[12px] bg-black/[0.03] px-4 py-2.5"
                >
                  <span className="rounded-full bg-verdict-400/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-verdict-600">
                    {e.source === "DISPUTE" ? "rebuttal" : (e.source ?? "evidence")}
                  </span>
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] text-ink-300 underline decoration-black/20 underline-offset-2 transition-colors hover:text-verdict-600"
                  >
                    {e.url.length > 56 ? `${e.url.slice(0, 56)}…` : e.url}
                  </a>
                  <span className="text-[11px] text-ink-400">
                    by {e.actor ? shortAddress(e.actor, 4) : "unknown"}
                    {e.actor
                      ? e.actor.toLowerCase() === m.client.toLowerCase()
                        ? " (client)"
                        : e.actor.toLowerCase() === m.worker.toLowerCase()
                          ? " (worker)"
                          : ""
                      : ""}{" "}
                    · {e.at ? formatEpoch(e.at) : "—"}
                  </span>
                  {e.note && (
                    <span className="w-full text-[11px] text-ink-400">
                      note: {e.note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* response window countdown */}
          {dispute.status === "OPEN" && (
            <div
              className={`mt-4 rounded-[12px] px-4 py-3 ${
                responseWindowOpen
                  ? "bg-verdict-400/[0.06]"
                  : "bg-black/[0.03]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs font-medium text-ink-50">
                  Response window
                </span>
                {responseWindowOpen ? (
                  <span className="text-xs text-verdict-600">
                    open for {timeLeft(dispute.response_deadline)} — both
                    parties may add rebuttal evidence; resolution is
                    blocked on-chain until it closes.
                  </span>
                ) : (
                  <span className="text-xs text-ink-400">
                    closed {formatEpoch(dispute.response_deadline)} — the
                    dispute can now be resolved by a fresh consensus round.
                  </span>
                )}
              </div>
            </div>
          )}

          {dispute.status === "RESOLVED" && dispute.resolution.decision && (
            <div className="mt-4 rounded-[12px] bg-black/[0.03] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <DecisionBadge decision={dispute.resolution.decision} />
                <span className="text-xs text-ink-400">
                  resolved {formatEpoch(dispute.resolution.at ?? "0")}
                </span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ---------------- timeline ---------------- */}
      <Card className="p-6">
        <SectionLabel>Timeline</SectionLabel>
        <ol className="space-y-2.5">
          {m.timeline.map((ev, i) => (
            <li key={i} className="flex items-baseline gap-3">
              <span className="w-36 shrink-0 text-[11px] tabular-nums text-ink-400">
                {formatEpoch(ev.t)}
              </span>
              <span className="font-mono text-[11px] text-verdict-600">
                {ev.event}
              </span>
              <span className="font-mono text-[10px] text-ink-400">
                by {shortAddress(ev.actor, 4)}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {/* ---------------- actions ---------------- */}
      <Card className="space-y-5 p-6">
        <SectionLabel>Actions</SectionLabel>
        <TxTracker tx={tx} />
        {actionError && (
          <p className="rounded-[12px] bg-fail/[0.07] px-4 py-3 text-xs text-fail">
            {actionError}
          </p>
        )}

        {!isConnected && (
          <p className="text-sm text-ink-400">
            Connect your wallet to interact with this milestone.
          </p>
        )}

        {isConnected && role === "client" && m.status === "CREATED" && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={btnCls}
              disabled={!write || tx.phase !== "idle"}
              onClick={() =>
                run((c) => c.fundMilestone(m.id, BigInt(m.amount_wei), setTx))
              }
            >
              Fund escrow ({m.amount_wei.slice(0, -18) || "0"} GEN)
            </button>
            <button
              className={ghostBtn}
              disabled={!write || tx.phase !== "idle"}
              onClick={() => run((c) => c.cancelMilestone(m.id, setTx))}
            >
              Cancel milestone
            </button>
          </div>
        )}

        {isConnected && role === "worker" &&
          ["FUNDED", "REJECTED", "INSUFFICIENT_EVIDENCE"].includes(m.status) && (
          <div className="space-y-3">
            <SectionLabel>
              {m.status === "FUNDED" ? "Submit evidence" : "Resubmit evidence"}
            </SectionLabel>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <input
                className={`${inputCls} font-mono text-sm`}
                placeholder="https://your-deployment.example.com"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
              />
              <select
                className={inputCls}
                value={evidenceKind}
                onChange={(e) => setEvidenceKind(e.target.value)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <input
              className={inputCls}
              placeholder="Note for this evidence (optional)"
              value={evidenceNote}
              onChange={(e) => setEvidenceNote(e.target.value)}
            />
            <textarea
              className={`${inputCls} min-h-[60px]`}
              placeholder="Statement: how does this evidence prove the milestone is complete? (min 10 chars)"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
            />
            <p className="text-xs text-ink-400">
              Evidence must be public — validators fetch these URLs
              themselves. Never include private data or secrets.
            </p>
            <button
              className={btnCls}
              disabled={
                !write ||
                tx.phase !== "idle" ||
                !/^https?:\/\//.test(evidenceUrl.trim()) ||
                statement.trim().length < 10
              }
              onClick={() => {
                const evidenceJson = JSON.stringify([
                  {
                    url: evidenceUrl.trim(),
                    kind: evidenceKind,
                    note: evidenceNote.trim(),
                  },
                ]);
                setEvidenceUrl("");
                setEvidenceNote("");
                run((c) =>
                  c.submitEvidence(m.id, evidenceJson, statement.trim(), setTx)
                );
              }}
            >
              Submit evidence
            </button>
          </div>
        )}

        {isConnected && role && m.status === "SUBMITTED" && (
          <div className="space-y-3">
            <p className="text-sm text-ink-300">
              Evidence is in. Either party can trigger adjudication — the
              contract runs the LLM evaluation under full validator
              consensus (~45–60s typical).
            </p>
            <button
              className={btnCls}
              disabled={!write || tx.phase !== "idle"}
              onClick={() =>
                run((c) => c.startAdjudication(m.id, setTx))
              }
            >
              Start adjudication
            </button>
          </div>
        )}

        {disputeWindowOpen && role && (
          <div className="space-y-3 border-t border-black/[0.08] pt-5">
            <SectionLabel>Dispute this decision</SectionLabel>
            <textarea
              className={`${inputCls} min-h-[60px]`}
              placeholder="Why do you believe this verdict is wrong? (min 10 chars)"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            />
            <input
              className={`${inputCls} font-mono text-sm`}
              placeholder="Optional evidence URL to support the dispute"
              value={disputeUrl}
              onChange={(e) => setDisputeUrl(e.target.value)}
            />
            <button
              className={btnCls}
              disabled={
                !write ||
                tx.phase !== "idle" ||
                disputeReason.trim().length < 10 ||
                (disputeUrl.trim() !== "" &&
                  !/^https?:\/\//.test(disputeUrl.trim()))
              }
              onClick={() => {
                const urls = disputeUrl.trim();
                run((c) =>
                  c.openDispute(
                    m.id,
                    disputeReason.trim(),
                    urls ? JSON.stringify([{ url: urls, kind: "OTHER" }]) : "[]",
                    setTx
                  )
                );
              }}
            >
              Open dispute
            </button>
          </div>
        )}

        {dispute && dispute.status === "OPEN" && role && (
          <div className="space-y-3 border-t border-black/[0.08] pt-5">
            <SectionLabel>
              {responseWindowOpen
                ? "Add rebuttal evidence"
                : "Add more dispute evidence"}
            </SectionLabel>
            <p className="text-sm text-ink-300">
              {responseWindowOpen
                ? "The 24h response window is open — both the client and the worker can submit rebuttal URLs. The contract will re-adjudicate ALL evidence (original + dispute) with a fair, reserved fetch budget for rebuttal items."
                : "The response window has closed, but evidence can still be appended before the dispute is resolved."}
            </p>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <input
                className={`${inputCls} font-mono text-sm`}
                placeholder="https://rebuttal-evidence.example.com"
                value={rebuttalUrl}
                onChange={(e) => setRebuttalUrl(e.target.value)}
              />
              <select
                className={inputCls}
                value={rebuttalKind}
                onChange={(e) => setRebuttalKind(e.target.value)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <input
              className={inputCls}
              placeholder="Note for this rebuttal (optional)"
              value={rebuttalNote}
              onChange={(e) => setRebuttalNote(e.target.value)}
            />
            <button
              className={btnCls}
              disabled={
                !write ||
                tx.phase !== "idle" ||
                !/^https?:\/\//.test(rebuttalUrl.trim())
              }
              onClick={() => {
                const evidenceJson = JSON.stringify([
                  {
                    url: rebuttalUrl.trim(),
                    kind: rebuttalKind,
                    note: rebuttalNote.trim(),
                  },
                ]);
                setRebuttalUrl("");
                setRebuttalNote("");
                run((c) =>
                  c.submitDisputeEvidence(m.id, evidenceJson, setTx)
                );
              }}
            >
              Submit rebuttal evidence
            </button>
          </div>
        )}

        {dispute && dispute.status === "OPEN" && role && (
          <div className="space-y-3 border-t border-black/[0.08] pt-5">
            <SectionLabel>Resolve dispute</SectionLabel>
            {responseWindowOpen ? (
              <p className="text-sm text-ink-400">
                Resolution is blocked on-chain until the response window
                closes ({formatEpoch(dispute.response_deadline)},{" "}
                {timeLeft(dispute.response_deadline)} left). This gives both
                parties time to add rebuttal evidence before the fresh
                consensus round runs.
              </p>
            ) : (
              <>
                <p className="text-sm text-ink-300">
                  The response window has closed. Re-adjudicates ALL
                  evidence (original + dispute) under a fresh consensus
                  round, then settles the escrow per the new verdict.
                </p>
                <button
                  className={btnCls}
                  disabled={!write || tx.phase !== "idle"}
                  onClick={() => run((c) => c.resolveDispute(m.id, setTx))}
                >
                  Trigger dispute resolution
                </button>
              </>
            )}
          </div>
        )}

        {canFinalize && (
          <div className="space-y-3 border-t border-black/[0.08] pt-5">
            <SectionLabel>Finalize</SectionLabel>
            <p className="text-sm text-ink-300">
              The dispute window has closed.{" "}
              {m.status === "APPROVED"
                ? "Finalizing releases the escrow to the worker."
                : "Finalizing refunds the escrow to the client."}
            </p>
            <button
              className={btnCls}
              disabled={!write || tx.phase !== "idle"}
              onClick={() => run((c) => c.finalizeMilestone(m.id, setTx))}
            >
              Finalize milestone
            </button>
          </div>
        )}

        {["CREATED", "FUNDED"].includes(m.status) &&
          Number(m.deadline_epoch) <= nowSec && (
          <div className="space-y-3 border-t border-black/[0.08] pt-5">
            <SectionLabel>Expired</SectionLabel>
            <p className="text-sm text-ink-300">
              The deadline passed without a worker submission. Anyone can
              trigger the expiry crank — the escrow returns to the client.
            </p>
            <button
              className={ghostBtn}
              disabled={!write || tx.phase !== "idle"}
              onClick={() => run((c) => c.markExpired(m.id, setTx))}
            >
              Trigger expiry
            </button>
          </div>
        )}
      </Card>

      {tx.hash && (
        <p className="text-center font-mono text-[11px] text-ink-400">
          <a
            href={explorerTx(tx.hash)}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-verdict-600"
          >
            view transaction on explorer ↗
          </a>
        </p>
      )}
    </div>
  );
}
