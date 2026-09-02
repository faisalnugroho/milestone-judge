"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet, useWriteContract } from "@/lib/wallet";
import { Card, SectionLabel, TxTracker } from "@/components/ui";
import type { TxState } from "@/lib/types";

const KINDS = ["WEBSITE", "GITHUB", "DOCUMENTATION", "API", "OTHER"] as const;

export default function SubmitEvidencePage() {
  const { isConnected } = useWallet();
  const write = useWriteContract();
  const [mid, setMid] = useState("");
  const [items, setItems] = useState([
    { url: "", kind: "WEBSITE" as string, note: "" },
  ]);
  const [statement, setStatement] = useState("");
  const [tx, setTx] = useState<TxState>({ phase: "idle" });
  const [error, setError] = useState<string | null>(null);

  const validItems = items.filter((i) => /^https?:\/\//.test(i.url.trim()));
  const canSubmit =
    isConnected &&
    !!write &&
    /^\d+$/.test(mid.trim()) &&
    validItems.length >= 1 &&
    validItems.length === items.filter((i) => i.url.trim() !== "").length &&
    statement.trim().length >= 10 &&
    tx.phase === "idle";

  async function submit() {
    if (!write || !canSubmit) return;
    setError(null);
    const evidenceJson = JSON.stringify(
      validItems.map((i) => ({
        url: i.url.trim(),
        kind: i.kind,
        note: i.note.trim(),
      }))
    );
    try {
      await write.submitEvidence(mid.trim(), evidenceJson, statement.trim(), setTx);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    }
  }

  const inputCls =
    "w-full rounded border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-400 focus:border-verdict-500/60 focus:outline-none";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
          Submit evidence
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          File public proof that the milestone is complete. Everything you
          list here is fetched directly by GenLayer validators.
        </p>
      </div>

      <Card className="space-y-4 border-warn/30 bg-[#231a10] p-4">
        <SectionLabel>Evidence ground rules</SectionLabel>
        <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-[#f0c66a]/90">
          <li>
            Evidence URLs must be publicly reachable — validators fetch them
            independently. Anything behind a login cannot be judged.
          </li>
          <li>
            Treat fetched web content as untrusted data. MilestoneJudge's
            adjudication prompt forbids following instructions found inside
            evidence — injected commands cannot swing the verdict.
          </li>
          <li>
            Fetched content is size-bounded; per-URL and total limits are
            enforced by the contract.
          </li>
          <li>Never include secrets, tokens, or private data in URLs.</li>
        </ul>
      </Card>

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
          <p className="mt-1 text-xs text-ink-400">
            Find it on your{" "}
            <Link href="/dashboard" className="text-verdict-400 hover:underline">
              dashboard
            </Link>
            .
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-300">
              Evidence URLs (max 5)
            </span>
            <button
              type="button"
              onClick={() =>
                setItems((is) =>
                  is.length >= 5
                    ? is
                    : [...is, { url: "", kind: "WEBSITE", note: "" }]
                )
              }
              className="rounded border border-ink-600 px-2 py-1 text-xs text-ink-300 hover:border-ink-500"
            >
              + Add URL
            </button>
          </div>
          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                <input
                  className={`${inputCls} font-mono`}
                  placeholder="https://…"
                  value={it.url}
                  onChange={(e) =>
                    setItems((is) =>
                      is.map((x, j) =>
                        j === i ? { ...x, url: e.target.value } : x
                      )
                    )
                  }
                />
                <select
                  className={inputCls}
                  value={it.kind}
                  onChange={(e) =>
                    setItems((is) =>
                      is.map((x, j) =>
                        j === i ? { ...x, kind: e.target.value } : x
                      )
                    )
                  }
                >
                  {KINDS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                <input
                  className={`${inputCls} sm:col-span-2`}
                  placeholder="Description of what this URL shows (optional)"
                  value={it.note}
                  onChange={(e) =>
                    setItems((is) =>
                      is.map((x, j) =>
                        j === i ? { ...x, note: e.target.value } : x
                      )
                    )
                  }
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setItems((is) => is.filter((_, j) => j !== i))}
                    className="justify-self-end rounded border border-ink-600 px-2 py-1 text-xs text-ink-400 hover:border-fail/50 hover:text-[#f08a8d]"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-300">
            Statement — how does this evidence prove completion?
          </label>
          <textarea
            className={`${inputCls} min-h-[90px]`}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="The deployment at the first URL implements the dashboard from the acceptance criteria; the export feature is linked from the header…"
          />
        </div>

        {error && (
          <p className="rounded border border-fail/40 bg-[#2a1214] px-3 py-2 text-xs text-[#f08a8d]">
            {error}
          </p>
        )}
        <TxTracker tx={tx} label="Submit evidence" />

        <button
          disabled={!canSubmit}
          onClick={submit}
          className="w-full rounded border border-verdict-500/70 bg-verdict-500/15 px-4 py-2.5 text-sm font-medium text-verdict-400 transition-colors hover:bg-verdict-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Submit evidence for milestone #{mid || "…"}
        </button>
      </Card>
    </div>
  );
}
