-- Habilitar RLS para el bucket 'noticias'
-- Supabase Storage utiliza la tabla storage.objects para gestionar los archivos.

-- 1. Permitir acceso público de lectura (SELECT)
CREATE POLICY "Public Access Select"
ON storage.objects FOR SELECT
USING ( bucket_id = 'noticias' );

-- 2. Permitir acceso público de escritura (INSERT)
-- Esto permite a cualquier usuario (incluso anónimo) subir archivos al bucket 'noticias'
CREATE POLICY "Public Access Insert"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'noticias' );

-- 3. Permitir actualización (UPDATE)
CREATE POLICY "Public Access Update"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'noticias' );

-- 4. Permitir borrado (DELETE)
CREATE POLICY "Public Access Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'noticias' );
