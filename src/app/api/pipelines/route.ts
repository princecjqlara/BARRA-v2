import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

// GET /api/pipelines - List pipelines
export async function GET() {
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: pipelines, error } = await supabase
        .from('pipelines')
        .select(`
      *,
      pipeline_stages (
        *
      )
    `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to fetch pipelines:', error);
        return NextResponse.json({ error: 'Failed to fetch pipelines' }, { status: 500 });
    }

    // Sort stages by order_index
    const pipelinesWithSortedStages = pipelines?.map(p => ({
        ...p,
        pipeline_stages: p.pipeline_stages?.sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index),
    }));

    return NextResponse.json({ pipelines: pipelinesWithSortedStages });
}

// POST /api/pipelines - Create pipeline
export async function POST(request: NextRequest) {
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();

        // Check if this should be the default pipeline
        if (body.is_default) {
            // Unset other default pipelines
            await supabase
                .from('pipelines')
                .update({ is_default: false })
                .eq('user_id', user.id);
        }

        // Create pipeline
        const { data: pipeline, error } = await supabase
            .from('pipelines')
            .insert({
                user_id: user.id,
                name: body.name,
                description: body.description,
                is_default: body.is_default || false,
                ai_generated: body.ai_generated || false,
            })
            .select()
            .single();

        if (error) {
            console.error('Failed to create pipeline:', error);
            return NextResponse.json({ error: 'Failed to create pipeline' }, { status: 500 });
        }

        // If stages are provided, create them
        if (body.stages && Array.isArray(body.stages)) {
            const stagesToCreate = body.stages.map((stage: {
                name: string;
                description?: string;
                order_index: number;
                color?: string;
                requirements?: object;
                capi_event_name?: string;
            }, index: number) => ({
                pipeline_id: pipeline.id,
                name: stage.name,
                description: stage.description,
                order_index: stage.order_index ?? index,
                color: stage.color || '#6366f1',
                requirements: stage.requirements || { criteria: [] },
                capi_event_name: stage.capi_event_name,
            }));

            const { error: stagesError } = await supabase
                .from('pipeline_stages')
                .insert(stagesToCreate);

            if (stagesError) {
                console.error('Failed to create stages:', stagesError);
            }
        }

        // Fetch the complete pipeline with stages
        const { data: completePipeline } = await supabase
            .from('pipelines')
            .select(`
        *,
        pipeline_stages (*)
      `)
            .eq('id', pipeline.id)
            .single();

        return NextResponse.json({ pipeline: completePipeline }, { status: 201 });
    } catch (err) {
        console.error('Invalid request body:', err);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
