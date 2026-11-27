import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Clock,
  Loader2,
  MapPin,
  Sparkles,
  Ticket as TicketIcon,
  Users,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BoardingPassCard } from '../components/BoardingPassCard';
import { useRealtimeQueue } from '../hooks/useRealtimeQueue';
import { getMyActiveTicket, joinQueue, leaveQueue } from '../lib/queueApi';
import {
  getStudentSessionToken,
  getTrackedTicketId,
  saveTrackedTicketId,
} from '../lib/session';
import { playCalledAlert, unlockAudioOnGesture } from '../lib/sound';
import {
  PRIORITY_TAG,
  calculateStudentWaitEstimate,
  computeRollingAverageMinutes,
  formatMinutesLabel,
  type RollingWaitStats,
} from '../lib/waitTime';
import type { ServicePoint, Ticket, TicketStatus } from '../types/database';

export function StudentPage() {
  const { servicePoints, tickets, loading, error, realtimeStatus, refresh } = useRealtimeQueue();

  const [sessionToken] = useState<string>(() => getStudentSessionToken());
  const [trackedTicketId, setTrackedTicketId] = useState<string | null>(() => getTrackedTicketId());
  const [optimisticTicket, setOptimisticTicket] = useState<Ticket | null>(null);
  const [restoringTicket, setRestoringTicket] = useState<boolean>(true);

  const [selectedSpId, setSelectedSpId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('');
  const [requestPriorityLane, setRequestPriorityLane] = useState<boolean>(false);

  const [joining, setJoining] = useState<boolean>(false);
  const [leaving, setLeaving] = useState<boolean>(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [callFlashKey, setCallFlashKey] = useState<number>(0);

  const joiningRef = useRef<boolean>(false);
  const prevTicketIdRef = useRef<string | null>(null);
  const prevStatusRef = useRef<TicketStatus | null>(null);
  const prevCalledTsRef = useRef<string | null>(null);

  // Restore student's active ticket from PostgreSQL while keeping localStorage hydration instant
  useEffect(() => {
    let active = true;
    getMyActiveTicket(sessionToken)
      .then((found) => {
        if (!active) return;
        if (found) {
          setOptimisticTicket(found);
          setTrackedTicketId(found.id);
          saveTrackedTicketId(found.id);
        }
      })
      .catch(() => {
        // Non-fatal: handled by main queue error banner
      })
      .finally(() => {
        if (active) setRestoringTicket(false);
      });

    return () => {
      active = false;
    };
  }, [sessionToken]);

  // Drop optimistic copy once the live tickets stream includes the same ticket
  useEffect(() => {
    if (optimisticTicket && tickets.some((t) => t.id === optimisticTicket.id)) {
      setOptimisticTicket(null);
    }
  }, [tickets, optimisticTicket]);

  // Clear stale mirrored localStorage ticket IDs from prior days once today's queue loads
  useEffect(() => {
    if (loading || restoringTicket || joining || !trackedTicketId) return;
    // Never wipe a ticket we just joined/restored while waiting for refresh/realtime to catch up
    if (optimisticTicket?.id === trackedTicketId) return;

    const existsToday = tickets.some((t) => t.id === trackedTicketId);
    if (!existsToday) {
      setTrackedTicketId(null);
      saveTrackedTicketId(null);
    }
  }, [loading, restoringTicket, joining, tickets, trackedTicketId, optimisticTicket]);

  const myTicket: Ticket | null = useMemo(() => {
    if (!trackedTicketId) return null;
    const liveTicket = tickets.find((t) => t.id === trackedTicketId);
    if (liveTicket) return liveTicket;
    if (optimisticTicket && optimisticTicket.id === trackedTicketId) {
      return optimisticTicket;
    }
    return null;
  }, [tickets, trackedTicketId, optimisticTicket]);

  const myServicePoint: ServicePoint | null = useMemo(() => {
    if (!myTicket) return null;
    return servicePoints.find((sp) => sp.id === myTicket.service_point_id) ?? null;
  }, [myTicket, servicePoints]);

  // Trigger audio chime + vibration + animated highlight on waiting -> called OR last_called_at bump
  useEffect(() => {
    if (!myTicket) {
      prevTicketIdRef.current = null;
      prevStatusRef.current = null;
      prevCalledTsRef.current = null;
      return;
    }

    const currentCallTs = myTicket.last_called_at ?? myTicket.called_at ?? null;
    const isSameTicket = prevTicketIdRef.current === myTicket.id;

    if (isSameTicket) {
      const transitionedFromWaitingToCalled =
        prevStatusRef.current === 'waiting' && myTicket.status === 'called';
      const callTimestampBumped =
        myTicket.status === 'called' &&
        currentCallTs !== null &&
        prevCalledTsRef.current !== null &&
        currentCallTs !== prevCalledTsRef.current;

      if (transitionedFromWaitingToCalled || callTimestampBumped) {
        playCalledAlert(soundEnabled);
        setCallFlashKey((k) => k + 1);
      }
    }

    prevTicketIdRef.current = myTicket.id;
    prevStatusRef.current = myTicket.status;
    prevCalledTsRef.current = currentCallTs;
  }, [myTicket, soundEnabled]);

  // Compute live queue counts and rolling-average wait stats per service point
  const spStatsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        waitingCount: number;
        currentServing: Ticket | null;
        rolling: RollingWaitStats;
      }
    >();

    for (const sp of servicePoints) {
      map.set(sp.id, {
        waitingCount: 0,
        currentServing: null,
        rolling: computeRollingAverageMinutes(tickets, sp.id),
      });
    }

    for (const t of tickets) {
      const entry = map.get(t.service_point_id);
      if (!entry) continue;
      if (t.status === 'waiting') {
        entry.waitingCount += 1;
      } else if (t.status === 'called') {
        entry.currentServing = t;
      }
    }

    return map;
  }, [servicePoints, tickets]);

  // Compute live queue position and rolling wait estimate for active student ticket
  const myQueueMetrics = useMemo(() => {
    if (!myTicket) return null;

    const rawSpTickets = tickets.filter((t) => t.service_point_id === myTicket.service_point_id);
    const spTickets = rawSpTickets.some((t) => t.id === myTicket.id)
      ? rawSpTickets
      : [...rawSpTickets, myTicket];

    const currentServing = spTickets.find((t) => t.status === 'called') ?? null;
    const waitingTickets = spTickets
      .filter((t) => t.status === 'waiting')
      .sort((a, b) => a.sequence_number - b.sequence_number);

    const positionIndex = waitingTickets.findIndex((t) => t.id === myTicket.id);
    const position = positionIndex >= 0 ? positionIndex + 1 : 0;
    const aheadCount = positionIndex >= 0 ? positionIndex : 0;

    const rolling =
      spStatsMap.get(myTicket.service_point_id)?.rolling ??
      computeRollingAverageMinutes(tickets, myTicket.service_point_id);

    const waitEstimate = calculateStudentWaitEstimate(
      aheadCount,
      Boolean(currentServing && currentServing.id !== myTicket.id),
      rolling
    );

    return {
      currentServing,
      position,
      aheadCount,
      totalWaiting: waitingTickets.length,
      waitEstimate,
    };
  }, [myTicket, spStatsMap, tickets]);

  const selectedSp = useMemo(
    () => servicePoints.find((sp) => sp.id === selectedSpId) ?? null,
    [servicePoints, selectedSpId]
  );

  async function handleJoinQueue(e: React.FormEvent, targetSp: ServicePoint | null = selectedSp) {
    e.preventDefault();
    if (!targetSp || !targetSp.is_active || joiningRef.current) return;

    joiningRef.current = true;
    setJoining(true);
    setActionError(null);
    setNotice(null);

    try {
      unlockAudioOnGesture();
    } catch {
      // Non-fatal: audio unlocking may be restricted in some browsers
    }

    const trimmedPurpose = purpose.trim();
    const encodedPurpose = requestPriorityLane
      ? trimmedPurpose
        ? `${PRIORITY_TAG} ${trimmedPurpose}`
        : PRIORITY_TAG
      : trimmedPurpose;

    try {
      const result = await joinQueue({
        servicePointId: targetSp.id,
        sessionToken,
        studentName,
        purpose: encodedPurpose,
      });

      setOptimisticTicket(result.ticket);
      setTrackedTicketId(result.ticket.id);
      saveTrackedTicketId(result.ticket.id);
      prevTicketIdRef.current = result.ticket.id;
      prevStatusRef.current = result.ticket.status;
      prevCalledTsRef.current = result.ticket.last_called_at ?? result.ticket.called_at ?? null;

      if (result.already_active) {
        setNotice(
          `You already have an active ticket (${result.ticket.ticket_number}). Restored your spot in line.`
        );
      }

      setStudentName('');
      setPurpose('');
      setRequestPriorityLane(false);
      setSelectedSpId(null);

      try {
        await refresh();
      } catch {
        // Realtime subscription or next refresh will sync; ticket is already issued
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to join the queue.');
    } finally {
      joiningRef.current = false;
      setJoining(false);
    }
  }

  async function handleLeaveQueue() {
    if (!myTicket) return;
    setLeaving(true);
    setActionError(null);

    try {
      await leaveQueue(myTicket.id, sessionToken);
      setOptimisticTicket(null);
      setConfirmLeaveOpen(false);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to leave the queue.');
    } finally {
      setLeaving(false);
    }
  }

  function handleDismissFinishedTicket() {
    setOptimisticTicket(null);
    setTrackedTicketId(null);
    saveTrackedTicketId(null);
    setNotice(null);
    setActionError(null);
  }

  // Instant hydration: render active ticket immediately if mirrored ID already matched today's stream
  const isLoadingScreen = (loading && !myTicket) || (!trackedTicketId && restoringTicket);

  return (
    <div className="min-h-screen bg-slate-50 pb-14 transition-colors dark:bg-slate-950">
      <Navbar realtimeStatus={realtimeStatus} onRefresh={refresh} />

      <main className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-8">
        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div>
              <p className="font-semibold">Connection Error</p>
              <p className="mt-0.5 text-rose-700 dark:text-rose-300">{error}</p>
            </div>
          </div>
        )}

        {actionError && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <p className="font-medium">{actionError}</p>
          </div>
        )}

        {notice && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-gold-400/40 dark:bg-amber-950/40 dark:text-amber-100">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-gold-400" />
            <p className="font-medium">{notice}</p>
          </div>
        )}

        {isLoadingScreen ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white py-20 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Loader2 className="h-8 w-8 animate-spin text-maroon-800 dark:text-rose-400" />
            <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
              Connecting to live campus queues...
            </p>
          </div>
        ) : myTicket && myQueueMetrics ? (
          /* ================= ACTIVE / RECENT BOARDING-PASS VIEW ================= */
          <section className="space-y-4">
            <BoardingPassCard
              ticket={myTicket}
              servicePoint={myServicePoint}
              currentServing={myQueueMetrics.currentServing}
              position={myQueueMetrics.position}
              aheadCount={myQueueMetrics.aheadCount}
              waitEstimate={myQueueMetrics.waitEstimate}
              soundEnabled={soundEnabled}
              callFlashKey={callFlashKey}
              onToggleSound={() => {
                unlockAudioOnGesture();
                setSoundEnabled((prev) => !prev);
              }}
              onRequestLeave={() => setConfirmLeaveOpen(true)}
              onDismissFinished={handleDismissFinishedTicket}
            />

            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              No need to refresh — this boarding pass updates live the moment staff calls your ticket.
            </p>
          </section>
        ) : (
          /* ================= SERVICE POINT PICKER VIEW ================= */
          <section className="space-y-6">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-maroon-50 px-3 py-1 text-xs font-bold text-maroon-800 ring-1 ring-maroon-200/70 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-400/30">
                <TicketIcon className="h-3.5 w-3.5" />
                Zero-Wait Digital Queue
              </span>
              <h1 className="mt-2.5 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Select a Campus Office
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Pick an open service counter below to claim your MSU-IIT digital boarding pass and
                monitor the line live from your phone.
              </p>
            </div>

            {servicePoints.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <Building2 className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p className="mt-3 font-semibold text-slate-800 dark:text-slate-100">
                  No service points available
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Run the SQL migration in Supabase to create campus offices.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {servicePoints.map((sp) => {
                  const stats = spStatsMap.get(sp.id) ?? {
                    waitingCount: 0,
                    currentServing: null,
                    rolling: computeRollingAverageMinutes(tickets, sp.id),
                  };
                  const isSelected = selectedSpId === sp.id;
                  const joinEstimate = calculateStudentWaitEstimate(
                    stats.waitingCount,
                    Boolean(stats.currentServing),
                    stats.rolling
                  );

                  return (
                    <div
                      key={sp.id}
                      className={`rounded-2xl border bg-white transition dark:bg-slate-900 ${
                        !sp.is_active
                          ? 'border-slate-200 opacity-65 dark:border-slate-800'
                          : isSelected
                          ? 'border-maroon-800 shadow-md ring-2 ring-maroon-800/20 dark:border-rose-400 dark:ring-rose-400/25'
                          : 'border-slate-200 hover:border-maroon-300 hover:shadow-sm dark:border-slate-800 dark:hover:border-rose-400/60'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={!sp.is_active || joining}
                        onClick={() => {
                          unlockAudioOnGesture();
                          setActionError(null);
                          setSelectedSpId(isSelected ? null : sp.id);
                        }}
                        className="w-full p-4 text-left disabled:cursor-not-allowed sm:p-5"
                      >
                        <div className="flex items-start gap-3.5">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-mono text-xl font-extrabold ${
                              sp.is_active
                                ? 'bg-maroon-800 text-white dark:bg-rose-500 dark:text-slate-950'
                                : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500'
                            }`}
                          >
                            {sp.code}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                                {sp.name}
                              </h2>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                  sp.is_active
                                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-500/40'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                }`}
                              >
                                {sp.is_active ? 'Open' : 'Paused'}
                              </span>
                            </div>

                            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-gold-400" />
                              <span className="truncate">{sp.location}</span>
                            </p>

                            {sp.description && (
                              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                                {sp.description}
                              </p>
                            )}

                            <div className="mt-3 flex flex-wrap items-center gap-2.5 text-xs font-semibold">
                              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                <Users className="h-3.5 w-3.5 text-maroon-800 dark:text-rose-400" />
                                {stats.waitingCount} waiting
                              </span>

                              <span className="inline-flex items-center gap-1 rounded-lg bg-maroon-50 px-2.5 py-1 text-maroon-800 dark:bg-rose-500/15 dark:text-rose-300">
                                Serving:{' '}
                                <span className="font-mono font-bold">
                                  {stats.currentServing?.ticket_number ?? '—'}
                                </span>
                              </span>

                              <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                                <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-gold-400" />
                                <span>{formatMinutesLabel(joinEstimate.estimatedMinutes)}</span>
                                <span
                                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                    joinEstimate.isLiveCalculated
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                  }`}
                                >
                                  {joinEstimate.isLiveCalculated ? 'Live-calculated' : 'Estimated'}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Inline Join Form when selected */}
                      {isSelected && sp.is_active && (
                        <form
                          onSubmit={(e) => void handleJoinQueue(e, sp)}
                          className="space-y-3 rounded-b-2xl border-t border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60 sm:p-5"
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label
                                htmlFor="student-name"
                                className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                              >
                                Name or Student ID{' '}
                                <span className="font-normal text-slate-400">(optional)</span>
                              </label>
                              <input
                                id="student-name"
                                type="text"
                                maxLength={60}
                                disabled={joining}
                                value={studentName}
                                onChange={(e) => setStudentName(e.target.value)}
                                placeholder="e.g., Juan D. / 2024-0123"
                                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-maroon-800 focus:outline-none focus:ring-2 focus:ring-maroon-800/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-rose-400 dark:focus:ring-rose-400/25"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor="student-purpose"
                                className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                              >
                                Transaction{' '}
                                <span className="font-normal text-slate-400">(optional)</span>
                              </label>
                              <input
                                id="student-purpose"
                                type="text"
                                maxLength={105}
                                disabled={joining}
                                value={purpose}
                                onChange={(e) => setPurpose(e.target.value)}
                                placeholder="e.g., Request TOR, Clearance"
                                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-maroon-800 focus:outline-none focus:ring-2 focus:ring-maroon-800/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-rose-400 dark:focus:ring-rose-400/25"
                              />
                            </div>
                          </div>

                          {/* Lane Selection (Regular / Priority) — preserves joinQueue RPC contract */}
                          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-900">
                            <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                              <Sparkles className="h-4 w-4 text-gold-600 dark:text-gold-400" />
                              Priority Lane (PWD / Senior / Pregnant)
                            </span>
                            <input
                              type="checkbox"
                              disabled={joining}
                              checked={requestPriorityLane}
                              onChange={(e) => setRequestPriorityLane(e.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-maroon-800 focus:ring-maroon-800 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-rose-500 dark:focus:ring-rose-400"
                            />
                          </label>

                          <button
                            type="submit"
                            disabled={joining || !sp.is_active}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-maroon-800 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-maroon-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-rose-500 dark:text-slate-950 dark:hover:bg-rose-400"
                          >
                            {joining ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Issuing Boarding Pass...
                              </>
                            ) : (
                              <>
                                Join {sp.name} Queue
                                <ArrowRight className="h-4 w-4" />
                              </>
                            )}
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      <ConfirmDialog
        open={confirmLeaveOpen}
        title="Leave this queue?"
        description={`Are you sure you want to cancel ticket ${
          myTicket?.ticket_number ?? ''
        }? You will lose your current spot and need a new ticket if you return.`}
        confirmLabel="Yes, Leave Queue"
        cancelLabel="Keep My Spot"
        variant="danger"
        loading={leaving}
        onConfirm={handleLeaveQueue}
        onCancel={() => setConfirmLeaveOpen(false)}
      />
    </div>
  );
}