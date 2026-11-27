import { requireSupabase } from './supabase';
import { JoinQueueResult, ServicePoint, Ticket } from '../types/database';

function getManilaTodayString(): string {
  // Format YYYY-MM-DD in Asia/Manila timezone to match PostgreSQL manila_today()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export async function fetchServicePoints(): Promise<ServicePoint[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('service_points')
    .select('*')
    .order('display_order', { ascending: true })
    .order('code', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ServicePoint[];
}

export async function fetchTodayTickets(servicePointId?: string): Promise<Ticket[]> {
  const client = requireSupabase();
  const today = getManilaTodayString();

  let query = client
    .from('tickets')
    .select('*')
    .eq('queue_date', today)
    .order('sequence_number', { ascending: true });

  if (servicePointId) {
    query = query.eq('service_point_id', servicePointId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Ticket[];
}

export async function joinQueue(params: {
  servicePointId: string;
  sessionToken: string;
  studentName?: string;
  purpose?: string;
}): Promise<JoinQueueResult> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('join_queue', {
    p_service_point_id: params.servicePointId,
    p_session_token: params.sessionToken,
    p_student_name: params.studentName?.trim() || null,
    p_purpose: params.purpose?.trim() || null,
  });

  if (error) throw new Error(error.message);
  return data as JoinQueueResult;
}

export async function getMyActiveTicket(sessionToken: string): Promise<Ticket | null> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_my_active_ticket', {
    p_session_token: sessionToken,
  });

  if (error) throw new Error(error.message);
  if (!data || !data.id) return null;
  return data as Ticket;
}

export async function leaveQueue(ticketId: string, sessionToken: string): Promise<Ticket> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('leave_queue', {
    p_ticket_id: ticketId,
    p_session_token: sessionToken,
  });

  if (error) throw new Error(error.message);
  return data as Ticket;
}

export async function staffCallNext(servicePointId: string): Promise<Ticket> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('staff_call_next', {
    p_service_point_id: servicePointId,
  });

  if (error) throw new Error(error.message);
  return data as Ticket;
}

export async function staffCompleteTicket(ticketId: string): Promise<Ticket> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('staff_complete_ticket', {
    p_ticket_id: ticketId,
  });

  if (error) throw new Error(error.message);
  return data as Ticket;
}

export async function staffSkipTicket(ticketId: string): Promise<Ticket> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('staff_skip_ticket', {
    p_ticket_id: ticketId,
  });

  if (error) throw new Error(error.message);
  return data as Ticket;
}

export async function staffRequeueTicket(ticketId: string): Promise<Ticket> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('staff_requeue_ticket', {
    p_ticket_id: ticketId,
  });

  if (error) throw new Error(error.message);
  return data as Ticket;
}

export async function staffToggleServicePoint(
  servicePointId: string,
  isActive: boolean
): Promise<ServicePoint> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('staff_toggle_service_point', {
    p_service_point_id: servicePointId,
    p_is_active: isActive,
  });

  if (error) throw new Error(error.message);
  return data as ServicePoint;
}

export async function staffResetQueueToday(servicePointId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc('staff_reset_queue_today', {
    p_service_point_id: servicePointId,
  });

  if (error) throw new Error(error.message);
}
