-- CLEANUP SCRIPT
-- 1. Delete the potentially corrupted Super Admin user to allow fresh creation via Dashboard.

DO $$
DECLARE
    sa_email text := 'brifyaimaster@gmail.com';
    sa_id uuid;
BEGIN
    SELECT id INTO sa_id FROM auth.users WHERE email = sa_email;
    
    IF sa_id IS NOT NULL THEN
        DELETE FROM public.user_radios WHERE user_id = sa_id;
        DELETE FROM public.users WHERE id = sa_id;
        DELETE FROM auth.users WHERE id = sa_id;
    END IF;
END $$;
