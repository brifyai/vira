-- Create Super Admin for New Project
-- Run this AFTER running 014_full_schema_setup.sql

-- 1. Enable pgcrypto if not already enabled (just in case)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create the Super Admin User
DO $$
DECLARE
    sa_email text := 'brifyaimaster@gmail.com';
    sa_password text := 'Aintelligence2026$';
    sa_id uuid := uuid_generate_v4();
BEGIN
    -- Only insert if not exists
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = sa_email) THEN
        
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
            recovery_token,
            is_sso_user
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
            '',
            false
        );

        -- The trigger 'on_auth_user_created' (from 014 script) will likely fire 
        -- and insert into public.users with role 'user'.
        -- We need to upgrade it to 'super_admin'.
        
        -- Wait a tick or just Upsert directly to override
        INSERT INTO public.users (id, email, full_name, role)
        VALUES (sa_id, sa_email, 'Super Admin', 'super_admin')
        ON CONFLICT (id) DO UPDATE SET 
            role = 'super_admin',
            full_name = 'Super Admin';
            
    ELSE
        -- If user exists, just ensure they are super_admin
        UPDATE public.users 
        SET role = 'super_admin' 
        WHERE email = sa_email;
    END IF;
END $$;
