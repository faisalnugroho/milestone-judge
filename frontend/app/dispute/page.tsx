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
import { formatEpoch, shortAddress } from "@/lib/money";

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
    "w-full rounded border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-400 focus:border-verdict-500/60 focus:outline-none";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
          Dispute a verdict
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          An application-level dispute: the original decision, evidence, and
          reasoning stay on-chain, and a fresh consensus round re-adjudicates
          everything with the dispute context added.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-300">
            Milestone id
          </label>
          <input
            className={`${inputCls} w-32 font-mono`}
            value={mid}
            onChange={(e) => setMid(e.target.value)}
            placeholder="e.g. 3"
          />
        </div>
        {lookupError && (
          <p className="text-xs text-[#f08a8d]">{lookupError}</p>
        )}
      </Card>

      {milestone && (
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={milestone.status} />
            <Link
              href={`/milestone/${milestone.id}`}
              className="text-sm font-medium text-ink-100 hover:text-verdict-400"
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
          <p className="font-mono text-[11px] text-ink-400">
            dispute window ends {formatEpoch(milestone.dispute_deadline)}
          </p>

          {record ? (
            <div className="space-y-3 border-t border-ink-700 pt-3">
              <SectionLabel>Existing dispute</SectionLabel>
              <div className="flex items-center gap-2">
                <StatusBadge status={`DISPUTE_${record.status}`} />
                <span className="font-mono text-[11px] text-ink-400">
                  opened {formatEpoch(record.opened_at)} by{" "}
                  {shortAddress(record.opened_by, 4)}
                </span>
              </div>
              <p className="text-sm text-ink-300">{record.reason}</p>
              <p className="font-mono text-[11px] text-ink-500">
                original decision: {record.original_decision} (round{" "}
                {record.original_round})
              </p>
              {record.status === "OPEN" && (
                <button
                  onClick={resolve}
                  disabled={!isConnected || !write || tx.phase !== "idle"}
                  className="rounded border border-verdict-500/70 bg-verdict-500/15 px-4 py-2 text-sm font-medium text-verdict-400 hover:bg-verdict-500/25 disabled:opacity-40"
                >
                  Trigger dispute resolution (fresh consensus round)
                </button>
              )}
              {record.status === "RESOLVED" && record.resolution.decision && (
                <div className="flex items-center gap-2 rounded border border-ink-700 bg-ink-950 px-3 py-2">
                  <DecisionBadge decision={record.resolution.decision} />
                  <span className="font-mono text-[11px] text-ink-400">
                    resolved {formatEpoch(record.resolution.at ?? "0")}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 border-t border-ink-700 pt-3">
              <SectionLabel>Open a dispute</SectionLabel>
              <textarea
                className={`${inputCls} min-h-[70px]`}
                placeholder="Why is this verdict wrong? (min 10 chars)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <input
                className={`${inputCls} font-mono`}
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
                className="rounded border border-verdict-500/70 bg-verdict-500/15 px-4 py-2 text-sm font-medium text-verdict-400 hover:bg-verdict-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Open dispute
              </button>
            </div>
          )}
        </Card>
      )}

      {error && (
        <p className="rounded border border-fail/40 bg-[#2a1214] px-3 py-2 text-xs text-[#f08a8d]">
          {error}
        </p>
      )}
      <TxTracker tx={tx} />
    </div>
  );
}
