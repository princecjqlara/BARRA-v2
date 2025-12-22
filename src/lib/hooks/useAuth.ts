'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface AuthState {
    isAuthenticated: boolean | null;
    isAdmin: boolean;
    user: { id: string; email: string } | null;
    loading: boolean;
}

export function useAuth(redirectIfUnauthenticated: boolean = true) {
    const router = useRouter();
    const [authState, setAuthState] = useState<AuthState>({
        isAuthenticated: null,
        isAdmin: false,
        user: null,
        loading: true,
    });

    useEffect(() => {
        checkAuth();
    }, []);

    async function checkAuth() {
        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();

            if (!data.authenticated && redirectIfUnauthenticated) {
                router.push('/login');
                return;
            }

            setAuthState({
                isAuthenticated: data.authenticated,
                isAdmin: data.isAdmin || false,
                user: data.user || null,
                loading: false,
            });
        } catch (err) {
            console.error('Auth check failed:', err);
            if (redirectIfUnauthenticated) {
                router.push('/login');
            }
            setAuthState({
                isAuthenticated: false,
                isAdmin: false,
                user: null,
                loading: false,
            });
        }
    }

    return authState;
}
