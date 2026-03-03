-- 1. Create Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Super admins can read and write all profiles
CREATE POLICY "Super admins can manage all profiles" ON public.profiles
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
        )
    );

-- Users can read their own profile
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (id = auth.uid());


-- 2. Create Shared Accounts Table
CREATE TABLE IF NOT EXISTS public.shared_accounts (
    id TEXT PRIMARY KEY,
    accounts_data TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for shared_accounts
ALTER TABLE public.shared_accounts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the shared accounts
CREATE POLICY "All authenticated users can view shared accounts" ON public.shared_accounts
    FOR SELECT
    TO authenticated
    USING (true);

-- Only super admins can insert or update shared accounts
CREATE POLICY "Only super admins can update shared accounts" ON public.shared_accounts
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );


-- 3. Enable Realtime for shared_accounts
-- This ensures the client side subscription works when Super admin updates the OTP accounts
ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_accounts;


-- 4. Automatically create profile on user signup
-- A trigger to create a profile automatically when a user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
      new.id, 
      new.email, 
      -- Make the first user 'super_admin', and others 'user'
      CASE 
          WHEN NOT EXISTS (SELECT 1 FROM public.profiles) THEN 'super_admin'
          ELSE 'user'
      END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create it
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

