import { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  MapPin,
  Megaphone,
  QrCode,
  Sparkles,
  Volume2,
  VolumeX,
  DoorOpen,
} from 'lucide-react';
import { downloadBoardingPassPng } from '../lib/boardingPassExport';
import { useTheme } from '../lib/theme';
import {
  formatMinutesLabel,
  getDisplayPurpose,
  isPriorityTicket,
  resolveAssignedWindow,
  type StudentWaitEstimate,
} from '../lib/waitTime';
import type { ServicePoint, Ticket } from '../types/database';

interface BoardingPassCardProps {
  ticket: Ticket;
  servicePoint: ServicePoint | null;
  currentServing: Ticket | null;
  position: number;
  aheadCount: number;
  waitEstimate: StudentWaitEstimate;
  soundEnabled: boolean;
  callFlashKey: number;
  onToggleSound: () => void;
  onRequestLeave: () => void;
  onDismissFinished: () => void;
}

export function BoardingPassCard({
  ticket,
  servicePoint,
  currentServing,
  position,
  aheadCount,
  waitEstimate,
  soundEnabled,
  callFlashKey,
  onToggleSound,
  onRequestLeave,
  onDismissFinished,
}: BoardingPassCardProps) {
  const { isDark } = useTheme();
  const qrWrapperRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  const priority = isPriorityTicket(ticket);
  const displayPurpose = getDisplayPurpose(ticket.purpose);
  const assignedWindow = resolveAssignedWindow(ticket, servicePoint);
  const qrPayload = `LINYAIIT:${ticket.id}:${ticket.ticket_number}`;

  const issuedTime = new Date(ticket.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  function handleDownloadPng() {
    const qrCanvas = qrWrapperRef.current?.querySelector('canvas');
    if (!qrCanvas) return;

    setDownloading(true);
    try {
      downloadBoardingPassPng({
        ticket,
        servicePoint,
        qrCanvas,
        waitEstimate,
        position,
        isDark,
      });
    } finally {
      setTimeout(() => setDownloading(false), 300);
    }
  }

  return (
    <div
      key={ticket.status === 'called' ? `called-${callFlashKey}` : ticket.id}
      className={`relative overflow-hidden rounded-3xl border bg-white shadow-xl transition dark:bg-slate-900 ${
        ticket.status === 'called'
          ? 'border-emerald-500 animate-called-glow animate-called-flash dark:border-emerald-400'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* ================= TOP BOARDING PASS HEADER ================= */}
      {ticket.status === 'called' && (
        <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 px-5 py-4 text-white sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
                <Megaphone className="h-6 w-6 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-gold-300 animate-ping" />
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-50">
                    Now Serving Your Ticket
                  </p>
                </div>
                <p className="mt-0.5 text-lg font-extrabold leading-tight">
                  Proceed to {assignedWindow}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'Mute call alert sound' : 'Unmute call alert sound'}
              aria-label={soundEnabled ? 'Mute call alert sound' : 'Unmute call alert sound'}
              className="rounded-xl bg-white/15 p-2 text-white transition hover:bg-white/25"
            >
              {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </button>
          </div>
        </div>
      )}

      {ticket.status === 'waiting' && (
        <div className="border-b-2 border-gold-400 bg-maroon-800 px-5 py-4 text-white dark:border-gold-400 dark:bg-slate-800 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-gold-300 dark:text-gold-400">
                MSU-IIT • LinyaIIT Boarding Pass
              </p>
              <p className="mt-0.5 text-base font-extrabold text-white">
                {position === 1
                  ? 'You are NEXT in line — get ready!'
                  : 'Live Digital Queue Pass'}
              </p>
            </div>

            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'Mute call alert sound' : 'Unmute call alert sound'}
              aria-label={soundEnabled ? 'Mute call alert sound' : 'Unmute call alert sound'}
              className="rounded-xl bg-white/10 p-2 text-white transition hover:bg-white/20 dark:bg-slate-700/80 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 opacity-70" />}
            </button>
          </div>
        </div>
      )}

      {ticket.status === 'completed' && (
        <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-4 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-100">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-base font-extrabold">Service Completed</p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                Thank you for using LinyaIIT!
              </p>
            </div>
          </div>
        </div>
      )}

      {ticket.status === 'skipped' && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-7 w-7 shrink-0 text-amber-600 dark:text-gold-400" />
            <div>
              <p className="text-base font-extrabold">Ticket Skipped</p>
              <p className="text-xs text-amber-800 dark:text-amber-200">
                You missed your call. Approach the staff counter or join a new queue below.
              </p>
            </div>
          </div>
        </div>
      )}

      {ticket.status === 'cancelled' && (
        <div className="border-b border-slate-200 bg-slate-100 px-6 py-4 text-slate-900 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-100">
          <p className="text-base font-extrabold">You Left the Queue</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Ticket {ticket.ticket_number} has been cancelled.
          </p>
        </div>
      )}

      {/* ================= UPPER PASS BODY ================= */}
      <div className="px-5 pb-6 pt-5 sm:px-6">
        {/* Lane Badge & Counter Code Row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${
              priority
                ? 'bg-gold-100 text-gold-900 ring-1 ring-gold-300 dark:bg-gold-400 dark:text-slate-950 dark:ring-gold-300'
                : 'bg-maroon-50 text-maroon-800 ring-1 ring-maroon-200 dark:bg-rose-500/20 dark:text-rose-300 dark:ring-rose-400/40'
            }`}
          >
            {priority && <Sparkles className="h-3.5 w-3.5" />}
            {priority ? 'Priority Lane' : 'Regular Lane'}
          </span>

          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {servicePoint && (
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                COUNTER {servicePoint.code}
              </span>
            )}
            <span>Issued {issuedTime}</span>
          </div>
        </div>

        {/* Hero Ticket Number */}
        <div className="mt-5 text-center">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-400">
            Boarding Ticket Number
          </p>
          <div
            className={`mt-1 font-mono text-6xl font-extrabold tracking-tight sm:text-7xl ${
              ticket.status === 'called'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-maroon-800 dark:text-rose-400'
            }`}
          >
            {ticket.ticket_number}
          </div>

          {/* Assigned Window Highlight when Called */}
          {ticket.status === 'called' && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-emerald-900 shadow-sm dark:border-emerald-500/50 dark:bg-emerald-950/60 dark:text-emerald-200">
              <DoorOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <div className="text-left">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Assigned Window
                </p>
                <p className="text-base font-extrabold leading-tight">{assignedWindow}</p>
              </div>
            </div>
          )}

          {/* Service Point Details */}
          {servicePoint && (
            <div className="mt-4 flex flex-col items-center rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/60">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {servicePoint.name}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-maroon-800 dark:text-rose-400" />
                {servicePoint.location}
              </span>
              {(ticket.student_name || displayPurpose) && (
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {[ticket.student_name, displayPurpose].filter(Boolean).join(' • ')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Live Metrics Grid */}
        {(ticket.status === 'waiting' || ticket.status === 'called') && (
          <div className="mt-5 grid grid-cols-3 gap-2.5 sm:gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-center dark:border-slate-800 dark:bg-slate-800/50">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {ticket.status === 'called' ? 'Window' : 'Position'}
              </p>
              <p className="mt-1 font-mono text-xl font-extrabold text-slate-900 dark:text-white sm:text-2xl">
                {ticket.status === 'called' ? assignedWindow.replace(/^Window\s+/i, 'W') : `#${position}`}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-center dark:border-slate-800 dark:bg-slate-800/50">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Now Serving
              </p>
              <p className="mt-1 font-mono text-xl font-extrabold text-maroon-800 dark:text-rose-400 sm:text-2xl">
                {currentServing?.ticket_number ?? '—'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-center dark:border-slate-800 dark:bg-slate-800/50">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Est. Wait
              </p>
              <p className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white sm:text-xl">
                {ticket.status === 'called'
                  ? 'NOW'
                  : formatMinutesLabel(waitEstimate.estimatedMinutes)}
              </p>
              {ticket.status === 'waiting' && (
                <p
                  className={`mt-0.5 text-[10px] font-bold ${
                    waitEstimate.isLiveCalculated
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {waitEstimate.isLiveCalculated ? 'Live-calculated' : 'Estimated'}
                </p>
              )}
            </div>
          </div>
        )}

        {ticket.status === 'waiting' && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-slate-600 dark:text-slate-300">
            <span>
              {aheadCount === 0
                ? 'No one is waiting ahead of you. Get ready!'
                : `${aheadCount} ${aheadCount === 1 ? 'student is' : 'students are'} ahead of you.`}
            </span>
            <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <Clock className="h-3.5 w-3.5 text-maroon-800 dark:text-gold-400" />
              {waitEstimate.isLiveCalculated
                ? `Live avg: ${waitEstimate.rollingAvgMinutes}m/ticket (${waitEstimate.sampleSize} served)`
                : `Estimated: ${waitEstimate.rollingAvgMinutes}m/ticket`}
            </span>
          </div>
        )}
      </div>

      {/* ================= PERFORATED BOARDING PASS DIVIDER ================= */}
      <div className="relative flex items-center" aria-hidden="true">
        <div className="-ml-4 h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950" />
        <div className="w-full border-t-2 border-dashed border-slate-300 dark:border-slate-700" />
        <div className="-mr-4 h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950" />
      </div>

      {/* ================= LOWER VERIFICATION STUB (QR + ACTIONS) ================= */}
      <div className="bg-slate-50/70 px-5 pb-6 pt-5 dark:bg-slate-900/60 sm:px-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Inline Scannable QR Code (Always white background for reliable scanning) */}
          <div className="flex flex-col items-center">
            <div
              ref={qrWrapperRef}
              className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <QRCodeCanvas
                value={qrPayload}
                size={132}
                level="M"
                marginSize={1}
                bgColor="#FFFFFF"
                fgColor="#0F172A"
              />
            </div>
            <span className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              <QrCode className="h-3 w-3" />
              LINYAIIT:{ticket.ticket_number}
            </span>
          </div>

          {/* Verification Details & Download CTA */}
          <div className="flex-1 text-center sm:text-left">
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Scannable Queue Pass
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Save a crisp copy to your phone or show this QR code at the service counter for
              instant ticket verification.
            </p>
            <p className="mt-2 truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
              {qrPayload}
            </p>

            <button
              type="button"
              disabled={downloading}
              onClick={handleDownloadPng}
              className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-maroon-800 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-maroon-900 disabled:opacity-60 dark:bg-rose-500 dark:text-slate-950 dark:hover:bg-rose-400 sm:w-auto"
            >
              <Download className="h-4 w-4" />
              {downloading ? 'Preparing PNG...' : 'Download Boarding Pass (PNG)'}
            </button>
          </div>
        </div>

        {/* Footer Actions: Leave Queue visible while status === 'waiting' */}
        {(ticket.status === 'waiting' ||
          ticket.status === 'completed' ||
          ticket.status === 'skipped' ||
          ticket.status === 'cancelled') && (
          <div className="mt-5 border-t border-slate-200/80 pt-4 dark:border-slate-800">
            {ticket.status === 'waiting' ? (
              <button
                type="button"
                onClick={onRequestLeave}
                className="w-full rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70"
              >
                Leave Queue
              </button>
            ) : (
              <button
                type="button"
                onClick={onDismissFinished}
                className="w-full rounded-xl bg-maroon-800 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-maroon-900 dark:bg-rose-500 dark:text-slate-950 dark:hover:bg-rose-400"
              >
                Join Another Queue
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}