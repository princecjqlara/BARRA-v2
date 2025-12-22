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
        const tokenResponse = await exchangeCodeForToken(code, redirectUri);

        // Get long-lived token
        const longLivedToken = await getLongLivedToken(tokenResponse.access_token);

        // Get user's pages
        const pages = await getUserPages(longLivedToken);

        if (pages.length === 0) {
            return NextResponse.redirect(`${appUrl}/settings?error=no_pages`);
        }

        // Get ad accounts for dataset creation
        let adAccounts: { id: string; name: string; account_id: string }[] = [];
        try {
            adAccounts = await getAdAccounts(longLivedToken);
            console.log('Ad accounts found:', JSON.stringify(adAccounts));
        } catch (adError) {
            console.error('Failed to get ad accounts:', adError);
        }

        console.log('Pages found:', JSON.stringify(pages.map(p => ({ id: p.id, name: p.name }))));

        // Store pages data in session/cookie for user to select
        // For now, we'll auto-select the first page and ad account
        const selectedPage = pages[0];
        const selectedAdAccount = adAccounts[0] || null;

        // Get the current user from Supabase auth - use cookie-aware client
        const authClient = await createServerClientWithCookies();
        const supabase = createServerClient();

        const { data: { user }, error: userError } = await authClient.auth.getUser();

        if (userError || !user) {
            // Store in session for after login
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

        // Create or update Facebook config for each page
        for (const page of pages) {
            // Try to create a dataset for CAPI
            let datasetId: string | null = null;
            if (selectedAdAccount) {
                try {
                    datasetId = await createDataset(
                        selectedAdAccount.account_id,
                        longLivedToken,
                        `Lead Pipeline - ${page.name}`
                    );
                    console.log('Created dataset:', datasetId);
                } catch (datasetError) {
                    console.error('Failed to create dataset (may already exist):', datasetError);
                    // Try to get existing datasets
                    // For now, we'll continue without dataset
                }
            }

            // Subscribe to leadgen webhook
            let webhookSubscribed = false;
            try {
                webhookSubscribed = await subscribeToLeadgen(page.id, page.access_token);
                console.log('Webhook subscription:', webhookSubscribed);
            } catch (webhookError) {
                console.error('Failed to subscribe to webhook:', webhookError);
            }

            // Upsert Facebook config
            const { error: upsertError } = await supabase
                .from('facebook_configs')
                .upsert({
                    user_id: user.id,
                    page_id: page.id,
                    page_name: page.name,
                    page_access_token: page.access_token,
                    ad_account_id: selectedAdAccount?.account_id || null,
                    dataset_id: datasetId,
                    webhook_subscribed: webhookSubscribed,
                }, {
                    onConflict: 'user_id,page_id',
                });

            if (upsertError) {
                console.error('Failed to save Facebook config:', upsertError);
            }
        }

        // Clear the state cookie
        const response = NextResponse.redirect(`${appUrl}/settings?success=facebook_connected`);
        response.cookies.delete('fb_oauth_state');

        return response;
    } catch (err) {
        console.error('Facebook OAuth callback error:', err);
        return NextResponse.redirect(`${appUrl}/settings?error=oauth_failed`);
    }
}
