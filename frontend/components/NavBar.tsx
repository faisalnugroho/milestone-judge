"use client";

import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { shortAddress } from "@/lib/money";

export default function NavBar() {
  const { address, isConnected, connect, disconnect, error } = useWallet();
  return (
    <header className="frost-nav sticky top-0 z-40 border-b border-black/[0.08]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-apple bg-ink-50 text-[13px] font-semibold text-white"
          >
            ⚖
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink-50">
            MilestoneJudge
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-xs text-ink-500 hover:md:text-ink-50 md:flex">
          <Link href="/dashboard" className="transition-colors hover:text-ink-50">
            Dashboard
          </Link>
          <Link href="/create" className="transition-colors hover:text-ink-50">
            New milestone
          </Link>
          <Link href="/history" className="transition-colors hover:text-ink-50">
            History
          </Link>
        </nav>
        <div className="flex items-center gap-2.5">
          {isConnected && address ? (
            <>
              <span className="hidden rounded-full bg-black/[0.05] px-3 py-1.5 font-mono text-xs text-ink-400 sm:inline-block">
                {shortAddress(address, 4)}
              </span>
              <button
                onClick={disconnect}
                className="rounded-full px-3 py-1.5 text-xs text-ink-500 transition-colors hover:bg-black/[0.05] hover:text-ink-50"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={connect}
              className="btn-pill bg-verdict-400 px-4 py-1.5 text-xs font-medium text-white hover:bg-verdict-600"
            >
              Connect wallet
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="bg-fail/10 px-5 py-1.5 text-center text-xs text-fail">
          {error}
        </div>
      )}
    </header>
  );
}
