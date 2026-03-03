-- 🔥 Fix for Infinite Recursion inside Policies 🔥

-- 1. We must replace the recursive row-level policy on `profiles` with a SECURITY DEFINER function
-- This allows checking the role without triggering RLS recursively.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Drop the old problematic policies
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Only super admins can update shared accounts" ON public.shared_accounts;


-- 3. Recreate the policies using the new function
CREATE POLICY "Super admins can manage all profiles" ON public.profiles
    FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());


CREATE POLICY "Only super admins can update shared accounts" ON public.shared_accounts
    FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());
