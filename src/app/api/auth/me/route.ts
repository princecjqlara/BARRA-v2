import { NextResponse } from 'next/server';
import { createServerClientWithCookies } from '@/lib/supabase/client';
import { ADMIN_EMAIL } from '@/lib/adminConfig';

/**
 * GET /api/auth/me - Get current user info including admin status
 */
export async function GET() {
    const supabase = await createServerClientWithCookies();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({
            authenticated: false,
            user: null,
            isAdmin: false,
        });
    }

    return NextResponse.json({
        authenticated: true,
        user: {
            id: user.id,
            email: user.email,
        },
        isAdmin: user.email === ADMIN_EMAIL,
    });
}
