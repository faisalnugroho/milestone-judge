"use client";

import Link from "next/link";
import type { MilestoneStatus, TxState } from "@/lib/types";
import { timeLeft } from "@/lib/money";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<string, string> = {
  CREATED: "bg-ink-800 text-ink-300 border-ink-600",
  FUNDED: "bg-ink-800 text-ink-200 border-ink-600",
  SUBMITTED: "bg-[#1d2b4d] text-[#9db8f0] border-[#33426e]",
  APPROVED: "bg-[#0e2a1c] text-[#5fd39a] border-[#2fbf71]/40",
  REJECTED: "bg-[#2a1214] text-[#f08a8d] border-[#e5484d]/40",
  INSUFFICIENT_EVIDENCE: "bg-[#2a2212] text-[#f0c66a] border-[#f5a623]/40",
  DISPUTED: "bg-[#2a1a2e] text-[#d8a0e8] border-[#b45cc7]/40",
  RELEASED: "bg-[#0e2a1c] text-[#5fd39a] border-[#2fbf71]/40",
  REFUNDED: "bg-[#1a2338] text-[#a8b4d4] border-[#33426e]",
  CANCELLED: "bg-ink-850 text-ink-400 border-ink-700",
  EXPIRED: "bg-ink-850 text-ink-400 border-ink-700",
};

export function StatusBadge({ status }: { status: MilestoneStatus | string }) {
  const style = STATUS_STYLE[status] ?? "bg-ink-800 text-ink-300 border-ink-600";
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide uppercase ${style}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function DecisionBadge({ decision }: { decision: string }) {
  if (decision === "APPROVED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-pass/40 bg-[#0e2a1c] px-2.5 py-1 font-mono text-xs font-semibold text-[#5fd39a]">
        ✓ APPROVED
      </span>
    );
  }
  if (decision === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-fail/40 bg-[#2a1214] px-2.5 py-1 font-mono text-xs font-semibold text-[#f08a8d]">
        ✕ REJECTED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-warn/40 bg-[#2a2212] px-2.5 py-1 font-mono text-xs font-semibold text-[#f0c66a]">
      ? {decision.replace(/_/g, " ")}
    </span>
  );
}

export function CriterionStatusPill({ status }: { status: string }) {
  if (status === "PASS") {
    return (
      <span className="rounded border border-pass/40 bg-[#0e2a1c] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-[#5fd39a]">
        PASS
      </span>
    );
  }
  if (status === "FAIL") {
    return (
      <span className="rounded border border-fail/40 bg-[#2a1214] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-[#f08a8d]">
        FAIL
      </span>
    );
  }
  return (
    <span className="rounded border border-warn/40 bg-[#2a2212] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-[#f0c66a]">
      INSUFFICIENT
    </span>
  );
}

// ---------------------------------------------------------------------------
// Gen amount display
// ---------------------------------------------------------------------------

export function GenAmount({
  wei,
  size = "md",
}: {
  wei: string | bigint;
  size?: "sm" | "md" | "lg";
}) {
  const fmt = (v: string | bigint) => {
    const n = typeof v === "bigint" ? v : BigInt(v || "0");
    const whole = n / 10n ** 18n;
    const frac = n % 10n ** 18n;
    if (frac === 0n) return whole.toString();
    const fracStr = frac
      .toString()
      .padStart(18, "0")
      .slice(0, 4)
      .replace(/0+$/, "");
    return `${whole}.${fracStr}`;
  };
  const cls =
    size === "lg"
      ? "text-2xl font-semibold"
      : size === "sm"
        ? "text-sm"
        : "text-lg font-medium";
  return (
    <span className={`font-mono ${cls} text-verdict-400 tabular-nums`}>
      {fmt(wei)}{" "}
      <span className="text-[0.7em] text-ink-400">GEN</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Transaction lifecycle indicator — GenLayer states surfaced verbatim
// ---------------------------------------------------------------------------

const PHASE_LABEL: Record<string, string> = {
  idle: "Idle",
  signing: "Waiting for wallet signature…",
  pending: "Transaction submitted — awaiting network",
  proposing: "PROPOSING — leader executing",
  committing: "COMMITTING — validators voting",
  revealing: "REVEALING — votes revealed",
  accepted: "ACCEPTED — provisional consensus",
  finalized: "FINALIZED — consensus complete",
  undetermined: "UNDETERMINED — consensus failed, no state change",
  failed: "FAILED",
};

export function TxTracker({ tx, label }: { tx: TxState; label?: string }) {
  if (tx.phase === "idle") return null;
  const isError = tx.phase === "failed" || tx.phase === "undetermined";
  const isDone = tx.phase === "finalized";
  return (
    <div
      className={`rounded border px-3 py-2 font-mono text-xs ${
        isError
          ? "border-fail/40 bg-[#2a1214] text-[#f08a8d]"
          : isDone
            ? "border-pass/40 bg-[#0e2a1c] text-[#5fd39a]"
            : "border-ink-600 bg-ink-850 text-ink-300"
      }`}
    >
      <div className="flex items-center gap-2">
        {!isError && !isDone && (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-verdict-400" />
        )}
        <span>
          {label ? `${label}: ` : ""}
          {PHASE_LABEL[tx.phase]}
        </span>
      </div>
      {tx.hash && (
        <div className="mt-1 truncate text-[10px] text-ink-400">
          tx {tx.hash}
        </div>
      )}
      {tx.error && (
        <div className="mt-1 break-words text-[10px]">{tx.error}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cards / layout primitives
// ---------------------------------------------------------------------------

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-ink-700 bg-ink-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ink-700 bg-ink-900/50 px-6 py-14 text-center">
      <p className="text-sm font-medium text-ink-200">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-ink-400">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Milestone list row (dashboard / history)
// ---------------------------------------------------------------------------

export function MilestoneRow({
  id,
  title,
  status,
  amountWei,
  deadlineEpoch,
  role,
}: {
  id: string;
  title: string;
  status: string;
  amountWei: string;
  deadlineEpoch: string;
  role?: string;
}) {
  return (
    <Link
      href={`/milestone/${id}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 transition-colors hover:border-ink-600 hover:bg-ink-850"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-ink-400">#{id}</span>
          {role && (
            <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-300">
              {role}
            </span>
          )}
          <span className="truncate text-sm font-medium text-ink-100">
            {title}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-ink-400">
          <span className="font-mono tabular-nums text-verdict-400/80">
            {(BigInt(amountWei || "0") / 10n ** 18n).toString()} GEN
          </span>
          <span>deadline {timeLeft(deadlineEpoch)}</span>
        </div>
      </div>
      <StatusBadge status={status} />
    </Link>
  );
}
