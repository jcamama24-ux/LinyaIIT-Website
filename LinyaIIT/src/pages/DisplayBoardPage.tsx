import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Clock, MapPin, Megaphone, Users } from 'lucide-react';
import { useRealtimeQueue } from '../hooks/useRealtimeQueue';
import { ConnectionBadge } from '../components/ConnectionBadge';
import {
  calculateStudentWaitEstimate,
  computeRollingAverageMinutes,
  formatMinutesLabel,
} from '../lib/waitTime';

export function DisplayBoardPage() {
  const { servicePoints, tickets, realtimeStatus, refresh } = useRealtimeQueue();
  const [searchParams] = useSearchParams();
  const filterSpId = searchParams.get('sp');

  const visiblePoints = useMemo(() => {
    if (!filterSpId) return servicePoints;
    const match = servicePoints.filter((sp) => sp.id === filterSpId);
    return match.length > 0 ? match : servicePoints;
  }, [servicePoints, filterSpId]);

  const studentUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-900/90 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500 text-xl font-extrabold text-slate-950">
              L
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">
                Linya<span className="text-rose-400">IIT</span>{' '}
                <span className="text-gold-400">Live Queue Board</span>
              </h1>
              <p className="text-xs text-slate-400">Real-time Campus Service Monitor</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ConnectionBadge status={realtimeStatus} onRefresh={refresh} />
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Student View
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 p-6 lg:grid-cols-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:col-span-9">
          {visiblePoints.map((sp) => {
            const spTickets = tickets
              .filter((t) => t.service_point_id === sp.id)
              .sort((a, b) => a.sequence_number - b.sequence_number);
            const called = spTickets.find((t) => t.status === 'called') ?? null;
            const waiting = spTickets.filter((t) => t.status === 'waiting');
            const rolling = computeRollingAverageMinutes(tickets, sp.id);
            const estimate = calculateStudentWaitEstimate(
              waiting.length,
              Boolean(called),
              rolling
            );

            return (
              <div
                key={sp.id}
                className="flex flex-col justify-between rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-lg bg-rose-500 px-2.5 py-1 font-mono text-xs font-extrabold text-slate-950">
                      COUNTER {sp.code}
                    </span>
                    <div className="flex items-center gap-3 text-xs font-semibold text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-gold-400" />
                        {formatMinutesLabel(estimate.estimatedMinutes)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-rose-400" />
                        {waiting.length} waiting
                      </span>
                    </div>
                  </div>

                  <h2 className="mt-3 text-lg font-bold text-white">{sp.name}</h2>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                    <MapPin className="h-3.5 w-3.5 text-gold-400" />
                    {sp.location}
                  </p>
                </div>

                <div className="my-6 rounded-2xl bg-slate-950/80 py-6 text-center ring-1 ring-slate-800">
                  <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gold-400">
                    <Megaphone className="h-3.5 w-3.5" />
                    Now Serving
                  </p>
                  <p className="mt-2 font-mono text-6xl font-extrabold tracking-tight text-emerald-400">
                    {called ? called.ticket_number : '—'}
                  </p>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Up Next:</span>
                  <div className="flex items-center gap-1.5 font-mono font-bold text-slate-200">
                    {waiting.length === 0 ? (
                      <span className="text-slate-600">None</span>
                    ) : (
                      waiting.slice(0, 4).map((t) => (
                        <span key={t.id} className="rounded-md bg-slate-800 px-2 py-0.5">
                          {t.ticket_number}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="lg:col-span-3">
          <div className="sticky top-6 rounded-3xl border border-rose-500/30 bg-slate-900 p-6 text-center shadow-xl">
            <p className="text-xs font-bold uppercase tracking-widest text-gold-400">
              Skip the Line
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-white">Scan to Join Queue</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              Point your phone camera at the QR code to get a live digital boarding pass.
            </p>

            <div className="mx-auto mt-5 inline-block rounded-2xl bg-white p-4 shadow-lg">
              <QRCodeSVG value={studentUrl} size={176} level="M" />
            </div>

            <p className="mt-4 break-all font-mono text-[11px] text-slate-400">{studentUrl}</p>
          </div>
        </aside>
      </main>
    </div>
  );
}