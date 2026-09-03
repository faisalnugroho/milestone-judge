"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet, useWriteContract } from "@/lib/wallet";
import { getReadContract } from "@/lib/contract";
import type { DisputeRecord, Milestone, TxState } from "@/lib/types";
import {
  Card,
  DecisionBadge,
  SectionLabel,
  StatusBadge,
  TxTracker,
} from "@/components/ui";
import { formatEpoch, shortAddress, timeLeft } from "@/lib/money";

const KINDS = ["WEBSITE", "GITHUB", "DOCUMENTATION", "API", "OTHER"] as const;

export default function DisputePage() {
  const { isConnected } = useWallet();
  const write = useWriteContract();
  const [mid, setMid] = useState("");
  const [record, setRecord] = useState<DisputeRecord | null>(null);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [url, setUrl] = useState("");
  const [tx, setTx] = useState<TxState>({ phase: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [rebuttalUrl, setRebuttalUrl] = useState("");
  const [rebuttalKind, setRebuttalKind] = useState<string>("WEBSITE");
  const [rebuttalNote, setRebuttalNote] = useState("");

  const lookup = useCallback(async (id: string) => {
    if (!/^\d+$/.test(id) || !getReadContract()) return;
    setLookupError(null);
    try {
      const contract = getReadContract();
      const [m, d] = await Promise.all([
        contract!.getMilestone(id),
        contract!.getDispute(id),
      ]);
      setMilestone("error" in m ? null : m);
      setRecord("error" in d ? null : d);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Lookup failed");
    }
  }, []);

  useEffect(() => {
    void lookup(mid);
  }, [mid, lookup]);

  const nowSec = Math.floor(Date.now() / 1000);
  const responseWindowOpen =
    record?.status === "OPEN" &&
    Number(record.response_deadline) > nowSec;

  const canDispute =
    isConnected &&
    !!write &&
    milestone &&
    ["APPROVED", "REJECTED", "INSUFFICIENT_EVIDENCE"].includes(
      milestone.status
    ) &&
    !record &&
    Number(milestone.dispute_deadline) > Math.floor(Date.now() / 1000);

  async function open() {
    if (!write || !canDispute) return;
    setError(null);
    const evidenceJson = url.trim()
      ? JSON.stringify([{ url: url.trim(), kind: "OTHER" }])
      : "[]";
    try {
      await write.openDispute(mid, reason.trim(), evidenceJson, setTx);
      await lookup(mid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open dispute");
    }
  }

  async function addRebuttal() {
    if (!write || !record) return;
    setError(null);
    try {
      await write.submitDisputeEvidence(
        mid,
        JSON.stringify([
          {
            url: rebuttalUrl.trim(),
            kind: rebuttalKind,
            note: rebuttalNote.trim(),
          },
        ]),
        setTx
      );
      setRebuttalUrl("");
      setRebuttalNote("");
      await lookup(mid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add evidence");
    }
  }

  async function resolve() {
    if (!write || !record) return;
    setError(null);
    try {
      await write.resolveDispute(mid, setTx);
      await lookup(mid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve dispute");
    }
  }

  const inputCls =
    "w-full rounded-[12px] border border-black/10 bg-white px-3.5 py-2.5 text-[15px] text-ink-50 placeholder:text-ink-400 transition-shadow focus:border-verdict-400";
  const btnCls =
    "btn-pill bg-verdict-400 px-5 py-2.5 text-sm font-medium text-white hover:bg-verdict-600 disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-50">
          Dispute a verdict
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-400">
          An application-level dispute: the original decision, evidence, and
          reasoning stay on-chain, and a fresh consensus round re-adjudicates
          everything with the dispute context added.
        </p>
      </div>

      <Card className="space-y-4 p-6">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-400">
            Milestone id
          </label>
          <input
            className={`${inputCls} w-32 font-mono text-sm`}
            value={mid}
            onChange={(e) => setMid(e.target.value)}
            placeholder="e.g. 3"
          />
        </div>
        {lookupError && (
          <p className="text-xs text-fail">{lookupError}</p>
        )}
      </Card>

      {milestone && (
        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={milestone.status} />
            <Link
              href={`/milestone/${milestone.id}`}
              className="text-sm font-medium text-ink-50 transition-colors hover:text-verdict-600"
            >
              #{milestone.id} {milestone.title}
            </Link>
            <DecisionBadge
              decision={
                (milestone.verdict as { decision?: string }).decision ??
                milestone.status
              }
            />
          </div>
          <p className="text-xs text-ink-400">
            dispute window ends {formatEpoch(milestone.dispute_deadline)}
          </p>

          {record ? (
            <div className="space-y-4 border-t border-black/[0.08] pt-4">
              <SectionLabel>Existing dispute</SectionLabel>
              <div className="flex items-center gap-2.5">
                <StatusBadge status={`DISPUTE_${record.status}`} />
                <span className="text-xs text-ink-400">
                  opened {formatEpoch(record.opened_at)} by{" "}
                  {shortAddress(record.opened_by, 4)}
                </span>
              </div>
              <p className="text-sm text-ink-300">{record.reason}</p>
              <p className="text-xs text-ink-400">
                original decision: {record.original_decision} (round{" "}
                {record.original_round})
              </p>

              {/* dispute evidence with provenance */}
              {record.evidence.length > 0 && (
                <div className="space-y-2">
                  <SectionLabel>Dispute / rebuttal evidence</SectionLabel>
                  {record.evidence.map((e, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[12px] bg-black/[0.03] px-4 py-2.5"
                    >
                      <span className="rounded-full bg-verdict-400/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-verdict-600">
                        {e.source === "DISPUTE"
                          ? "rebuttal"
                          : (e.source ?? "evidence")}
                      </span>
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[11px] text-ink-300 underline decoration-black/20 underline-offset-2 transition-colors hover:text-verdict-600"
                      >
                        {e.url.length > 56
                          ? `${e.url.slice(0, 56)}…`
                          : e.url}
                      </a>
                      <span className="text-[11px] text-ink-400">
                        by {shortAddress(e.actor, 4)} · {formatEpoch(e.at)}
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

              {/* response window + gated actions */}
              {record.status === "OPEN" && (
                <div className="space-y-4">
                  <div
                    className={`rounded-[12px] px-4 py-3 ${
                      responseWindowOpen
                        ? "bg-verdict-400/[0.06]"
                        : "bg-black/[0.03]"
                    }`}
                  >
                    <p className="text-xs font-medium text-ink-50">
                      Response window
                    </p>
                    {responseWindowOpen ? (
                      <p className="mt-1 text-xs text-verdict-600">
                        open for {timeLeft(record.response_deadline)} — both
                        parties may add rebuttal evidence; resolution is
                        blocked on-chain until it closes.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-ink-400">
                        closed {formatEpoch(record.response_deadline)} — the
                        dispute can now be resolved.
                      </p>
                    )}
                  </div>

                  {/* add rebuttal evidence — BOTH parties */}
                  <div className="space-y-3">
                    <SectionLabel>
                      {responseWindowOpen
                        ? "Add rebuttal evidence"
                        : "Add more dispute evidence"}
                    </SectionLabel>
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
                      onClick={addRebuttal}
                      disabled={
                        !isConnected ||
                        !write ||
                        tx.phase !== "idle" ||
                        !/^https?:\/\//.test(rebuttalUrl.trim())
                      }
                      className={btnCls}
                    >
                      Submit rebuttal evidence
                    </button>
                  </div>

                  {/* resolve — gated by the on-chain window */}
                  <div className="space-y-3">
                    <SectionLabel>Resolve dispute</SectionLabel>
                    {responseWindowOpen ? (
                      <p className="text-xs text-ink-400">
                        Resolution is blocked on-chain until the response
                        window closes ({formatEpoch(record.response_deadline)}).
                      </p>
                    ) : (
                      <button
                        onClick={resolve}
                        disabled={!isConnected || !write || tx.phase !== "idle"}
                        className={btnCls}
                      >
                        Trigger dispute resolution (fresh consensus round)
                      </button>
                    )}
                  </div>
                </div>
              )}

              {record.status === "RESOLVED" && record.resolution.decision && (
                <div className="flex items-center gap-2.5 rounded-[12px] bg-black/[0.03] px-4 py-3">
                  <DecisionBadge decision={record.resolution.decision} />
                  <span className="text-xs text-ink-400">
                    resolved {formatEpoch(record.resolution.at ?? "0")}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 border-t border-black/[0.08] pt-4">
              <SectionLabel>Open a dispute</SectionLabel>
              <textarea
                className={`${inputCls} min-h-[70px]`}
                placeholder="Why is this verdict wrong? (min 10 chars)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <input
                className={`${inputCls} font-mono text-sm`}
                placeholder="Optional supporting evidence URL (https://…)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              {!canDispute && (
                <p className="text-xs text-ink-400">
                  {milestone.status === "DISPUTED"
                    ? "This milestone is already disputed."
                    : "Disputing requires a decided milestone within its dispute window, and a connected wallet that is a party to it."}
                </p>
              )}
              <button
                onClick={open}
                disabled={
                  !canDispute ||
                  reason.trim().length < 10 ||
                  (url.trim() !== "" && !/^https?:\/\//.test(url.trim()))
                }
                className={btnCls}
              >
                Open dispute
              </button>
              <p className="text-xs text-ink-400">
                Evidence is optional when opening — a dispute may rest on its
                reason alone. The other party gets a 24h response window to
                add rebuttal evidence before any resolution runs.
              </p>
            </div>
          )}
        </Card>
      )}

      {error && (
        <p className="rounded-[12px] bg-fail/[0.07] px-4 py-3 text-xs text-fail">
          {error}
        </p>
      )}
      <TxTracker tx={tx} />
    </div>
  );
}
