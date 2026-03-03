import { useState } from 'react';
import { Shield, LogIn, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
    const { login } = useAuth();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!identifier.trim() || !password.trim()) {
            setError('Please fill in all fields');
            return;
        }

        setLoading(true);
        const err = await login(identifier.trim(), password);
        if (err) {
            setError(err);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#06060e] text-white flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background effects */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-indigo-600/8 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-purple-600/5 rounded-full blur-[100px]" />
            </div>

            <div className="relative w-full max-w-sm animate-fade-in-up">
                {/* Logo & Branding */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-indigo-600/15 border border-indigo-500/25 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/10">
                        <Shield size={32} className="text-indigo-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Auth Vault</h1>
                    <p className="text-sm text-gray-500 mt-1">Authenticator Manager</p>
                </div>

                {/* Login Card */}
                <div className="bg-[#0c0c18]/80 border border-gray-800/50 rounded-2xl shadow-2xl backdrop-blur-sm">
                    {/* Header */}
                    <div className="px-6 py-5 border-b border-gray-800/40">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2.5">
                            <LogIn size={20} className="text-indigo-400" />
                            Sign In
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">Enter your credentials to continue</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div>
                            <label className="text-xs font-medium text-gray-400 mb-1.5 block">
                                Username / Email
                            </label>
                            <input
                                type="text"
                                value={identifier}
                                onChange={e => { setIdentifier(e.target.value); setError(null); }}
                                placeholder="Enter username or email"
                                className="w-full bg-gray-900/60 border border-gray-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all"
                                autoComplete="username"
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="text-xs font-medium text-gray-400 mb-1.5 block">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => { setPassword(e.target.value); setError(null); }}
                                    placeholder="Enter password"
                                    className="w-full bg-gray-900/60 border border-gray-700/50 rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all"
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 animate-fade-in">
                                <p className="text-sm text-red-400">{error}</p>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    <LogIn size={18} />
                                    Sign In
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-gray-600 mt-6">
                    Protected by AES-256-GCM encryption
                </p>
            </div>
        </div>
    );
}
