-- Sync missing users from auth.users to public.users
-- Run this to fix the "User not found" or "0 rows" error when logging in.

-- 1. Insert missing users from auth.users into public.users
INSERT INTO public.users (id, email, full_name, role)
SELECT 
    au.id, 
    au.email, 
    COALESCE(au.raw_user_meta_data->>'full_name', 'User'),
    CASE 
        WHEN au.email = 'brifyaimaster@gmail.com' THEN 'super_admin'::user_role
        ELSE 'user'::user_role
    END
FROM auth.users au
WHERE au.id NOT IN (SELECT id FROM public.users);

-- 2. Force ensure the specific Super Admin has the correct role
UPDATE public.users 
SET role = 'super_admin' 
WHERE email = 'brifyaimaster@gmail.com';

-- 3. Verify the result
SELECT * FROM public.users WHERE email = 'brifyaimaster@gmail.com';
