import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServerClientWithCookies } from '@/lib/supabase/client';
import {
    exchangeCodeForToken,
    getLongLivedToken,
    getUserPages,
    getAdAccounts,
    createDataset,
    subscribeToLeadgen,
} from '@/lib/services/facebookService';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    // Check for errors
    if (error) {
        console.error('Facebook OAuth error:', error);
        return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(error)}`);
    }

    // Verify state
    const storedState = request.cookies.get('fb_oauth_state')?.value;
    if (!state || state !== storedState) {
        console.error('State mismatch');
        return NextResponse.redirect(`${appUrl}/settings?error=invalid_state`);
    }

    if (!code) {
        return NextResponse.redirect(`${appUrl}/settings?error=no_code`);
    }

    try {
        const redirectUri = `${appUrl}/api/auth/facebook/callback`;

        // Exchange code for short-lived token
        console.log('Exchanging code for token...');
        const tokenResponse = await exchangeCodeForToken(code, redirectUri);

        // Get long-lived token
        console.log('Getting long-lived token...');
        const longLivedToken = await getLongLivedToken(tokenResponse.access_token);

        // Get user's pages
        console.log('Fetching user pages...');
        const pages = await getUserPages(longLivedToken);
        console.log(`Found ${pages.length} pages:`, pages.map(p => p.name));

        if (pages.length === 0) {
            return NextResponse.redirect(`${appUrl}/settings?error=no_pages`);
        }

        // Get ALL ad accounts (personal + Business Manager)
        console.log('Fetching ad accounts...');
        let adAccounts: { id: string; name: string; account_id: string }[] = [];
        try {
            adAccounts = await getAdAccounts(longLivedToken);
            console.log(`Found ${adAccounts.length} ad accounts:`, adAccounts.map(a => ({ id: a.id, name: a.name })));
        } catch (adError) {
            console.error('Failed to get ad accounts:', adError);
        }

        // Get the current user from Supabase auth
        const authClient = await createServerClientWithCookies();
        const supabase = createServerClient();

        const { data: { user }, error: userError } = await authClient.auth.getUser();

        if (userError || !user) {
            // Store in session for after login
            console.log('User not logged in, storing pending connection...');
            const response = NextResponse.redirect(`${appUrl}/login?callback=facebook_connect`);
            response.cookies.set('fb_pending_connection', JSON.stringify({
                pages,
                adAccounts,
                longLivedToken,
            }), {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 3600,
            });
            return response;
        }

        console.log(`Saving Facebook config for user ${user.id}...`);

        // Create or update Facebook config for each page
        for (const page of pages) {
            // Don't auto-assign ad account or dataset - let user configure in Settings
            // This prevents all pages from getting the same ad account

            // Subscribe to leadgen webhook
            let webhookSubscribed = false;
            try {
                webhookSubscribed = await subscribeToLeadgen(page.id, page.access_token);
                console.log('Webhook subscription for', page.name, ':', webhookSubscribed);
            } catch (webhookError) {
                console.error('Failed to subscribe to webhook:', webhookError);
            }

            // Upsert Facebook config (without ad account - user sets this in Settings)
            const configData = {
                user_id: user.id,
                page_id: page.id,
                page_name: page.name,
                page_access_token: page.access_token,
                ad_account_id: null,  // User configures per-page in Settings
                dataset_id: null,     // User creates per-page in Settings
                webhook_subscribed: webhookSubscribed,
            };

            console.log(`Saving config for page ${page.name}:`, {
                ad_account_id: configData.ad_account_id,
                webhook_subscribed: configData.webhook_subscribed,
            });

            const { error: upsertError } = await supabase
                .from('facebook_configs')
                .upsert(configData, {
                    onConflict: 'user_id,page_id',
                });

            if (upsertError) {
                console.error('Failed to save Facebook config:', upsertError);
            } else {
                console.log(`Successfully saved config for page ${page.name}`);
            }
        }

        // Clear the state cookie and redirect with success
        const adAccountMessage = adAccounts.length > 0
            ? `&ad_accounts=${adAccounts.length}`
            : '';
        const response = NextResponse.redirect(`${appUrl}/settings?success=facebook_connected${adAccountMessage}`);
        response.cookies.delete('fb_oauth_state');

        return response;
    } catch (err) {
        console.error('Facebook OAuth callback error:', err);
        return NextResponse.redirect(`${appUrl}/settings?error=oauth_failed`);
    }
}

