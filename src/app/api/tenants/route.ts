import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServerClientWithCookies } from '@/lib/supabase/client';

// Only this admin email can manage tenants
const ADMIN_EMAIL = 'cjlara032107@gmail.com';

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

// Check if user is admin
function isAdmin(email: string | undefined): boolean {
    return email === ADMIN_EMAIL;
}

/**
 * GET /api/tenants - List all tenants (admin sees all, owned by admin)
 */
export async function GET() {
    // Use cookie-aware client for auth
    const authClient = await createServerClientWithCookies();
    // Use service role client for data operations
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin can see tenants
    if (!isAdmin(user.email)) {
        return NextResponse.json({ error: 'Only admin can view tenants' }, { status: 403 });
    }

    try {
        // Get ALL tenants (admin sees everything)
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('*')
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
 * POST /api/tenants - Create a new tenant with their own auth account
 */
export async function POST(request: NextRequest) {
    // Use cookie-aware client for auth
    const authClient = await createServerClientWithCookies();
    // Use service role client for admin operations
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin can create tenants
    if (!isAdmin(user.email)) {
        return NextResponse.json({ error: 'Only admin can manage tenants' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const {
            name,
            description,
            contact_name,
            contact_email,
            contact_phone,
            logo_url,
            login_email,
            login_password
        } = body;

        if (!name || name.trim().length === 0) {
            return NextResponse.json({ error: 'Tenant name is required' }, { status: 400 });
        }

        if (!login_email || login_email.trim().length === 0) {
            return NextResponse.json({ error: 'Login email is required' }, { status: 400 });
        }

        if (!login_password || login_password.length < 6) {
            return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
        }

        // Step 1: Create auth user for the tenant using admin API
        const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
            email: login_email.trim(),
            password: login_password,
            email_confirm: true, // Auto-confirm the email
        });

        if (createUserError) {
            console.error('Failed to create auth user:', createUserError);
            // Check for duplicate email
            if (createUserError.message.includes('already') || createUserError.message.includes('exists')) {
                return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
            }
            return NextResponse.json({ error: `Failed to create user: ${createUserError.message}` }, { status: 500 });
        }

        if (!newUser.user) {
            return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 });
        }

        // Step 2: Create tenant linked to the new user
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .insert({
                user_id: newUser.user.id, // Link to the new user, not the admin
                name: name.trim(),
                description,
                contact_name,
                contact_email: contact_email || login_email, // Use login email as contact if not provided
                contact_phone,
                logo_url,
                is_active: true,
                settings: {},
            })
            .select()
            .single();

        if (tenantError) {
            console.error('Failed to create tenant:', tenantError);
            // Clean up: delete the auth user we just created
            await supabase.auth.admin.deleteUser(newUser.user.id);
            return NextResponse.json({ error: 'Failed to create tenant' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            tenant,
            message: `Tenant "${name}" created successfully. They can now log in with ${login_email}`,
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
    // Use cookie-aware client for auth
    const authClient = await createServerClientWithCookies();
    // Use service role client for data operations
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin can update tenants
    if (!isAdmin(user.email)) {
        return NextResponse.json({ error: 'Only admin can manage tenants' }, { status: 403 });
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
    // Use cookie-aware client for auth
    const authClient = await createServerClientWithCookies();
    // Use service role client for data operations
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin can delete tenants
    if (!isAdmin(user.email)) {
        return NextResponse.json({ error: 'Only admin can manage tenants' }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 });
        }

        // Get tenant info before deleting
        const { data: tenant } = await supabase
            .from('tenants')
            .select('name, user_id')
            .eq('id', id)
            .single();

        // Delete the tenant's auth user if exists
        if (tenant?.user_id) {
            await supabase.auth.admin.deleteUser(tenant.user_id);
        }

        // Delete tenant
        const { error } = await supabase
            .from('tenants')
            .delete()
            .eq('id', id);

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
