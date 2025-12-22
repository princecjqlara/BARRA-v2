import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServerClientWithCookies } from '@/lib/supabase/client';
import { createDataset, getDatasets } from '@/lib/services/facebookService';

// POST /api/facebook-config/[id]/create-dataset - Create or find CAPI dataset for a Facebook page
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

        let datasetId: string;

        // First, try to get existing datasets (pixels)
        try {
            const existingDatasets = await getDatasets(config.ad_account_id, config.page_access_token);

            if (existingDatasets.length > 0) {
                // Use the first existing dataset
                datasetId = existingDatasets[0].id;
                console.log('Using existing dataset:', datasetId, existingDatasets[0].name);
            } else {
                // No existing datasets, create a new one
                datasetId = await createDataset(
                    config.ad_account_id,
                    config.page_access_token,
                    `Lead Pipeline - ${config.page_name}`
                );
                console.log('Created new dataset:', datasetId);
            }
        } catch (fetchError) {
            // If fetching fails, try to create anyway
            console.log('Could not fetch existing datasets, attempting to create new one');
            datasetId = await createDataset(
                config.ad_account_id,
                config.page_access_token,
                `Lead Pipeline - ${config.page_name}`
            );
        }

        // Update the config with the dataset ID
        const { error: updateError } = await supabase
            .from('facebook_configs')
            .update({ dataset_id: datasetId })
            .eq('id', configId);

        if (updateError) {
            console.error('Failed to save dataset ID:', updateError);
            return NextResponse.json({
                error: 'Dataset found/created but failed to save to database',
                dataset_id: datasetId
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            dataset_id: datasetId,
            message: 'CAPI Dataset linked successfully!',
        });
    } catch (error) {
        console.error('Failed to create/find dataset:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return NextResponse.json({
            error: 'Failed to create/find CAPI dataset',
            details: errorMessage
        }, { status: 500 });
    }
}
