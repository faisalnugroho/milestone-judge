"use client";

import { useCallback, useEffect, useState } from "react";
import { getReadContract } from "@/lib/contract";
import type { Milestone } from "@/lib/types";
import { Card, EmptyState, MilestoneRow, SectionLabel } from "@/components/ui";

const TERMINAL = ["RELEASED", "REFUNDED", "CANCELLED", "EXPIRED"];

export default function HistoryPage() {
  const [items, setItems] = useState<Milestone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const contract = getReadContract();
    if (!contract) {
      setError("Contract not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS.");
      setLoading(false);
      return;
    }
    try {
      const ids = await contract.getMilestoneIds();
      const loaded: Milestone[] = [];
      for (const id of ids) {
        try {
          const m = await contract.getMilestone(id);
          if (!("error" in m)) loaded.push(m);
        } catch {
          /* skip */
        }
      }
      setItems(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const completed = items
    .filter((m) => TERMINAL.includes(m.status))
    .sort((a, b) => Number(b.resolved_at || b.created_at) - Number(a.resolved_at || a.created_at));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
            History
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            Completed milestones and their outcomes, settled on-chain.
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

      {!loading && !error && completed.length === 0 && (
        <EmptyState
          title="Nothing settled yet"
          hint="Completed milestones — released, refunded, cancelled, or expired — will appear here."
        />
      )}

      {completed.length > 0 && (
        <div className="space-y-3">
          <SectionLabel>
            {completed.length} settled milestone{completed.length > 1 ? "s" : ""}
          </SectionLabel>
          {completed.map((m) => (
            <MilestoneRow
              key={m.id}
              id={m.id}
              title={m.title}
              status={m.status}
              amountWei={m.amount_wei}
              deadlineEpoch={m.deadline_epoch}
            />
          ))}
        </div>
      )}

      {!loading && !error && completed.length > 0 && (
        <details className="rounded-lg border border-ink-700 bg-ink-900 p-4">
          <summary className="cursor-pointer text-xs text-ink-300">
            Show all milestones including active ones ({items.length} total)
          </summary>
          <div className="mt-3 space-y-3">
            {items
              .filter((m) => !TERMINAL.includes(m.status))
              .map((m) => (
                <MilestoneRow
                  key={m.id}
                  id={m.id}
                  title={m.title}
                  status={m.status}
                  amountWei={m.amount_wei}
                  deadlineEpoch={m.deadline_epoch}
                />
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
