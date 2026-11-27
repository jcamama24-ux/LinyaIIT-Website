  -- ============================================================================
  -- LinyaIIT — Authorize a Staff Account
  -- ============================================================================
  -- Step 1: Go to Supabase Dashboard -> Authentication -> Users -> "Add user"
  --         Create an email/password account (e.g. staff@linyaiit.edu.ph)
  --         and check "Auto Confirm User".
  -- Step 2: Replace the email below with that exact email and run this query
  --         in Supabase Dashboard -> SQL Editor.

  INSERT INTO public.staff_profiles (user_id, full_name, role, default_service_point_id)
  SELECT
    u.id,
    'Registrar Counter Staff',
    'admin',
    (SELECT id FROM public.service_points WHERE code = 'A' LIMIT 1)
  FROM auth.users u
  WHERE u.email = 'staff@linyaiit.edu.ph'
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role = EXCLUDED.role;
