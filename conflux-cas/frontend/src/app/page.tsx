'use client';

import { useCallback, useEffect, useState } from 'react';
import { injected, useAccount, useConnect } from 'wagmi';
import { Dashboard } from '@/components/Dashboard/Dashboard';
import { StrategyBuilder } from '@/components/StrategyBuilder/StrategyBuilder';
import {
  EXPECTED_CHAIN_NAME,
  useNetworkSwitch,
} from '@/hooks/useNetworkSwitch';
import { useAuthContext } from '@/lib/auth-context';

// ── Strategy modal ────────────────────────────────────────────────────────────

function StrategyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [txInProgress, setTxInProgress] = useState(false);

  // Close on Escape — blocked while transactions are running
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !txInProgress) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, txInProgress]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-label="Create strategy"
    >
      {/* Backdrop — not clickable while tx is running */}
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm ${txInProgress ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={txInProgress ? undefined : onClose}
      />

      {/* Centered modal panel */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-white tracking-tight">
            New Strategy
          </h2>
          <button
            type="button"
            onClick={txInProgress ? undefined : onClose}
            disabled={txInProgress}
            title={txInProgress ? 'Complete or cancel transactions first' : 'Close'}
            className={`p-1 rounded-lg transition-colors ${txInProgress ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <StrategyBuilder onSuccess={onClose} onSubmittingChange={setTxInProgress} />
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { isConnected } = useAccount();
  const { connect } = useConnect();
  const { address, token, isLoading, error, login } = useAuthContext();
  const { isWrongNetwork, isSwitching, switchError, handleSwitchNetwork } =
    useNetworkSwitch();
  const [mounted, setMounted] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const openStrategy = useCallback(() => setStrategyOpen(true), []);
  const closeStrategy = useCallback(() => setStrategyOpen(false), []);

  useEffect(() => setMounted(true), []);

  // ── Pre-hydration skeleton ────────────────────────────────────────────────
  if (!mounted) return <div className="min-h-screen" />;

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] text-center gap-8">
        <div className="space-y-4">
          <h1 className="text-6xl font-bold text-white tracking-tight">
            Conflux Automation
          </h1>
          <p className="text-xl text-slate-400 max-w-xl mx-auto leading-relaxed">
            Non-custodial limit orders and DCA strategies on Conflux eSpace.
            Your keys, your tokens — automated execution without custody.
          </p>
        </div>
        <button
          type="button"
          onClick={() => connect({ connector: injected() })}
          className="bg-conflux-600 hover:bg-conflux-700 text-white text-lg font-semibold py-4 px-12 rounded-xl transition-colors shadow-lg shadow-conflux-900/40"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  // ── Connected but wrong network ───────────────────────────────────────────
  if (isWrongNetwork) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] text-center gap-8">
        <div className="space-y-4">
          <h1 className="text-6xl font-bold text-white tracking-tight">
            Conflux Automation
          </h1>
          <p className="text-xl text-slate-400 max-w-xl mx-auto leading-relaxed">
            Please switch your wallet to{' '}
            <span className="text-amber-400 font-semibold">
              {EXPECTED_CHAIN_NAME}
            </span>{' '}
            to continue.
          </p>
          <p className="text-xs text-slate-500 font-mono">
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSwitchNetwork()}
          disabled={isSwitching}
          className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-lg font-semibold py-4 px-12 rounded-xl transition-colors shadow-lg shadow-amber-900/40"
        >
          {isSwitching ? 'Switching…' : `Switch to ${EXPECTED_CHAIN_NAME}`}
        </button>
        {switchError && <p className="text-red-400 text-sm">{switchError}</p>}
      </div>
    );
  }

  // ── Connected + SIWE in progress (auto-sign fired) ────────────────────────
  if (!token && isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] text-center gap-6">
        <div className="w-10 h-10 rounded-full border-2 border-conflux-500 border-t-transparent animate-spin" />
        <p className="text-slate-400 text-lg">
          Check your wallet — sign the message to continue.
        </p>
        <p className="text-xs text-slate-500 font-mono">
          {address?.slice(0, 6)}…{address?.slice(-4)}
        </p>
      </div>
    );
  }

  // ── Connected but signature was rejected ─────────────────────────────────
  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] text-center gap-8">
        <div className="space-y-3">
          <h1 className="text-6xl font-bold text-white tracking-tight">
            Conflux Automation
          </h1>
          <p className="text-xl text-slate-400 max-w-xl mx-auto leading-relaxed">
            Sign the message in your wallet to verify ownership.
          </p>
          <p className="text-xs text-slate-500 font-mono">
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void login()}
          className="bg-conflux-600 hover:bg-conflux-700 text-white text-lg font-semibold py-4 px-12 rounded-xl transition-colors shadow-lg shadow-conflux-900/40"
        >
          Sign In with Wallet
        </button>
        {error && <p className="text-red-400 text-sm max-w-sm">{error}</p>}
      </div>
    );
  }

  // ── Signed in: history-first layout ──────────────────────────────────────
  return (
    <>
      <div className="space-y-6">
        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              My Strategies
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Active and historical automation orders
            </p>
          </div>
          <button
            type="button"
            onClick={openStrategy}
            className="inline-flex items-center gap-2 bg-conflux-600 hover:bg-conflux-700 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors shadow-md shadow-conflux-900/40 text-sm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            New Strategy
          </button>
        </div>

        {/* ── Strategy history / table ── */}
        <Dashboard onCreateNew={openStrategy} />
      </div>

      {/* ── Strategy builder slide-over ── */}
      <StrategyModal open={strategyOpen} onClose={closeStrategy} />
    </>
  );
}
