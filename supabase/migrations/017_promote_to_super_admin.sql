-- PROMOTION SCRIPT
-- Run this AFTER creating the user in the Supabase Dashboard.

UPDATE public.users 
SET role = 'super_admin' 
WHERE email = 'brifyaimaster@gmail.com';

-- Verify
SELECT * FROM public.users WHERE email = 'brifyaimaster@gmail.com';
