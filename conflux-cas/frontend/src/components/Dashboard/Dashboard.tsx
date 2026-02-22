'use client';

import type { DCAJob, Job, LimitOrderJob } from '@conflux-cas/shared';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { useAuthContext } from '@/lib/auth-context';
import {
  AUTOMATION_MANAGER_ABI,
  AUTOMATION_MANAGER_ADDRESS,
} from '@/lib/contracts';

const CACHE_KEY = 'cas_pool_meta_v2';
const POLL_MS = 30_000;

// ─── Token meta ──────────────────────────────────────────────────────────────

interface TokenMeta {
  symbol: string;
  decimals: number;
  logoURI?: string;
  name?: string;
}

function loadTokenCache(): Map<string, TokenMeta> {
  if (typeof window === 'undefined') return new Map();
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return new Map();
    const c = JSON.parse(raw) as {
      tokens: Array<{
        address: string;
        symbol: string;
        decimals: number;
        logoURI?: string;
        name?: string;
      }>;
    };
    return new Map(
      c.tokens.map((t) => [
        t.address.toLowerCase(),
        {
          symbol: t.symbol,
          decimals: t.decimals,
          logoURI: t.logoURI,
          name: t.name,
        },
      ])
    );
  } catch {
    return new Map();
  }
}

function symOf(addr: string, cache: Map<string, TokenMeta>): string {
  return cache.get(addr.toLowerCase())?.symbol ?? `${addr.slice(0, 6)}…`;
}

