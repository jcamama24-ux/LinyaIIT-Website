-- ============================================================================
-- LinyaIIT — Complete PostgreSQL Schema, Atomic RPCs, RLS & Realtime Setup
-- ============================================================================
-- Safe to run in Supabase SQL Editor (100% Free Tier, PostgreSQL 15+).
-- Idempotent: safe to re-run without breaking existing structures.

-- 1. TIMEZONE HELPER (Asia/Manila so daily queue counters reset at midnight PHT)
CREATE OR REPLACE FUNCTION public.manila_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (timezone('Asia/Manila', now()))::date;
$$;

-- 2. SERVICE POINTS TABLE
CREATE TABLE IF NOT EXISTS public.service_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{1,3}$'),
  name text NOT NULL,
  location text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  avg_service_minutes integer NOT NULL DEFAULT 5 CHECK (avg_service_minutes > 0),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. ATOMIC DAILY SEQUENCE COUNTERS (Internal only — locked down via RLS)
CREATE TABLE IF NOT EXISTS public.service_point_counters (
  service_point_id uuid NOT NULL REFERENCES public.service_points(id) ON DELETE CASCADE,
  queue_date date NOT NULL,
  last_number integer NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  PRIMARY KEY (service_point_id, queue_date)
);

-- 4. AUTHORIZED STAFF PROFILES (True authorization beyond plain Auth sign-up)
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'admin')),
  default_service_point_id uuid REFERENCES public.service_points(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. TICKETS TABLE
CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_point_id uuid NOT NULL REFERENCES public.service_points(id) ON DELETE CASCADE,
  queue_date date NOT NULL DEFAULT public.manila_today(),
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  ticket_number text NOT NULL,
  session_token_hash text NOT NULL,
  student_name text,
  purpose text,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'called', 'completed', 'skipped', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz,
  completed_at timestamptz,
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT uq_ticket_number_per_day UNIQUE (service_point_id, queue_date, ticket_number),
  CONSTRAINT uq_sequence_number_per_day UNIQUE (service_point_id, queue_date, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_tickets_lookup
  ON public.tickets (service_point_id, queue_date, status, sequence_number);

CREATE INDEX IF NOT EXISTS idx_tickets_date_created
  ON public.tickets (queue_date, created_at DESC);

-- Guarantee at database level: one active (waiting or called) ticket per student session per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_ticket_per_session
  ON public.tickets (session_token_hash, queue_date)
  WHERE status IN ('waiting', 'called');

-- 6. SECURITY HELPERS
CREATE OR REPLACE FUNCTION public.hash_session_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(sha256(convert_to(trim(p_token), 'UTF8')), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.is_authorized_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_profiles
    WHERE user_id = auth.uid()
  );
$$;

-- 7. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.service_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_point_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Service points: public read; authorized staff manage
DROP POLICY IF EXISTS "Public can view service points" ON public.service_points;
CREATE POLICY "Public can view service points"
  ON public.service_points
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff can manage service points" ON public.service_points;
CREATE POLICY "Staff can manage service points"
  ON public.service_points
  FOR ALL
  TO authenticated
  USING (public.is_authorized_staff())
  WITH CHECK (public.is_authorized_staff());

-- Service point counters: NO direct client access (RPC-only via SECURITY DEFINER)

-- Staff profiles: authenticated users can read only their own staff profile
DROP POLICY IF EXISTS "Staff can view own profile" ON public.staff_profiles;
CREATE POLICY "Staff can view own profile"
  ON public.staff_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Tickets: public can read today's queue for live display & Realtime; staff can read all.
-- All INSERT / UPDATE / DELETE mutations are strictly handled by atomic SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "Public can view today tickets" ON public.tickets;
CREATE POLICY "Public can view today tickets"
  ON public.tickets
  FOR SELECT
  TO anon, authenticated
  USING (queue_date = public.manila_today() OR public.is_authorized_staff());

-- ============================================================================
-- 8. ATOMIC STUDENT RPC FUNCTIONS
-- ============================================================================

-- 8A. Join Queue (Atomic ticket numbering + duplicate session protection)
CREATE OR REPLACE FUNCTION public.join_queue(
  p_service_point_id uuid,
  p_session_token text,
  p_student_name text DEFAULT NULL,
  p_purpose text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := public.manila_today();
  v_token_hash text;
  v_sp public.service_points%ROWTYPE;
  v_existing public.tickets%ROWTYPE;
  v_next_num integer;
  v_ticket_num text;
  v_new_ticket public.tickets%ROWTYPE;
  v_clean_name text;
  v_clean_purpose text;
BEGIN
  IF p_session_token IS NULL OR length(trim(p_session_token)) < 8 THEN
    RAISE EXCEPTION 'Invalid session token.';
  END IF;

  v_token_hash := public.hash_session_token(p_session_token);
  v_clean_name := NULLIF(left(trim(COALESCE(p_student_name, '')), 60), '');
  v_clean_purpose := NULLIF(left(trim(COALESCE(p_purpose, '')), 120), '');

  -- Check if this device/session already holds an active ticket today
  SELECT * INTO v_existing
  FROM public.tickets
  WHERE session_token_hash = v_token_hash
    AND queue_date = v_today
    AND status IN ('waiting', 'called')
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ticket', to_jsonb(v_existing),
      'already_active', true
    );
  END IF;

  -- Verify service point exists and is open
  SELECT * INTO v_sp
  FROM public.service_points
  WHERE id = p_service_point_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected service point was not found.';
  END IF;

  IF NOT v_sp.is_active THEN
    RAISE EXCEPTION 'This service point is currently paused or closed.';
  END IF;

  -- Atomically increment daily counter using PostgreSQL row-level locking
  INSERT INTO public.service_point_counters (service_point_id, queue_date, last_number)
  VALUES (p_service_point_id, v_today, 1)
  ON CONFLICT (service_point_id, queue_date)
  DO UPDATE SET last_number = public.service_point_counters.last_number + 1
  RETURNING last_number INTO v_next_num;

  v_ticket_num := v_sp.code || lpad(v_next_num::text, 3, '0');

  BEGIN
    INSERT INTO public.tickets (
      service_point_id,
      queue_date,
      sequence_number,
      ticket_number,
      session_token_hash,
      student_name,
      purpose,
      status
    )
    VALUES (
      p_service_point_id,
      v_today,
      v_next_num,
      v_ticket_num,
      v_token_hash,
      v_clean_name,
      v_clean_purpose,
      'waiting'
    )
    RETURNING * INTO v_new_ticket;
  EXCEPTION
    WHEN unique_violation THEN
      -- Handles simultaneous double-tap from the same device gracefully
      SELECT * INTO v_existing
      FROM public.tickets
      WHERE session_token_hash = v_token_hash
        AND queue_date = v_today
        AND status IN ('waiting', 'called')
      LIMIT 1;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'ticket', to_jsonb(v_existing),
          'already_active', true
        );
      END IF;
      RAISE;
  END;

  RETURN jsonb_build_object(
    'ticket', to_jsonb(v_new_ticket),
    'already_active', false
  );
END;
$$;

-- 8B. Restore Student's Own Active Ticket (after page refresh / phone unlock)
CREATE OR REPLACE FUNCTION public.get_my_active_ticket(p_session_token text)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.tickets%ROWTYPE;
BEGIN
  IF p_session_token IS NULL OR length(trim(p_session_token)) < 8 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_ticket
  FROM public.tickets
  WHERE session_token_hash = public.hash_session_token(p_session_token)
    AND queue_date = public.manila_today()
    AND status IN ('waiting', 'called')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_ticket;
END;
$$;

-- 8C. Leave Queue (Verified against hashed session token so students only cancel their own)
CREATE OR REPLACE FUNCTION public.leave_queue(
  p_ticket_id uuid,
  p_session_token text
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.tickets%ROWTYPE;
BEGIN
  IF p_session_token IS NULL OR length(trim(p_session_token)) < 8 THEN
    RAISE EXCEPTION 'Invalid session token.';
  END IF;

  UPDATE public.tickets
  SET status = 'cancelled',
      completed_at = now()
  WHERE id = p_ticket_id
    AND session_token_hash = public.hash_session_token(p_session_token)
    AND status IN ('waiting', 'called')
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unable to cancel ticket. It may already be completed or belong to another session.';
  END IF;

  RETURN v_updated;
END;
$$;

-- ============================================================================
-- 9. ATOMIC AUTHORIZED STAFF RPC FUNCTIONS
-- ============================================================================

-- 9A. Call Next Waiting Ticket
CREATE OR REPLACE FUNCTION public.staff_call_next(p_service_point_id uuid)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := public.manila_today();
  v_current_called public.tickets%ROWTYPE;
  v_next public.tickets%ROWTYPE;
BEGIN
  IF NOT public.is_authorized_staff() THEN
    RAISE EXCEPTION 'Unauthorized: Staff access required.';
  END IF;

  -- Prevent accidentally calling a second ticket before finishing/skipping the current one
  SELECT * INTO v_current_called
  FROM public.tickets
  WHERE service_point_id = p_service_point_id
    AND queue_date = v_today
    AND status = 'called'
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Ticket % is currently being served. Mark it completed or skipped first.', v_current_called.ticket_number;
  END IF;

  -- Select next waiting ticket atomically using row lock
  SELECT * INTO v_next
  FROM public.tickets
  WHERE service_point_id = p_service_point_id
    AND queue_date = v_today
    AND status = 'waiting'
  ORDER BY sequence_number ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No waiting tickets in this queue.';
  END IF;

  UPDATE public.tickets
  SET status = 'called',
      called_at = now(),
      handled_by = auth.uid()
  WHERE id = v_next.id
  RETURNING * INTO v_next;

  RETURN v_next;
END;
$$;

-- 9B. Mark Ticket Completed
CREATE OR REPLACE FUNCTION public.staff_complete_ticket(p_ticket_id uuid)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.tickets%ROWTYPE;
BEGIN
  IF NOT public.is_authorized_staff() THEN
    RAISE EXCEPTION 'Unauthorized: Staff access required.';
  END IF;

  UPDATE public.tickets
  SET status = 'completed',
      completed_at = now(),
      handled_by = auth.uid()
  WHERE id = p_ticket_id
    AND status = 'called'
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket is not currently in called status.';
  END IF;

  RETURN v_updated;
END;
$$;

-- 9C. Skip Ticket (from called or waiting)
CREATE OR REPLACE FUNCTION public.staff_skip_ticket(p_ticket_id uuid)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.tickets%ROWTYPE;
BEGIN
  IF NOT public.is_authorized_staff() THEN
    RAISE EXCEPTION 'Unauthorized: Staff access required.';
  END IF;

  UPDATE public.tickets
  SET status = 'skipped',
      completed_at = now(),
      handled_by = auth.uid()
  WHERE id = p_ticket_id
    AND status IN ('called', 'waiting')
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket cannot be skipped in its current state.';
  END IF;

  RETURN v_updated;
END;
$$;

-- 9D. Re-queue a Skipped Ticket (helpful if student arrives shortly after being skipped)
CREATE OR REPLACE FUNCTION public.staff_requeue_ticket(p_ticket_id uuid)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.tickets%ROWTYPE;
BEGIN
  IF NOT public.is_authorized_staff() THEN
    RAISE EXCEPTION 'Unauthorized: Staff access required.';
  END IF;

  UPDATE public.tickets
  SET status = 'waiting',
      called_at = NULL,
      completed_at = NULL,
      handled_by = auth.uid()
  WHERE id = p_ticket_id
    AND queue_date = public.manila_today()
    AND status = 'skipped'
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only skipped tickets from today can be re-queued.';
  END IF;

  RETURN v_updated;
END;
$$;

-- 9E. Pause or Re-open a Service Point
CREATE OR REPLACE FUNCTION public.staff_toggle_service_point(
  p_service_point_id uuid,
  p_is_active boolean
)
RETURNS public.service_points
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.service_points%ROWTYPE;
BEGIN
  IF NOT public.is_authorized_staff() THEN
    RAISE EXCEPTION 'Unauthorized: Staff access required.';
  END IF;

  UPDATE public.service_points
  SET is_active = p_is_active
  WHERE id = p_service_point_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service point not found.';
  END IF;

  RETURN v_updated;
END;
$$;

-- 9F. Reset Today's Queue for a Service Point (clean reset before demos or testing)
CREATE OR REPLACE FUNCTION public.staff_reset_queue_today(p_service_point_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := public.manila_today();
BEGIN
  IF NOT public.is_authorized_staff() THEN
    RAISE EXCEPTION 'Unauthorized: Staff access required.';
  END IF;

  DELETE FROM public.tickets
  WHERE service_point_id = p_service_point_id
    AND queue_date = v_today;

  DELETE FROM public.service_point_counters
  WHERE service_point_id = p_service_point_id
    AND queue_date = v_today;
END;
$$;

-- 10. FUNCTION PERMISSIONS
GRANT EXECUTE ON FUNCTION public.manila_today() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_queue(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_active_ticket(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_queue(uuid, text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.staff_call_next(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_complete_ticket(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_skip_ticket(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_requeue_ticket(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_toggle_service_point(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_reset_queue_today(uuid) TO authenticated;

-- 11. REALTIME PUBLICATION SETUP
ALTER TABLE public.tickets REPLICA IDENTITY FULL;
ALTER TABLE public.service_points REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.service_points;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 12. REALISTIC CAMPUS SERVICE POINTS (Sample Seed Data — Safe to Re-run)
INSERT INTO public.service_points (code, name, location, description, is_active, avg_service_minutes, display_order)
VALUES
  (
    'A',
    'Office of the Registrar',
    'Admin Building, Ground Floor — Windows 1–3',
    'TOR requests, enrollment verification, certification, and academic records.',
    true,
    5,
    1
  ),
  (
    'B',
    'Cashier & Student Accounts',
    'Admin Building, Ground Floor — Windows 4–6',
    'Tuition assessment, fee payments, clearances, and official receipts.',
    true,
    4,
    2
  ),
  (
    'C',
    'Admissions & Scholarships',
    'Student Center, Room 102',
    'Scholarship renewals, stipend inquiries, and freshman admission documents.',
    true,
    6,
    3
  ),
  (
    'D',
    'ICTC Student Helpdesk',
    'CASS / ICTC Building, Ground Floor',
    'My.IIT account recovery, institutional email, and campus Wi-Fi assistance.',
    true,
    5,
    4
  ),
  (
    'E',
    'University Health Services',
    'Campus Clinic, Near Gymnasium',
    'Medical certificates, physical exam clearances, and routine consultations.',
    true,
    7,
    5
  )
ON CONFLICT (code) DO NOTHING;
