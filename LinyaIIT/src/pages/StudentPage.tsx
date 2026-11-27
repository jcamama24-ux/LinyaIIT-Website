import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Megaphone,
  Sparkles,
  Ticket as TicketIcon,
  Users,
  Volume2,
  VolumeX,
  AlertCircle,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useRealtimeQueue } from '../hooks/useRealtimeQueue';
import { getMyActiveTicket, joinQueue, leaveQueue } from '../lib/queueApi';
import {
  getStudentSessionToken,
  getTrackedTicketId,
  saveTrackedTicketId,
} from '../lib/session';
import { playCalledAlert, unlockAudioOnGesture } from '../lib/sound';
import type { ServicePoint, Ticket } from '../types/database';

export function StudentPage() {
  const { servicePoints, tickets, loading, error, realtimeStatus, refresh } = useRealtimeQueue();

  const [sessionToken] = useState<string>(() => getStudentSessionToken());
  const [trackedTicketId, setTrackedTicketId] = useState<string | null>(() => getTrackedTicketId());
  const [restoringTicket, setRestoringTicket] = useState<boolean>(true);

  const [selectedSpId, setSelectedSpId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('');
  const [joining, setJoining] = useState<boolean>(false);
  const [leaving, setLeaving] = useState<boolean>(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const prevStatusRef = useRef<string | null>(null);

  // Restore student's active ticket from Supabase PostgreSQL on mount
  useEffect(() => {
    let active = true;
    getMyActiveTicket(sessionToken)
      .then((found) => {
        if (!active) return;
        if (found) {
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

  // Locate the student's live ticket inside the Realtime tickets stream
  const myTicket: Ticket | null = useMemo(() => {
    if (!trackedTicketId) return null;
    return tickets.find((t) => t.id === trackedTicketId) ?? null;
  }, [tickets, trackedTicketId]);

  const myServicePoint: ServicePoint | null = useMemo(() => {
    if (!myTicket) return null;
    return servicePoints.find((sp) => sp.id === myTicket.service_point_id) ?? null;
  }, [myTicket, servicePoints]);

  // Trigger audio chime + phone vibration when status transitions to "called"
  useEffect(() => {
    if (!myTicket) {
      prevStatusRef.current = null;
      return;
    }

    if (prevStatusRef.current && prevStatusRef.current !== 'called' && myTicket.status === 'called') {
      playCalledAlert(soundEnabled);
    }
    prevStatusRef.current = myTicket.status;
  }, [myTicket, soundEnabled]);

  // Compute live queue statistics per service point
  const spStatsMap = useMemo(() => {
    const map = new Map<
      string,
      { waitingCount: number; currentServing: Ticket | null }
    >();

    for (const sp of servicePoints) {
      map.set(sp.id, { waitingCount: 0, currentServing: null });
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

  // Compute student's exact live queue position and current serving ticket
  const myQueueMetrics = useMemo(() => {
    if (!myTicket) return null;

    const spTickets = tickets.filter((t) => t.service_point_id === myTicket.service_point_id);
    const currentServing = spTickets.find((t) => t.status === 'called') ?? null;
    const waitingTickets = spTickets
      .filter((t) => t.status === 'waiting')
      .sort((a, b) => a.sequence_number - b.sequence_number);

    const positionIndex = waitingTickets.findIndex((t) => t.id === myTicket.id);
    const position = positionIndex >= 0 ? positionIndex + 1 : 0;
    const aheadCount = positionIndex >= 0 ? positionIndex : 0;
    const estMinutes =
      aheadCount * (myServicePoint?.avg_service_minutes ?? 5) +
      (currentServing ? Math.ceil((myServicePoint?.avg_service_minutes ?? 5) / 2) : 0);

    return {
      currentServing,
      position,
      aheadCount,
      totalWaiting: waitingTickets.length,
      estMinutes,
    };
  }, [myTicket, myServicePoint, tickets]);

  const selectedSp = useMemo(
    () => servicePoints.find((sp) => sp.id === selectedSpId) ?? null,
    [servicePoints, selectedSpId]
  );

  async function handleJoinQueue(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSp) return;

    unlockAudioOnGesture();
    setJoining(true);
    setActionError(null);
    setNotice(null);

    try {
      const result = await joinQueue({
        servicePointId: selectedSp.id,
        sessionToken,
        studentName,
        purpose,
      });

      setTrackedTicketId(result.ticket.id);
      saveTrackedTicketId(result.ticket.id);
      prevStatusRef.current = result.ticket.status;

      if (result.already_active) {
        setNotice(
          `You already have an active ticket (${result.ticket.ticket_number}). Restored your spot in line.`
        );
      }

      setStudentName('');
      setPurpose('');
      setSelectedSpId(null);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to join the queue.');
    } finally {
      setJoining(false);
    }
  }

  async function handleLeaveQueue() {
    if (!myTicket) return;
    setLeaving(true);
    setActionError(null);

    try {
      await leaveQueue(myTicket.id, sessionToken);
      setConfirmLeaveOpen(false);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to leave the queue.');
    } finally {
      setLeaving(false);
    }
  }

  function handleDismissFinishedTicket() {
    setTrackedTicketId(null);
    saveTrackedTicketId(null);
    setNotice(null);
    setActionError(null);
  }

  const isLoadingScreen = loading || restoringTicket;

  return (
    <div className="min-h-screen bg-slate-50 pb-14">
      <Navbar realtimeStatus={realtimeStatus} onRefresh={refresh} />

      <main className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-8">
        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold">Connection Error</p>
              <p className="mt-0.5 text-rose-700">{error}</p>
            </div>
          </div>
        )}

        {actionError && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <p className="font-medium">{actionError}</p>
          </div>
        )}

        {notice && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p className="font-medium">{notice}</p>
          </div>
        )}

        {isLoadingScreen ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white py-20 shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-maroon-800" />
            <p className="mt-3 text-sm font-medium text-slate-600">
              Connecting to live campus queues...
            </p>
          </div>
        ) : myTicket && myQueueMetrics ? (
          /* ================= ACTIVE / RECENT TICKET VIEW ================= */
          <section className="space-y-4">
            <div
              className={`overflow-hidden rounded-3xl border bg-white shadow-lg transition ${
                myTicket.status === 'called'
                  ? 'border-emerald-400 animate-called-glow'
                  : 'border-slate-200'
              }`}
            >
              {/* Status Banner */}
              {myTicket.status === 'called' && (
                <div className="bg-emerald-600 px-6 py-4 text-white">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Megaphone className="h-6 w-6 animate-bounce" />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-100">
                          Now Calling Your Number
                        </p>
                        <p className="text-lg font-extrabold">
                          It&apos;s your turn! Proceed to the counter.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {myTicket.status === 'waiting' && (
                <div className="bg-gradient-to-r from-maroon-900 to-maroon-800 px-6 py-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gold-200">
                        Live Queue Pass
                      </p>
                      <p className="text-base font-bold">
                        {myQueueMetrics.position === 1
                          ? 'You are NEXT in line!'
                          : 'Please stay nearby — updates live'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        unlockAudioOnGesture();
                        setSoundEnabled((prev) => !prev);
                      }}
                      title={soundEnabled ? 'Mute call alert sound' : 'Unmute call alert sound'}
                      className="rounded-xl bg-white/10 p-2 text-white transition hover:bg-white/20"
                    >
                      {soundEnabled ? (
                        <Volume2 className="h-5 w-5" />
                      ) : (
                        <VolumeX className="h-5 w-5 text-maroon-200" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {myTicket.status === 'completed' && (
                <div className="bg-emerald-50 px-6 py-5 text-emerald-900 border-b border-emerald-100">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                    <div>
                      <p className="text-base font-extrabold">Service Completed</p>
                      <p className="text-sm text-emerald-700">
                        Thank you for using LinyaIIT!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {myTicket.status === 'skipped' && (
                <div className="bg-amber-50 px-6 py-5 text-amber-950 border-b border-amber-200">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-7 w-7 text-amber-600" />
                    <div>
                      <p className="text-base font-extrabold">Ticket Skipped</p>
                      <p className="text-sm text-amber-800">
                        You missed your call. Approach the staff counter or join a new queue below.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {myTicket.status === 'cancelled' && (
                <div className="bg-slate-100 px-6 py-5 text-slate-900 border-b border-slate-200">
                  <p className="text-base font-extrabold">You Left the Queue</p>
                  <p className="text-sm text-slate-600">
                    Ticket {myTicket.ticket_number} has been cancelled.
                  </p>
                </div>
              )}

              {/* Ticket Body */}
              <div className="p-6 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  Your Ticket Number
                </p>
                <div
                  className={`mt-1 font-mono text-6xl font-extrabold tracking-tight sm:text-7xl ${
                    myTicket.status === 'called' ? 'text-emerald-600' : 'text-maroon-800'
                  }`}
                >
                  {myTicket.ticket_number}
                </div>

                {myServicePoint && (
                  <div className="mt-4 inline-flex flex-col items-center rounded-2xl bg-slate-50 px-4 py-2.5 text-center ring-1 ring-slate-200/80">
                    <span className="text-sm font-bold text-slate-900">
                      {myServicePoint.name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5 text-maroon-700" />
                      {myServicePoint.location}
                    </span>
                  </div>
                )}

                {/* Live Metrics Grid */}
                {(myTicket.status === 'waiting' || myTicket.status === 'called') && (
                  <div className="mt-6 grid grid-cols-3 gap-2.5 text-left sm:gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 text-center">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Position
                      </p>
                      <p className="mt-1 font-mono text-2xl font-extrabold text-slate-900">
                        {myTicket.status === 'called' ? 'NOW' : `#${myQueueMetrics.position}`}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 text-center">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Now Serving
                      </p>
                      <p className="mt-1 font-mono text-2xl font-extrabold text-maroon-800">
                        {myQueueMetrics.currentServing?.ticket_number ?? '—'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 text-center">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Est. Wait
                      </p>
                      <p className="mt-1 text-xl font-extrabold text-slate-900">
                        {myTicket.status === 'called'
                          ? '0 min'
                          : myQueueMetrics.estMinutes === 0
                          ? '< 2m'
                          : `~${myQueueMetrics.estMinutes}m`}
                      </p>
                    </div>
                  </div>
                )}

                {myTicket.status === 'waiting' && (
                  <p className="mt-4 text-xs text-slate-500">
                    {myQueueMetrics.aheadCount === 0
                      ? 'No one is waiting ahead of you. Get ready!'
                      : `${myQueueMetrics.aheadCount} ${
                          myQueueMetrics.aheadCount === 1 ? 'student is' : 'students are'
                        } ahead of you in line.`}
                  </p>
                )}

                {/* Ticket Footer Actions */}
                <div className="mt-6 border-t border-slate-100 pt-5">
                  {myTicket.status === 'waiting' || myTicket.status === 'called' ? (
                    <button
                      type="button"
                      onClick={() => setConfirmLeaveOpen(true)}
                      className="w-full rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      Leave Queue
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDismissFinishedTicket}
                      className="w-full rounded-xl bg-maroon-800 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-maroon-900"
                    >
                      Join Another Queue
                    </button>
                  )}
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-slate-500">
              No need to refresh — this screen updates automatically the moment staff calls your ticket.
            </p>
          </section>
        ) : (
          /* ================= SERVICE POINT PICKER VIEW ================= */
          <section className="space-y-6">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-maroon-50 px-3 py-1 text-xs font-bold text-maroon-800 ring-1 ring-maroon-200/70">
                <TicketIcon className="h-3.5 w-3.5" />
                Zero-Wait Digital Queue
              </span>
              <h1 className="mt-2.5 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Select a Campus Office
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Pick an open service counter below to claim your digital ticket and monitor the line live from your phone.
              </p>
            </div>

            {servicePoints.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                <Building2 className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 font-semibold text-slate-800">No service points available</p>
                <p className="mt-1 text-sm text-slate-500">
                  Run the SQL migration in Supabase to create campus offices.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {servicePoints.map((sp) => {
                  const stats = spStatsMap.get(sp.id) ?? {
                    waitingCount: 0,
                    currentServing: null,
                  };
                  const isSelected = selectedSpId === sp.id;
                  const estWait = stats.waitingCount * sp.avg_service_minutes;

                  return (
                    <div
                      key={sp.id}
                      className={`rounded-2xl border bg-white transition ${
                        !sp.is_active
                          ? 'border-slate-200 opacity-65'
                          : isSelected
                          ? 'border-maroon-700 ring-2 ring-maroon-700/20 shadow-md'
                          : 'border-slate-200 hover:border-maroon-300 hover:shadow-sm'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={!sp.is_active}
                        onClick={() => {
                          unlockAudioOnGesture();
                          setActionError(null);
                          setSelectedSpId(isSelected ? null : sp.id);
                        }}
                        className="w-full p-4 text-left sm:p-5 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-start gap-3.5">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-mono text-xl font-extrabold ${
                              sp.is_active
                                ? 'bg-maroon-800 text-white'
                                : 'bg-slate-200 text-slate-500'
                            }`}
                          >
                            {sp.code}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h2 className="text-base font-bold text-slate-900">{sp.name}</h2>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                  sp.is_active
                                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {sp.is_active ? 'Open' : 'Paused'}
                              </span>
                            </div>

                            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <span className="truncate">{sp.location}</span>
                            </p>

                            {sp.description && (
                              <p className="mt-1.5 text-xs text-slate-600">{sp.description}</p>
                            )}

                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold">
                              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700">
                                <Users className="h-3.5 w-3.5 text-maroon-700" />
                                {stats.waitingCount} waiting
                              </span>

                              <span className="inline-flex items-center gap-1 rounded-lg bg-maroon-50 px-2.5 py-1 text-maroon-800">
                                Serving:{' '}
                                <span className="font-mono font-bold">
                                  {stats.currentServing?.ticket_number ?? '—'}
                                </span>
                              </span>

                              <span className="inline-flex items-center gap-1 text-slate-500">
                                <Clock className="h-3.5 w-3.5" />
                                {estWait === 0 ? 'No wait' : `~${estWait} min`}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Inline Join Form when selected */}
                      {isSelected && sp.is_active && (
                        <form
                          onSubmit={handleJoinQueue}
                          className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5 rounded-b-2xl space-y-3"
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label
                                htmlFor="student-name"
                                className="block text-xs font-semibold text-slate-700"
                              >
                                Name or Student ID <span className="font-normal text-slate-400">(optional)</span>
                              </label>
                              <input
                                id="student-name"
                                type="text"
                                maxLength={60}
                                value={studentName}
                                onChange={(e) => setStudentName(e.target.value)}
                                placeholder="e.g., Juan D. / 2024-0123"
                                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-maroon-700 focus:outline-none focus:ring-2 focus:ring-maroon-700/20"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor="student-purpose"
                                className="block text-xs font-semibold text-slate-700"
                              >
                                Transaction <span className="font-normal text-slate-400">(optional)</span>
                              </label>
                              <input
                                id="student-purpose"
                                type="text"
                                maxLength={120}
                                value={purpose}
                                onChange={(e) => setPurpose(e.target.value)}
                                placeholder="e.g., Request TOR, Clearance"
                                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-maroon-700 focus:outline-none focus:ring-2 focus:ring-maroon-700/20"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={joining}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-maroon-800 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-maroon-900 disabled:opacity-60"
                          >
                            {joining ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Issuing Ticket...
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
