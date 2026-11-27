import { useCallback, useEffect, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { fetchServicePoints, fetchTodayTickets } from '../lib/queueApi';
import type { RealtimeStatus, ServicePoint, Ticket } from '../types/database';

interface UseRealtimeQueueResult {
  servicePoints: ServicePoint[];
  tickets: Ticket[];
  loading: boolean;
  error: string | null;
  realtimeStatus: RealtimeStatus;
  lastSyncedAt: Date | null;
  refresh: () => Promise<void>;
}

/**
 * Keeps service points and today's tickets live across all connected devices
 * via Supabase Realtime Postgres Changes, with automatic mobile wake-up
 * synchronization (`visibilitychange` & `online`) and reconnection recovery.
 */
export function useRealtimeQueue(): UseRealtimeQueueResult {
  const [servicePoints, setServicePoints] = useState<ServicePoint[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const isFetchingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      setRealtimeStatus('disconnected');
      return;
    }

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const [points, todayTickets] = await Promise.all([
        fetchServicePoints(),
        fetchTodayTickets(),
      ]);
      setServicePoints(points);
      setTickets(todayTickets);
      setError(null);
      setLastSyncedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue data.');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      setRealtimeStatus('disconnected');
      return;
    }

    void refresh();

    const channelName = `linyaiit-live-queue-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        (payload) => {
          setLastSyncedAt(new Date());

          if (payload.eventType === 'INSERT') {
            const inserted = payload.new as Ticket;
            setTickets((prev) => {
              if (prev.some((t) => t.id === inserted.id)) return prev;
              return [...prev, inserted].sort((a, b) => a.sequence_number - b.sequence_number);
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Ticket;
            setTickets((prev) => {
              const exists = prev.some((t) => t.id === updated.id);
              if (!exists) {
                return [...prev, updated].sort((a, b) => a.sequence_number - b.sequence_number);
              }
              return prev.map((t) => (t.id === updated.id ? updated : t));
            });
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<Ticket>;
            if (oldRow.id) {
              setTickets((prev) => prev.filter((t) => t.id !== oldRow.id));
            } else {
              void refresh();
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_points' },
        () => {
          // Re-fetch service points to guarantee clean ordering
          void refresh();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
          // Re-sync after reconnect to catch any events missed while offline
          void refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeStatus('reconnecting');
        } else if (status === 'CLOSED') {
          setRealtimeStatus('disconnected');
        }
      });

    // Mobile browsers suspend WebSockets when screen locks; re-sync immediately on wake
    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void refresh();
      }
    };

    const handleOffline = () => {
      setRealtimeStatus('disconnected');
    };

    document.addEventListener('visibilitychange', handleVisibilityOrOnline);
    window.addEventListener('online', handleVisibilityOrOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
      window.removeEventListener('online', handleVisibilityOrOnline);
      window.removeEventListener('offline', handleOffline);
      if (supabase) {
        void supabase.removeChannel(channel);
      }
    };
  }, [refresh]);

  return {
    servicePoints,
    tickets,
    loading,
    error,
    realtimeStatus,
    lastSyncedAt,
    refresh,
  };
}
