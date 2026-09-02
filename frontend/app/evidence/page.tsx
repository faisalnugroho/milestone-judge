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
    "w-full rounded-[12px] border border-black/10 bg-white px-3.5 py-2.5 text-[15px] text-ink-50 placeholder:text-ink-400 transition-shadow focus:border-verdict-400";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-50">
          Submit evidence
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-400">
          File public proof that the milestone is complete. Everything you
          list here is fetched directly by GenLayer validators.
        </p>
      </div>

      <Card className="bg-warn/[0.06] p-5">
        <SectionLabel>Evidence ground rules</SectionLabel>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-[#8a5a00]">
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

      <Card className="space-y-5 p-6">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-400">
            Milestone id
          </label>
          <input
            className={`${inputCls} w-32 font-mono text-sm`}
            value={mid}
            onChange={(e) => setMid(e.target.value)}
            placeholder="e.g. 3"
          />
          <p className="mt-1.5 text-xs text-ink-400">
            Find it on your{" "}
            <Link href="/dashboard" className="text-verdict-600 hover:underline">
              dashboard
            </Link>
            .
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-400">
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
              className="rounded-full px-3 py-1 text-xs font-medium text-verdict-600 transition-colors hover:bg-verdict-400/[0.08]"
            >
              + Add URL
            </button>
          </div>
          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                <input
                  className={`${inputCls} font-mono text-sm`}
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
                    className="justify-self-end rounded-full px-3 py-1 text-xs font-medium text-ink-400 transition-colors hover:bg-fail/10 hover:text-fail"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-400">
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
          <p className="rounded-[12px] bg-fail/[0.07] px-4 py-3 text-xs text-fail">
            {error}
          </p>
        )}
        <TxTracker tx={tx} label="Submit evidence" />

        <button
          disabled={!canSubmit}
          onClick={submit}
          className="btn-pill w-full bg-verdict-400 px-4 py-3 text-[15px] font-medium text-white hover:bg-verdict-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Submit evidence for milestone #{mid || "…"}
        </button>
      </Card>
    </div>
  );
}
