import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServerClientWithCookies } from '@/lib/supabase/client';
import { createDataset } from '@/lib/services/facebookService';

// POST /api/facebook-config/[id]/create-dataset - Create CAPI dataset for a Facebook page
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authClient = await createServerClientWithCookies();
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: configId } = await params;

    if (!configId) {
        return NextResponse.json({ error: 'Config ID is required' }, { status: 400 });
    }

    try {
        // Get the config to get ad_account_id and page info
        const { data: config, error: fetchError } = await supabase
            .from('facebook_configs')
            .select('*')
            .eq('id', configId)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !config) {
            return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
        }

        if (!config.ad_account_id) {
            return NextResponse.json({
                error: 'No Ad Account ID set. Please add an Ad Account ID first.'
            }, { status: 400 });
        }

        if (!config.page_access_token) {
            return NextResponse.json({
                error: 'No access token available. Please reconnect your Facebook account.'
            }, { status: 400 });
        }

        // Create the dataset
        const datasetId = await createDataset(
            config.ad_account_id,
            config.page_access_token,
            `Lead Pipeline - ${config.page_name}`
        );

        // Update the config with the dataset ID
        const { error: updateError } = await supabase
            .from('facebook_configs')
            .update({ dataset_id: datasetId })
            .eq('id', configId);

        if (updateError) {
            console.error('Failed to save dataset ID:', updateError);
        }

        return NextResponse.json({
            success: true,
            dataset_id: datasetId,
            message: 'CAPI Dataset created successfully!',
        });
    } catch (error) {
        console.error('Failed to create dataset:', error);

        // Check if it's a "already exists" error
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
            return NextResponse.json({
                error: 'A dataset may already exist for this ad account. Check your Facebook Business Manager.',
                details: errorMessage
            }, { status: 409 });
        }

        return NextResponse.json({
            error: 'Failed to create CAPI dataset',
            details: errorMessage
        }, { status: 500 });
    }
}
