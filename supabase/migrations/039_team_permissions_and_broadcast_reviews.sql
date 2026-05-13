ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS can_upload_music boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_use_ad_block boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_download_broadcast boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.set_team_user_permissions(
  p_user_id uuid,
  p_can_upload_music boolean,
  p_can_use_ad_block boolean,
  p_can_download_broadcast boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() = 'super_admin' THEN
    UPDATE public.users
    SET
      can_upload_music = COALESCE(p_can_upload_music, can_upload_music),
      can_use_ad_block = COALESCE(p_can_use_ad_block, can_use_ad_block),
      can_download_broadcast = COALESCE(p_can_download_broadcast, can_download_broadcast)
    WHERE id = p_user_id;
    RETURN;
  END IF;

  IF public.get_my_role() = 'admin' AND public.is_admin_of(auth.uid(), p_user_id) THEN
    UPDATE public.users
    SET
      can_upload_music = COALESCE(p_can_upload_music, can_upload_music),
      can_use_ad_block = COALESCE(p_can_use_ad_block, can_use_ad_block),
      can_download_broadcast = COALESCE(p_can_download_broadcast, can_download_broadcast)
    WHERE id = p_user_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'No autorizado';
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_team_user_permissions(uuid, boolean, boolean, boolean) TO authenticated;

ALTER TABLE public.news_broadcasts
ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

DROP POLICY IF EXISTS "Music resources insert own" ON public.music_resources;

CREATE POLICY "Music resources insert own" ON public.music_resources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.get_my_role() = 'super_admin'
      OR public.get_my_role() = 'admin'
      OR EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid() AND u.can_upload_music = true
      )
    )
  );

