import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

/**
 * GET /api/test/status - Check the status of all integrations
 * Returns a comprehensive health check of the system
 */
export async function GET() {
    const supabase = createServerClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const checks: {
        name: string;
        status: 'ok' | 'warning' | 'error';
        details: string;
        action?: string;
    }[] = [];

    try {
        // Check 1: Facebook Config
        const { data: fbConfigs, error: fbError } = await supabase
            .from('facebook_configs')
            .select('*')
            .eq('user_id', user.id);

        if (fbError) {
            checks.push({
                name: 'Database Connection',
                status: 'error',
                details: 'Cannot connect to database',
                action: 'Check Supabase configuration',
            });
        } else if (!fbConfigs || fbConfigs.length === 0) {
            checks.push({
                name: 'Facebook Connection',
                status: 'error',
                details: 'No Facebook Page connected',
                action: 'Go to Settings → Connect Facebook',
            });
        } else {
            const config = fbConfigs[0];
            checks.push({
                name: 'Facebook Connection',
                status: 'ok',
                details: `Connected: ${config.page_name}`,
            });

            // Check webhook subscription
            if (config.webhook_subscribed) {
                checks.push({
                    name: 'Webhook Subscription',
                    status: 'ok',
                    details: 'Subscribed to leadgen events',
                });
            } else {
                checks.push({
                    name: 'Webhook Subscription',
                    status: 'warning',
                    details: 'Not subscribed to webhooks',
                    action: 'Reconnect Facebook Page',
                });
            }

            // Check Dataset/Pixel
            if (config.dataset_id) {
                checks.push({
                    name: 'CAPI Dataset',
                    status: 'ok',
                    details: `Dataset ID: ${config.dataset_id}`,
                });
            } else {
                checks.push({
                    name: 'CAPI Dataset',
                    status: 'warning',
                    details: 'No Dataset configured',
                    action: 'CAPI events will not be sent',
                });
            }

            // Check Ad Account
            if (config.ad_account_id) {
                checks.push({
                    name: 'Ad Account',
                    status: 'ok',
                    details: `Connected: ${config.ad_account_id}`,
                });
            } else {
                checks.push({
                    name: 'Ad Account',
                    status: 'warning',
                    details: 'No Ad Account connected',
                    action: 'Ad metrics will not be available',
                });
            }
        }

        // Check 2: Pipelines
        const { data: pipelines } = await supabase
            .from('pipelines')
            .select('*, pipeline_stages(count)')
            .eq('user_id', user.id);

        if (!pipelines || pipelines.length === 0) {
            checks.push({
                name: 'Pipelines',
                status: 'warning',
                details: 'No pipelines configured',
                action: 'Create a pipeline to organize leads',
            });
        } else {
            const defaultPipeline = pipelines.find(p => p.is_default);
            checks.push({
                name: 'Pipelines',
                status: 'ok',
                details: `${pipelines.length} pipeline(s), default: ${defaultPipeline?.name || 'None'}`,
            });
        }

        // Check 3: NVIDIA AI
        const nvidiaKey = process.env.NVIDIA_API_KEY;
        if (nvidiaKey && nvidiaKey !== 'placeholder') {
            checks.push({
                name: 'AI Service (NVIDIA)',
                status: 'ok',
                details: 'API key configured',
            });
        } else {
            checks.push({
                name: 'AI Service (NVIDIA)',
                status: 'warning',
                details: 'API key not configured',
                action: 'Add NVIDIA_API_KEY to environment',
            });
        }

        // Check 4: Recent Activity
        const { data: recentContacts, count } = await supabase
            .from('contacts')
            .select('id', { count: 'exact' })
            .eq('user_id', user.id)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        checks.push({
            name: 'Recent Leads (24h)',
            status: (count || 0) > 0 ? 'ok' : 'warning',
            details: `${count || 0} new leads in last 24 hours`,
        });

        // Overall status
        const hasErrors = checks.some(c => c.status === 'error');
        const hasWarnings = checks.some(c => c.status === 'warning');

        return NextResponse.json({
            overall: hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok',
            checks,
            timestamp: new Date().toISOString(),
            ready_for_production: !hasErrors && checks.filter(c => c.name.includes('Facebook')).every(c => c.status === 'ok'),
        });
    } catch (error) {
        console.error('Status check failed:', error);
        return NextResponse.json({
            overall: 'error',
            checks: [{
                name: 'System',
                status: 'error',
                details: error instanceof Error ? error.message : 'Unknown error',
            }],
        }, { status: 500 });
    }
}
