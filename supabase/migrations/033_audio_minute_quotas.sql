CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS audio_minutes_quota integer NOT NULL DEFAULT 0;

ALTER TABLE public.generated_broadcasts
ADD COLUMN IF NOT EXISTS charged_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.generated_broadcasts
ADD COLUMN IF NOT EXISTS charged_minutes integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.audio_minute_usage_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    actor_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
    broadcast_id uuid NULL REFERENCES public.news_broadcasts(id) ON DELETE SET NULL,
    generated_broadcast_id uuid NULL REFERENCES public.generated_broadcasts(id) ON DELETE SET NULL,
    consumed_minutes integer NOT NULL CHECK (consumed_minutes > 0),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audio_minute_usage_events_user_created
    ON public.audio_minute_usage_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audio_minute_usage_events_broadcast
    ON public.audio_minute_usage_events(broadcast_id);

ALTER TABLE public.audio_minute_usage_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.audio_minute_usage_events TO authenticated;
GRANT SELECT ON public.audio_minute_usage_events TO service_role;

CREATE OR REPLACE FUNCTION public.get_audio_minutes_used(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(SUM(e.consumed_minutes), 0)::integer
    FROM public.audio_minute_usage_events e
    WHERE e.user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_audio_minutes_used(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audio_minutes_used(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_audio_quota_summary_rpc(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (
    user_id uuid,
    role user_role,
    manager_id uuid,
    quota_total_minutes integer,
    team_assigned_minutes integer,
    personal_quota_minutes integer,
    used_minutes integer,
    remaining_minutes integer,
    available_to_assign_minutes integer,
    unlimited boolean,
    can_generate boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_id uuid;
    v_requester_id uuid;
    v_requester_role user_role;
    v_role user_role;
    v_manager_id uuid;
    v_quota_total integer;
    v_team_assigned integer := 0;
    v_personal_quota integer := 0;
    v_used integer := 0;
    v_remaining integer := 0;
    v_available_to_assign integer := 0;
    v_unlimited boolean := false;
BEGIN
    v_target_id := COALESCE(p_user_id, auth.uid());
    v_requester_id := auth.uid();
    v_requester_role := public.get_my_role();

    IF v_target_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF v_requester_id IS DISTINCT FROM v_target_id THEN
        IF v_requester_role = 'super_admin' THEN
            NULL;
        ELSIF v_requester_role = 'admin' AND public.is_admin_of(v_requester_id, v_target_id) THEN
            NULL;
        ELSE
            RAISE EXCEPTION 'Unauthorized';
        END IF;
    END IF;

    SELECT
        u.role,
        u.manager_id,
        COALESCE(u.audio_minutes_quota, 0)
    INTO
        v_role,
        v_manager_id,
        v_quota_total
    FROM public.users u
    WHERE u.id = v_target_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado';
    END IF;

    IF v_role = 'super_admin' THEN
        v_unlimited := true;
        v_personal_quota := v_quota_total;
        v_remaining := v_quota_total;
        v_available_to_assign := 0;
    ELSE
        v_used := public.get_audio_minutes_used(v_target_id);

        IF v_role = 'admin' THEN
            SELECT COALESCE(SUM(COALESCE(u.audio_minutes_quota, 0)), 0)::integer
            INTO v_team_assigned
            FROM public.users u
            WHERE u.manager_id = v_target_id;

            v_personal_quota := GREATEST(v_quota_total - v_team_assigned, 0);
            v_remaining := GREATEST(v_personal_quota - v_used, 0);
            v_available_to_assign := GREATEST(v_quota_total - v_team_assigned - v_used, 0);
        ELSE
            v_personal_quota := v_quota_total;
            v_remaining := GREATEST(v_quota_total - v_used, 0);
            v_available_to_assign := 0;
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        v_target_id,
        v_role,
        v_manager_id,
        v_quota_total,
        v_team_assigned,
        v_personal_quota,
        v_used,
        v_remaining,
        v_available_to_assign,
        v_unlimited,
        CASE
            WHEN v_unlimited THEN true
            ELSE v_remaining > 0
        END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audio_quota_summary_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audio_quota_summary_rpc(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.set_user_audio_quota_rpc(
    p_user_id uuid,
    p_quota_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_requester_id uuid := auth.uid();
    v_requester_role user_role := public.get_my_role();
    v_target_role user_role;
    v_target_manager_id uuid;
    v_target_used integer := 0;
    v_target_team_assigned integer := 0;
    v_admin_total integer := 0;
    v_admin_used integer := 0;
    v_other_team_assigned integer := 0;
    v_max_assignable integer := 0;
    v_target_summary jsonb;
    v_actor_summary jsonb;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Debes indicar el usuario destino.';
    END IF;

    IF p_quota_minutes IS NULL OR p_quota_minutes < 0 THEN
        RAISE EXCEPTION 'La cuota debe ser un numero entero mayor o igual a 0.';
    END IF;

    SELECT u.role, u.manager_id
    INTO v_target_role, v_target_manager_id
    FROM public.users u
    WHERE u.id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado.';
    END IF;

    SELECT
        s.used_minutes,
        s.team_assigned_minutes
    INTO
        v_target_used,
        v_target_team_assigned
    FROM public.get_audio_quota_summary_rpc(p_user_id) s;

    IF v_requester_role = 'super_admin' THEN
        IF v_target_role = 'super_admin' THEN
            RAISE EXCEPTION 'No se asignan cuotas al Super Admin.';
        END IF;

        IF v_target_role = 'admin' AND p_quota_minutes < (v_target_team_assigned + v_target_used) THEN
            RAISE EXCEPTION 'La cuota del admin no puede ser menor a lo ya distribuido mas lo ya consumido (% min).', (v_target_team_assigned + v_target_used);
        END IF;

        IF v_target_role <> 'admin' AND p_quota_minutes < v_target_used THEN
            RAISE EXCEPTION 'La cuota del usuario no puede ser menor a lo ya consumido (% min).', v_target_used;
        END IF;
    ELSIF v_requester_role = 'admin' THEN
        IF p_user_id = v_requester_id THEN
            RAISE EXCEPTION 'El admin no puede asignarse minutos a si mismo.';
        END IF;

        IF v_target_role <> 'user' OR v_target_manager_id IS DISTINCT FROM v_requester_id THEN
            RAISE EXCEPTION 'Solo puedes asignar cuota a usuarios de tu equipo.';
        END IF;

        SELECT COALESCE(u.audio_minutes_quota, 0)
        INTO v_admin_total
        FROM public.users u
        WHERE u.id = v_requester_id;

        v_admin_used := public.get_audio_minutes_used(v_requester_id);

        SELECT COALESCE(SUM(COALESCE(u.audio_minutes_quota, 0)), 0)::integer
        INTO v_other_team_assigned
        FROM public.users u
        WHERE u.manager_id = v_requester_id
          AND u.id <> p_user_id;

        v_max_assignable := GREATEST(v_admin_total - v_admin_used - v_other_team_assigned, 0);

        IF p_quota_minutes > v_max_assignable THEN
            RAISE EXCEPTION 'No puedes asignar % min. Tu maximo disponible para repartir es % min.', p_quota_minutes, v_max_assignable;
        END IF;

        IF p_quota_minutes < v_target_used THEN
            RAISE EXCEPTION 'La cuota del usuario no puede ser menor a lo ya consumido (% min).', v_target_used;
        END IF;
    ELSE
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE public.users
    SET
        audio_minutes_quota = p_quota_minutes,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_user_id;

    SELECT to_jsonb(s) INTO v_target_summary
    FROM public.get_audio_quota_summary_rpc(p_user_id) s;

    SELECT to_jsonb(s) INTO v_actor_summary
    FROM public.get_audio_quota_summary_rpc(v_requester_id) s;

    RETURN jsonb_build_object(
        'success', true,
        'target_summary', v_target_summary,
        'actor_summary', v_actor_summary
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_audio_quota_rpc(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_audio_quota_rpc(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.create_generated_broadcast_with_quota_rpc(
    p_broadcast_id uuid,
    p_title text,
    p_audio_url text,
    p_duration_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner_id uuid;
    v_owner_role user_role;
    v_charge_minutes integer;
    v_generated public.generated_broadcasts%ROWTYPE;
    v_quota_summary jsonb;
BEGIN
    IF p_broadcast_id IS NULL OR COALESCE(trim(p_title), '') = '' OR COALESCE(trim(p_audio_url), '') = '' THEN
        RAISE EXCEPTION 'broadcast_id, title y audio_url son requeridos.';
    END IF;

    IF NOT public.can_manage_broadcast(p_broadcast_id) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT nb.created_by
    INTO v_owner_id
    FROM public.news_broadcasts nb
    WHERE nb.id = p_broadcast_id;

    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'No se encontro el noticiero a exportar.';
    END IF;

    SELECT u.role
    INTO v_owner_role
    FROM public.users u
    WHERE u.id = v_owner_id;

    v_charge_minutes := GREATEST(1, CEIL(GREATEST(COALESCE(p_duration_seconds, 0), 1)::numeric / 60.0)::integer);

    IF v_owner_role <> 'super_admin' THEN
        SELECT to_jsonb(s) INTO v_quota_summary
        FROM public.get_audio_quota_summary_rpc(v_owner_id) s;

        IF COALESCE((v_quota_summary ->> 'remaining_minutes')::integer, 0) < v_charge_minutes THEN
            RAISE EXCEPTION 'No tienes minutos suficientes para generar este audio final. Necesitas % min y solo quedan % min.',
                v_charge_minutes,
                COALESCE((v_quota_summary ->> 'remaining_minutes')::integer, 0);
        END IF;
    END IF;

    INSERT INTO public.generated_broadcasts (
        broadcast_id,
        title,
        audio_url,
        duration_seconds,
        charged_user_id,
        charged_minutes
    ) VALUES (
        p_broadcast_id,
        p_title,
        p_audio_url,
        COALESCE(p_duration_seconds, 0),
        v_owner_id,
        CASE WHEN v_owner_role = 'super_admin' THEN 0 ELSE v_charge_minutes END
    )
    RETURNING * INTO v_generated;

    IF v_owner_role <> 'super_admin' THEN
        INSERT INTO public.audio_minute_usage_events (
            user_id,
            actor_user_id,
            broadcast_id,
            generated_broadcast_id,
            consumed_minutes,
            metadata
        ) VALUES (
            v_owner_id,
            auth.uid(),
            p_broadcast_id,
            v_generated.id,
            v_charge_minutes,
            jsonb_build_object(
                'title', p_title,
                'duration_seconds', COALESCE(p_duration_seconds, 0)
            )
        );

        SELECT to_jsonb(s) INTO v_quota_summary
        FROM public.get_audio_quota_summary_rpc(v_owner_id) s;
    ELSE
        v_quota_summary := jsonb_build_object(
            'user_id', v_owner_id,
            'unlimited', true,
            'remaining_minutes', 0,
            'quota_total_minutes', 0,
            'team_assigned_minutes', 0,
            'personal_quota_minutes', 0,
            'used_minutes', 0,
            'available_to_assign_minutes', 0,
            'can_generate', true
        );
    END IF;

    RETURN jsonb_build_object(
        'generated_broadcast', to_jsonb(v_generated),
        'quota_summary', v_quota_summary,
        'charged_minutes', CASE WHEN v_owner_role = 'super_admin' THEN 0 ELSE v_charge_minutes END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_generated_broadcast_with_quota_rpc(uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_generated_broadcast_with_quota_rpc(uuid, text, text, integer) TO service_role;

DROP POLICY IF EXISTS "Users can view own audio minute usage" ON public.audio_minute_usage_events;
CREATE POLICY "Users can view own audio minute usage" ON public.audio_minute_usage_events
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view team audio minute usage" ON public.audio_minute_usage_events;
CREATE POLICY "Admins can view team audio minute usage" ON public.audio_minute_usage_events
    FOR SELECT
    TO authenticated
    USING (
        public.get_my_role() = 'admin'
        AND (user_id = auth.uid() OR public.is_admin_of(auth.uid(), user_id))
    );

DROP POLICY IF EXISTS "Super admins can view all audio minute usage" ON public.audio_minute_usage_events;
CREATE POLICY "Super admins can view all audio minute usage" ON public.audio_minute_usage_events
    FOR SELECT
    TO authenticated
    USING (public.get_my_role() = 'super_admin');
