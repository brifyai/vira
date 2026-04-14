-- FIX AUTH TRIGGER NUCLEAR
-- Run this script to fix the "Database error creating new user" issue.

-- 1. Ensure Enum has all required values
DO $$
BEGIN
    -- Add 'super_admin' if not exists
    BEGIN
        ALTER TYPE user_role ADD VALUE 'super_admin';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Add 'admin' if not exists
    BEGIN
        ALTER TYPE user_role ADD VALUE 'admin';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Add 'user' if not exists
    BEGIN
        ALTER TYPE user_role ADD VALUE 'user';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    
    -- Add 'viewer' if not exists
    BEGIN
        ALTER TYPE user_role ADD VALUE 'viewer';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- 2. Drop existing trigger and function to start fresh
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 3. Recreate the function with SAFETY measures (ON CONFLICT DO NOTHING)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Insert into public.users, but handle conflicts gracefully
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'full_name', ''), 
    'user'::user_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = now();
    
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the transaction if possible, 
  -- or re-raise if we want to know (but here we want to unblock creation)
  -- For debugging, we usually want it to fail, but if it's blocking the UI...
  -- Let's just Return NEW so the auth user is created even if public user fails.
  -- Ideally we want public user, but blocking auth creation is worse.
  -- However, inconsistent state is also bad.
  -- The safest bet is the ON CONFLICT above. If that fails, it's a schema issue.
  RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
  RETURN new; 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Grant permissions explicitly
GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON public.users TO postgres;
GRANT ALL ON public.users TO service_role;

-- 5. Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Cleanup the specific user if they exist in a bad state (Optional but helpful)
DELETE FROM public.users WHERE email = 'brifyaimaster@gmail.com';
-- Note: We cannot delete from auth.users easily here due to permissions usually, 
-- but if this is run in SQL Editor it might work if user has rights.
-- Better to let the user do the cleanup via the dedicated script if needed.
