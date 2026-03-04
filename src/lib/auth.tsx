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

    // Helper: fetch profile role from Supabase
    const fetchRole = async (userId: string): Promise<UserRole> => {
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single();
            return (profile?.role as UserRole) || 'user';
        } catch {
            return 'user';
        }
    };

    // Initialize auth on mount
    useEffect(() => {
        let mounted = true;

        // Safety timeout — never stay loading forever
        const safetyTimer = setTimeout(() => {
            if (mounted) setLoading(false);
        }, 10000);

        const init = async () => {
            try {
                // 1) Check local-only super admin first
                const savedRole = localStorage.getItem('auth_vault_role');
                if (savedRole === 'super_admin') {
                    if (mounted) {
                        setRole('super_admin');
                        setUser({ id: 'super_admin', email: SUPER_ADMIN_USERNAME, user_metadata: {} } as User);
                        setLoading(false);
                    }
                    return;
                }

                // 2) Check Supabase session
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.warn('Auth: getSession failed:', error.message);
                    if (mounted) setLoading(false);
                    return;
                }

                if (session?.user && mounted) {
                    setUser(session.user);
                    const userRole = await fetchRole(session.user.id);
                    if (mounted) setRole(userRole);
                }

                if (mounted) setLoading(false);
            } catch (err) {
                console.warn('Auth: init error:', err);
                if (mounted) setLoading(false);
            }
        };

        init();

        // Listen for auth state changes (token refresh, sign out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!mounted) return;

                const savedRole = localStorage.getItem('auth_vault_role');
                if (savedRole === 'super_admin') return;

                if (event === 'SIGNED_OUT') {
                    setUser(null);
                    setRole(null);
                    return;
                }

                if (session?.user) {
                    setUser(session.user);
                    try {
                        const userRole = await fetchRole(session.user.id);
                        if (mounted) setRole(userRole);
                    } catch {
                        if (mounted) setRole('user');
                    }
                } else if (event !== 'INITIAL_SESSION') {
                    // Only clear user if it's not the initial load (which init() handles)
                    setUser(null);
                    setRole(null);
                }
            }
        );

        return () => {
            mounted = false;
            clearTimeout(safetyTimer);
            subscription.unsubscribe();
        };
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
