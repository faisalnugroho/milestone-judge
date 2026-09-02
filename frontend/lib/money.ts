"use client";

// ---------------------------------------------------------------------------
// Money helpers — 1 GEN = 10^18 wei. BigInt ONLY, never Number/float.
// ---------------------------------------------------------------------------

export const WEI_PER_GEN = 10n ** 18n;

/** Parse a user-typed GEN amount ("1.5") into wei BigInt. Throws on junk. */
export function parseGenToWei(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new Error("Invalid GEN amount");
  }
  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  if (fracRaw.length > 18) {
    throw new Error("Max 18 decimal places");
  }
  const whole = wholeRaw || "0";
  const frac = (fracRaw + "0".repeat(18)).slice(0, 18);
  return BigInt(whole) * WEI_PER_GEN + BigInt(frac || "0");
}

/** Format wei BigInt into a display GEN string with up to 4 decimals. */
export function formatWeiAsGen(wei: string | bigint): string {
  const v = typeof wei === "string" ? BigInt(wei || "0") : wei;
  const whole = v / WEI_PER_GEN;
  const frac = v % WEI_PER_GEN;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

/** Truncate an address for display: 0x1234…abcd */
export function shortAddress(addr: string | undefined, size = 4): string {
  if (!addr) return "";
  if (addr.length <= 2 + size * 2) return addr;
  return `${addr.slice(0, 2 + size)}…${addr.slice(-size)}`;
}

/** Format epoch-seconds (string from contract) as a local datetime string. */
export function formatEpoch(epoch: string | number | undefined): string {
  if (epoch === undefined || epoch === "" || epoch === "0") return "—";
  const n = typeof epoch === "number" ? epoch : parseInt(epoch, 10);
  if (Number.isNaN(n) || n <= 0) return "—";
  return new Date(n * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Countdown-ish relative rendering for deadlines/dispute windows. */
export function timeLeft(epoch: string | undefined, nowMs = Date.now()): string {
  if (!epoch) return "—";
  const target = parseInt(epoch, 10) * 1000;
  if (Number.isNaN(target)) return "—";
  const diff = target - nowMs;
  if (diff <= 0) return "passed";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}
