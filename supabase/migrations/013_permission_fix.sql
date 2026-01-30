-- PERMISSION-SAFE FIX SCRIPT
-- This script avoids "ALTER TABLE auth.users" which requires superuser ownership.
-- Instead, we let the trigger run and overwrite the results.

-- 1. Ensure extensions exist
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- 2. Ensure ENUMs exist (Idempotent)
DO $$
BEGIN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer';
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user';
EXCEPTION
    WHEN OTHERS THEN NULL; -- Ignore if already exists or other minor issues
END $$;

-- 3. Define the Trigger Function (Robust Version)
-- We define this first so the trigger uses the correct logic
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'full_name', 'Usuario'), 
    'user'::user_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Re-create the Trigger (Drop and Create)
-- We can DROP our own trigger usually.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. Clean up and Re-create Super Admin
DO $$
DECLARE
    sa_email text := 'brifyaimaster@gmail.com';
    sa_password text := 'Aintelligence2026$';
    sa_id uuid;
BEGIN
    -- Find existing user
    SELECT id INTO sa_id FROM auth.users WHERE email = sa_email;
    
    -- DELETE phase
    IF sa_id IS NOT NULL THEN
        -- Must delete dependent rows first due to lack of CASCADE in some setups
        DELETE FROM public.user_radios WHERE user_id = sa_id;
        DELETE FROM public.users WHERE id = sa_id;
        DELETE FROM auth.users WHERE id = sa_id;
    END IF;

    -- Generate new ID
    sa_id := public.uuid_generate_v4();

    -- INSERT phase
    -- This will fire the trigger 'on_auth_user_created' which inserts into public.users as 'user'
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
        public.crypt(sa_password, public.gen_salt('bf')),
        now(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Super Admin"}',
        now(),
        now(),
        '',
        '',
        false
    );

    -- UPDATE phase
    -- Upgrade the user to super_admin (overriding the trigger's default 'user' role)
    UPDATE public.users 
    SET role = 'super_admin'::user_role 
    WHERE id = sa_id;
        
END $$;
