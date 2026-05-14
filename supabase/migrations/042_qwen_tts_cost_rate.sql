-- Qwen TTS cost rate (DashScope) aligned to Model Studio pricing (per 1M tokens)

INSERT INTO public.cost_rates (action, module, unit_name, unit_cost, currency, is_active)
VALUES
    ('tts_generate_qwen', 'qwen-dashscope', 'm_token', 0.115, 'USD', true)
ON CONFLICT (action)
DO UPDATE SET
    module = EXCLUDED.module,
    unit_name = EXCLUDED.unit_name,
    unit_cost = EXCLUDED.unit_cost,
    currency = EXCLUDED.currency,
    is_active = EXCLUDED.is_active;

