CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_manager_id ON public.users(manager_id);

CREATE OR REPLACE FUNCTION public.is_admin_of(p_admin_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.manager_id = p_admin_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_of(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Admins view all profiles" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Update users" ON public.users;

CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Super admins can view all profiles" ON public.users
  FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'super_admin');

CREATE POLICY "Admins can view team profiles" ON public.users
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'admin'
    AND (id = auth.uid() OR public.is_admin_of(auth.uid(), id))
  );

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.can_access_broadcast(p_broadcast_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.news_broadcasts nb
    WHERE nb.id = p_broadcast_id
      AND (
        nb.created_by = auth.uid()
        OR public.get_my_role() = 'super_admin'
        OR (
          public.get_my_role() = 'admin'
          AND (nb.created_by = auth.uid() OR public.is_admin_of(auth.uid(), nb.created_by))
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_broadcast(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_broadcast(p_broadcast_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.news_broadcasts nb
    WHERE nb.id = p_broadcast_id
      AND (
        nb.created_by = auth.uid()
        OR public.get_my_role() = 'super_admin'
        OR (
          public.get_my_role() = 'admin'
          AND (nb.created_by = auth.uid() OR public.is_admin_of(auth.uid(), nb.created_by))
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_broadcast(uuid) TO authenticated;

ALTER TABLE public.news_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Editors and admins can view broadcasts" ON public.news_broadcasts;
DROP POLICY IF EXISTS "Editors and admins can create broadcasts" ON public.news_broadcasts;
DROP POLICY IF EXISTS "Editors and admins can update their broadcasts" ON public.news_broadcasts;
DROP POLICY IF EXISTS "Admins can delete broadcasts" ON public.news_broadcasts;
DROP POLICY IF EXISTS "Read access for news_broadcasts" ON public.news_broadcasts;
DROP POLICY IF EXISTS "Write access for news_broadcasts" ON public.news_broadcasts;

CREATE POLICY "Broadcasts select own or team" ON public.news_broadcasts
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'admin'
      AND (created_by = auth.uid() OR public.is_admin_of(auth.uid(), created_by))
    )
  );

CREATE POLICY "Broadcasts insert own" ON public.news_broadcasts
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Broadcasts update own or team" ON public.news_broadcasts
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'admin'
      AND (created_by = auth.uid() OR public.is_admin_of(auth.uid(), created_by))
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'admin'
      AND (created_by = auth.uid() OR public.is_admin_of(auth.uid(), created_by))
    )
  );

CREATE POLICY "Broadcasts delete own or team" ON public.news_broadcasts
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'admin'
      AND (created_by = auth.uid() OR public.is_admin_of(auth.uid(), created_by))
    )
  );

DROP POLICY IF EXISTS "Editors and admins can view broadcast items" ON public.broadcast_news_items;
DROP POLICY IF EXISTS "Editors and admins can create broadcast items" ON public.broadcast_news_items;
DROP POLICY IF EXISTS "Editors and admins can delete broadcast items" ON public.broadcast_news_items;

CREATE POLICY "Broadcast items select by broadcast access" ON public.broadcast_news_items
  FOR SELECT
  TO authenticated
  USING (public.can_access_broadcast(broadcast_id));

CREATE POLICY "Broadcast items write by broadcast manage" ON public.broadcast_news_items
  FOR ALL
  TO authenticated
  USING (public.can_manage_broadcast(broadcast_id))
  WITH CHECK (public.can_manage_broadcast(broadcast_id));

DROP POLICY IF EXISTS "Editors and admins can view timeline events" ON public.timeline_events;
DROP POLICY IF EXISTS "Editors and admins can create timeline events" ON public.timeline_events;

CREATE POLICY "Timeline select by broadcast access" ON public.timeline_events
  FOR SELECT
  TO authenticated
  USING (public.can_access_broadcast(broadcast_id));

CREATE POLICY "Timeline write by broadcast manage" ON public.timeline_events
  FOR ALL
  TO authenticated
  USING (public.can_manage_broadcast(broadcast_id))
  WITH CHECK (public.can_manage_broadcast(broadcast_id));

DROP POLICY IF EXISTS "Public Access Select Generated" ON public.generated_broadcasts;
DROP POLICY IF EXISTS "Public Access Insert Generated" ON public.generated_broadcasts;
DROP POLICY IF EXISTS "Public Access Delete Generated" ON public.generated_broadcasts;

CREATE POLICY "Generated broadcasts select by broadcast access" ON public.generated_broadcasts
  FOR SELECT
  TO authenticated
  USING (public.can_access_broadcast(broadcast_id));

CREATE POLICY "Generated broadcasts write by broadcast manage" ON public.generated_broadcasts
  FOR ALL
  TO authenticated
  USING (public.can_manage_broadcast(broadcast_id))
  WITH CHECK (public.can_manage_broadcast(broadcast_id));

DROP POLICY IF EXISTS "Admins can view team cost events" ON public.cost_events;
CREATE POLICY "Admins can view team cost events" ON public.cost_events
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'admin'
    AND (user_id = auth.uid() OR public.is_admin_of(auth.uid(), user_id))
  );

