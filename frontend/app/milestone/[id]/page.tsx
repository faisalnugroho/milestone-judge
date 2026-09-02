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
    "w-full rounded border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-400 focus:border-verdict-500/60 focus:outline-none";
  const btnCls =
    "rounded border border-verdict-500/70 bg-verdict-500/15 px-4 py-2 text-sm font-medium text-verdict-400 transition-colors hover:bg-verdict-500/25 disabled:cursor-not-allowed disabled:opacity-40";
  const ghostBtn =
    "rounded border border-ink-600 px-4 py-2 text-sm text-ink-200 transition-colors hover:border-ink-500 hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-40";

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
    <div className="space-y-6">
      {/* ---------------- header ---------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink-400">#{m.id}</span>
            <StatusBadge status={m.status} />
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-50">
            {m.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-400">{m.description}</p>
        </div>
        <Card className="px-4 py-3 text-right">
          <SectionLabel>Escrow</SectionLabel>
          <GenAmount wei={m.amount_wei} size="lg" />
          <p className="mt-1 font-mono text-[11px] text-ink-400">
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
          You are the <span className="text-verdict-400">{role}</span> of this
          milestone.
        </p>
      )}

      {/* ---------------- parties + timing ---------------- */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <SectionLabel>Client</SectionLabel>
          <a
            href={explorerAddress(m.client)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-ink-200 hover:text-verdict-400"
          >
            {shortAddress(m.client, 6)}
          </a>
        </Card>
        <Card className="p-4">
          <SectionLabel>Worker</SectionLabel>
          <a
            href={explorerAddress(m.worker)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-ink-200 hover:text-verdict-400"
          >
            {shortAddress(m.worker, 6)}
          </a>
        </Card>
        <Card className="p-4">
          <SectionLabel>Deadline</SectionLabel>
          <p className="text-xs text-ink-200">{formatEpoch(m.deadline_epoch)}</p>
          <p className="mt-0.5 text-[11px] text-ink-400">
            {timeLeft(m.deadline_epoch)}
          </p>
        </Card>
        <Card className="p-4">
          <SectionLabel>Dispute window</SectionLabel>
          <p className="text-xs text-ink-200">
            {m.dispute_deadline ? formatEpoch(m.dispute_deadline) : "—"}
          </p>
          {disputeWindowOpen && (
            <p className="mt-0.5 text-[11px] text-verdict-400">
              {timeLeft(m.dispute_deadline)}
            </p>
          )}
        </Card>
      </div>

      {/* ---------------- criteria ---------------- */}
      <Card className="p-5">
        <SectionLabel>Acceptance criteria</SectionLabel>
        <ul className="space-y-2">
          {criteria.map((c) => {
            const verdictStatus = (m.verdict as { statuses?: { id: string; status: string }[] })
              .statuses?.find((s) => s.id === c.id);
            return (
              <li
                key={c.id}
                className="flex items-start justify-between gap-3 rounded border border-ink-700 bg-ink-950 px-3 py-2"
              >
                <div>
                  <span className="font-mono text-[11px] text-ink-400">
                    [{c.id}]
                  </span>{" "}
                  <span className="text-sm text-ink-100">{c.text}</span>
                  <span
                    className={`ml-2 rounded px-1 py-0.5 font-mono text-[10px] uppercase ${
                      c.mandatory
                        ? "bg-verdict-500/15 text-verdict-400"
                        : "bg-ink-800 text-ink-400"
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
      <Card className="p-5">
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
                className="rounded border border-ink-700 bg-ink-950 p-3 transition-colors hover:border-ink-600"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-300">
                    {e.kind}
                  </span>
                  <span className="font-mono text-[10px] text-ink-500">
                    {formatEpoch(e.at)}
                  </span>
                </div>
                <p className="mt-2 truncate font-mono text-xs text-ink-200">
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
          <div className="mt-4 rounded border border-ink-700 bg-ink-950 p-3">
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
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionLabel>Adjudication</SectionLabel>
            <div className="flex items-center gap-2">
              <DecisionBadge decision={history[history.length - 1].decision} />
              <span className="font-mono text-[11px] text-ink-400">
                round {history[history.length - 1].round} ·{" "}
                {history[history.length - 1].trigger} · quality{" "}
                {history[history.length - 1].evidence_quality}
              </span>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-300">
            {history[history.length - 1].summary}
          </p>
          <p className="mt-2 font-mono text-[11px] text-ink-500">
            rule: {history[history.length - 1].rule}
          </p>
          <div className="mt-4 space-y-2">
            {history[history.length - 1].statuses.map((s) => {
              const c = criteria.find((x) => x.id === s.id);
              return (
                <div
                  key={s.id}
                  className="rounded border border-ink-700 bg-ink-950 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-ink-100">
                      <span className="font-mono text-[11px] text-ink-400">
                        [{s.id}]
                      </span>{" "}
                      {c?.text ?? ""}
                    </span>
                    <CriterionStatusPill status={s.status} />
                  </div>
                  {s.evidence && (
                    <p className="mt-1 text-xs text-ink-400">
                      evidence: {s.evidence}
                    </p>
                  )}
                  {s.reason && (
                    <p className="mt-0.5 text-xs text-ink-500">
                      reason: {s.reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {history.length > 1 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-ink-300">
                Earlier rounds ({history.length - 1})
              </summary>
              <div className="mt-2 space-y-3">
                {history.slice(0, -1).map((h) => (
                  <div
                    key={h.round}
                    className="rounded border border-ink-800 bg-ink-950 px-3 py-2"
                  >
                    <p className="font-mono text-[11px] text-ink-400">
                      round {h.round} ({h.trigger}) → {h.decision}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">{h.summary}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
          <p className="mt-4 font-mono text-[10px] text-ink-500">
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
        <Card className="p-5">
          <SectionLabel>Dispute</SectionLabel>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={`DISPUTE_${dispute.status}`} />
            <span className="font-mono text-[11px] text-ink-400">
              opened {formatEpoch(dispute.opened_at)} by{" "}
              {shortAddress(dispute.opened_by, 4)} · original decision{" "}
              {dispute.original_decision}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-300">
            {dispute.reason}
          </p>
          {dispute.evidence.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {dispute.evidence.map((e, i) => (
                <a
                  key={i}
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-[11px] text-ink-300 hover:border-ink-600"
                >
                  [{e.kind}] {e.url.slice(0, 48)}…
                </a>
              ))}
            </div>
          )}
          {dispute.status === "RESOLVED" && dispute.resolution.decision && (
            <div className="mt-4 rounded border border-ink-700 bg-ink-950 px-3 py-2">
              <div className="flex items-center gap-2">
                <DecisionBadge decision={dispute.resolution.decision} />
                <span className="font-mono text-[11px] text-ink-400">
                  resolved {formatEpoch(dispute.resolution.at ?? "0")}
                </span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ---------------- timeline ---------------- */}
      <Card className="p-5">
        <SectionLabel>Timeline</SectionLabel>
        <ol className="space-y-2">
          {m.timeline.map((ev, i) => (
            <li key={i} className="flex items-baseline gap-3">
              <span className="w-36 shrink-0 font-mono text-[11px] text-ink-500 tabular-nums">
                {formatEpoch(ev.t)}
              </span>
              <span className="font-mono text-[11px] text-verdict-400/80">
                {ev.event}
              </span>
              <span className="font-mono text-[10px] text-ink-500">
                by {shortAddress(ev.actor, 4)}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {/* ---------------- actions ---------------- */}
      <Card className="space-y-5 p-5">
        <SectionLabel>Actions</SectionLabel>
        <TxTracker tx={tx} />
        {actionError && (
          <p className="rounded border border-fail/40 bg-[#2a1214] px-3 py-2 text-xs text-[#f08a8d]">
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
                className={`${inputCls} font-mono`}
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
          <div className="space-y-3 border-t border-ink-700 pt-4">
            <SectionLabel>Dispute this decision</SectionLabel>
            <textarea
              className={`${inputCls} min-h-[60px]`}
              placeholder="Why do you believe this verdict is wrong? (min 10 chars)"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            />
            <input
              className={`${inputCls} font-mono`}
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
          <div className="space-y-3 border-t border-ink-700 pt-4">
            <SectionLabel>Resolve dispute</SectionLabel>
            <p className="text-sm text-ink-300">
              Re-adjudicates ALL evidence (original + dispute) under a fresh
              consensus round, then settles the escrow per the new verdict.
            </p>
            <button
              className={btnCls}
              disabled={!write || tx.phase !== "idle"}
              onClick={() => run((c) => c.resolveDispute(m.id, setTx))}
            >
              Trigger dispute resolution
            </button>
          </div>
        )}

        {canFinalize && (
          <div className="space-y-3 border-t border-ink-700 pt-4">
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
          <div className="space-y-3 border-t border-ink-700 pt-4">
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
        <p className="text-center font-mono text-[11px] text-ink-500">
          <a
            href={explorerTx(tx.hash)}
            target="_blank"
            rel="noreferrer"
            className="hover:text-verdict-400"
          >
            view transaction on explorer ↗
          </a>
        </p>
      )}
    </div>
  );
}
