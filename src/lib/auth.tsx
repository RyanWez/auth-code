import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    type ReactNode,
} from 'react';
import { supabase } from './supabase';
import { createClient, type User } from '@supabase/supabase-js';

// ── Types ────────────────────────────────────────────────────────────────────

type UserRole = 'super_admin' | 'user';

interface AuthState {
    user: User | null;
    role: UserRole | null;
    loading: boolean;
    login: (identifier: string, password: string) => Promise<string | null>;
    logout: () => Promise<void>;
    createUser: (email: string, password: string) => Promise<string | null>;
}

// ── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

// ── Super Admin Helpers ──────────────────────────────────────────────────────

const SUPER_ADMIN_USERNAME = import.meta.env.VITE_SUPER_ADMIN_USERNAME || '';
const SUPER_ADMIN_PASSWORD = import.meta.env.VITE_SUPER_ADMIN_PASSWORD || '';

function isSuperAdmin(identifier: string, password: string): boolean {
    return identifier === SUPER_ADMIN_USERNAME && password === SUPER_ADMIN_PASSWORD;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<UserRole | null>(null);
    const [loading, setLoading] = useState(true);

    // Check existing session on mount
    useEffect(() => {
        const init = async () => {
            // Check if local-only super admin was previously logged in
            const savedRole = localStorage.getItem('auth_vault_role');
            if (savedRole === 'super_admin') {
                setRole('super_admin');
                setUser({ id: 'super_admin', email: SUPER_ADMIN_USERNAME, user_metadata: {} } as User);
                setLoading(false);
                return;
            }

            // Check Supabase session
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setUser(session.user);
                // Fetch profile role
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', session.user.id)
                    .single();

                setRole((profile?.role as UserRole) || 'user');
            }
            setLoading(false);
        };

        init();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                const savedRole = localStorage.getItem('auth_vault_role');
                if (savedRole === 'super_admin') return;

                if (session?.user) {
                    setUser(session.user);
                    // Fetch role again if changed
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('role')
                        .eq('id', session.user.id)
                        .single();

                    setRole((profile?.role as UserRole) || 'user');
                } else {
                    setUser(null);
                    setRole(null);
                }
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    // Login
    const login = useCallback(async (identifier: string, password: string): Promise<string | null> => {
        // Fallback: Local Super Admin Bypass
        if (isSuperAdmin(identifier, password)) {
            setUser({ id: 'super_admin', email: SUPER_ADMIN_USERNAME, user_metadata: {} } as User);
            setRole('super_admin');
            localStorage.setItem('auth_vault_role', 'super_admin');
            return null;
        }

        // Supabase email/password auth
        const { data, error } = await supabase.auth.signInWithPassword({
            email: identifier,
            password,
        });

        if (error) return error.message;

        if (data.user) {
            setUser(data.user);
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', data.user.id)
                .single();

            setRole((profile?.role as UserRole) || 'user');
        }
        return null;
    }, []);

    // Logout
    const logout = useCallback(async () => {
        const savedRole = localStorage.getItem('auth_vault_role');
        if (savedRole === 'super_admin') {
            localStorage.removeItem('auth_vault_role');
            setUser(null);
            setRole(null);
            return;
        }

        await supabase.auth.signOut();
        setUser(null);
        setRole(null);
    }, []);

    // Create user (Super Admin only)
    const createUser = useCallback(async (email: string, password: string): Promise<string | null> => {
        if (role !== 'super_admin') return 'Unauthorized';

        // Use a temporary client that doesn't persist the session.
        // This prevents the Super Admin from being forced into the new user's session!
        const tempSupabase = createClient(
            import.meta.env.VITE_SUPABASE_URL,
            import.meta.env.VITE_SUPABASE_ANON_KEY,
            {
                auth: { persistSession: false, autoRefreshToken: false },
            }
        );

        const { error } = await tempSupabase.auth.signUp({
            email,
            password,
        });

        if (error) return error.message;

        return null;
    }, [role]);

    return (
        <AuthContext.Provider value={{ user, role, loading, login, logout, createUser }}>
            {children}
        </AuthContext.Provider>
    );
}
