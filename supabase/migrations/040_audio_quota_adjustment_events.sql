CREATE TABLE IF NOT EXISTS public.audio_quota_adjustment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    actor_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
    mode text NOT NULL CHECK (mode IN ('set', 'delta')),
    delta_minutes integer NOT NULL,
    previous_quota_minutes integer NOT NULL,
    new_quota_minutes integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audio_quota_adjustment_events_target_created
    ON public.audio_quota_adjustment_events(target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audio_quota_adjustment_events_actor_created
    ON public.audio_quota_adjustment_events(actor_user_id, created_at DESC);

ALTER TABLE public.audio_quota_adjustment_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.audio_quota_adjustment_events TO authenticated;
GRANT SELECT ON public.audio_quota_adjustment_events TO service_role;

DROP POLICY IF EXISTS "Users can view own quota adjustments" ON public.audio_quota_adjustment_events;
CREATE POLICY "Users can view own quota adjustments" ON public.audio_quota_adjustment_events
    FOR SELECT
    TO authenticated
    USING (target_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view team quota adjustments" ON public.audio_quota_adjustment_events;
CREATE POLICY "Admins can view team quota adjustments" ON public.audio_quota_adjustment_events
    FOR SELECT
    TO authenticated
    USING (
        public.get_my_role() = 'admin'
        AND (target_user_id = auth.uid() OR public.is_admin_of(auth.uid(), target_user_id))
    );

DROP POLICY IF EXISTS "Super admins can view all quota adjustments" ON public.audio_quota_adjustment_events;
CREATE POLICY "Super admins can view all quota adjustments" ON public.audio_quota_adjustment_events
    FOR SELECT
    TO authenticated
    USING (public.get_my_role() = 'super_admin');

CREATE OR REPLACE FUNCTION public.adjust_user_audio_quota_rpc(
    p_user_id uuid,
    p_delta_minutes integer
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
    v_prev_quota integer := 0;
    v_new_quota integer := 0;
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

    IF p_delta_minutes IS NULL OR p_delta_minutes = 0 THEN
        RAISE EXCEPTION 'Debes indicar un ajuste distinto de 0.';
    END IF;

    SELECT u.role, u.manager_id, COALESCE(u.audio_minutes_quota, 0)
    INTO v_target_role, v_target_manager_id, v_prev_quota
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

    v_new_quota := GREATEST(v_prev_quota + p_delta_minutes, 0);

    IF v_requester_role = 'super_admin' THEN
        IF v_target_role = 'super_admin' THEN
            RAISE EXCEPTION 'No se asignan cuotas al Super Admin.';
        END IF;

        IF v_target_role = 'admin' AND v_new_quota < (v_target_team_assigned + v_target_used) THEN
            RAISE EXCEPTION 'La cuota del admin no puede ser menor a lo ya distribuido mas lo ya consumido (% min).', (v_target_team_assigned + v_target_used);
        END IF;

        IF v_target_role <> 'admin' AND v_new_quota < v_target_used THEN
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

        IF v_new_quota > v_max_assignable THEN
            RAISE EXCEPTION 'No puedes asignar % min. Tu maximo disponible para repartir es % min.', v_new_quota, v_max_assignable;
        END IF;

        IF v_new_quota < v_target_used THEN
            RAISE EXCEPTION 'La cuota del usuario no puede ser menor a lo ya consumido (% min).', v_target_used;
        END IF;
    ELSE
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE public.users
    SET
        audio_minutes_quota = v_new_quota,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_user_id;

    INSERT INTO public.audio_quota_adjustment_events (
        target_user_id,
        actor_user_id,
        mode,
        delta_minutes,
        previous_quota_minutes,
        new_quota_minutes
    ) VALUES (
        p_user_id,
        v_requester_id,
        'delta',
        v_new_quota - v_prev_quota,
        v_prev_quota,
        v_new_quota
    );

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

GRANT EXECUTE ON FUNCTION public.adjust_user_audio_quota_rpc(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_user_audio_quota_rpc(uuid, integer) TO service_role;

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
    v_prev_quota integer := 0;
    v_target_summary jsonb;
    v_actor_summary jsonb;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Debes indicar el usuario destino.';
    END IF;

    IF p_quota_minutes IS NULL OR p_quota_minutes < 0 THEN
        RAISE EXCEPTION 'La cuota debe ser un numero entero mayor o igual a 0.';
    END IF;

    SELECT u.role, u.manager_id, COALESCE(u.audio_minutes_quota, 0)
    INTO v_target_role, v_target_manager_id, v_prev_quota
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

    IF v_prev_quota IS DISTINCT FROM p_quota_minutes THEN
        INSERT INTO public.audio_quota_adjustment_events (
            target_user_id,
            actor_user_id,
            mode,
            delta_minutes,
            previous_quota_minutes,
            new_quota_minutes
        ) VALUES (
            p_user_id,
            v_requester_id,
            'set',
            p_quota_minutes - v_prev_quota,
            v_prev_quota,
            p_quota_minutes
        );
    END IF;

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
