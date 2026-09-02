"use client";

import Link from "next/link";
import type { MilestoneStatus, TxState } from "@/lib/types";
import { timeLeft } from "@/lib/money";

// ---------------------------------------------------------------------------
// Status badge — iOS-style tinted capsule
// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<string, string> = {
  CREATED: "bg-black/[0.05] text-ink-500",
  FUNDED: "bg-verdict-400/10 text-verdict-600",
  SUBMITTED: "bg-verdict-400/10 text-verdict-600",
  APPROVED: "bg-pass/12 text-[#1e8e3e]",
  REJECTED: "bg-fail/10 text-fail",
  INSUFFICIENT_EVIDENCE: "bg-warn/12 text-[#b25f00]",
  DISPUTED: "bg-dispute/10 text-dispute",
  RELEASED: "bg-pass/12 text-[#1e8e3e]",
  REFUNDED: "bg-black/[0.05] text-ink-400",
  CANCELLED: "bg-black/[0.05] text-ink-500",
  EXPIRED: "bg-black/[0.05] text-ink-500",
  DISPUTE_OPEN: "bg-dispute/10 text-dispute",
  DISPUTE_RESOLVED: "bg-pass/12 text-[#1e8e3e]",
};

export function StatusBadge({ status }: { status: MilestoneStatus | string }) {
  const style = STATUS_STYLE[status] ?? "bg-black/[0.05] text-ink-500";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${style}`}
    >
      {status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

export function DecisionBadge({ decision }: { decision: string }) {
  if (decision === "APPROVED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-pass/12 px-3 py-1 text-xs font-semibold text-[#1e8e3e]">
        ✓ Approved
      </span>
    );
  }
  if (decision === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-fail/10 px-3 py-1 text-xs font-semibold text-fail">
        ✕ Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/12 px-3 py-1 text-xs font-semibold text-[#b25f00]">
      ? {decision.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

export function CriterionStatusPill({ status }: { status: string }) {
  if (status === "PASS") {
    return (
      <span className="rounded-full bg-pass/12 px-2 py-0.5 text-[10px] font-semibold text-[#1e8e3e]">
        PASS
      </span>
    );
  }
  if (status === "FAIL") {
    return (
      <span className="rounded-full bg-fail/10 px-2 py-0.5 text-[10px] font-semibold text-fail">
        FAIL
      </span>
    );
  }
  return (
    <span className="rounded-full bg-warn/12 px-2 py-0.5 text-[10px] font-semibold text-[#b25f00]">
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
      ? "text-3xl font-semibold tracking-tight"
      : size === "sm"
        ? "text-sm"
        : "text-lg font-medium";
  return (
    <span className={`${cls} text-ink-50 tabular-nums`}>
      {fmt(wei)}{" "}
      <span className="text-[0.62em] font-medium text-ink-400">GEN</span>
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
  proposing: "Proposing — leader executing",
  committing: "Committing — validators voting",
  revealing: "Revealing — votes revealed",
  accepted: "Accepted — provisional consensus",
  finalized: "Finalized — consensus complete",
  undetermined: "Undetermined — consensus failed, no state change",
  failed: "Failed",
};

export function TxTracker({ tx, label }: { tx: TxState; label?: string }) {
  if (tx.phase === "idle") return null;
  const isError = tx.phase === "failed" || tx.phase === "undetermined";
  const isDone = tx.phase === "finalized";
  return (
    <div
      className={`rounded-apple px-4 py-3 text-xs ${
        isError
          ? "bg-fail/[0.07] text-fail"
          : isDone
            ? "bg-pass/[0.08] text-[#1e8e3e]"
            : "bg-black/[0.04] text-ink-400"
      }`}
    >
      <div className="flex items-center gap-2.5">
        {!isError && !isDone && (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-verdict-400" />
        )}
        <span className="font-medium">
          {label ? `${label}: ` : ""}
          {PHASE_LABEL[tx.phase]}
        </span>
      </div>
      {tx.hash && (
        <div className="mt-1 truncate font-mono text-[10px] text-ink-400">
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
// Cards / layout primitives — white cards, continuous corners
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
      className={`rounded-apple bg-white shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
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
    <div className="flex flex-col items-center justify-center rounded-apple bg-white px-6 py-16 text-center shadow-card">
      <p className="text-[17px] font-semibold text-ink-50">{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-sm text-ink-400">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Milestone list row (dashboard / history) — iOS grouped-list style
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
      className="flex items-center justify-between gap-3 rounded-apple bg-white px-5 py-4 shadow-card transition-all hover:shadow-pop"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] text-ink-400">#{id}</span>
          {role && (
            <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium text-ink-500">
              {role}
            </span>
          )}
          <span className="truncate text-[15px] font-medium text-ink-50">
            {title}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-ink-400">
          <span className="font-medium tabular-nums text-ink-50">
            {(BigInt(amountWei || "0") / 10n ** 18n).toString()} GEN
          </span>
          <span>deadline {timeLeft(deadlineEpoch)}</span>
        </div>
      </div>
      <StatusBadge status={status} />
    </Link>
  );
}
