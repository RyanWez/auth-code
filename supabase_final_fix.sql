-- 🚨 Final Nuclear Fix version 2: Drop All Potentially Recursive Policies on Profiles 🚨

-- 1. We remove ALL policies from `profiles` to start clean.
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can modify profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;

-- 2. We allow ALL authenticated users to READ `profiles`. 
-- This completely avoids any recursive loops or deadlocks on SELECT.
CREATE POLICY "Anyone can read profiles" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- 3. We allow Super Admins to UPDATE and DELETE profiles securely.
-- IMPORTANT: We MUST use explicit FOR UPDATE/DELETE instead of FOR ALL here.
-- Using FOR ALL makes the policy apply to SELECT too, which causes infinite recursion!
CREATE POLICY "Super admins can update profiles" ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "Super admins can delete profiles" ON public.profiles
    FOR DELETE
    TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- 4. Clean up the shared_accounts policies as well.
DROP POLICY IF EXISTS "Only super admins can update shared accounts" ON public.shared_accounts;

CREATE POLICY "Only super admins can update shared accounts" ON public.shared_accounts
    FOR ALL
    TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    )
    WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- 5. Drop the custom function since we don't need it anymore.
DROP FUNCTION IF EXISTS public.is_super_admin();
