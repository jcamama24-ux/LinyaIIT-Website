import { WifiOff, RefreshCw } from 'lucide-react';
import type { RealtimeStatus } from '../types/database';

interface ConnectionBadgeProps {
  status: RealtimeStatus;
  onRefresh?: () => void;
}

export function ConnectionBadge({ status, onRefresh }: ConnectionBadgeProps) {
  if (status === 'connected') {
    return (
      <button
        type="button"
        onClick={onRefresh}
        title="Connected via Supabase Realtime — click to refresh"
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 transition hover:bg-emerald-100"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span>Live</span>
      </button>
    );
  }

  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span>{status === 'connecting' ? 'Connecting...' : 'Reconnecting...'}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onRefresh}
      className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100"
    >
      <WifiOff className="h-3 w-3" />
      <span>Offline — Tap to retry</span>
    </button>
  );
}
