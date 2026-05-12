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
    v_existing_generated public.generated_broadcasts%ROWTYPE;
    v_existing_charged_minutes integer := 0;
    v_already_charged boolean := false;
    v_charged_now boolean := false;
    v_result_charged_minutes integer := 0;
BEGIN
    IF p_broadcast_id IS NULL OR COALESCE(trim(p_title), '') = '' OR COALESCE(trim(p_audio_url), '') = '' THEN
        RAISE EXCEPTION 'broadcast_id, title y audio_url son requeridos.';
    END IF;

    IF NOT public.can_manage_broadcast(p_broadcast_id) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext('create_generated_broadcast_with_quota_rpc'),
        hashtext(p_broadcast_id::text)
    );

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

    SELECT COALESCE(SUM(e.consumed_minutes), 0)::integer
    INTO v_existing_charged_minutes
    FROM public.audio_minute_usage_events e
    WHERE e.broadcast_id = p_broadcast_id
      AND e.user_id = v_owner_id;

    v_already_charged := v_existing_charged_minutes > 0;

    IF v_owner_role <> 'super_admin' AND NOT v_already_charged THEN
        SELECT to_jsonb(s) INTO v_quota_summary
        FROM public.get_audio_quota_summary_rpc(v_owner_id) s;

        IF COALESCE((v_quota_summary ->> 'remaining_minutes')::integer, 0) < v_charge_minutes THEN
            RAISE EXCEPTION 'No tienes minutos suficientes para generar este audio final. Necesitas % min y solo quedan % min.',
                v_charge_minutes,
                COALESCE((v_quota_summary ->> 'remaining_minutes')::integer, 0);
        END IF;
    END IF;

    SELECT gb.*
    INTO v_existing_generated
    FROM public.generated_broadcasts gb
    WHERE gb.broadcast_id = p_broadcast_id
    ORDER BY gb.created_at DESC, gb.id DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.generated_broadcasts
        SET
            title = p_title,
            audio_url = p_audio_url,
            duration_seconds = COALESCE(p_duration_seconds, 0),
            charged_user_id = v_owner_id,
            charged_minutes = CASE
                WHEN v_owner_role = 'super_admin' THEN 0
                WHEN v_already_charged THEN GREATEST(v_existing_charged_minutes, COALESCE(v_existing_generated.charged_minutes, 0))
                ELSE v_charge_minutes
            END
        WHERE id = v_existing_generated.id
        RETURNING * INTO v_generated;
    ELSE
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
            CASE
                WHEN v_owner_role = 'super_admin' THEN 0
                WHEN v_already_charged THEN v_existing_charged_minutes
                ELSE v_charge_minutes
            END
        )
        RETURNING * INTO v_generated;
    END IF;

    IF v_owner_role <> 'super_admin' AND NOT v_already_charged THEN
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

        v_charged_now := true;
        v_result_charged_minutes := v_charge_minutes;

        SELECT to_jsonb(s) INTO v_quota_summary
        FROM public.get_audio_quota_summary_rpc(v_owner_id) s;
    ELSIF v_owner_role <> 'super_admin' THEN
        v_result_charged_minutes := 0;
        SELECT to_jsonb(s) INTO v_quota_summary
        FROM public.get_audio_quota_summary_rpc(v_owner_id) s;
    ELSE
        v_result_charged_minutes := 0;
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
        'charged_minutes', v_result_charged_minutes,
        'charged_now', v_charged_now,
        'already_charged', v_already_charged
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_generated_broadcast_with_quota_rpc(uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_generated_broadcast_with_quota_rpc(uuid, text, text, integer) TO service_role;
