import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Client-side Supabase client (lazy initialization)
let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase credentials not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }

    if (!supabaseInstance) {
        supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    }
    return supabaseInstance;
}

// For backwards compatibility
export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// Server-side Supabase client with service role key
export function createServerClient(): SupabaseClient {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Supabase server credentials not configured');
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
