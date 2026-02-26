-- VERIFY USER SETUP
-- Run this script to check if your user is correctly set up in the database.

DO $$
DECLARE
    v_auth_user_id uuid;
    v_public_user_exists boolean;
    v_role user_role;
    v_email text := 'brifyaimaster@gmail.com';
BEGIN
    -- 1. Check if user exists in auth.users
    SELECT id INTO v_auth_user_id FROM auth.users WHERE email = v_email;
    
    IF v_auth_user_id IS NULL THEN
        RAISE NOTICE '❌ ERROR: User % not found in auth.users', v_email;
        RETURN;
    ELSE
        RAISE NOTICE '✅ OK: User found in auth.users (ID: %)', v_auth_user_id;
    END IF;

    -- 2. Check if user exists in public.users
    SELECT EXISTS (SELECT 1 FROM public.users WHERE id = v_auth_user_id) INTO v_public_user_exists;
    
    IF NOT v_public_user_exists THEN
        RAISE NOTICE '❌ ERROR: User NOT found in public.users. Run script 023 again!';
        
        -- Attempt to fix immediately
        INSERT INTO public.users (id, email, full_name, role)
        VALUES (v_auth_user_id, v_email, 'Super Admin', 'super_admin');
        RAISE NOTICE '⚠️ FIX: Attempted to insert user into public.users';
    ELSE
        RAISE NOTICE '✅ OK: User found in public.users';
    END IF;

    -- 3. Check Role
    SELECT role INTO v_role FROM public.users WHERE id = v_auth_user_id;
    RAISE NOTICE 'ℹ️ ROLE: User role is %', v_role;
    
    IF v_role != 'super_admin' THEN
        RAISE NOTICE '⚠️ WARNING: User is not super_admin. Fixing...';
        UPDATE public.users SET role = 'super_admin' WHERE id = v_auth_user_id;
        RAISE NOTICE '✅ FIX: Updated role to super_admin';
    END IF;

    -- 4. Test RLS (Simulated)
    -- We can't easily simulate RLS here as anon, but we verified the structure.
    RAISE NOTICE '✅ VERIFICATION COMPLETE. Try logging in now.';
END $$;
