
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'user', 'viewer');
    ELSE
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
BEGIN
    SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
    RETURN v_role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon;

CREATE TABLE IF NOT EXISTS public.users (
    id uuid NOT NULL,
    email character varying NOT NULL UNIQUE,
    full_name character varying,
    avatar_url text,
    role user_role NOT NULL DEFAULT 'user'::user_role,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

CREATE TABLE IF NOT EXISTS public.radios (
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

CREATE INDEX IF NOT EXISTS idx_radios_created_at ON public.radios(created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_radios (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid,
    radio_id uuid,
    assigned_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    assigned_by uuid,
    CONSTRAINT user_radios_pkey PRIMARY KEY (id),
    CONSTRAINT user_radios_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT user_radios_radio_id_fkey FOREIGN KEY (radio_id) REFERENCES public.radios(id) ON DELETE CASCADE,
    CONSTRAINT user_radios_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_radios_user ON public.user_radios(user_id);
CREATE INDEX IF NOT EXISTS idx_user_radios_radio ON public.user_radios(radio_id);

CREATE TABLE IF NOT EXISTS public.music_resources (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    url text NOT NULL,
    type text NOT NULL,
    duration numeric,
    radio_id uuid,
    user_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT music_resources_pkey PRIMARY KEY (id),
    CONSTRAINT music_resources_type_chk CHECK (type IN ('intro', 'outro', 'background', 'effect')),
    CONSTRAINT music_resources_radio_id_fkey FOREIGN KEY (radio_id) REFERENCES public.radios(id) ON DELETE SET NULL,
    CONSTRAINT music_resources_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_music_resources_created_at ON public.music_resources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_music_resources_radio ON public.music_resources(radio_id);

CREATE TABLE IF NOT EXISTS public.news_sources (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name character varying NOT NULL,
    url text NOT NULL,
    description text,
    category character varying,
    region text,
    scraping_config jsonb,
    is_active boolean DEFAULT true,
    created_by uuid,
    radio_id uuid,
    last_scraped timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    selector_list_container text,
    selector_link text,
    selector_content text,
    selector_ignore text,
    CONSTRAINT news_sources_pkey PRIMARY KEY (id),
    CONSTRAINT news_sources_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT news_sources_radio_id_fkey FOREIGN KEY (radio_id) REFERENCES public.radios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_news_sources_category ON public.news_sources(category);
CREATE INDEX IF NOT EXISTS idx_news_sources_active ON public.news_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_news_sources_created_at ON public.news_sources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_sources_radio ON public.news_sources(radio_id);
CREATE INDEX IF NOT EXISTS idx_news_sources_region ON public.news_sources(region);

CREATE TABLE IF NOT EXISTS public.scraped_news (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    source_id uuid,
    title text NOT NULL,
    content text NOT NULL,
    summary text,
    original_url text,
    image_url text,
    published_at timestamp with time zone,
    scraped_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    is_processed boolean DEFAULT false,
    is_selected boolean DEFAULT false,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    category character varying,
    CONSTRAINT scraped_news_pkey PRIMARY KEY (id),
    CONSTRAINT scraped_news_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.news_sources(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_scraped_news_source ON public.scraped_news(source_id);
CREATE INDEX IF NOT EXISTS idx_scraped_news_published ON public.scraped_news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraped_news_selected ON public.scraped_news(is_selected);
CREATE INDEX IF NOT EXISTS idx_scraped_news_processed ON public.scraped_news(is_processed);
CREATE INDEX IF NOT EXISTS idx_scraped_news_created_at ON public.scraped_news(created_at DESC);

CREATE TABLE IF NOT EXISTS public.humanized_news (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    scraped_news_id uuid,
    original_content text NOT NULL,
    humanized_content text NOT NULL,
    reading_time_seconds integer,
    word_count integer,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    title text,
    audio_url text,
    status text DEFAULT 'ready'::text,
    CONSTRAINT humanized_news_pkey PRIMARY KEY (id),
    CONSTRAINT humanized_news_scraped_news_id_fkey FOREIGN KEY (scraped_news_id) REFERENCES public.scraped_news(id) ON DELETE SET NULL,
    CONSTRAINT humanized_news_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_humanized_news_scraped ON public.humanized_news(scraped_news_id);
CREATE INDEX IF NOT EXISTS idx_humanized_news_created_by ON public.humanized_news(created_by);
CREATE INDEX IF NOT EXISTS idx_humanized_news_created_at ON public.humanized_news(created_at DESC);

CREATE TABLE IF NOT EXISTS public.news_broadcasts (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    title character varying NOT NULL,
    description text,
    duration_minutes integer NOT NULL,
    status character varying DEFAULT 'draft'::character varying,
    total_news_count integer DEFAULT 0,
    total_reading_time_seconds integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    published_at timestamp with time zone,
    radio_id uuid,
    scheduled_time text,
    CONSTRAINT news_broadcasts_pkey PRIMARY KEY (id),
    CONSTRAINT news_broadcasts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT news_broadcasts_radio_id_fkey FOREIGN KEY (radio_id) REFERENCES public.radios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_news_broadcasts_created_at ON public.news_broadcasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_broadcasts_created_by ON public.news_broadcasts(created_by);
CREATE INDEX IF NOT EXISTS idx_news_broadcasts_status ON public.news_broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_news_broadcasts_radio ON public.news_broadcasts(radio_id);

CREATE TABLE IF NOT EXISTS public.broadcast_news_items (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    broadcast_id uuid,
    humanized_news_id uuid,
    order_index integer NOT NULL,
    reading_time_seconds integer,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    type text DEFAULT 'news'::text,
    custom_title text,
    custom_content text,
    audio_url text,
    duration_seconds integer DEFAULT 30,
    music_resource_id uuid,
    voice_delay double precision DEFAULT 0,
    music_volume double precision DEFAULT 0.5,
    CONSTRAINT broadcast_news_items_pkey PRIMARY KEY (id),
    CONSTRAINT broadcast_news_items_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.news_broadcasts(id) ON DELETE CASCADE,
    CONSTRAINT broadcast_news_items_humanized_news_id_fkey FOREIGN KEY (humanized_news_id) REFERENCES public.humanized_news(id) ON DELETE SET NULL,
    CONSTRAINT broadcast_news_items_music_resource_id_fkey FOREIGN KEY (music_resource_id) REFERENCES public.music_resources(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_broadcast_items_broadcast_order ON public.broadcast_news_items(broadcast_id, order_index);
CREATE INDEX IF NOT EXISTS idx_broadcast_items_humanized ON public.broadcast_news_items(humanized_news_id);

CREATE TABLE IF NOT EXISTS public.generated_broadcasts (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    broadcast_id uuid,
    title text NOT NULL,
    audio_url text NOT NULL,
    duration_seconds integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT generated_broadcasts_pkey PRIMARY KEY (id),
    CONSTRAINT generated_broadcasts_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.news_broadcasts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_generated_broadcasts_created_at ON public.generated_broadcasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_broadcasts_broadcast ON public.generated_broadcasts(broadcast_id);

CREATE TABLE IF NOT EXISTS public.timeline_events (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    broadcast_id uuid,
    event_type character varying NOT NULL,
    title character varying,
    description text,
    start_time_seconds integer NOT NULL,
    end_time_seconds integer,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT timeline_events_pkey PRIMARY KEY (id),
    CONSTRAINT timeline_events_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.news_broadcasts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_timeline_events_broadcast ON public.timeline_events(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_created_at ON public.timeline_events(created_at DESC);

CREATE TABLE IF NOT EXISTS public.tts_audio_files (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    humanized_news_id uuid,
    broadcast_news_item_id uuid,
    audio_url text NOT NULL,
    audio_duration_seconds integer,
    voice_settings jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT tts_audio_files_pkey PRIMARY KEY (id),
    CONSTRAINT tts_audio_files_humanized_news_id_fkey FOREIGN KEY (humanized_news_id) REFERENCES public.humanized_news(id) ON DELETE CASCADE,
    CONSTRAINT tts_audio_files_broadcast_news_item_id_fkey FOREIGN KEY (broadcast_news_item_id) REFERENCES public.broadcast_news_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tts_audio_humanized ON public.tts_audio_files(humanized_news_id);
CREATE INDEX IF NOT EXISTS idx_tts_audio_broadcast_item ON public.tts_audio_files(broadcast_news_item_id);
CREATE INDEX IF NOT EXISTS idx_tts_audio_created_at ON public.tts_audio_files(created_at DESC);

CREATE TABLE IF NOT EXISTS public.automation_assets (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name character varying NOT NULL,
    type character varying NOT NULL,
    config jsonb NOT NULL,
    is_active boolean DEFAULT true,
    schedule jsonb,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT automation_assets_pkey PRIMARY KEY (id),
    CONSTRAINT automation_assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_assets_type ON public.automation_assets(type);
CREATE INDEX IF NOT EXISTS idx_automation_assets_active ON public.automation_assets(is_active);
CREATE INDEX IF NOT EXISTS idx_automation_assets_created_by ON public.automation_assets(created_by);

CREATE TABLE IF NOT EXISTS public.automation_runs (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    asset_id uuid,
    status character varying NOT NULL,
    started_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    completed_at timestamp with time zone,
    result jsonb,
    error_message text,
    created_by uuid,
    CONSTRAINT automation_runs_pkey PRIMARY KEY (id),
    CONSTRAINT automation_runs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.automation_assets(id) ON DELETE SET NULL,
    CONSTRAINT automation_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_asset ON public.automation_runs(asset_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_started ON public.automation_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON public.automation_runs(status);

CREATE TABLE IF NOT EXISTS public.settings (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    key character varying NOT NULL UNIQUE,
    value jsonb NOT NULL,
    description text,
    updated_by uuid,
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT settings_pkey PRIMARY KEY (id),
    CONSTRAINT settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_settings_key ON public.settings(key);

CREATE TABLE IF NOT EXISTS public.source_import_failures (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    import_run_id text NOT NULL,
    file_name text,
    url text NOT NULL,
    name text,
    radio_id uuid,
    region text,
    stage text NOT NULL,
    error_code text,
    error_message text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT source_import_failures_pkey PRIMARY KEY (id),
    CONSTRAINT source_import_failures_radio_id_fkey FOREIGN KEY (radio_id) REFERENCES public.radios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_source_import_failures_created_at ON public.source_import_failures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_import_failures_run ON public.source_import_failures(import_run_id);
CREATE INDEX IF NOT EXISTS idx_source_import_failures_stage ON public.source_import_failures(stage);

CREATE TABLE IF NOT EXISTS public.vehicle_detections (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid,
    source text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT vehicle_detections_pkey PRIMARY KEY (id),
    CONSTRAINT vehicle_detections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicle_detections_created_at ON public.vehicle_detections(created_at DESC);

CREATE TABLE IF NOT EXISTS public.cost_rates (
    action text PRIMARY KEY,
    module text NOT NULL DEFAULT 'app',
    unit_name text NOT NULL DEFAULT 'unit',
    unit_cost numeric(18, 6) NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'USD',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_cost_rates_active ON public.cost_rates(is_active);

CREATE TABLE IF NOT EXISTS public.cost_events (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    action text NOT NULL,
    module text NOT NULL DEFAULT 'app',
    units numeric(18, 6) NOT NULL DEFAULT 1,
    unit_name text NOT NULL DEFAULT 'unit',
    unit_cost numeric(18, 6) NOT NULL DEFAULT 0,
    total_cost numeric(18, 6) NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'USD',
    related_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_cost_events_user_created ON public.cost_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_action_created ON public.cost_events(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_created ON public.cost_events(created_at DESC);

CREATE OR REPLACE FUNCTION public.log_cost_event(
    p_action text,
    p_module text DEFAULT 'app',
    p_units numeric DEFAULT 1,
    p_related_id uuid DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_unit_cost numeric(18, 6);
    v_unit_name text;
    v_currency text;
    v_event_id uuid;
BEGIN
    SELECT cr.unit_cost, cr.unit_name, cr.currency
    INTO v_unit_cost, v_unit_name, v_currency
    FROM public.cost_rates cr
    WHERE cr.action = p_action AND cr.is_active = true
    LIMIT 1;

    v_unit_cost := COALESCE(v_unit_cost, 0);
    v_unit_name := COALESCE(v_unit_name, 'unit');
    v_currency := COALESCE(v_currency, 'USD');

    INSERT INTO public.cost_events (
        user_id,
        action,
        module,
        units,
        unit_name,
        unit_cost,
        total_cost,
        currency,
        related_id,
        metadata
    )
    VALUES (
        auth.uid(),
        p_action,
        COALESCE(NULLIF(p_module, ''), 'app'),
        COALESCE(p_units, 1),
        v_unit_name,
        v_unit_cost,
        COALESCE(p_units, 1) * v_unit_cost,
        v_currency,
        p_related_id,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_cost_event(text, text, numeric, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_cost_event(text, text, numeric, uuid, jsonb) TO service_role;

INSERT INTO public.cost_rates (action, module, unit_name, unit_cost, currency, is_active)
VALUES
    ('humanize_in',  'gemini',    'k_token', 0.10 / 1000, 'USD', true),
    ('humanize_out', 'gemini',    'k_token', 0.40 / 1000, 'USD', true),
    ('tts_generate', 'azure-tts', 'k_char',  15.00 / 1000, 'USD', true)
ON CONFLICT (action) DO UPDATE SET
    module = EXCLUDED.module,
    unit_name = EXCLUDED.unit_name,
    unit_cost = EXCLUDED.unit_cost,
    currency = EXCLUDED.currency,
    is_active = EXCLUDED.is_active,
    updated_at = timezone('utc'::text, now());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.columns WHERE column_name = 'updated_at' AND table_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
        'user'::user_role
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION public.create_user_rpc(
    email text,
    password text,
    role_name text,
    full_name text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_user_id uuid;
    requesting_user_role user_role;
BEGIN
    SELECT role INTO requesting_user_role FROM public.users WHERE id = auth.uid();

    IF requesting_user_role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only Admins can create users';
    END IF;

    IF requesting_user_role = 'admin' AND role_name IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Admins can only create regular users';
    END IF;

    new_user_id := uuid_generate_v4();

    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_user_id,
        'authenticated',
        'authenticated',
        email,
        crypt(password, gen_salt('bf')),
        now(),
        '{"provider": "email", "providers": ["email"]}',
        json_build_object('full_name', full_name),
        now(),
        now()
    );

    INSERT INTO public.users (id, email, full_name, role)
    VALUES (new_user_id, email, full_name, role_name::user_role)
    ON CONFLICT (id) DO UPDATE SET role = role_name::user_role;

    RETURN json_build_object('id', new_user_id, 'email', email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_rpc(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_rpc(text, text, text, text) TO service_role;

CREATE OR REPLACE VIEW public.news_with_source AS
SELECT
    sn.id,
    sn.source_id,
    sn.title,
    sn.content,
    sn.summary,
    sn.original_url,
    sn.image_url,
    sn.published_at,
    sn.scraped_at,
    sn.is_processed,
    sn.is_selected,
    sn.metadata,
    sn.created_at,
    sn.category,
    ns.name AS source_name,
    ns.url AS source_url,
    ns.category AS source_category
FROM public.scraped_news sn
LEFT JOIN public.news_sources ns ON sn.source_id = ns.id;

GRANT SELECT ON public.news_with_source TO authenticated;
GRANT SELECT ON public.news_with_source TO service_role;

CREATE OR REPLACE VIEW public.broadcast_details AS
SELECT
    nb.*,
    r.name AS radio_name,
    u.full_name AS created_by_name
FROM public.news_broadcasts nb
LEFT JOIN public.radios r ON nb.radio_id = r.id
LEFT JOIN public.users u ON nb.created_by = u.id;

GRANT SELECT ON public.broadcast_details TO authenticated;
GRANT SELECT ON public.broadcast_details TO service_role;

CREATE OR REPLACE VIEW public.automation_status AS
SELECT
    aa.id,
    aa.name,
    aa.type,
    aa.is_active,
    aa.schedule,
    aa.last_run_at,
    aa.next_run_at,
    ar.status AS last_run_status,
    ar.started_at AS last_run_started,
    ar.completed_at AS last_run_completed
FROM public.automation_assets aa
LEFT JOIN LATERAL (
    SELECT status, started_at, completed_at
    FROM public.automation_runs
    WHERE asset_id = aa.id
    ORDER BY started_at DESC
    LIMIT 1
) ar ON true;

GRANT SELECT ON public.automation_status TO authenticated;
GRANT SELECT ON public.automation_status TO service_role;

CREATE OR REPLACE FUNCTION public.get_news_sources_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::integer
    FROM public.news_sources;
$$;

GRANT EXECUTE ON FUNCTION public.get_news_sources_count() TO anon;
GRANT EXECUTE ON FUNCTION public.get_news_sources_count() TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('noticias', 'noticias', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('music-resources', 'music-resources', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access Select - noticias" ON storage.objects;
CREATE POLICY "Public Access Select - noticias"
ON storage.objects FOR SELECT
USING (bucket_id = 'noticias');

DROP POLICY IF EXISTS "Public Access Insert - noticias" ON storage.objects;
CREATE POLICY "Public Access Insert - noticias"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'noticias');

DROP POLICY IF EXISTS "Public Access Update - noticias" ON storage.objects;
CREATE POLICY "Public Access Update - noticias"
ON storage.objects FOR UPDATE
USING (bucket_id = 'noticias');

DROP POLICY IF EXISTS "Public Access Delete - noticias" ON storage.objects;
CREATE POLICY "Public Access Delete - noticias"
ON storage.objects FOR DELETE
USING (bucket_id = 'noticias');

DROP POLICY IF EXISTS "Public Access Select - music-resources" ON storage.objects;
CREATE POLICY "Public Access Select - music-resources"
ON storage.objects FOR SELECT
USING (bucket_id = 'music-resources');

DROP POLICY IF EXISTS "Authenticated Upload - music-resources" ON storage.objects;
CREATE POLICY "Authenticated Upload - music-resources"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'music-resources' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Owner Delete - music-resources" ON storage.objects;
CREATE POLICY "Owner Delete - music-resources"
ON storage.objects FOR DELETE
USING (bucket_id = 'music-resources' AND auth.uid() = owner);
