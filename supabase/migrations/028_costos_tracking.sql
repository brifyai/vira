-- Cost tracking (usage + rates)

CREATE TABLE IF NOT EXISTS public.cost_rates (
    action TEXT PRIMARY KEY,
    module TEXT NOT NULL DEFAULT 'app',
    unit_name TEXT NOT NULL DEFAULT 'unit',
    unit_cost NUMERIC(18, 6) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_cost_rates_active ON public.cost_rates(is_active);

CREATE TABLE IF NOT EXISTS public.cost_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    module TEXT NOT NULL DEFAULT 'app',
    units NUMERIC(18, 6) NOT NULL DEFAULT 1,
    unit_name TEXT NOT NULL DEFAULT 'unit',
    unit_cost NUMERIC(18, 6) NOT NULL DEFAULT 0,
    total_cost NUMERIC(18, 6) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    related_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_cost_events_user_created ON public.cost_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_action_created ON public.cost_events(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_created ON public.cost_events(created_at DESC);

ALTER TABLE public.cost_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_cost_rates_updated_at ON public.cost_rates;
CREATE TRIGGER set_cost_rates_updated_at
BEFORE UPDATE ON public.cost_rates
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.log_cost_event(
    p_action TEXT,
    p_module TEXT DEFAULT 'app',
    p_units NUMERIC DEFAULT 1,
    p_related_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_unit_cost NUMERIC(18, 6);
    v_unit_name TEXT;
    v_currency TEXT;
    v_event_id UUID;
BEGIN
    SELECT
        cr.unit_cost,
        cr.unit_name,
        cr.currency
    INTO
        v_unit_cost,
        v_unit_name,
        v_currency
    FROM public.cost_rates cr
    WHERE cr.action = p_action
      AND cr.is_active = true
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

GRANT EXECUTE ON FUNCTION public.log_cost_event(TEXT, TEXT, NUMERIC, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_cost_event(TEXT, TEXT, NUMERIC, UUID, JSONB) TO service_role;

DROP POLICY IF EXISTS "Super admins can manage cost rates" ON public.cost_rates;
CREATE POLICY "Super admins can manage cost rates" ON public.cost_rates
    FOR ALL
    USING ( public.get_my_role() = 'super_admin' )
    WITH CHECK ( public.get_my_role() = 'super_admin' );

DROP POLICY IF EXISTS "Super admins can view all cost events" ON public.cost_events;
CREATE POLICY "Super admins can view all cost events" ON public.cost_events
    FOR SELECT
    USING ( public.get_my_role() = 'super_admin' );

DROP POLICY IF EXISTS "Users can view their own cost events" ON public.cost_events;
CREATE POLICY "Users can view their own cost events" ON public.cost_events
    FOR SELECT
    USING ( user_id = auth.uid() );

DROP POLICY IF EXISTS "Users can insert their own cost events" ON public.cost_events;
CREATE POLICY "Users can insert their own cost events" ON public.cost_events
    FOR INSERT
    WITH CHECK ( user_id = auth.uid() );

DROP POLICY IF EXISTS "Super admins can delete cost events" ON public.cost_events;
CREATE POLICY "Super admins can delete cost events" ON public.cost_events
    FOR DELETE
    USING ( public.get_my_role() = 'super_admin' );

DROP POLICY IF EXISTS "Super admins can update cost events" ON public.cost_events;
CREATE POLICY "Super admins can update cost events" ON public.cost_events
    FOR UPDATE
    USING ( public.get_my_role() = 'super_admin' )
    WITH CHECK ( public.get_my_role() = 'super_admin' );

INSERT INTO public.cost_rates (action, module, unit_name, unit_cost, currency, is_active)
VALUES
    ('humanize_in', 'gemini', 'token', 0.10 / 1000000, 'USD', true),
    ('humanize_out', 'gemini', 'token', 0.40 / 1000000, 'USD', true),
    ('tts_generate', 'azure-tts', 'char', 15.00 / 1000000, 'USD', true)
ON CONFLICT (action) DO NOTHING;
