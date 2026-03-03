import { useState, useEffect, useCallback } from 'react';
import {
    Users, UserPlus, Trash2, X, Loader2, Mail, KeyRound,
    Shield, Eye, EyeOff, AlertCircle, Check, RefreshCw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

interface SupabaseUser {
    id: string;
    email: string;
    created_at: string;
}

export default function AdminPanel({ onClose }: { onClose: () => void }) {
    const { role, createUser } = useAuth();
    const [users, setUsers] = useState<SupabaseUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(true);

    // Create user form
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [createSuccess, setCreateSuccess] = useState<string | null>(null);

    // Delete confirmation
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    if (role !== 'super_admin') return null;

    // Fetch users from profiles table
    const fetchUsers = useCallback(async () => {
        setLoadingUsers(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, email, created_at')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Failed to fetch users:', error);
                setUsers([]);
            } else {
                setUsers(data || []);
            }
        } catch {
            setUsers([]);
        }
        setLoadingUsers(false);
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateError(null);
        setCreateSuccess(null);

        if (!email.trim() || !password.trim()) {
            setCreateError('Please fill in all fields');
            return;
        }

        if (password.length < 6) {
            setCreateError('Password must be at least 6 characters');
            return;
        }

        setCreating(true);
        const err = await createUser(email.trim(), password);
        if (err) {
            setCreateError(err);
        } else {
            setCreateSuccess(`User ${email} created successfully`);
            setEmail('');
            setPassword('');
            fetchUsers();
        }
        setCreating(false);
    };

    const handleDeleteUser = async (userId: string) => {
        if (confirmDeleteId !== userId) {
            setConfirmDeleteId(userId);
            setTimeout(() => setConfirmDeleteId(null), 3000);
            return;
        }

        // Delete user profile (we can't delete auth users from client-side)
        try {
            await supabase.from('profiles').delete().eq('id', userId);
            setUsers(prev => prev.filter(u => u.id !== userId));
            setConfirmDeleteId(null);
        } catch (err) {
            console.error('Failed to delete user data:', err);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
            style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-md bg-[#0f1019] border border-gray-800/60 rounded-2xl shadow-2xl animate-slide-up overflow-hidden max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/60 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <Shield size={20} className="text-amber-400" />
                        <h2 className="text-lg font-semibold text-white">Admin Panel</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1">
                    {/* Create User Section */}
                    <div className="p-5 border-b border-gray-800/40">
                        <div className="flex items-center gap-2 mb-4">
                            <UserPlus size={16} className="text-emerald-400" />
                            <h3 className="text-sm font-semibold text-white">Create New User</h3>
                        </div>

                        <form onSubmit={handleCreateUser} className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-gray-400 mb-1 block">Email</label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => { setEmail(e.target.value); setCreateError(null); }}
                                        placeholder="user@example.com"
                                        className="w-full bg-gray-900/60 border border-gray-700/50 rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-gray-400 mb-1 block">Password</label>
                                <div className="relative">
                                    <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={e => { setPassword(e.target.value); setCreateError(null); }}
                                        placeholder="Min 6 characters"
                                        className="w-full bg-gray-900/60 border border-gray-700/50 rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-colors"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>

                            {createError && (
                                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 animate-fade-in">
                                    <AlertCircle size={14} className="text-red-400 shrink-0" />
                                    <p className="text-xs text-red-400">{createError}</p>
                                </div>
                            )}

                            {createSuccess && (
                                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 animate-fade-in">
                                    <Check size={14} className="text-emerald-400 shrink-0" />
                                    <p className="text-xs text-emerald-400">{createSuccess}</p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={creating}
                                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {creating ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <UserPlus size={16} />
                                        Create User
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Users List Section */}
                    <div className="p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Users size={16} className="text-indigo-400" />
                                <h3 className="text-sm font-semibold text-white">
                                    Users {!loadingUsers && <span className="text-gray-500 font-normal">({users.length})</span>}
                                </h3>
                            </div>
                            <button
                                onClick={fetchUsers}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800/60 transition-colors"
                                title="Refresh"
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>

                        {loadingUsers ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 size={24} className="text-indigo-400 animate-spin" />
                            </div>
                        ) : users.length === 0 ? (
                            <div className="text-center py-8">
                                <Users size={32} className="text-gray-700 mx-auto mb-3" />
                                <p className="text-sm text-gray-500">No users yet</p>
                                <p className="text-xs text-gray-600 mt-1">Create your first user above</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {users.map(user => (
                                    <div
                                        key={user.id}
                                        className="flex items-center justify-between bg-gray-900/40 border border-gray-800/40 rounded-lg px-3 py-2.5 group hover:border-gray-700/50 transition-colors"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm text-white truncate">{user.email}</p>
                                            <p className="text-xs text-gray-600">
                                                Joined {formatDate(user.created_at)}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteUser(user.id)}
                                            className={`shrink-0 p-1.5 rounded-lg transition-colors ${confirmDeleteId === user.id
                                                ? 'text-white bg-red-600 hover:bg-red-500'
                                                : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100'
                                                }`}
                                            title={confirmDeleteId === user.id ? 'Click again to confirm' : 'Delete user data'}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
