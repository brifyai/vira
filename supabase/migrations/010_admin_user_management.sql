-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function to create a user (accessible by admins)
CREATE OR REPLACE FUNCTION public.create_user_rpc(
    email text,
    password text,
    role_name text,
    full_name text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    new_user_id uuid;
    encrypted_pw text;
    check_role text;
BEGIN
    -- Check if requestor is admin/super_admin
    SELECT role INTO check_role FROM public.users WHERE id = auth.uid();
    
    IF check_role NOT IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can create users';
    END IF;

    -- Validate role assignment
    -- Admin can only create 'user'
    -- Super Admin can create 'admin' or 'user'
    IF check_role = 'admin' AND role_name = 'super_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Admins cannot create Super Admins';
    END IF;
    
    -- Super Admin restriction? (Maybe they can create anything)

    -- Generate ID and encrypt password
    new_user_id := gen_random_uuid();
    encrypted_pw := crypt(password, gen_salt('bf'));

    -- Insert into auth.users
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_user_id,
        'authenticated',
        'authenticated',
        email,
        encrypted_pw,
        now(),
        NULL,
        NULL,
        '{"provider": "email", "providers": ["email"]}',
        json_build_object('full_name', full_name),
        now(),
        now(),
        '',
        '',
        '',
        ''
    );

    BEGIN
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'auth'
              AND table_name = 'identities'
              AND column_name = 'provider_id'
        ) THEN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'auth'
                  AND table_name = 'identities'
                  AND column_name = 'email'
                  AND (is_generated IS NULL OR is_generated = 'NEVER')
            ) THEN
                INSERT INTO auth.identities (
                    id,
                    user_id,
                    identity_data,
                    provider,
                    provider_id,
                    email,
                    last_sign_in_at,
                    created_at,
                    updated_at
                ) VALUES (
                    gen_random_uuid(),
                    new_user_id,
                    json_build_object('sub', new_user_id::text, 'email', email),
                    'email',
                    email,
                    email,
                    NULL,
                    now(),
                    now()
                );
            ELSE
                INSERT INTO auth.identities (
                    id,
                    user_id,
                    identity_data,
                    provider,
                    provider_id,
                    last_sign_in_at,
                    created_at,
                    updated_at
                ) VALUES (
                    gen_random_uuid(),
                    new_user_id,
                    json_build_object('sub', new_user_id::text, 'email', email),
                    'email',
                    email,
                    NULL,
                    now(),
                    now()
                );
            END IF;
        ELSE
            INSERT INTO auth.identities (
                id,
                user_id,
                identity_data,
                provider,
                last_sign_in_at,
                created_at,
                updated_at
            ) VALUES (
                gen_random_uuid(),
                new_user_id,
                json_build_object('sub', new_user_id::text, 'email', email),
                'email',
                NULL,
                now(),
                now()
            );
        END IF;
    EXCEPTION
        WHEN undefined_table OR undefined_column THEN
            NULL;
    END;

    INSERT INTO public.users (id, email, full_name, role)
    VALUES (new_user_id, email, full_name, role_name::user_role)
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        updated_at = now();

    RETURN json_build_object('id', new_user_id, 'email', email, 'role', role_name);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_user_rpc TO authenticated;

-- Seed the Super Admin User
DO $$
DECLARE
    sa_email text := 'brifyaimaster@gmail.com';
    sa_password text := 'Aintelligence2026$';
    sa_id uuid;
BEGIN
    -- Check if user exists
    SELECT id INTO sa_id FROM auth.users WHERE email = sa_email;

    IF sa_id IS NULL THEN
        sa_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, 
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
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
            now()
        );
        
        -- Update public.users role (Trigger might have set it to 'user')
        -- We explicitly set it to super_admin
        -- Note: Trigger might run after this block or during. 
        -- To be safe, we upsert into public.users just in case trigger failed or we want to override.
        INSERT INTO public.users (id, email, full_name, role)
        VALUES (sa_id, sa_email, 'Super Admin', 'super_admin')
        ON CONFLICT (id) DO UPDATE SET role = 'super_admin';
        
    ELSE
        -- Update password if exists
        UPDATE auth.users 
        SET encrypted_password = crypt(sa_password, gen_salt('bf')) 
        WHERE id = sa_id;
        
        -- Ensure role is super_admin
        UPDATE public.users SET role = 'super_admin' WHERE id = sa_id;
    END IF;
END $$;
