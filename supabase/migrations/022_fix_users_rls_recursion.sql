-- Fix infinite recursion in users table policies
-- The previous policy queried public.users to check for admin role, causing a loop.
-- We use the SECURITY DEFINER function get_my_role() to bypass RLS for the role check.

-- 1. Drop the problematic policies
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins and Super Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;

-- 2. Create optimized policies using get_my_role()

-- Policy 1: Users can view their own profile
CREATE POLICY "Users can view their own profile" ON public.users
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = id
    );

-- Policy 2: Admins and Super Admins can view ALL users
-- This uses the SECURITY DEFINER function to check role without triggering RLS on users table again
CREATE POLICY "Admins and Super Admins can view all users" ON public.users
    FOR SELECT
    TO authenticated
    USING (
        public.get_my_role() IN ('admin', 'super_admin')
    );

-- Policy 3: Users can update their own profile
CREATE POLICY "Users can update their own profile" ON public.users
    FOR UPDATE
    TO authenticated
    USING ( auth.uid() = id );
