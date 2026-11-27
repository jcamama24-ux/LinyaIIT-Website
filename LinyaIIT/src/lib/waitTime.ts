import type { ServicePoint, Ticket } from '../types/database';

const FALLBACK_AVG_MINUTES = 5;
const MIN_COMPLETED_SAMPLES = 3;
const MAX_ROLLING_WINDOW = 10;
const MIN_CLAMP_MINUTES = 1;
const MAX_CLAMP_MINUTES = 45;

export const PRIORITY_TAG = '[PRIORITY]';

export interface RollingWaitStats {
  rollingAvgMinutes: number;
  isLiveCalculated: boolean;
  sampleSize: number;
}

export interface StudentWaitEstimate extends RollingWaitStats {
  estimatedMinutes: number;
}

/**
 * Computes rolling-average service duration per service point from today's
 * completed tickets that have both `called_at` and `completed_at`.
 * Uses the 10 most recent completed tickets clamped to [1, 45] minutes,
 * or falls back to 5 minutes if fewer than 3 completed tickets exist today.
 */
export function computeRollingAverageMinutes(
  tickets: Ticket[],
  servicePointId: string
): RollingWaitStats {
  const validCompleted = tickets
    .filter((t) => {
      if (t.service_point_id !== servicePointId) return false;
      if (t.status !== 'completed') return false;
      if (!t.called_at || !t.completed_at) return false;
      const calledMs = new Date(t.called_at).getTime();
      const completedMs = new Date(t.completed_at).getTime();
      return Number.isFinite(calledMs) && Number.isFinite(completedMs) && completedMs >= calledMs;
    })
    .sort(
      (a, b) =>
        new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()
    );

  if (validCompleted.length < MIN_COMPLETED_SAMPLES) {
    return {
      rollingAvgMinutes: FALLBACK_AVG_MINUTES,
      isLiveCalculated: false,
      sampleSize: validCompleted.length,
    };
  }

  const recent = validCompleted.slice(0, MAX_ROLLING_WINDOW);
  const totalMinutes = recent.reduce((sum, t) => {
    const durationMins =
      (new Date(t.completed_at!).getTime() - new Date(t.called_at!).getTime()) / 60000;
    return sum + Math.max(0, durationMins);
  }, 0);

  const rawAvg = totalMinutes / recent.length;
  const clamped = Math.min(MAX_CLAMP_MINUTES, Math.max(MIN_CLAMP_MINUTES, rawAvg));

  return {
    rollingAvgMinutes: Math.round(clamped),
    isLiveCalculated: true,
    sampleSize: recent.length,
  };
}

/**
 * Formula for a waiting student:
 * `peopleAhead * rollingAvgMinutes` + `Math.ceil(rollingAvgMinutes / 2)` if someone is currently 'called'.
 */
export function calculateStudentWaitEstimate(
  peopleAhead: number,
  hasCurrentlyCalled: boolean,
  rolling: RollingWaitStats
): StudentWaitEstimate {
  const safeAhead = Math.max(0, peopleAhead);
  const baseMinutes = safeAhead * rolling.rollingAvgMinutes;
  const activeServingOffset = hasCurrentlyCalled
    ? Math.ceil(rolling.rollingAvgMinutes / 2)
    : 0;

  return {
    estimatedMinutes: baseMinutes + activeServingOffset,
    rollingAvgMinutes: rolling.rollingAvgMinutes,
    isLiveCalculated: rolling.isLiveCalculated,
    sampleSize: rolling.sampleSize,
  };
}

export function formatMinutesLabel(minutes: number): string {
  return `~${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
}

export function isPriorityTicket(ticket: Ticket): boolean {
  if (ticket.is_priority === true || ticket.lane === 'priority') return true;
  if (ticket.purpose && ticket.purpose.trim().toUpperCase().startsWith(PRIORITY_TAG)) {
    return true;
  }
  return false;
}

export function getDisplayPurpose(purpose: string | null): string | null {
  if (!purpose) return null;
  const cleaned = purpose.replace(/^\[PRIORITY\]\s*/i, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function resolveAssignedWindow(
  ticket: Ticket,
  servicePoint: ServicePoint | null
): string {
  if (
    ticket.window_number !== undefined &&
    ticket.window_number !== null &&
    String(ticket.window_number).trim() !== ''
  ) {
    const raw = String(ticket.window_number).trim();
    return /^window/i.test(raw) ? raw : `Window ${raw}`;
  }

  if (servicePoint?.location) {
    const match = servicePoint.location.match(/Windows?\s+[\d\u2013\-A-Za-z]+/i);
    if (match) return match[0];
  }

  return servicePoint ? `Counter ${servicePoint.code}` : 'Assigned Window';
}