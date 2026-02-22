'use client';

import { useEffect, useState } from 'react';
import { SafetyPanel } from '@/components/SafetyPanel/SafetyPanel';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { DEFAULT_SAFETY_CONFIG } from '@/lib/safety';

export default function SafetyPage() {
  const isAdmin = useIsAdmin();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Defer rendering until after client hydration (wallet state not available on server)
  if (!mounted) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-32 rounded bg-slate-800 animate-pulse" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="text-5xl">🔒</div>
        <h2 className="text-2xl font-bold text-white">Access Restricted</h2>
        <p className="text-slate-400 max-w-sm">
          The Safety panel is only accessible to authorised admin addresses.
          Connect the correct wallet and sign in to continue.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-3xl font-bold mb-2">Safety Settings</h2>
      <p className="text-slate-400 mb-6 text-sm">
        Off-chain safety controls enforced by the execution worker. These limits
        apply to all your strategies.
      </p>
      <SafetyPanel config={DEFAULT_SAFETY_CONFIG} />
    </div>
  );
}
