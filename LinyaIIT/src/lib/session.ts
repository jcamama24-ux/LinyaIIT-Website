/**
 * Anonymous device identity token for students.
 *
 * Queue state lives 100% in Supabase PostgreSQL. This random token is hashed
 * with SHA-256 on the database server to prevent duplicate active tickets,
 * restore live tickets across reloads, and authorize Leave Queue requests.
 * The active ticket.id is mirrored in localStorage strictly for instant UI
 * hydration before getMyActiveTicket() resolves.
 */

const TOKEN_STORAGE_KEY = 'linyaiit_device_identity_v1';
const LAST_TICKET_KEY = 'linyaiit_last_ticket_id_v1';

function generateRandomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getStudentSessionToken(): string {
  try {
    const existing = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (existing && existing.length >= 16) {
      return existing;
    }
    const fresh = generateRandomToken();
    window.localStorage.setItem(TOKEN_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return generateRandomToken();
  }
}

export function saveTrackedTicketId(ticketId: string | null): void {
  try {
    if (ticketId) {
      window.localStorage.setItem(LAST_TICKET_KEY, ticketId);
      window.sessionStorage.setItem(LAST_TICKET_KEY, ticketId);
    } else {
      window.localStorage.removeItem(LAST_TICKET_KEY);
      window.sessionStorage.removeItem(LAST_TICKET_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getTrackedTicketId(): string | null {
  try {
    const fromLocal = window.localStorage.getItem(LAST_TICKET_KEY);
    if (fromLocal) return fromLocal;
    return window.sessionStorage.getItem(LAST_TICKET_KEY);
  } catch {
    return null;
  }
}