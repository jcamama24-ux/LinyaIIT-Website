import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  LogOut,
  Megaphone,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  SkipForward,
  Tv,
  UserCheck,
  Users,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeQueue } from '../hooks/useRealtimeQueue';
import {
  staffCallNext,
  staffCompleteTicket,
  staffRequeueTicket,
  staffResetQueueToday,
  staffSkipTicket,
  staffToggleServicePoint,
} from '../lib/queueApi';
import type { Ticket } from '../types/database';

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatWaitMinutes(createdAt: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  return `${mins} mins ago`;
}

export function StaffDashboardPage() {
  const { user, staffProfile, loading: authLoading, isAuthorizedStaff, signOut } = useAuth();
  const { servicePoints, tickets, loading: queueLoading, error, realtimeStatus, refresh } =
    useRealtimeQueue();
  const navigate = useNavigate();

  const [selectedSpId, setSelectedSpId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'waiting' | 'history'>('waiting');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState<boolean>(false);

  // Redirect unauthenticated or unauthorized users to login
  useEffect(() => {
    if (!authLoading && !isAuthorizedStaff) {
      navigate('/staff/login', { replace: true });
    }
  }, [authLoading, isAuthorizedStaff, navigate]);

  // Select default service point once loaded
  useEffect(() => {
    if (!selectedSpId && servicePoints.length > 0) {
      const preferred =
        staffProfile?.default_service_point_id &&
        servicePoints.some((sp) => sp.id === staffProfile.default_service_point_id)
          ? staffProfile.default_service_point_id
          : servicePoints[0].id;
      setSelectedSpId(preferred);
    }
  }, [servicePoints, selectedSpId, staffProfile]);

  const currentSp = useMemo(
    () => servicePoints.find((sp) => sp.id === selectedSpId) ?? null,
    [servicePoints, selectedSpId]
  );

  const spTickets = useMemo(
    () =>
      tickets
        .filter((t) => t.service_point_id === selectedSpId)
        .sort((a, b) => a.sequence_number - b.sequence_number),
    [tickets, selectedSpId]
  );

  const currentCalled: Ticket | null = useMemo(
    () => spTickets.find((t) => t.status === 'called') ?? null,
    [spTickets]
  );

  const waitingTickets = useMemo(
    () => spTickets.filter((t) => t.status === 'waiting'),
    [spTickets]
  );

  const historyTickets = useMemo(
    () =>
      spTickets
        .filter((t) => t.status === 'completed' || t.status === 'skipped' || t.status === 'cancelled')
        .sort((a, b) => {
          const timeA = new Date(a.completed_at ?? a.created_at).getTime();
          const timeB = new Date(b.completed_at ?? b.created_at).getTime();
          return timeB - timeA;
        }),
    [spTickets]
  );

  const stats = useMemo(() => {
    const completed = spTickets.filter((t) => t.status === 'completed');
    const skipped = spTickets.filter((t) => t.status === 'skipped');
    const calledWithWait = spTickets.filter((t) => t.called_at);

    let avgWaitMins: number | null = null;
    if (calledWithWait.length > 0) {
      const totalMins = calledWithWait.reduce((sum, t) => {
        const diff =
          (new Date(t.called_at!).getTime() - new Date(t.created_at).getTime()) / 60000;
        return sum + Math.max(0, diff);
      }, 0);
      avgWaitMins = Math.round(totalMins / calledWithWait.length);
    }

    return {
      waiting: waitingTickets.length,
      completed: completed.length,
      skipped: skipped.length,
      totalToday: spTickets.length,
      avgWaitMins,
    };
  }, [spTickets, waitingTickets.length]);

  const waitingCountBySp = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets) {
      if (t.status === 'waiting') {
        counts.set(t.service_point_id, (counts.get(t.service_point_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [tickets]);

  async function runAction(actionName: string, fn: () => Promise<unknown>) {
    setBusyAction(actionName);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusyAction(null);
    }
  }

  // Fast keyboard shortcuts for counter staff (N = Call Next, C = Complete, S = Skip)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || busyAction) return;

      if (e.key.toLowerCase() === 'n' && !currentCalled && waitingTickets.length > 0 && selectedSpId) {
        e.preventDefault();
        void runAction('call', () => staffCallNext(selectedSpId));
      } else if (e.key.toLowerCase() === 'c' && currentCalled) {
        e.preventDefault();
        void runAction('complete', () => staffCompleteTicket(currentCalled.id));
      } else if (e.key.toLowerCase() === 's' && currentCalled) {
        e.preventDefault();
        void runAction('skip', () => staffSkipTicket(currentCalled.id));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (authLoading || !isAuthorizedStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-maroon-800" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <Navbar realtimeStatus={realtimeStatus} onRefresh={refresh} />

      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        {/* Top Control Bar */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div>
              <label
                htmlFor="service-point-select"
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
              >
                Active Service Counter
              </label>
              <select
                id="service-point-select"
                value={selectedSpId}
                onChange={(e) => {
                  setSelectedSpId(e.target.value);
                  setActionError(null);
                }}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 focus:border-maroon-700 focus:outline-none focus:ring-2 focus:ring-maroon-700/20 sm:w-80"
              >
                {servicePoints.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    [{sp.code}] {sp.name} ({waitingCountBySp.get(sp.id) ?? 0} waiting)
                  </option>
                ))}
              </select>
            </div>

            {currentSp && (
              <div className="flex items-center gap-2 sm:pt-5">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() =>
                    void runAction('toggle', () =>
                      staffToggleServicePoint(currentSp.id, !currentSp.is_active)
                    )
                  }
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                    currentSp.is_active
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100'
                      : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100'
                  }`}
                >
                  {currentSp.is_active ? (
                    <>
                      <PauseCircle className="h-4 w-4" />
                      Queue Open
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4" />
                      Queue Paused
                    </>
                  )}
                </button>

                <Link
                  to={`/display?sp=${currentSp.id}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  <Tv className="h-4 w-4 text-maroon-700" />
                  Kiosk TV
                </Link>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0">
            <div className="text-xs">
              <p className="font-bold text-slate-900">{staffProfile?.full_name}</p>
              <p className="text-slate-500">{user?.email}</p>
            </div>

            <div className="flex items-center gap-2">
              {currentSp && (
                <button
                  type="button"
                  onClick={() => setConfirmResetOpen(true)}
                  disabled={busyAction !== null}
                  title="Clear today's tickets for this counter and reset numbering to 001"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset Queue
                </button>
              )}

              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {(error || actionError) && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <p className="font-medium">{actionError ?? error}</p>
          </div>
        )}

        {/* Stats Summary Row */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Waiting Now</span>
              <Users className="h-4 w-4 text-maroon-700" />
            </div>
            <p className="mt-2 font-mono text-3xl font-extrabold text-slate-900">
              {stats.waiting}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Completed Today</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 font-mono text-3xl font-extrabold text-emerald-700">
              {stats.completed}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Skipped</span>
              <SkipForward className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 font-mono text-3xl font-extrabold text-amber-700">
              {stats.skipped}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Avg Wait Time</span>
              <Clock className="h-4 w-4 text-slate-400" />
            </div>
            <p className="mt-2 font-mono text-3xl font-extrabold text-slate-900">
              {stats.avgWaitMins !== null ? `${stats.avgWaitMins}m` : '—'}
            </p>
          </div>
        </div>

        {/* Main Workspace Grid */}
        {queueLoading ? (
          <div className="mt-6 flex justify-center rounded-3xl border border-slate-200 bg-white py-20">
            <Loader2 className="h-8 w-8 animate-spin text-maroon-800" />
          </div>
        ) : (
          <div className="mt-5 grid gap-5 lg:grid-cols-12">
            {/* LEFT: NOW SERVING CONTROL CONSOLE */}
            <section className="lg:col-span-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Currently Serving
                  </span>
                  {currentCalled && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                      <Megaphone className="h-3 w-3" />
                      Called at {formatTime(currentCalled.called_at)}
                    </span>
                  )}
                </div>

                {currentCalled ? (
                  <div className="mt-4">
                    <div className="rounded-2xl bg-gradient-to-br from-maroon-900 to-maroon-800 px-6 py-8 text-center text-white shadow-inner">
                      <p className="font-mono text-6xl font-extrabold tracking-tight">
                        {currentCalled.ticket_number}
                      </p>
                      {(currentCalled.student_name || currentCalled.purpose) && (
                        <div className="mt-3 space-y-0.5 text-sm text-maroon-100">
                          {currentCalled.student_name && (
                            <p className="font-semibold text-white">
                              {currentCalled.student_name}
                            </p>
                          )}
                          {currentCalled.purpose && <p>{currentCalled.purpose}</p>}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() =>
                          void runAction('complete', () =>
                            staffCompleteTicket(currentCalled.id)
                          )
                        }
                        className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {busyAction === 'complete' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-5 w-5" />
                        )}
                        Mark Completed
                      </button>

                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() =>
                          void runAction('skip', () => staffSkipTicket(currentCalled.id))
                        }
                        className="flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-sm font-bold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                      >
                        {busyAction === 'skip' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <SkipForward className="h-5 w-5" />
                        )}
                        Skip Ticket
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
                      <UserCheck className="mx-auto h-10 w-10 text-slate-300" />
                      <p className="mt-2 text-base font-bold text-slate-700">
                        Counter Ready
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {waitingTickets.length > 0
                          ? `Next in line: ${waitingTickets[0].ticket_number}`
                          : 'Waiting for students to join this queue.'}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={
                        busyAction !== null || waitingTickets.length === 0 || !selectedSpId
                      }
                      onClick={() =>
                        void runAction('call', () => staffCallNext(selectedSpId))
                      }
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-maroon-800 px-5 py-4 text-base font-extrabold text-white shadow-md transition hover:bg-maroon-900 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {busyAction === 'call' ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Calling Next...
                        </>
                      ) : (
                        <>
                          <Megaphone className="h-5 w-5" />
                          {waitingTickets.length > 0
                            ? `Call Next (${waitingTickets[0].ticket_number})`
                            : 'Call Next'}
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div className="mt-5 border-t border-slate-100 pt-3 text-center text-[11px] text-slate-400">
                  Shortcuts: <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">N</kbd> Call Next ·{' '}
                  <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">C</kbd> Complete ·{' '}
                  <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">S</kbd> Skip
                </div>
              </div>
            </section>

            {/* RIGHT: LIVE WAITING LIST & HISTORY */}
            <section className="lg:col-span-7">
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
                  <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('waiting')}
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                        activeTab === 'waiting'
                          ? 'bg-white text-maroon-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Waiting ({waitingTickets.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                        activeTab === 'history'
                          ? 'bg-white text-maroon-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      History ({historyTickets.length})
                    </button>
                  </div>
                  <span className="text-xs font-medium text-slate-500">
                    Total today: {stats.totalToday}
                  </span>
                </div>

                {activeTab === 'waiting' ? (
                  waitingTickets.length === 0 ? (
                    <div className="px-6 py-16 text-center">
                      <Users className="mx-auto h-10 w-10 text-slate-300" />
                      <p className="mt-2 font-bold text-slate-700">Queue is empty</p>
                      <p className="mt-1 text-xs text-slate-500">
                        New student tickets will appear here instantly without refreshing.
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {waitingTickets.map((ticket, index) => (
                        <li
                          key={ticket.id}
                          className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <span
                              className={`flex h-11 w-16 shrink-0 items-center justify-center rounded-xl font-mono text-base font-extrabold ${
                                index === 0
                                  ? 'bg-maroon-800 text-white'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {ticket.ticket_number}
                            </span>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-bold text-slate-900">
                                  {ticket.student_name || 'Campus Student'}
                                </span>
                                {index === 0 && (
                                  <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-800">
                                    Up Next
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-xs text-slate-500">
                                {ticket.purpose ? `${ticket.purpose} · ` : ''}
                                Joined {formatTime(ticket.created_at)} ({formatWaitMinutes(ticket.created_at)})
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() =>
                              void runAction(`skip-${ticket.id}`, () =>
                                staffSkipTicket(ticket.id)
                              )
                            }
                            title="Skip this waiting ticket"
                            className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-50"
                          >
                            Skip
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : historyTickets.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <Clock className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-2 font-bold text-slate-700">No history yet today</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Completed, skipped, and cancelled tickets appear here.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {historyTickets.map((ticket) => (
                      <li
                        key={ticket.id}
                        className="flex items-center justify-between gap-4 px-5 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-sm font-bold text-slate-700 w-14">
                            {ticket.ticket_number}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {ticket.student_name || 'Campus Student'}
                            </p>
                            <p className="text-xs text-slate-400">
                              Finished {formatTime(ticket.completed_at)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${
                              ticket.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700'
                                : ticket.status === 'skipped'
                                ? 'bg-amber-50 text-amber-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {ticket.status}
                          </span>

                          {ticket.status === 'skipped' && (
                            <button
                              type="button"
                              disabled={busyAction !== null}
                              onClick={() =>
                                void runAction(`requeue-${ticket.id}`, () =>
                                  staffRequeueTicket(ticket.id)
                                )
                              }
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-maroon-800 hover:bg-maroon-50"
                            >
                              Re-queue
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={confirmResetOpen}
        title={`Reset today's queue for ${currentSp?.name ?? 'this counter'}?`}
        description="This deletes all of today's tickets for this service point and resets the counter back to 001. Useful before starting a clean live demo."
        confirmLabel="Reset to 001"
        variant="danger"
        loading={busyAction === 'reset'}
        onConfirm={() => {
          if (!currentSp) return;
          void runAction('reset', () => staffResetQueueToday(currentSp.id)).then(() => {
            setConfirmResetOpen(false);
          });
        }}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </div>
  );
}
