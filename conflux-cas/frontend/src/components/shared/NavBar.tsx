'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { injected, useAccount, useConnect } from 'wagmi';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import {
  EXPECTED_CHAIN_NAME,
  useNetworkSwitch,
} from '../../hooks/useNetworkSwitch';
import { useAuthContext } from '../../lib/auth-context';

// ─── Copy-to-clipboard address chip with inline status dot ───────────────────
type SignStatus = 'signed' | 'unsigned' | 'loading';

function AddressChip({
  address,
  status,
}: {
  address: string;
  status: SignStatus;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const dotEl =
    status === 'loading' ? (
      <svg
        className="h-2.5 w-2.5 animate-spin text-slate-400 flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <path
          d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
          strokeLinecap="round"
        />
      </svg>
    ) : status === 'signed' ? (
      <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_5px_#4ade80] flex-shrink-0" />
    ) : (
      <span className="h-2 w-2 rounded-full bg-orange-400 shadow-[0_0_5px_#fb923c] flex-shrink-0" />
    );

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied!' : address}
      className="group flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800
                 px-2.5 py-1 transition-colors hover:border-conflux-500 hover:bg-slate-700"
    >
      {dotEl}
      <span className="font-mono text-xs text-slate-200">
        {address.slice(0, 6)}…{address.slice(-4)}
      </span>
      {/* copy / check icon */}
      {copied ? (
        <svg
          className="h-3 w-3 text-green-400 flex-shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 8l4 4 8-8" />
        </svg>
      ) : (
        <svg
          className="h-3 w-3 text-slate-500 group-hover:text-conflux-400 flex-shrink-0 transition-colors"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5" y="5" width="8" height="8" rx="1.5" />
          <path d="M11 5V4a1 1 0 00-1-1H4a1 1 0 00-1 1v6a1 1 0 001 1h1" />
        </svg>
      )}
    </button>
  );
}

export function NavBar() {
  const { isConnected } = useAccount();
  const { connect } = useConnect();
  const { address, token, isLoading, error, login, logout } = useAuthContext();
  const isAdmin = useIsAdmin();
  const { isWrongNetwork, isSwitching, switchError, handleSwitchNetwork } =
    useNetworkSwitch();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <nav className="border-b border-slate-800 bg-slate-950 px-4 py-3">
      <div className="mx-auto max-w-7xl flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="text-lg font-bold text-white flex items-center gap-2"
        >
          <span className="text-conflux-400">⚡</span>
          Conflux Automation
        </Link>

        {/* Links */}
        <div className="hidden md:flex items-center gap-6 text-slate-400 text-sm">
          {mounted && isAdmin && (
            <Link href="/safety" className="hover:text-white transition-colors">
              Safety
            </Link>
          )}
          <Link href="/status" className="hover:text-white transition-colors">
            Status
          </Link>
        </div>

        {/* Wallet widget */}
        <div className="min-w-[120px] flex justify-end">
          {!mounted ? (
            <div className="h-8 w-40 rounded-xl bg-slate-800 animate-pulse" />
          ) : !isConnected ? (
            <button
              type="button"
              onClick={() => connect({ connector: injected() })}
              className="bg-conflux-600 hover:bg-conflux-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Connect Wallet
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {/* Address chip — dot reflects sign status, click to copy */}
              {address && (
                <AddressChip
                  address={address}
                  status={isLoading ? 'loading' : token ? 'signed' : 'unsigned'}
                />
              )}

              {/* Adaptive action button: wrong-network → switch | signing → disabled | unsigned → sign | signed → disconnect */}
              {isWrongNetwork ? (
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={handleSwitchNetwork}
                    disabled={isSwitching}
                    className="flex items-center gap-1.5 text-xs bg-amber-600 hover:bg-amber-500
                               disabled:opacity-50 text-white py-1 px-3 rounded-lg transition-colors whitespace-nowrap"
                    title={`Switch wallet to ${EXPECTED_CHAIN_NAME}`}
                  >
                    <span>⚠</span>
                    {isSwitching
                      ? 'Switching…'
                      : `Switch to ${EXPECTED_CHAIN_NAME}`}
                  </button>
                  {switchError && (
                    <span className="text-xs text-red-400 max-w-[180px] text-right leading-tight">
                      {switchError}
                    </span>
                  )}
                </div>
              ) : isLoading ? (
                <button
                  type="button"
                  disabled
                  className="flex items-center gap-1.5 text-xs border border-slate-700 text-slate-500
                             py-1 px-3 rounded-lg cursor-not-allowed opacity-60"
                >
                  <svg
                    className="h-3 w-3 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path
                      d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                      strokeLinecap="round"
                    />
                  </svg>
                  Signing…
                </button>
              ) : !token ? (
                <button
                  type="button"
                  onClick={() => void login()}
                  title={error ?? 'Sign a message to authenticate'}
                  className="text-xs bg-conflux-600 hover:bg-conflux-700 text-white py-1 px-3 rounded-lg transition-colors"
                >
                  Sign In
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => logout()}
                  title="Disconnect wallet"
                  className="flex items-center gap-1 text-xs border border-slate-700 hover:border-red-600
                             text-slate-400 hover:text-red-400 py-1 px-2.5 rounded-lg transition-colors"
                >
                  <svg
                    className="h-3 w-3 flex-shrink-0"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" />
                  </svg>
                  <span className="hidden sm:inline">Disconnect</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
