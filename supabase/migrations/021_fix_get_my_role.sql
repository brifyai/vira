-- Fix get_my_role function and user_role type
-- Run this script to ensure the type exists and the function is created correctly.

-- 1. Ensure user_role Type Exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'user', 'viewer');
    ELSE
        -- Ensure all values exist
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer';
    END IF;
END $$;

-- 2. Create get_my_role Function
-- This function is critical for RLS policies to avoid recursion
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with permissions of the creator (postgres/superuser)
SET search_path = public -- Security best practice
AS $$
DECLARE
  v_role user_role;
BEGIN
  -- Get the role for the current authenticated user
  -- If user is not found or not authenticated, this returns null
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  
  -- Default to 'viewer' or 'user' if null (optional, depending on strictness)
  -- For now, returning NULL is fine, as RLS checks will fail safely (NULL != 'admin')
  
  RETURN v_role;
END;
$$;

-- 3. Grant Execute Permissions
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon; -- Sometimes needed if used in public policies

-- 4. Verify
DO $$
DECLARE
    r user_role;
BEGIN
    -- Just a dummy check to see if we can declare the variable
    r := 'super_admin';
END $$;
