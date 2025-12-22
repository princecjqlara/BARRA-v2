import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServerClientWithCookies } from '@/lib/supabase/client';

// GET /api/pipeline-stages - List stages for a pipeline
export async function GET(request: NextRequest) {
    const authClient = await createServerClientWithCookies();
    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;
    const pipelineId = searchParams.get('pipeline_id');

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!pipelineId) {
        return NextResponse.json({ error: 'pipeline_id is required' }, { status: 400 });
    }

    // Verify pipeline ownership
    const { data: pipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('id', pipelineId)
        .eq('user_id', user.id)
        .single();

    if (!pipeline) {
        return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    const { data: stages, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('order_index');

    if (error) {
        console.error('Failed to fetch stages:', error);
        return NextResponse.json({ error: 'Failed to fetch stages' }, { status: 500 });
    }

    return NextResponse.json({ stages });
}

// POST /api/pipeline-stages - Add a new stage to a pipeline
export async function POST(request: NextRequest) {
    const authClient = await createServerClientWithCookies();
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { pipeline_id, name, description, color, capi_event_name } = body;

        if (!pipeline_id || !name) {
            return NextResponse.json({ error: 'pipeline_id and name are required' }, { status: 400 });
        }

        // Verify pipeline ownership
        const { data: pipeline } = await supabase
            .from('pipelines')
            .select('id')
            .eq('id', pipeline_id)
            .eq('user_id', user.id)
            .single();

        if (!pipeline) {
            return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
        }

        // Get current max order_index
        const { data: maxStage } = await supabase
            .from('pipeline_stages')
            .select('order_index')
            .eq('pipeline_id', pipeline_id)
            .order('order_index', { ascending: false })
            .limit(1)
            .single();

        const nextOrder = (maxStage?.order_index ?? -1) + 1;

        const { data: stage, error } = await supabase
            .from('pipeline_stages')
            .insert({
                pipeline_id,
                name,
                description: description || '',
                color: color || '#6366f1',
                order_index: nextOrder,
                capi_event_name: capi_event_name || null,
            })
            .select()
            .single();

        if (error) {
            console.error('Failed to create stage:', error);
            return NextResponse.json({ error: 'Failed to create stage' }, { status: 500 });
        }

        return NextResponse.json({ stage }, { status: 201 });
    } catch (err) {
        console.error('Invalid request body:', err);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}

// DELETE /api/pipeline-stages - Delete a stage
export async function DELETE(request: NextRequest) {
    const authClient = await createServerClientWithCookies();
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { stage_id } = body;

        if (!stage_id) {
            return NextResponse.json({ error: 'stage_id is required' }, { status: 400 });
        }

        // Verify stage belongs to user's pipeline
        const { data: stage } = await supabase
            .from('pipeline_stages')
            .select('id, pipeline_id')
            .eq('id', stage_id)
            .single();

        if (!stage) {
            return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
        }

        // Verify pipeline ownership
        const { data: pipeline } = await supabase
            .from('pipelines')
            .select('user_id')
            .eq('id', stage.pipeline_id)
            .single();

        if (!pipeline || pipeline.user_id !== user.id) {
            return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
        }

        // Delete the stage
        const { error } = await supabase
            .from('pipeline_stages')
            .delete()
            .eq('id', stage_id);

        if (error) {
            console.error('Failed to delete stage:', error);
            return NextResponse.json({ error: 'Failed to delete stage' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Stage deleted' });
    } catch (err) {
        console.error('Invalid request body:', err);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}

// PUT /api/pipeline-stages - Update a stage
export async function PUT(request: NextRequest) {
    const authClient = await createServerClientWithCookies();
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { stage_id, name, description, color, capi_event_name, order_index } = body;

        if (!stage_id) {
            return NextResponse.json({ error: 'stage_id is required' }, { status: 400 });
        }

        // Verify stage belongs to user's pipeline
        const { data: existingStage } = await supabase
            .from('pipeline_stages')
            .select('id, pipeline_id')
            .eq('id', stage_id)
            .single();

        if (!existingStage) {
            return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
        }

        // Verify pipeline ownership
        const { data: ownerPipeline } = await supabase
            .from('pipelines')
            .select('user_id')
            .eq('id', existingStage.pipeline_id)
            .single();

        if (!ownerPipeline || ownerPipeline.user_id !== user.id) {
            return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
        }

        // Update the stage
        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (color !== undefined) updateData.color = color;
        if (capi_event_name !== undefined) updateData.capi_event_name = capi_event_name;
        if (order_index !== undefined) updateData.order_index = order_index;

        const { data: stage, error } = await supabase
            .from('pipeline_stages')
            .update(updateData)
            .eq('id', stage_id)
            .select()
            .single();

        if (error) {
            console.error('Failed to update stage:', error);
            return NextResponse.json({ error: 'Failed to update stage' }, { status: 500 });
        }

        return NextResponse.json({ stage });
    } catch (err) {
        console.error('Invalid request body:', err);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
