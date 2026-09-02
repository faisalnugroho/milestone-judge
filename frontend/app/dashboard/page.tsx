"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { getReadContract } from "@/lib/contract";
import type { ContractStats, Milestone, MilestoneRef } from "@/lib/types";
import {
  Card,
  EmptyState,
  GenAmount,
  MilestoneRow,
  SectionLabel,
  StatusBadge,
} from "@/components/ui";

interface DashboardData {
  refs: MilestoneRef[];
  byId: Record<string, Milestone>;
  stats: ContractStats | null;
}

export default function DashboardPage() {
  const { address, isConnected } = useWallet();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const contract = getReadContract();
    if (!contract) {
      setError(
        "Contract not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS and restart."
      );
      setLoading(false);
      return;
    }
    try {
      const [stats, refs] = await Promise.all([
        contract.getStats(),
        address ? contract.getMilestonesFor(address) : Promise.resolve([]),
      ]);
      const byId: Record<string, Milestone> = {};
      await Promise.all(
        refs.map(async (ref) => {
          try {
            const m = await contract.getMilestone(ref.id);
            if (!("error" in m)) byId[ref.id] = m;
          } catch {
            /* skip unreadable */
          }
        })
      );
      setData({ refs, byId, stats });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  const walletOnly = isConnected && address;
  const mine = data?.refs ?? [];
  const activeStates = new Set([
    "CREATED",
    "FUNDED",
    "SUBMITTED",
    "APPROVED",
    "REJECTED",
    "INSUFFICIENT_EVIDENCE",
    "DISPUTED",
  ]);
  const active = mine.filter((r) => {
    const m = data?.byId[r.id];
    return m && activeStates.has(m.status);
  });
  const awaitingMe = mine.filter((r) => {
    const m = data?.byId[r.id];
    if (!m) return false;
    if (r.role === "client" && m.status === "SUBMITTED") return true;
    if (m.status === "APPROVED" || m.status === "REJECTED" ||
        m.status === "INSUFFICIENT_EVIDENCE") return true;
    return false;
  });
  const locked = mine
    .map((r) => BigInt(data?.byId[r.id]?.balance_wei ?? "0"))
    .reduce((a, b) => a + b, 0n);
  const completed = mine.filter((r) => {
    const m = data?.byId[r.id];
    return m && ["RELEASED", "REFUNDED", "CANCELLED", "EXPIRED"].includes(m.status);
  });
  const disputes = mine.filter((r) => data?.byId[r.id]?.status === "DISPUTED");
  const pendingReviews = mine.filter((r) =>
    ["SUBMITTED", "APPROVED", "REJECTED", "INSUFFICIENT_EVIDENCE"].includes(
      data?.byId[r.id]?.status ?? ""
    )
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            {walletOnly
              ? `Milestones where ${address.slice(0, 8)}… is client or worker.`
              : "Connect your wallet to see your milestones."}
          </p>
        </div>
        <button
          onClick={load}
          className="rounded border border-ink-600 px-3 py-1.5 text-xs text-ink-300 hover:border-ink-500 hover:text-ink-100"
        >
          Refresh
        </button>
      </div>

      {error && (
        <Card className="border-fail/40 bg-[#2a1214] p-4 text-sm text-[#f08a8d]">
          {error}
        </Card>
      )}
      {loading && <p className="text-sm text-ink-400">Loading…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Card className="p-4">
              <SectionLabel>Total</SectionLabel>
              <p className="font-mono text-2xl font-semibold text-ink-100">
                {mine.length}
              </p>
              <p className="mt-1 text-xs text-ink-400">milestones</p>
            </Card>
            <Card className="p-4">
              <SectionLabel>Active</SectionLabel>
              <p className="font-mono text-2xl font-semibold text-ink-100">
                {active.length}
              </p>
              <p className="mt-1 text-xs text-ink-400">in progress</p>
            </Card>
            <Card className="p-4">
              <SectionLabel>Escrow</SectionLabel>
              <GenAmount wei={locked} />
              <p className="mt-1 text-xs text-ink-400">locked in your deals</p>
            </Card>
            <Card className="p-4">
              <SectionLabel>Reviews</SectionLabel>
              <p className="font-mono text-2xl font-semibold text-ink-100">
                {pendingReviews.length}
              </p>
              <p className="mt-1 text-xs text-ink-400">awaiting verdict/finality</p>
            </Card>
            <Card className="p-4">
              <SectionLabel>Disputes</SectionLabel>
              <p className="font-mono text-2xl font-semibold text-ink-100">
                {disputes.length}
              </p>
              <p className="mt-1 text-xs text-ink-400">open</p>
            </Card>
          </div>

          {data.stats && (
            <Card className="flex flex-wrap items-center gap-x-8 gap-y-2 p-4">
              <div>
                <SectionLabel>Network (all users)</SectionLabel>
                <p className="font-mono text-sm text-ink-200">
                  {data.stats.total_milestones} milestones ·{" "}
                  {data.stats.locked_wei !== "0"
                    ? `${(BigInt(data.stats.locked_wei) / 10n ** 18n).toString()} GEN locked`
                    : "no escrow locked"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {Object.entries(data.stats.counts).map(([st, n]) => (
                  <span key={st} className="flex items-center gap-1.5">
                    <StatusBadge status={st} />
                    <span className="font-mono text-xs text-ink-300">{n}</span>
                  </span>
                ))}
              </div>
            </Card>
          )}

          {!walletOnly ? (
            <EmptyState
              title="Wallet not connected"
              hint="Connect MetaMask to load your client and worker milestones."
            />
          ) : mine.length === 0 ? (
            <EmptyState
              title="No milestones yet"
              hint="Create your first milestone as a client, or get one assigned as a worker."
              action={
                <Link
                  href="/create"
                  className="rounded border border-verdict-500/70 bg-verdict-500/15 px-4 py-2 text-sm font-medium text-verdict-400 hover:bg-verdict-500/25"
                >
                  Create a milestone
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              <SectionLabel>Your milestones</SectionLabel>
              {mine.map((ref) => {
                const m = data.byId[ref.id];
                if (!m) return null;
                return (
                  <MilestoneRow
                    key={`${ref.id}-${ref.role}`}
                    id={m.id}
                    title={m.title}
                    status={m.status}
                    amountWei={m.amount_wei}
                    deadlineEpoch={m.deadline_epoch}
                    role={ref.role}
                  />
                );
              })}
              {awaitingMe.length > 0 && (
                <p className="pt-2 text-xs text-ink-400">
                  {awaitingMe.length} of your milestones need action — open
                  them to adjudicate or finalize.
                </p>
              )}
              {completed.length > 0 && (
                <p className="pt-1 text-xs text-ink-400">
                  {completed.length} completed.{" "}
                  <Link href="/history" className="text-verdict-400 hover:underline">
                    View history →
                  </Link>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
