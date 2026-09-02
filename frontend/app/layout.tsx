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
      <body className="min-h-screen bg-ink-950 font-sans text-ink-200 antialiased">
        <WalletProvider>
          <NavBar />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="border-t border-ink-800 px-4 py-6">
            <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 text-xs text-ink-400 sm:flex-row sm:items-center">
              <span>
                MilestoneJudge — escrow and adjudication executed by a GenLayer
                Intelligent Contract under validator consensus.
              </span>
              <a
                className="hover:text-ink-200"
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
