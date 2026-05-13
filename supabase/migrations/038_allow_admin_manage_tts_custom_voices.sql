-- Allow admins to manage the 'tts_custom_voices' setting as well.
-- Required because INSERT policies are evaluated during UPSERT, even when the row already exists.

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin insert tts_custom_voices" ON public.settings;
DROP POLICY IF EXISTS "Admin update tts_custom_voices" ON public.settings;
DROP POLICY IF EXISTS "Admin delete tts_custom_voices" ON public.settings;

CREATE POLICY "Admin insert tts_custom_voices" ON public.settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'admin' AND key = 'tts_custom_voices');

CREATE POLICY "Admin update tts_custom_voices" ON public.settings
  FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND key = 'tts_custom_voices')
  WITH CHECK (public.get_my_role() = 'admin' AND key = 'tts_custom_voices');

CREATE POLICY "Admin delete tts_custom_voices" ON public.settings
  FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND key = 'tts_custom_voices');

