CREATE TABLE public.radios (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  region text,
  comuna text,
  frequency text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT radios_pkey PRIMARY KEY (id),
  CONSTRAINT radios_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- Add radio_id and scheduled_time to news_broadcasts
ALTER TABLE public.news_broadcasts
ADD COLUMN radio_id uuid REFERENCES public.radios(id),
ADD COLUMN scheduled_time text;

-- RLS Policies
ALTER TABLE public.radios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON public.radios
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON public.radios
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Enable update access for authenticated users" ON public.radios
    FOR UPDATE TO authenticated USING (auth.uid() = created_by);

CREATE POLICY "Enable delete access for authenticated users" ON public.radios
    FOR DELETE TO authenticated USING (auth.uid() = created_by);
