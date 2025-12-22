import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServerClientWithCookies } from '@/lib/supabase/client';

// DELETE /api/facebook-config/[id] - Delete a Facebook configuration
export async function DELETE(
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
        // Delete the config (only if owned by user)
        const { error } = await supabase
            .from('facebook_configs')
            .delete()
            .eq('id', configId)
            .eq('user_id', user.id);

        if (error) {
            console.error('Failed to delete facebook config:', error);
            return NextResponse.json({ error: 'Failed to delete configuration' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Facebook page disconnected successfully',
        });
    } catch (error) {
        console.error('Failed to delete facebook config:', error);
        return NextResponse.json({ error: 'Failed to delete configuration' }, { status: 500 });
    }
}