function decimalsOf(addr: string, cache: Map<string, TokenMeta>): number {
  return cache.get(addr.toLowerCase())?.decimals ?? 18;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtAmt(wei: string, decimals: number): string {
  const n = Number(formatUnits(BigInt(wei), decimals));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toPrecision(4);
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtNext(ms: number): string {
  const diff = Math.floor((ms - Date.now()) / 1000);
  if (diff <= 0) return 'now';
  if (diff < 60) return `in ${diff}s`;
  if (diff < 3600) return `in ${Math.floor(diff / 60)}m`;
  return `in ${Math.floor(diff / 3600)}h`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-900/50 text-yellow-400 border border-yellow-700',
  active: 'bg-blue-900/50 text-blue-400 border border-blue-700',
  executed: 'bg-green-900/50 text-green-400 border border-green-700',
  cancelled: 'bg-slate-800 text-slate-500 border border-slate-700',
  failed: 'bg-red-900/50 text-red-400 border border-red-700',
  paused: 'bg-purple-900/50 text-purple-400 border border-purple-700',
};

const TERMINAL = new Set(['executed', 'cancelled', 'failed']);

// ─── Mini token chip ──────────────────────────────────────────────────────────

function TokenChip({
  meta,
  size = 'sm',
}: {
  meta?: TokenMeta;
  size?: 'xs' | 'sm';
}) {
  const dim = size === 'xs' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <span className="inline-flex items-center gap-1.5">
      {meta?.logoURI ? (
        <img
          src={meta.logoURI}
          alt={meta.symbol}
          className={`${dim} rounded-full bg-white ring-1 ring-slate-600 object-contain flex-shrink-0`}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <span
          className={`${dim} rounded-full bg-slate-700 ring-1 ring-slate-600 flex-shrink-0`}
        />
      )}
      <span className="font-semibold text-slate-200">
        {meta?.symbol ?? '?'}
      </span>
    </span>
  );
}

// ─── Job row ──────────────────────────────────────────────────────────────────

function JobRow({
  job,
  tokenCache,
  onCancel,
}: {
  job: Job;
  tokenCache: Map<string, TokenMeta>;
  onCancel: (id: string) => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const { token } = useAuthContext();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const handleCancel = async () => {
    setCancelling(true);
    try {
      // Cancel on-chain first if the job has an on-chain ID.
      if (job.onChainJobId && publicClient) {
        try {
          const hash = await writeContractAsync({
            address: AUTOMATION_MANAGER_ADDRESS,
            abi: AUTOMATION_MANAGER_ABI,
            functionName: 'cancelJob',
            args: [job.onChainJobId as `0x${string}`],
          });
          await publicClient.waitForTransactionReceipt({ hash });
        } catch (onChainErr: unknown) {
          const msg = (onChainErr as Error)?.message ?? '';
          // JobNotActive = already closed on-chain, proceed to clean up DB.
          if (
            !msg.includes('JobNotActive') &&
            !msg.includes('user rejected') &&
            !msg.includes('User rejected')
          ) {
            throw onChainErr;
          }
        }
      }
      await fetch(`/api/jobs/${job.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      onCancel(job.id);
    } catch {
      setCancelling(false);
    }
  };

  const isTerminal = TERMINAL.has(job.status);
  const badgeCls = STATUS_STYLES[job.status] ?? STATUS_STYLES.failed;

  const metaIn = tokenCache.get(
    (job.type === 'limit_order'
      ? (job as LimitOrderJob).params.tokenIn
      : (job as DCAJob).params.tokenIn
    ).toLowerCase()
  );
  const metaOut = tokenCache.get(
    (job.type === 'limit_order'
      ? (job as LimitOrderJob).params.tokenOut
      : (job as DCAJob).params.tokenOut
    ).toLowerCase()
  );

  // Pair & amount
  let tokenIn: string, tokenOut: string, amtIn: string;
  let targetCell: React.ReactNode;

  if (job.type === 'limit_order') {
    const lo = job as LimitOrderJob;
    tokenIn = lo.params.tokenIn;
    tokenOut = lo.params.tokenOut;
    amtIn = fmtAmt(lo.params.amountIn, decimalsOf(tokenIn, tokenCache));
    const isGte = lo.params.direction === 'gte';
    const tgt = Number(
      formatUnits(BigInt(lo.params.targetPrice), 18)
    ).toPrecision(5);
    targetCell = (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${
          isGte
            ? 'border-emerald-800/70 bg-emerald-950/40 text-emerald-300'
            : 'border-amber-800/70 bg-amber-950/40 text-amber-300'
        }`}
      >
        {isGte ? '↑' : '↓'} {tgt} <TokenChip meta={metaOut} size="xs" />
      </span>
    );
  } else {
    const dca = job as DCAJob;
    tokenIn = dca.params.tokenIn;
    tokenOut = dca.params.tokenOut;
    amtIn = fmtAmt(dca.params.amountPerSwap, decimalsOf(tokenIn, tokenCache));
    const done = dca.params.swapsCompleted;
    const total = dca.params.totalSwaps;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const allDone = done >= total && total > 0;
    const next = isTerminal
      ? allDone
        ? 'Complete'
        : '—'
      : fmtNext(dca.params.nextExecution);
    const chipColor = allDone
      ? 'border-sky-800/70 bg-sky-950/40 text-sky-300'
      : isTerminal
        ? 'border-slate-700 bg-slate-900 text-slate-500'
        : 'border-blue-800/70 bg-blue-950/40 text-blue-300';
    targetCell = (
      <span
        className={`inline-flex flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 min-w-[8rem] ${chipColor}`}
      >
        {/* progress bar */}
        <span className="flex items-center gap-2">
          <span className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
            <span
              className={`h-full rounded-full transition-all ${allDone ? 'bg-sky-400' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="text-xs font-mono font-semibold shrink-0">
            {done}/{total}
          </span>
        </span>
        {/* next execution */}
        <span className="text-[10px] opacity-70 text-right">{next}</span>
      </span>
    );
  }

  const symIn = symOf(tokenIn, tokenCache);
  const _symOut = symOf(tokenOut, tokenCache);

  return (
    <tr className="border-t border-slate-800 hover:bg-slate-800/30 transition-colors">
      {/* Status */}
      <td className="px-3 py-3 whitespace-nowrap">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeCls}`}
        >
          {job.status}
        </span>
      </td>
      {/* Type */}
      <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-400 uppercase tracking-wide">
        {job.type === 'limit_order' ? 'Limit' : 'DCA'}
      </td>
      {/* Pair — icon chips */}
      <td className="px-3 py-3 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 text-sm">
          <TokenChip meta={metaIn} />
          <span className="text-slate-600">→</span>
          <TokenChip meta={metaOut} />
        </span>
      </td>
      {/* Amount — icon + number */}
      <td className="px-3 py-3 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1">
          {metaIn?.logoURI ? (
            <img
              src={metaIn.logoURI}
              alt={symIn}
              className="h-3.5 w-3.5 rounded-full bg-white ring-1 ring-slate-600 object-contain flex-shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <span className="h-3.5 w-3.5 rounded-full bg-slate-700 ring-1 ring-slate-600 flex-shrink-0" />
          )}
          <span className="text-sm font-mono font-semibold text-slate-100">
            {amtIn}
          </span>
          <span className="text-xs text-slate-400">{symIn}</span>
        </span>
      </td>
      {/* Target / Progress */}
      <td className="px-3 py-3 whitespace-nowrap text-xs">{targetCell}</td>
      {/* Retries */}
      <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-500 text-center">
        {job.retries}/{job.maxRetries}
      </td>
      {/* Created */}
      <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-500">
        {timeAgo(job.createdAt)}
      </td>
      {/* Actions */}
      <td className="px-3 py-3 whitespace-nowrap text-xs">
        <Link
          href={`/job/${job.id}`}
          className="text-conflux-400 hover:underline mr-3"
        >
          Details
        </Link>
        {!isTerminal && (
          <button
            type="button"
            onClick={() => void handleCancel()}
            disabled={cancelling}
            className="text-red-500 hover:underline disabled:opacity-40"
          >
            {cancelling ? '…' : 'Cancel'}
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard({ onCreateNew }: { onCreateNew?: () => void } = {}) {
  const { address } = useAccount();
  const { token } = useAuthContext();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenCache, setTokenCache] = useState<Map<string, TokenMeta>>(
    new Map()
  );
  const esRef = useRef<EventSource | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 401) {
        setError('Sign in to view your strategies.');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch jobs');
      const data = (await res.json()) as { jobs?: Job[] };
      setJobs(data.jobs ?? []);
      setError(null); // clear any previous auth/fetch error on success
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const connectSSERef = useRef<() => void>(() => undefined);

  connectSSERef.current = () => {
    if (!token) return;
    esRef.current?.close();
    const es = new EventSource(
      `/api/sse/jobs?token=${encodeURIComponent(token)}`
    );
    esRef.current = es;
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data as string) as {
          type: string;
          job: Job;
        };
        if (data.type === 'job_update') {
          setJobs((prev) =>
            prev.some((j) => j.id === data.job.id)
              ? prev.map((j) => (j.id === data.job.id ? data.job : j))
              : [data.job, ...prev]
          );
        }
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      es.close();
      setTimeout(() => connectSSERef.current(), 5_000);
    };
  };

  const connectSSE = useCallback(() => connectSSERef.current(), []);

  useEffect(() => {
    if (!address) return;
    // Reset loading + error whenever auth state changes so the UI doesn't
    // stay stuck on a 401 error after the user completes SIWE sign-in.
    setLoading(true);
    setError(null);
    setTokenCache(loadTokenCache());
    void fetchJobs();
    connectSSE();
    const poll = setInterval(() => void fetchJobs(), POLL_MS);
    return () => {
      clearInterval(poll);
      esRef.current?.close();
    };
  }, [address, fetchJobs, connectSSE]);

  if (loading)
    return <p className="text-slate-400 animate-pulse">Loading strategies…</p>;
  if (error)
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-3">{error}</p>
        {error.includes('Sign in') && (
          <p className="text-slate-500 text-sm">
            Connect your wallet and sign in — your strategies will appear
            automatically.
          </p>
        )}
      </div>
    );

  if (jobs.length === 0) {
    return (
      <div className="text-center py-24 text-slate-500 space-y-4">
        <div className="text-5xl">📋</div>
        <p className="text-lg font-medium text-slate-400">No strategies yet</p>
        <p className="text-sm text-slate-600">
          Automate your first limit order or DCA strategy.
        </p>
        {onCreateNew ? (
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 mt-2 bg-conflux-600 hover:bg-conflux-700 text-white font-semibold py-2.5 px-6 rounded-xl transition-colors text-sm"
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
        ) : (
          <Link
            href="/create"
            className="text-conflux-400 underline mt-2 inline-block"
          >
            Create one →
          </Link>
        )}
      </div>
    );
  }

  const active = jobs.filter((j) => !TERMINAL.has(j.status));
  const terminal = jobs.filter((j) => TERMINAL.has(j.status));

  const renderTable = (rows: Job[], label: string) => (
    <div>
      {active.length > 0 && terminal.length > 0 && (
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
          {label}
        </h3>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-900 text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Pair</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Target / Progress</th>
              <th className="px-3 py-2 text-center">Retries</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                tokenCache={tokenCache}
                onCancel={(id) =>
                  setJobs((prev) => prev.filter((j) => j.id !== id))
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {active.length > 0 && renderTable(active, 'Active')}
      {terminal.length > 0 && renderTable(terminal, 'History')}
    </div>
  );
}
