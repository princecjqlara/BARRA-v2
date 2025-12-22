import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServerClientWithCookies } from '@/lib/supabase/client';

// GET /api/facebook-config - Get user's Facebook configurations
export async function GET() {
    const authClient = await createServerClientWithCookies();
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { data: configs, error } = await supabase
            .from('facebook_configs')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Failed to fetch facebook configs:', error);
            return NextResponse.json({ error: 'Failed to fetch configurations' }, { status: 500 });
        }

        return NextResponse.json({ configs: configs || [] });
    } catch (error) {
        console.error('Failed to fetch facebook configs:', error);
        return NextResponse.json({ error: 'Failed to fetch configurations' }, { status: 500 });
    }
}

// PUT /api/facebook-config - Update Facebook configuration (ad account, etc.)
export async function PUT(request: NextRequest) {
    const authClient = await createServerClientWithCookies();
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { config_id, ad_account_id } = body;

        if (!config_id) {
            return NextResponse.json({ error: 'config_id is required' }, { status: 400 });
        }

        // Update the config
        const { data: config, error } = await supabase
            .from('facebook_configs')
            .update({
                ad_account_id: ad_account_id || null,
            })
            .eq('id', config_id)
            .eq('user_id', user.id) // Security: only update own configs
            .select()
            .single();

        if (error) {
            console.error('Failed to update facebook config:', error);
            return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            config,
            message: 'Ad account updated successfully',
        });
    } catch (error) {
        console.error('Failed to update facebook config:', error);
        return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 });
    }
}

// POST /api/facebook-config - Create a manual Facebook configuration
export async function POST(request: NextRequest) {
    const authClient = await createServerClientWithCookies();
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { page_id, page_name, ad_account_id, page_access_token } = body;

        if (!page_id || !page_name) {
            return NextResponse.json({ error: 'page_id and page_name are required' }, { status: 400 });
        }

        // Upsert the config
        const { data: config, error } = await supabase
            .from('facebook_configs')
            .upsert({
                user_id: user.id,
                page_id,
                page_name,
                ad_account_id: ad_account_id || null,
                page_access_token: page_access_token || null,
            }, {
                onConflict: 'user_id,page_id',
            })
            .select()
            .single();

        if (error) {
            console.error('Failed to create facebook config:', error);
            return NextResponse.json({ error: 'Failed to create configuration' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            config,
            message: 'Configuration created successfully',
        });
    } catch (error) {
        console.error('Failed to create facebook config:', error);
        return NextResponse.json({ error: 'Failed to create configuration' }, { status: 500 });
    }
}
