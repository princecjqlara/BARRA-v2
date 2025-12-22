import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServerClientWithCookies } from '@/lib/supabase/client';

// GET /api/contacts - List contacts
export async function GET(request: NextRequest) {
    const authClient = await createServerClientWithCookies();
    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Build query
    let query = supabase
        .from('contacts')
        .select(`
      *,
      contact_stage_assignments (
        id,
        stage_id,
        pipeline_id,
        assigned_by,
        notes,
        pipeline_stages (
          id,
          name,
          color
        )
      )
    `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    // Apply filters
    const stageId = searchParams.get('stage_id');
    const pipelineId = searchParams.get('pipeline_id');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (stageId) {
        query = query.eq('contact_stage_assignments.stage_id', stageId);
    }

    if (pipelineId) {
        query = query.eq('contact_stage_assignments.pipeline_id', pipelineId);
    }

    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: contacts, error } = await query;

    if (error) {
        console.error('Failed to fetch contacts:', error);
        return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
    }

    // Get total count
    const { count } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

    return NextResponse.json({
        contacts,
        pagination: {
            total: count || 0,
            limit,
            offset,
        },
    });
}

// POST /api/contacts - Create contact manually
export async function POST(request: NextRequest) {
    const authClient = await createServerClientWithCookies();
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();

        const { data: contact, error } = await supabase
            .from('contacts')
            .insert({
                user_id: user.id,
                email: body.email,
                phone: body.phone,
                first_name: body.first_name,
                last_name: body.last_name,
                full_name: body.full_name || `${body.first_name || ''} ${body.last_name || ''}`.trim(),
                custom_fields: body.custom_fields || {},
                source: 'manual',
            })
            .select()
            .single();

        if (error) {
            console.error('Failed to create contact:', error);
            return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
        }

        return NextResponse.json({ contact }, { status: 201 });
    } catch (err) {
        console.error('Invalid request body:', err);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
