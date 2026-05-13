CREATE OR REPLACE FUNCTION public.get_admin_team_audio_minutes_used(p_admin_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_requester_id uuid := auth.uid();
    v_requester_role user_role := public.get_my_role();
BEGIN
    IF p_admin_id IS NULL THEN
        RAISE EXCEPTION 'admin_id es requerido.';
    END IF;

    IF v_requester_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF v_requester_role = 'super_admin' THEN
        NULL;
    ELSIF v_requester_role = 'admin' AND v_requester_id IS NOT DISTINCT FROM p_admin_id THEN
        NULL;
    ELSE
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN COALESCE((
        SELECT SUM(e.consumed_minutes)
        FROM public.audio_minute_usage_events e
        JOIN public.users u ON u.id = e.user_id
        WHERE u.manager_id = p_admin_id
    ), 0)::integer;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_team_audio_minutes_used(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_team_audio_minutes_used(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_audio_quota_summary_v2_rpc(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (
    user_id uuid,
    role user_role,
    manager_id uuid,
    quota_total_minutes integer,
    team_assigned_minutes integer,
    team_used_minutes integer,
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
    v_team_used integer := 0;
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
        v_team_assigned := 0;
        v_team_used := 0;
        v_used := 0;
    ELSE
        v_used := public.get_audio_minutes_used(v_target_id);

        IF v_role = 'admin' THEN
            SELECT COALESCE(SUM(COALESCE(u.audio_minutes_quota, 0)), 0)::integer
            INTO v_team_assigned
            FROM public.users u
            WHERE u.manager_id = v_target_id;

            v_team_used := public.get_admin_team_audio_minutes_used(v_target_id);

            v_personal_quota := GREATEST(v_quota_total - v_team_assigned, 0);
            v_remaining := GREATEST(v_personal_quota - v_used, 0);
            v_available_to_assign := GREATEST(v_quota_total - v_team_assigned - v_used, 0);
        ELSE
            v_personal_quota := v_quota_total;
            v_remaining := GREATEST(v_quota_total - v_used, 0);
            v_available_to_assign := 0;
            v_team_assigned := 0;
            v_team_used := 0;
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        v_target_id,
        v_role,
        v_manager_id,
        v_quota_total,
        v_team_assigned,
        v_team_used,
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

GRANT EXECUTE ON FUNCTION public.get_audio_quota_summary_v2_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audio_quota_summary_v2_rpc(uuid) TO service_role;
