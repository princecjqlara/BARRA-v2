'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [message, setMessage] = useState<string | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            if (mode === 'login') {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) throw error;

                router.push('/');
                router.refresh();
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: `${window.location.origin}/auth/callback`,
                    },
                });

                if (error) throw error;

                setMessage('Check your email for the confirmation link!');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="glass-card p-8 w-full max-w-md">
                {/* Logo/Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold gradient-text mb-2">
                        Lead Pipeline
                    </h1>
                    <p className="text-slate-400">
                        {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-6 p-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Success Message */}
                {message && (
                    <div className="mb-6 p-4 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm">
                        {message}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="input-field w-full"
                            placeholder="you@example.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="input-field w-full"
                            placeholder="••••••••"
                            required
                            minLength={6}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <div className="spinner w-4 h-4" />
                                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                            </span>
                        ) : (
                            mode === 'login' ? 'Sign In' : 'Create Account'
                        )}
                    </button>
                </form>

                {/* Toggle Mode */}
                <div className="mt-6 text-center text-sm text-slate-400">
                    {mode === 'login' ? (
                        <>
                            Don&apos;t have an account?{' '}
                            <button
                                onClick={() => setMode('signup')}
                                className="text-indigo-400 hover:text-indigo-300"
                            >
                                Sign up
                            </button>
                        </>
                    ) : (
                        <>
                            Already have an account?{' '}
                            <button
                                onClick={() => setMode('login')}
                                className="text-indigo-400 hover:text-indigo-300"
                            >
                                Sign in
                            </button>
                        </>
                    )}
                </div>

                {/* Divider */}
                <div className="my-6 flex items-center">
                    <div className="flex-1 border-t border-slate-700"></div>
                    <span className="px-4 text-sm text-slate-500">or</span>
                    <div className="flex-1 border-t border-slate-700"></div>
                </div>

                {/* Demo Info */}
                <div className="text-center text-sm text-slate-500">
                    <p>Demo credentials:</p>
                    <p className="text-slate-400 mt-1">
                        Use the account you created in Supabase
                    </p>
                </div>
            </div>
        </div>
    );
}
