"use client";

import { createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import type {
  AdjudicationSnapshot,
  ContractStats,
  DisputeRecord,
  Milestone,
  MilestoneRef,
  TxState,
} from "./types";

// ---------------------------------------------------------------------------
// Environment-driven network selection (Studionet default, Bradbury option)
// ---------------------------------------------------------------------------

export const CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID || "61999"
);
export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_GENLAYER_EXPLORER ||
  "https://explorer-studio.genlayer.com";

function chainForEnv() {
  return CHAIN_ID === 4221 ? testnetBradbury : studionet;
}

export function getContractAddress(): string {
  return process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
}

function makeClient(address?: string) {
  const config: Record<string, unknown> = {
    chain: chainForEnv(),
  };
  const rpc = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL;
  if (rpc) config.endpoint = rpc;
  if (address) config.account = address;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient(config as any);
}

// ---------------------------------------------------------------------------
// Contract binding
// ---------------------------------------------------------------------------

function parseJsonOr<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return (raw as T) ?? fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class MilestoneJudgeContract {
  readonly address: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private account: string | null;

  constructor(address: string, account?: string | null) {
    this.address = address as `0x${string}`;
    this.account = account ?? null;
    this.client = makeClient(account ?? undefined);
  }

  updateAccount(account: string | null) {
    this.account = account;
    this.client = makeClient(account ?? undefined);
  }

  hasAccount(): boolean {
    return this.account !== null;
  }

  // ------------------------------------------------------------- reads

  async getMilestone(id: string | number): Promise<Milestone | { error: string }> {
    const raw = await this.client.readContract({
      address: this.address,
      functionName: "get_milestone",
      args: [BigInt(id)],
    });
    return parseJsonOr<Milestone | { error: string }>(raw, { error: "unreadable" });
  }

  async getMilestoneIds(): Promise<string[]> {
    const raw = await this.client.readContract({
      address: this.address,
      functionName: "get_milestone_ids",
      args: [],
    });
    if (Array.isArray(raw)) return raw.map(String);
    return [];
  }

  async getMilestonesFor(addr: string): Promise<MilestoneRef[]> {
    const raw = await this.client.readContract({
      address: this.address,
      functionName: "get_milestones_for",
      args: [addr],
    });
    return parseJsonOr<MilestoneRef[]>(raw, []);
  }

  async getAdjudications(id: string | number): Promise<AdjudicationSnapshot[]> {
    const raw = await this.client.readContract({
      address: this.address,
      functionName: "get_adjudications",
      args: [BigInt(id)],
    });
    return parseJsonOr<AdjudicationSnapshot[]>(raw, []);
  }

  async getDispute(id: string | number): Promise<DisputeRecord | { error: string }> {
    const raw = await this.client.readContract({
      address: this.address,
      functionName: "get_dispute",
      args: [BigInt(id)],
    });
    return parseJsonOr<DisputeRecord | { error: string }>(raw, { error: "not_found" });
  }

  async getParams(): Promise<Record<string, number>> {
    const raw = await this.client.readContract({
      address: this.address,
      functionName: "get_params",
      args: [],
    });
    return parseJsonOr<Record<string, number>>(raw, {});
  }

  async getContractBalance(): Promise<bigint> {
    const raw = await this.client.readContract({
      address: this.address,
      functionName: "get_contract_balance",
      args: [],
    });
    return BigInt(raw as string | bigint);
  }

  async getStats(): Promise<ContractStats> {
    const raw = await this.client.readContract({
      address: this.address,
      functionName: "get_stats",
      args: [],
    });
    return parseJsonOr<ContractStats>(raw, {
      total_milestones: 0,
      counts: {},
      locked_wei: "0",
      contract_balance_wei: "0",
    });
  }

  // ------------------------------------------------------------- writes

  /** Runs a write through the full GenLayer lifecycle with live phase
   *  callbacks. Returns the FINALIZED receipt (or throws). */
  async write(
    functionName: string,
    args: unknown[],
    onPhase: (state: TxState) => void,
    value?: bigint
  ): Promise<unknown> {
    onPhase({ phase: "signing" });
    const writeArgs: Record<string, unknown> = {
      address: this.address,
      functionName,
      args,
      value: value ?? 0n,
    };
    const hash = await this.client.writeContract(writeArgs);
    onPhase({ phase: "pending", hash: String(hash) });

    // Poll GenLayer status through the consensus pipeline, surfacing the
    // raw network states (PROPOSING/COMMITTING/REVEALING/ACCEPTED/FINALIZED).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const receipt: any = await this.client.waitForTransactionReceipt({
      hash,
      status: "FINALIZED",
      interval: 3000,
      retries: 100,
    });
    const status = String(
      receipt?.status ?? receipt?.tx_status ?? "FINALIZED"
    );
    onPhase({ phase: "finalized", hash: String(hash), consensus: status });

    // A FINALIZED consensus can still carry a failed execution — surface it.
    const leader = receipt?.consensus_data?.leader_receipt?.[0];
    const execResult = leader?.execution_result;
    if (execResult && String(execResult).toUpperCase() === "ERROR") {
      const msg = String(leader?.result?.payload ?? "execution failed");
      onPhase({ phase: "failed", hash: String(hash), error: msg });
      throw new Error(`Contract execution failed: ${msg}`);
    }
    return receipt;
  }

  async createMilestone(
    p: {
      title: string;
      description: string;
      worker: string;
      criteriaJson: string;
      evidenceRequirements: string;
      deadlineEpoch: bigint;
      amountWei: bigint;
      initialUrlsJson: string;
    },
    onPhase: (s: TxState) => void
  ): Promise<unknown> {
    return this.write(
      "create_milestone",
      [
        p.title,
        p.description,
        p.worker,
        p.criteriaJson,
        p.evidenceRequirements,
        p.deadlineEpoch,
        p.amountWei,
        p.initialUrlsJson,
      ],
      onPhase
    );
  }

  async fundMilestone(
    id: string | number,
    amountWei: bigint,
    onPhase: (s: TxState) => void
  ): Promise<unknown> {
    return this.write("fund_milestone", [BigInt(id)], onPhase, amountWei);
  }

  async cancelMilestone(
    id: string | number,
    onPhase: (s: TxState) => void
  ): Promise<unknown> {
    return this.write("cancel_milestone", [BigInt(id)], onPhase);
  }

  async markExpired(
    id: string | number,
    onPhase: (s: TxState) => void
  ): Promise<unknown> {
    return this.write("mark_expired", [BigInt(id)], onPhase);
  }

  async submitEvidence(
    id: string | number,
    evidenceJson: string,
    statement: string,
    onPhase: (s: TxState) => void
  ): Promise<unknown> {
    return this.write(
      "submit_evidence",
      [BigInt(id), evidenceJson, statement],
      onPhase
    );
  }

  async startAdjudication(
    id: string | number,
    onPhase: (s: TxState) => void
  ): Promise<unknown> {
    return this.write("start_adjudication", [BigInt(id)], onPhase);
  }

  async finalizeMilestone(
    id: string | number,
    onPhase: (s: TxState) => void
  ): Promise<unknown> {
    return this.write("finalize_milestone", [BigInt(id)], onPhase);
  }

  async openDispute(
    id: string | number,
    reason: string,
    evidenceJson: string,
    onPhase: (s: TxState) => void
  ): Promise<unknown> {
    return this.write(
      "open_dispute",
      [BigInt(id), reason, evidenceJson],
      onPhase
    );
  }

  async submitDisputeEvidence(
    id: string | number,
    evidenceJson: string,
    onPhase: (s: TxState) => void
  ): Promise<unknown> {
    return this.write(
      "submit_dispute_evidence",
      [BigInt(id), evidenceJson],
      onPhase
    );
  }

  async resolveDispute(
    id: string | number,
    onPhase: (s: TxState) => void
  ): Promise<unknown> {
    return this.write("resolve_dispute", [BigInt(id)], onPhase);
  }
}

// ---------------------------------------------------------------------------
// Singleton access for read-only + account-bound usage
// ---------------------------------------------------------------------------

let readInstance: MilestoneJudgeContract | null = null;

export function getReadContract(): MilestoneJudgeContract | null {
  const addr = getContractAddress();
  if (!addr) return null;
  if (!readInstance) readInstance = new MilestoneJudgeContract(addr);
  return readInstance;
}

export function getWriteContract(account: string): MilestoneJudgeContract {
  const addr = getContractAddress();
  if (!addr) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured");
  return new MilestoneJudgeContract(addr, account);
}

export function explorerAddress(addr: string): string {
  return `${EXPLORER_URL}/address/${addr}`;
}

export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}
