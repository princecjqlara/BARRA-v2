import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { sendConversionEvent } from '@/lib/services/facebookService';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/test/capi - Send a test event to Facebook CAPI
 * This allows users to verify their CAPI integration is working
 */
export async function POST(request: NextRequest) {
    const supabase = createServerClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const eventName = body.event_name || 'Lead';
        const testCode = body.test_event_code; // Optional: Facebook Test Event Code

        // Get user's Facebook config
        const { data: fbConfig, error: configError } = await supabase
            .from('facebook_configs')
            .select('*')
            .eq('user_id', user.id)
            .not('dataset_id', 'is', null)
            .single();

        if (configError || !fbConfig?.dataset_id) {
            return NextResponse.json({
                success: false,
                error: 'No Facebook Dataset configured. Please connect your Facebook account first.',
                step: 'config_check',
            }, { status: 400 });
        }

        // Create test user data
        const testUserData = {
            email: body.test_email || `test-${Date.now()}@example.com`,
            phone: body.test_phone || '+1234567890',
            firstName: 'Test',
            lastName: 'User',
            externalId: `test-${uuidv4()}`,
        };

        // Use CAPI access token if available, otherwise fallback to page token
        const accessToken = fbConfig.capi_access_token || fbConfig.page_access_token;

        // Send test event to Facebook CAPI
        const result = await sendConversionEvent(
            fbConfig.dataset_id,
            accessToken,
            eventName,
            testUserData,
            {
                test_event_code: testCode,
                currency: 'USD',
                value: 1.00,
            }
        );

        // Log the test event
        await supabase.from('conversions').insert({
            user_id: user.id,
            facebook_ad_id: null,
            facebook_campaign_id: null,
            event_name: `TEST_${eventName}`,
            event_value: 0,
            capi_event_id: result.fbtrace_id,
            sent_to_facebook: true,
        });

        return NextResponse.json({
            success: true,
            message: `Test event "${eventName}" sent successfully!`,
            details: {
                events_received: result.events_received,
                fbtrace_id: result.fbtrace_id,
                dataset_id: fbConfig.dataset_id,
                page_name: fbConfig.page_name,
            },
            next_steps: [
                'Go to Facebook Events Manager to verify the event',
                `Look for event: ${eventName}`,
                testCode ? `Filter by test event code: ${testCode}` : 'Check the "Test Events" tab if you provided a test code',
            ],
        });
    } catch (error) {
        console.error('Test CAPI event failed:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send test event',
            step: 'send_event',
            troubleshooting: [
                'Check that your Facebook access token is still valid',
                'Verify the Dataset ID is correct',
                'Ensure your app has the required permissions',
            ],
        }, { status: 500 });
    }
}
