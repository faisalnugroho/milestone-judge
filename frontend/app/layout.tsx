import type { ReactNode } from "react";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import NavBar from "@/components/NavBar";

export const metadata = {
  title: "MilestoneJudge — Trustless milestone escrow",
  description:
    "Trustless milestone escrow with AI-powered on-chain adjudication. GenLayer Intelligent Contract.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f5f5f7] font-sans text-ink-200 antialiased">
        <WalletProvider>
          <NavBar />
          <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
          <footer className="border-t border-black/[0.08] bg-[#f5f5f7] px-5 py-8">
            <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-2 text-xs text-ink-400 sm:flex-row sm:items-center">
              <span>
                MilestoneJudge — escrow and adjudication executed by a GenLayer
                Intelligent Contract under validator consensus.
              </span>
              <a
                className="transition-colors hover:text-verdict-600"
                href="https://docs.genlayer.com"
                target="_blank"
                rel="noreferrer"
              >
                GenLayer docs ↗
              </a>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
