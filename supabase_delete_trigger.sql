-- 🛡️ Secure Deletion Wrapper for Supabase Auth 🛡️

-- In Supabase, deleting a row in public.profiles DOES NOT automatically delete the user record in auth.users.
-- Since Javascript client cannot directly delete from auth.users (due to strict security),
-- we create a database-level trigger. When a Super Admin explicitly deletes a profile, 
-- this trigger securely cascade-deletes the actual authentication user.

-- 1. Create a function that runs with superuser privileges (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.handle_deleted_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Safely delete the user from the actual identity table
  DELETE FROM auth.users WHERE id = old.id;
  RETURN old;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach the trigger to the profiles table
DROP TRIGGER IF EXISTS on_profile_deleted ON public.profiles;
CREATE TRIGGER on_profile_deleted
  AFTER DELETE ON public.profiles
  FOR EACH ROW 
  EXECUTE PROCEDURE public.handle_deleted_profile();
