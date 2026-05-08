-- Password reset flow for self-hosted Supabase using backend-issued tokens
create extension if not exists pgcrypto;

create table if not exists public.password_reset_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    email text not null,
    token_hash text not null unique,
    expires_at timestamptz not null,
    used_at timestamptz null,
    requested_ip inet null,
    user_agent text null,
    created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists password_reset_tokens_user_id_idx
    on public.password_reset_tokens (user_id);

create index if not exists password_reset_tokens_email_idx
    on public.password_reset_tokens (email);

create index if not exists password_reset_tokens_expires_at_idx
    on public.password_reset_tokens (expires_at);

alter table public.password_reset_tokens enable row level security;

comment on table public.password_reset_tokens is
    'Temporary password reset tokens issued by backend for self-hosted auth recovery.';
