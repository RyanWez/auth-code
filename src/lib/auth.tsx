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

// ── Session Cache Helpers (module-level for instant access) ─────────────────

function saveSessionCache(u: User, r: UserRole) {
    try {
        localStorage.setItem('auth_vault_user', JSON.stringify({ id: u.id, email: u.email }));
        localStorage.setItem('auth_vault_user_role', r);
    } catch { /* ignore */ }
}

function clearSessionCache() {
    localStorage.removeItem('auth_vault_user');
    localStorage.removeItem('auth_vault_user_role');
}

function getInitialAuthState(): { user: User | null; role: UserRole | null; loading: boolean } {
    try {
        // Check Super Admin first
        const savedRole = localStorage.getItem('auth_vault_role');
        if (savedRole === 'super_admin') {
            return {
                user: { id: 'super_admin', email: SUPER_ADMIN_USERNAME, user_metadata: {} } as User,
                role: 'super_admin',
                loading: false,
            };
        }

        // Check cached user session
        const raw = localStorage.getItem('auth_vault_user');
        const cachedRole = localStorage.getItem('auth_vault_user_role') as UserRole | null;
        if (raw && cachedRole) {
            const parsed = JSON.parse(raw);
            return {
                user: { id: parsed.id, email: parsed.email, user_metadata: {} } as User,
                role: cachedRole,
                loading: false,
            };
        }
    } catch { /* ignore */ }

    // No cached session — need to load from Supabase
    return { user: null, role: null, loading: true };
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    // Read from cache SYNCHRONOUSLY on first render — zero delay!
    const initial = getInitialAuthState();
    const [user, setUser] = useState<User | null>(initial.user);
    const [role, setRole] = useState<UserRole | null>(initial.role);
    const [loading, setLoading] = useState(initial.loading);

    // Helper: fetch profile role with timeout
    const fetchRole = async (userId: string): Promise<UserRole> => {
        try {
            const result = await Promise.race([
                supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', userId)
                    .single(),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
            ]);
            if (result && 'data' in result) {
                return (result.data?.role as UserRole) || 'user';
            }
            return 'user';
        } catch {
            return 'user';
        }
    };

    // Background: validate/refresh session from Supabase
    useEffect(() => {
        let mounted = true;

        const refresh = async () => {
            const savedRole = localStorage.getItem('auth_vault_role');
            if (savedRole === 'super_admin') {
                // Super Admin doesn't use Supabase — nothing to refresh
                if (loading) setLoading(false);
                return;
            }

            try {
                const result = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
                ]);

                if (result && 'data' in result && result.data.session?.user && mounted) {
                    const sessionUser = result.data.session.user;
                    setUser(sessionUser);
                    const freshRole = await fetchRole(sessionUser.id);
                    if (mounted) {
                        setRole(freshRole);
                        saveSessionCache(sessionUser, freshRole);
                    }
                }
            } catch {
                // Keep using cached session
            }

            if (mounted && loading) setLoading(false);
        };

        refresh();

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!mounted) return;

                const savedAdminRole = localStorage.getItem('auth_vault_role');
                if (savedAdminRole === 'super_admin') return;

                if (event === 'SIGNED_OUT') {
                    setUser(null);
                    setRole(null);
                    clearSessionCache();
                    return;
                }

                if (session?.user) {
                    setUser(session.user);
                    try {
                        const userRole = await fetchRole(session.user.id);
                        if (mounted) {
                            setRole(userRole);
                            saveSessionCache(session.user, userRole);
                        }
                    } catch {
                        if (mounted) setRole('user');
                    }
                }
            }
        );

        return () => {
            mounted = false;
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

            const userRole = (profile?.role as UserRole) || 'user';
            setRole(userRole);
            saveSessionCache(data.user, userRole);
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
        clearSessionCache();
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