CREATE OR REPLACE FUNCTION public.create_team_user_rpc(
  email text,
  password text,
  full_name text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_user_id uuid;
  encrypted_pw text;
  requesting_role user_role;
BEGIN
  SELECT role INTO requesting_role FROM public.users WHERE id = auth.uid();
  IF requesting_role <> 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can create team users';
  END IF;

  new_user_id := gen_random_uuid();
  encrypted_pw := crypt(password, gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    email,
    encrypted_pw,
    now(),
    NULL,
    NULL,
    '{"provider": "email", "providers": ["email"]}',
    json_build_object('full_name', full_name),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  BEGIN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'auth'
        AND table_name = 'identities'
        AND column_name = 'provider_id'
    ) THEN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'auth'
          AND table_name = 'identities'
          AND column_name = 'email'
          AND (is_generated IS NULL OR is_generated = 'NEVER')
      ) THEN
        INSERT INTO auth.identities (
          id,
          user_id,
          identity_data,
          provider,
          provider_id,
          email,
          last_sign_in_at,
          created_at,
          updated_at
        ) VALUES (
          gen_random_uuid(),
          new_user_id,
          json_build_object('sub', new_user_id::text, 'email', email),
          'email',
          email,
          email,
          NULL,
          now(),
          now()
        );
      ELSE
        INSERT INTO auth.identities (
          id,
          user_id,
          identity_data,
          provider,
          provider_id,
          last_sign_in_at,
          created_at,
          updated_at
        ) VALUES (
          gen_random_uuid(),
          new_user_id,
          json_build_object('sub', new_user_id::text, 'email', email),
          'email',
          email,
          NULL,
          now(),
          now()
        );
      END IF;
    ELSE
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        new_user_id,
        json_build_object('sub', new_user_id::text, 'email', email),
        'email',
        NULL,
        now(),
        now()
      );
    END IF;
  EXCEPTION
    WHEN undefined_table OR undefined_column THEN
      NULL;
  END;

  INSERT INTO public.users (id, email, full_name, role, manager_id)
  VALUES (new_user_id, email, full_name, 'user'::user_role, auth.uid())
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    manager_id = EXCLUDED.manager_id,
    updated_at = now();

  RETURN json_build_object('id', new_user_id, 'email', email, 'role', 'user', 'manager_id', auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_team_user_rpc(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_team_members_with_usage_rpc(p_admin_id uuid DEFAULT NULL)
RETURNS TABLE (
  member_id uuid,
  email text,
  full_name text,
  role user_role,
  is_admin boolean,
  broadcasts_count bigint,
  total_cost numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_role user_role;
BEGIN
  v_admin_id := COALESCE(p_admin_id, auth.uid());
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();

  IF v_role = 'admin' AND v_admin_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Admins can only query their own team';
  END IF;

  IF v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT u.id, u.email, u.full_name, u.role, false::boolean AS is_admin
    FROM public.users u
    WHERE u.manager_id = v_admin_id
  ),
  admin_row AS (
    SELECT u.id, u.email, u.full_name, u.role, true::boolean AS is_admin
    FROM public.users u
    WHERE u.id = v_admin_id
  ),
  all_users AS (
    SELECT * FROM admin_row
    UNION ALL
    SELECT * FROM members
  )
  SELECT
    au.id AS member_id,
    au.email,
    au.full_name,
    au.role,
    au.is_admin,
    COALESCE(COUNT(DISTINCT nb.id), 0) AS broadcasts_count,
    COALESCE(SUM(ce.total_cost), 0) AS total_cost
  FROM all_users au
  LEFT JOIN public.news_broadcasts nb ON nb.created_by = au.id
  LEFT JOIN public.cost_events ce ON ce.user_id = au.id
  GROUP BY au.id, au.email, au.full_name, au.role, au.is_admin
  ORDER BY au.is_admin DESC, au.full_name NULLS LAST, au.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_members_with_usage_rpc(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_team_user_rpc(
  p_user_id uuid,
  p_behavior text DEFAULT 'transfer'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_requesting_role user_role;
  v_admin_id uuid;
  v_manager_id uuid;
BEGIN
  SELECT role INTO v_requesting_role FROM public.users WHERE id = auth.uid();
  IF v_requesting_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT manager_id INTO v_manager_id FROM public.users WHERE id = p_user_id;
  IF v_manager_id IS NULL THEN
    IF v_requesting_role = 'admin' THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  IF v_requesting_role = 'admin' THEN
    v_admin_id := auth.uid();
    IF v_manager_id <> v_admin_id THEN
      RAISE EXCEPTION 'Unauthorized: User is not in your team';
    END IF;
  ELSE
    v_admin_id := COALESCE(v_manager_id, auth.uid());
  END IF;

  IF p_behavior NOT IN ('transfer', 'delete') THEN
    RAISE EXCEPTION 'Invalid behavior';
  END IF;

  IF p_behavior = 'transfer' THEN
    UPDATE public.news_broadcasts
    SET created_by = v_admin_id
    WHERE created_by = p_user_id;

    UPDATE public.cost_events
    SET user_id = v_admin_id
    WHERE user_id = p_user_id;
  ELSE
    DELETE FROM public.tts_audio_files taf
    USING public.broadcast_news_items bni, public.news_broadcasts nb
    WHERE taf.broadcast_news_item_id = bni.id
      AND bni.broadcast_id = nb.id
      AND nb.created_by = p_user_id;

    DELETE FROM public.generated_broadcasts gb
    USING public.news_broadcasts nb
    WHERE gb.broadcast_id = nb.id
      AND nb.created_by = p_user_id;

    DELETE FROM public.timeline_events te
    USING public.news_broadcasts nb
    WHERE te.broadcast_id = nb.id
      AND nb.created_by = p_user_id;

    DELETE FROM public.broadcast_news_items bni
    USING public.news_broadcasts nb
    WHERE bni.broadcast_id = nb.id
      AND nb.created_by = p_user_id;

    DELETE FROM public.news_broadcasts
    WHERE created_by = p_user_id;
  END IF;

  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN json_build_object('id', p_user_id, 'behavior', p_behavior);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_team_user_rpc(uuid, text) TO authenticated;

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Editors and admins can view settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can update settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can create settings" ON public.settings;
DROP POLICY IF EXISTS "Settings read tts_custom_voices" ON public.settings;
DROP POLICY IF EXISTS "Super admin manage settings" ON public.settings;
DROP POLICY IF EXISTS "Admin manage settings except voices" ON public.settings;

CREATE POLICY "Settings read tts_custom_voices" ON public.settings
  FOR SELECT
  TO authenticated
  USING (key = 'tts_custom_voices');

CREATE POLICY "Super admin manage settings" ON public.settings
  FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "Admin manage settings except voices" ON public.settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'admin' AND key <> 'tts_custom_voices');

CREATE POLICY "Admin manage settings except voices" ON public.settings
  FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND key <> 'tts_custom_voices')
  WITH CHECK (public.get_my_role() = 'admin' AND key <> 'tts_custom_voices');

CREATE POLICY "Admin manage settings except voices" ON public.settings
  FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND key <> 'tts_custom_voices');
