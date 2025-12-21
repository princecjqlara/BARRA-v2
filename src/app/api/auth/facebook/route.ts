import { NextRequest, NextResponse } from 'next/server';
import { getFacebookOAuthUrl } from '@/lib/services/facebookService';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = `${appUrl}/api/auth/facebook/callback`;

    // Generate state for CSRF protection
    const state = uuidv4();

    // Store state in cookie for verification
    const oauthUrl = getFacebookOAuthUrl(redirectUri, state);

    const response = NextResponse.redirect(oauthUrl);
    response.cookies.set('fb_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
    });

    return response;
}
