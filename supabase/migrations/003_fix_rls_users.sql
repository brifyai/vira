-- ============================================
-- Fix RLS Recursion Error in users table
-- ============================================

-- Drop existing policies that cause infinite recursion
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;

-- Recreate policies with correct syntax (no EXISTS clause)
CREATE POLICY "Users can view their own profile" ON public.users
    FOR SELECT USING (
        auth.uid() = id
    );

CREATE POLICY "Users can update their own profile" ON public.users
    FOR UPDATE USING (
        auth.uid() = id
    );

CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role = 'admin'
        )
    );
