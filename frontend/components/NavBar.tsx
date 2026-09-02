"use client";

import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { shortAddress } from "@/lib/money";

export default function NavBar() {
  const { address, isConnected, connect, disconnect, error } = useWallet();
  return (
    <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded border border-verdict-500/60 bg-ink-900 font-mono text-sm font-bold text-verdict-400"
          >
            ⚖
          </span>
          <span className="font-sans text-sm font-semibold tracking-tight text-ink-100">
            MilestoneJudge
          </span>
        </Link>
        <nav className="hidden items-center gap-5 text-xs text-ink-300 md:flex">
          <Link href="/dashboard" className="hover:text-ink-100">
            Dashboard
          </Link>
          <Link href="/create" className="hover:text-ink-100">
            New milestone
          </Link>
          <Link href="/history" className="hover:text-ink-100">
            History
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          {isConnected && address ? (
            <>
              <span className="hidden rounded border border-ink-600 bg-ink-850 px-2.5 py-1.5 font-mono text-xs text-ink-200 sm:inline-block">
                {shortAddress(address, 4)}
              </span>
              <button
                onClick={disconnect}
                className="rounded border border-ink-600 px-2.5 py-1.5 text-xs text-ink-300 transition-colors hover:border-ink-500 hover:text-ink-100"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={connect}
              className="rounded border border-verdict-500/60 bg-verdict-500/10 px-3 py-1.5 text-xs font-medium text-verdict-400 transition-colors hover:bg-verdict-500/20"
            >
              Connect wallet
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="border-t border-fail/30 bg-[#2a1214] px-4 py-1.5 text-center text-xs text-[#f08a8d]">
          {error}
        </div>
      )}
    </header>
  );
}
