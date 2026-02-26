-- FIX AND RESET SUPER ADMIN SCRIPT
-- This script cleans up any corrupted state and freshly creates the Super Admin.

-- 1. Enable pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Ensure ENUMs exist (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'user');
    ELSE
        -- Attempt to add values if they don't exist (must be done in separate transactions usually, but here we assume 000_fix_enums ran)
        -- If 000_fix_enums failed, you MUST run it first separately.
        NULL;
    END IF;
END $$;

-- 3. Temporarily Disable Trigger to avoid interference
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 4. Cleanup existing user if exists
DO $$
DECLARE
    sa_email text := 'brifyaimaster@gmail.com';
    sa_id uuid;
BEGIN
    SELECT id INTO sa_id FROM auth.users WHERE email = sa_email;
    
    IF sa_id IS NOT NULL THEN
        -- Delete from public.users first (cascade should handle it, but being safe)
        DELETE FROM public.users WHERE id = sa_id;
        DELETE FROM public.user_radios WHERE user_id = sa_id;
        -- Delete from auth.users
        DELETE FROM auth.users WHERE id = sa_id;
    END IF;
END $$;

-- 5. Re-create the Trigger Function (Make it robust)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'full_name', 'Usuario'), 
    'user'
  )
  ON CONFLICT (id) DO NOTHING; -- Avoid crashing if already exists
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create the User Manually
DO $$
DECLARE
    sa_email text := 'brifyaimaster@gmail.com';
    sa_password text := 'Aintelligence2026$';
    sa_id uuid := uuid_generate_v4();
BEGIN
    -- Insert into auth.users
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
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        sa_id,
        'authenticated',
        'authenticated',
        sa_email,
        crypt(sa_password, gen_salt('bf')),
        now(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Super Admin"}',
        now(),
        now(),
        '',
        ''
    );

    -- Insert into public.users
    INSERT INTO public.users (id, email, full_name, role)
    VALUES (sa_id, sa_email, 'Super Admin', 'super_admin');
    
END $$;

-- 7. Re-enable Trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 8. Verify
SELECT id, email, role FROM public.users WHERE email = 'brifyaimaster@gmail.com';
