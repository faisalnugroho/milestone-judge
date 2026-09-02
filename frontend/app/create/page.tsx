"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet, useWriteContract } from "@/lib/wallet";
import { parseGenToWei, shortAddress } from "@/lib/money";
import { Card, SectionLabel, TxTracker } from "@/components/ui";
import type { TxState } from "@/lib/types";

interface CriterionDraft {
  id: string;
  text: string;
  mandatory: boolean;
}

export default function CreateMilestonePage() {
  const router = useRouter();
  const { isConnected, address } = useWallet();
  const contract = useWriteContract();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [worker, setWorker] = useState("");
  const [amountGen, setAmountGen] = useState("");
  const [evidenceRequirements, setEvidenceRequirements] = useState("");
  const [deadlineLocal, setDeadlineLocal] = useState("");
  const [criteria, setCriteria] = useState<CriterionDraft[]>([
    { id: "c1", text: "", mandatory: true },
  ]);
  const [clientUrls, setClientUrls] = useState("");
  const [tx, setTx] = useState<TxState>({ phase: "idle" });
  const [formError, setFormError] = useState<string | null>(null);

  const deadlineEpoch = useMemo(() => {
    if (!deadlineLocal) return null;
    const ms = new Date(deadlineLocal).getTime();
    if (Number.isNaN(ms)) return null;
    return BigInt(Math.floor(ms / 1000));
  }, [deadlineLocal]);

  const criteriaValid = useMemo(
    () =>
      criteria.every(
        (c) => c.id.trim() !== "" && c.text.trim().length >= 5
      ) &&
      new Set(criteria.map((c) => c.id.trim())).size === criteria.length &&
      criteria.length >= 1,
    [criteria]
  );

  const amountWei = useMemo(() => {
    try {
      return parseGenToWei(amountGen);
    } catch {
      return null;
    }
  }, [amountGen]);

  const workerValid = /^0x[0-9a-fA-F]{40}$/.test(worker.trim());
  const oneHour = 3600_000;
  const deadlineValid =
    deadlineEpoch !== null &&
    Date.now() + oneHour < Number(deadlineEpoch) * 1000;

  const canSubmit =
    isConnected &&
    !!contract &&
    title.trim().length >= 3 &&
    title.trim().length <= 200 &&
    description.trim().length <= 2000 &&
    workerValid &&
    worker.trim().toLowerCase() !== (address ?? "").toLowerCase() &&
    criteriaValid &&
    criteria.length <= 10 &&
    amountWei !== null &&
    amountWei !== undefined &&
    amountWei > 1000000n &&
    deadlineValid &&
    evidenceRequirements.trim().length <= 2000 &&
    tx.phase === "idle";

  async function submit() {
    if (!contract || !canSubmit || !amountWei || !deadlineEpoch) return;
    setFormError(null);
    const criteriaJson = JSON.stringify(
      criteria.map((c) => ({
        id: c.id.trim(),
        text: c.text.trim(),
        mandatory: c.mandatory,
      }))
    );
    const urls = clientUrls
      .split(/[\s,]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    for (const u of urls) {
      if (!/^https?:\/\//.test(u)) {
        setFormError(`Evidence URL must start with http(s):// — got: ${u}`);
        return;
      }
    }
    if (urls.length > 5) {
      setFormError("At most 5 evidence URLs.");
      return;
    }
    try {
      await contract.createMilestone(
        {
          title: title.trim(),
          description: description.trim(),
          worker: worker.trim(),
          criteriaJson,
          evidenceRequirements: evidenceRequirements.trim(),
          deadlineEpoch,
          amountWei,
          initialUrlsJson: JSON.stringify(urls),
        },
        setTx
      );
      router.push("/dashboard");
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : "Transaction failed"
      );
    }
  }

  const inputCls =
    "w-full rounded-[12px] border border-black/10 bg-white px-3.5 py-2.5 text-[15px] text-ink-50 placeholder:text-ink-400 transition-shadow focus:border-verdict-400";
  const labelCls = "mb-1.5 block text-xs font-medium text-ink-400";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-50">
          Create a milestone
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-400">
          Define the work, the acceptance criteria, and the escrow. The
          contract will hold your GEN until a validator-consensus verdict
          settles it.
        </p>
      </div>

      {!isConnected && (
        <Card className="bg-warn/[0.07] p-4 text-sm text-[#b25f00]">
          Connect your wallet first — the milestone is created by your
          address, and escrow is funded from it.
        </Card>
      )}

      <Card className="space-y-6 p-7">
        <div>
          <label className={labelCls} htmlFor="mj-title">
            Title <span className="text-ink-400/70">(3–200 chars)</span>
          </label>
          <input
            id="mj-title"
            className={inputCls}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Analytics dashboard v1"
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="mj-desc">
            Description <span className="text-ink-400/70">(what the work is)</span>
          </label>
          <textarea
            id="mj-desc"
            className={`${inputCls} min-h-[80px]`}
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="React dashboard with real-time charts, CSV export, and dark mode."
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="mj-worker">
              Worker address
            </label>
            <input
              id="mj-worker"
              className={`${inputCls} font-mono text-sm`}
              value={worker}
              onChange={(e) => setWorker(e.target.value)}
              placeholder="0x…"
            />
            {worker.trim() !== "" && !workerValid && (
              <p className="mt-1.5 text-xs text-fail">
                Must be a 0x-prefixed 40-hex address.
              </p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor="mj-amount">
              Escrow amount (GEN)
            </label>
            <input
              id="mj-amount"
              className={`${inputCls} font-mono text-sm`}
              value={amountGen}
              onChange={(e) => setAmountGen(e.target.value)}
              placeholder="5"
              inputMode="decimal"
            />
            {amountGen.trim() !== "" && !amountWei && (
              <p className="mt-1.5 text-xs text-fail">
                Invalid amount (max 18 decimals).
              </p>
            )}
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="mj-deadline">
            Deadline <span className="text-ink-400/70">(worker must submit before)</span>
          </label>
          <input
            id="mj-deadline"
            type="datetime-local"
            className={inputCls}
            value={deadlineLocal}
            onChange={(e) => setDeadlineLocal(e.target.value)}
          />
          {deadlineLocal && !deadlineValid && (
            <p className="mt-1.5 text-xs text-fail">
              Deadline must be at least 1 hour in the future.
            </p>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className={labelCls}>
              Acceptance criteria{" "}
              <span className="text-ink-400/70">
                (each judged independently by the network)
              </span>
            </span>
            <button
              type="button"
              onClick={() =>
                setCriteria((cs) =>
                  cs.length >= 10
                    ? cs
                    : [
                        ...cs,
                        { id: `c${cs.length + 1}`, text: "", mandatory: true },
                      ]
                )
              }
              className="rounded-full px-3 py-1 text-xs font-medium text-verdict-600 transition-colors hover:bg-verdict-400/[0.08]"
            >
              + Add criterion
            </button>
          </div>
          <div className="space-y-3">
            {criteria.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={`${inputCls} w-20 shrink-0 font-mono text-sm`}
                  value={c.id}
                  onChange={(e) =>
                    setCriteria((cs) =>
                      cs.map((x, j) =>
                        j === i ? { ...x, id: e.target.value } : x
                      )
                    )
                  }
                  aria-label="Criterion id"
                />
                <input
                  className={inputCls}
                  value={c.text}
                  onChange={(e) =>
                    setCriteria((cs) =>
                      cs.map((x, j) =>
                        j === i ? { ...x, text: e.target.value } : x
                      )
                    )
                  }
                  placeholder="Deployed site contains a working dashboard (min 5 chars)"
                  aria-label="Criterion text"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCriteria((cs) =>
                      cs.map((x, j) =>
                        j === i ? { ...x, mandatory: !x.mandatory } : x
                      )
                    )
                  }
                  className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold transition-colors ${
                    c.mandatory
                      ? "bg-verdict-400/10 text-verdict-600"
                      : "bg-black/[0.05] text-ink-400"
                  }`}
                  title="Mandatory criteria block approval on FAIL"
                >
                  {c.mandatory ? "mandatory" : "advisory"}
                </button>
                {criteria.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setCriteria((cs) => cs.filter((_, j) => j !== i))
                    }
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs text-ink-400 transition-colors hover:bg-fail/10 hover:text-fail"
                    aria-label="Remove criterion"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {!criteriaValid && criteria.some((c) => c.text.trim() !== "") && (
            <p className="mt-2 text-xs text-fail">
              Every criterion needs a unique id and text of at least 5 chars.
            </p>
          )}
        </div>

        <div>
          <label className={labelCls} htmlFor="mj-evreq">
            Evidence requirements{" "}
            <span className="text-ink-400/70">(what kind of proof you expect)</span>
          </label>
          <textarea
            id="mj-evreq"
            className={`${inputCls} min-h-[60px]`}
            value={evidenceRequirements}
            maxLength={2000}
            onChange={(e) => setEvidenceRequirements(e.target.value)}
            placeholder="Public deployment URL plus the GitHub repo with source."
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="mj-urls">
            Optional evidence URLs{" "}
            <span className="text-ink-400/70">(reference material, max 5)</span>
          </label>
          <input
            id="mj-urls"
            className={inputCls}
            value={clientUrls}
            onChange={(e) => setClientUrls(e.target.value)}
            placeholder="https://github.com/org/spec  https://spec.example.com"
          />
          <p className="mt-1.5 text-xs text-ink-400">
            Space or comma separated. These are fetched by validators during
            adjudication as context.
          </p>
        </div>

        {formError && (
          <p className="rounded-[12px] bg-fail/[0.07] px-4 py-3 text-xs text-fail">
            {formError}
          </p>
        )}
        <TxTracker tx={tx} label="Create milestone" />

        <div className="flex items-center justify-between gap-3 border-t border-black/[0.08] pt-5">
          <p className="text-xs text-ink-400">
            {amountWei
              ? `You will fund ${amountWei / 10n ** 18n} GEN after creating.`
              : "Enter the escrow amount to continue."}
          </p>
          <button
            disabled={!canSubmit}
            onClick={submit}
            className="btn-pill bg-verdict-400 px-5 py-2.5 text-sm font-medium text-white hover:bg-verdict-600 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Create milestone
          </button>
        </div>
      </Card>
    </div>
  );
}
