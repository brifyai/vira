ALTER TABLE public.tts_audio_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Editors and admins can view audio files" ON public.tts_audio_files;
DROP POLICY IF EXISTS "Editors and admins can create audio files" ON public.tts_audio_files;
DROP POLICY IF EXISTS "TTS audio select by broadcast access" ON public.tts_audio_files;
DROP POLICY IF EXISTS "TTS audio insert by broadcast manage" ON public.tts_audio_files;
DROP POLICY IF EXISTS "TTS audio update by broadcast manage" ON public.tts_audio_files;
DROP POLICY IF EXISTS "TTS audio delete by broadcast manage" ON public.tts_audio_files;

CREATE POLICY "TTS audio select by broadcast access" ON public.tts_audio_files
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM public.broadcast_news_items bni
      WHERE bni.id = public.tts_audio_files.broadcast_news_item_id
        AND public.can_access_broadcast(bni.broadcast_id)
    )
  );

CREATE POLICY "TTS audio insert by broadcast manage" ON public.tts_audio_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM public.broadcast_news_items bni
      WHERE bni.id = public.tts_audio_files.broadcast_news_item_id
        AND public.can_manage_broadcast(bni.broadcast_id)
    )
  );

CREATE POLICY "TTS audio update by broadcast manage" ON public.tts_audio_files
  FOR UPDATE
  TO authenticated
  USING (
    public.get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM public.broadcast_news_items bni
      WHERE bni.id = public.tts_audio_files.broadcast_news_item_id
        AND public.can_manage_broadcast(bni.broadcast_id)
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM public.broadcast_news_items bni
      WHERE bni.id = public.tts_audio_files.broadcast_news_item_id
        AND public.can_manage_broadcast(bni.broadcast_id)
    )
  );

CREATE POLICY "TTS audio delete by broadcast manage" ON public.tts_audio_files
  FOR DELETE
  TO authenticated
  USING (
    public.get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM public.broadcast_news_items bni
      WHERE bni.id = public.tts_audio_files.broadcast_news_item_id
        AND public.can_manage_broadcast(bni.broadcast_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tts_audio_files TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tts_audio_files TO service_role;

