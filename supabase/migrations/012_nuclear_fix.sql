-- NUCLEAR FIX SCRIPT
-- 1. Fix potential Enum/Default mismatches
-- 2. Clean up corrupted user
-- 3. Re-insert Super Admin safely

-- Enable PGCrypto in public schema explicitly
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- FIX 1: Ensure the 'user_role' enum has necessary values
-- We add 'viewer' just in case it's referenced by existing rows or defaults, to prevent crashes.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user';

-- FIX 2: Update public.users default to a safe value ('user')
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'user'::user_role;

-- FIX 3: Remove the specific user to start fresh
DO $$
DECLARE
    sa_email text := 'brifyaimaster@gmail.com';
    sa_id uuid;
BEGIN
    SELECT id INTO sa_id FROM auth.users WHERE email = sa_email;
    
    IF sa_id IS NOT NULL THEN
        -- Disable trigger temporarily to avoid side effects during delete
        ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
        
        DELETE FROM public.user_radios WHERE user_id = sa_id;
        DELETE FROM public.users WHERE id = sa_id;
        DELETE FROM auth.users WHERE id = sa_id;
        
        ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
    END IF;
END $$;

-- FIX 4: Re-define the Trigger Function to be robust
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'full_name', 'Usuario'), 
    'user' -- Always default to 'user' for new signups
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure Trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- FIX 5: Insert the Super Admin cleanly
DO $$
DECLARE
    sa_email text := 'brifyaimaster@gmail.com';
    sa_password text := 'Aintelligence2026$';
    sa_id uuid := public.uuid_generate_v4(); -- Use public schema function
BEGIN
    -- 1. Insert into auth.users
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
        updated_at,
        confirmation_token,
        recovery_token,
        is_sso_user
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        sa_id,
        'authenticated',
        'authenticated',
        sa_email,
        public.crypt(sa_password, public.gen_salt('bf')), -- Use public schema functions
        now(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Super Admin"}',
        now(),
        now(),
        '',
        '',
        false
    );

    -- 2. Insert/Update into public.users (Force Super Admin role)
    -- The trigger might run, but we override immediately to be sure
    INSERT INTO public.users (id, email, full_name, role)
    VALUES (sa_id, sa_email, 'Super Admin', 'super_admin')
    ON CONFLICT (id) DO UPDATE SET 
        role = 'super_admin',
        full_name = 'Super Admin';
        
END $$;
