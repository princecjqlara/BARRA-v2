import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

interface Tenant {
    id: string;
    user_id: string;
    name: string;
    description?: string;
    logo_url?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    is_active: boolean;
    settings: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

/**
 * GET /api/tenants - List all tenants for the user
 */
export async function GET() {
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Get tenants with stats
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('*')
            .eq('user_id', user.id)
            .order('name', { ascending: true });

        if (error) {
            console.error('Failed to fetch tenants:', error);
            return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 });
        }

        // Get stats for each tenant
        const tenantsWithStats = await Promise.all((tenants || []).map(async (tenant: Tenant) => {
            const [contactsRes, pipelinesRes, pagesRes, revenueRes] = await Promise.all([
                supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
                supabase.from('pipelines').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
                supabase.from('facebook_configs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
                supabase.from('revenue_tracking').select('amount').eq('tenant_id', tenant.id),
            ]);

            const totalRevenue = (revenueRes.data || []).reduce((sum: number, r: { amount: number }) => sum + (r.amount || 0), 0);

            return {
                ...tenant,
                stats: {
                    contacts: contactsRes.count || 0,
                    pipelines: pipelinesRes.count || 0,
                    pages: pagesRes.count || 0,
                    revenue: totalRevenue,
                },
            };
        }));

        return NextResponse.json({
            tenants: tenantsWithStats,
            count: tenants?.length || 0,
        });
    } catch (error) {
        console.error('Failed to fetch tenants:', error);
        return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 });
    }
}

/**
 * POST /api/tenants - Create a new tenant
 */
export async function POST(request: NextRequest) {
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { name, description, contact_name, contact_email, contact_phone, logo_url } = body;

        if (!name || name.trim().length === 0) {
            return NextResponse.json({ error: 'Tenant name is required' }, { status: 400 });
        }

        // Create tenant
        const { data: tenant, error } = await supabase
            .from('tenants')
            .insert({
                user_id: user.id,
                name: name.trim(),
                description,
                contact_name,
                contact_email,
                contact_phone,
                logo_url,
                is_active: true,
                settings: {},
            })
            .select()
            .single();

        if (error) {
            console.error('Failed to create tenant:', error);
            return NextResponse.json({ error: 'Failed to create tenant' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            tenant,
            message: `Tenant "${name}" created successfully`,
        });
    } catch (error) {
        console.error('Failed to create tenant:', error);
        return NextResponse.json({ error: 'Failed to create tenant' }, { status: 500 });
    }
}

/**
 * PUT /api/tenants - Update a tenant
 */
export async function PUT(request: NextRequest) {
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { id, name, description, contact_name, contact_email, contact_phone, logo_url, is_active } = body;

        if (!id) {
            return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 });
        }

        // Update tenant
        const { data: tenant, error } = await supabase
            .from('tenants')
            .update({
                name,
                description,
                contact_name,
                contact_email,
                contact_phone,
                logo_url,
                is_active,
            })
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error) {
            console.error('Failed to update tenant:', error);
            return NextResponse.json({ error: 'Failed to update tenant' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            tenant,
            message: 'Tenant updated successfully',
        });
    } catch (error) {
        console.error('Failed to update tenant:', error);
        return NextResponse.json({ error: 'Failed to update tenant' }, { status: 500 });
    }
}

/**
 * DELETE /api/tenants - Delete a tenant
 */
export async function DELETE(request: NextRequest) {
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 });
        }

        // Get tenant name before deleting
        const { data: tenant } = await supabase
            .from('tenants')
            .select('name')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        // Delete tenant
        const { error } = await supabase
            .from('tenants')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) {
            console.error('Failed to delete tenant:', error);
            return NextResponse.json({ error: 'Failed to delete tenant' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: `Tenant "${tenant?.name}" deleted successfully`,
        });
    } catch (error) {
        console.error('Failed to delete tenant:', error);
        return NextResponse.json({ error: 'Failed to delete tenant' }, { status: 500 });
    }
}
