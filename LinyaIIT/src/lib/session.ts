/**
 * Anonymous device identity token for students.
 *
 * IMPORTANT: This is NOT a queue database. Queue state lives 100% in Supabase
 * PostgreSQL. This random token is hashed with SHA-256 on the database server
 * solely to:
 *  1) Prevent the same device/browser from grabbing duplicate active tickets.
 *  2) Restore the student's live ticket if they refresh or reopen their browser.
 *  3) Verify ownership when a student clicks "Leave Queue".
 */

const TOKEN_STORAGE_KEY = 'linyaiit_device_identity_v1';
const LAST_TICKET_KEY = 'linyaiit_last_ticket_id_v1';

function generateRandomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Safe fallback for older mobile browsers without crypto.randomUUID
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
    // Private browsing / restricted storage fallback (in-memory for current tab)
    return generateRandomToken();
  }
}

export function saveTrackedTicketId(ticketId: string | null): void {
  try {
    if (ticketId) {
      window.sessionStorage.setItem(LAST_TICKET_KEY, ticketId);
    } else {
      window.sessionStorage.removeItem(LAST_TICKET_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getTrackedTicketId(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_TICKET_KEY);
  } catch {
    return null;
  }
}
