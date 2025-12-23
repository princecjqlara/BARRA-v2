import { NextResponse } from 'next/server';
import { createServerClient, createServerClientWithCookies } from '@/lib/supabase/client';

interface FacebookDebugToken {
    data: {
        app_id: string;
        type: string;
        application: string;
        expires_at: number;
        is_valid: boolean;
        scopes: string[];
        user_id?: string;
        error?: {
            code: number;
            message: string;
            subcode: number;
        };
    };
}

/**
 * GET /api/facebook-config/check-permissions
 * Check if the user's Facebook token has the required permissions
 */
export async function GET() {
    const authClient = await createServerClientWithCookies();
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Get user's Facebook configs
        const { data: fbConfigs, error: configError } = await supabase
            .from('facebook_configs')
            .select('*')
            .eq('user_id', user.id);

        if (configError) {
            return NextResponse.json({
                error: 'Failed to fetch Facebook configurations',
                details: configError.message,
            }, { status: 500 });
        }

        if (!fbConfigs || fbConfigs.length === 0) {
            return NextResponse.json({
                connected: false,
                message: 'No Facebook pages connected',
                action: 'connect_facebook',
            });
        }

        // Required permissions for full functionality
        const requiredPermissions = [
            'pages_manage_metadata',
            'pages_read_engagement',
            'pages_messaging',
            'pages_manage_ads',
            'leads_retrieval',
            'ads_read',
            'ads_management',
        ];

        // Check each config
        const configsStatus = await Promise.all(
            fbConfigs.map(async (config) => {
                if (!config.page_access_token) {
                    return {
                        page_id: config.page_id,
                        page_name: config.page_name,
                        status: 'error',
                        message: 'No access token',
                        has_ad_account: !!config.ad_account_id,
                        has_dataset: !!config.dataset_id,
                        has_capi_token: !!config.capi_access_token,
                    };
                }

                try {
                    // Debug the token to check permissions
                    const appId = process.env.FACEBOOK_APP_ID!;
                    const appSecret = process.env.FACEBOOK_APP_SECRET!;
                    const appAccessToken = `${appId}|${appSecret}`;

                    const debugRes = await fetch(
                        `https://graph.facebook.com/v24.0/debug_token?` +
                        `input_token=${config.page_access_token}` +
                        `&access_token=${appAccessToken}`
                    );

                    const debugData: FacebookDebugToken = await debugRes.json();

                    if (!debugData.data) {
                        return {
                            page_id: config.page_id,
                            page_name: config.page_name,
                            status: 'error',
                            message: 'Invalid token response',
                        };
                    }

                    const { is_valid, scopes, expires_at, error } = debugData.data;

                    if (!is_valid || error) {
                        return {
                            page_id: config.page_id,
                            page_name: config.page_name,
                            status: 'expired',
                            message: error?.message || 'Token is invalid or expired',
                            action: 'reconnect',
                        };
                    }

                    // Check which required permissions are missing
                    const grantedPermissions = scopes || [];
                    const missingPermissions = requiredPermissions.filter(
                        (p) => !grantedPermissions.includes(p)
                    );

                    const isExpired = expires_at && expires_at * 1000 < Date.now();
                    const expiresIn = expires_at
                        ? Math.round((expires_at * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
                        : 'never';

                    return {
                        page_id: config.page_id,
                        page_name: config.page_name,
                        status: missingPermissions.length > 0 ? 'warning' : 'ok',
                        is_valid,
                        expires_in_days: expiresIn,
                        is_expired: isExpired,
                        granted_permissions: grantedPermissions,
                        missing_permissions: missingPermissions,
                        has_ad_account: !!config.ad_account_id,
                        has_dataset: !!config.dataset_id,
                        has_capi_token: !!config.capi_access_token,
                        action: missingPermissions.length > 0 ? 'reconnect_for_permissions' : null,
                    };
                } catch (error) {
                    console.error('Error checking token for page', config.page_name, error);
                    return {
                        page_id: config.page_id,
                        page_name: config.page_name,
                        status: 'error',
                        message: 'Failed to check token',
                    };
                }
            })
        );

        const allOk = configsStatus.every((c) => c.status === 'ok');
        const hasExpired = configsStatus.some((c) => c.status === 'expired');
        const hasMissingPermissions = configsStatus.some((c) => c.status === 'warning');

        return NextResponse.json({
            connected: true,
            overall_status: allOk ? 'ok' : hasExpired ? 'expired' : 'warning',
            message: allOk
                ? 'All permissions granted'
                : hasExpired
                    ? 'Some tokens have expired - please reconnect'
                    : hasMissingPermissions
                        ? 'Some permissions are missing - please reconnect Facebook'
                        : 'Check configurations',
            configs: configsStatus,
        });
    } catch (error) {
        console.error('Permission check failed:', error);
        return NextResponse.json({
            error: 'Failed to check permissions',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
