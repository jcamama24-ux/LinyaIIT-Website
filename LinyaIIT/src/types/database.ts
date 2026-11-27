export type TicketStatus = 'waiting' | 'called' | 'completed' | 'skipped' | 'cancelled';

export interface ServicePoint {
  id: string;
  code: string;
  name: string;
  location: string;
  description: string;
  is_active: boolean;
  avg_service_minutes: number;
  display_order: number;
  created_at: string;
}

export interface Ticket {
  id: string;
  service_point_id: string;
  queue_date: string;
  sequence_number: number;
  ticket_number: string;
  session_token_hash: string;
  student_name: string | null;
  purpose: string | null;
  status: TicketStatus;
  created_at: string;
  called_at: string | null;
  completed_at: string | null;
  handled_by: string | null;
}

export interface StaffProfile {
  user_id: string;
  full_name: string;
  role: 'staff' | 'admin';
  default_service_point_id: string | null;
  created_at: string;
}

export interface JoinQueueResult {
  ticket: Ticket;
  already_active: boolean;
}

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
