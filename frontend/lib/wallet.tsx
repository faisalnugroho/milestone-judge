"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getWriteContract } from "./contract";

// Minimal EIP-1193 provider shape
interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void
  ) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  isMetaMaskInstalled: boolean;
  error: string | null;
}

interface WalletContextValue extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

const DISCONNECT_FLAG = "mj_wallet_disconnected";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    address: null,
    isConnected: false,
    isMetaMaskInstalled: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setState((s) => ({ ...s, isMetaMaskInstalled: false }));
      return;
    }
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_accounts",
      })) as string[];
      const intentionallyDisconnected =
        typeof window !== "undefined" &&
        localStorage.getItem(DISCONNECT_FLAG) === "true";
      if (accounts.length > 0 && !intentionallyDisconnected) {
        setState({
          address: accounts[0],
          isConnected: true,
          isMetaMaskInstalled: true,
          error: null,
        });
      } else {
        setState({
          address: null,
          isConnected: false,
          isMetaMaskInstalled: true,
          error: null,
        });
      }
    } catch {
      setState((s) => ({ ...s, isMetaMaskInstalled: true }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (typeof window === "undefined" || !window.ethereum?.on) return;
    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (!accounts || accounts.length === 0) {
        setState((s) => ({ ...s, address: null, isConnected: false }));
      } else {
        setState((s) => ({ ...s, address: accounts[0], isConnected: true }));
      }
    };
    window.ethereum.on("accountsChanged", onAccountsChanged);
    return () => {
      window.ethereum?.removeListener?.(
        "accountsChanged",
        onAccountsChanged
      );
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setState((s) => ({
        ...s,
        error: "MetaMask is not installed. Install MetaMask to use MilestoneJudge.",
      }));
      return;
    }
    try {
      localStorage.removeItem(DISCONNECT_FLAG);
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (accounts.length === 0) throw new Error("No accounts found");
      setState({
        address: accounts[0],
        isConnected: true,
        isMetaMaskInstalled: true,
        error: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Wallet connection failed";
      setState((s) => ({ ...s, error: msg }));
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.setItem(DISCONNECT_FLAG, "true");
    setState({
      address: null,
      isConnected: false,
      isMetaMaskInstalled: state.isMetaMaskInstalled,
      error: null,
    });
  }, [state.isMetaMaskInstalled]);

  return (
    <WalletContext.Provider
      value={{ ...state, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}

/** Contract bound to the connected wallet (throws if not configured). */
export function useWriteContract() {
  const { address } = useWallet();
  if (!address) return null;
  try {
    return getWriteContract(address);
  } catch {
    return null;
  }
}
