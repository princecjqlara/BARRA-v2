import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { sendConversionEvent } from '@/lib/services/facebookService';

/**
 * POST /api/revenue - Record revenue for a contact
 * This tracks actual revenue and sends conversion event to Facebook CAPI
 */
export async function POST(request: NextRequest) {
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            contact_id,
            amount,
            currency = 'USD',
            revenue_type = 'sale',
            description,
            send_to_facebook = true,
        } = body;

        if (!contact_id || !amount) {
            return NextResponse.json({
                error: 'contact_id and amount are required'
            }, { status: 400 });
        }

        // Get contact with ad attribution
        const { data: contact, error: contactError } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', contact_id)
            .eq('user_id', user.id)
            .single();

        if (contactError || !contact) {
            return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
        }

        // Record revenue
        const { data: revenue, error: revenueError } = await supabase
            .from('revenue_tracking')
            .insert({
                user_id: user.id,
                contact_id,
                facebook_ad_id: contact.facebook_ad_id,
                facebook_campaign_id: contact.facebook_campaign_id,
                amount,
                currency,
                revenue_type,
                description,
            })
            .select()
            .single();

        if (revenueError) {
            console.error('Failed to record revenue:', revenueError);
            return NextResponse.json({ error: 'Failed to record revenue' }, { status: 500 });
        }

        // Update contact's actual revenue
        const { data: currentContact } = await supabase
            .from('contacts')
            .select('actual_revenue')
            .eq('id', contact_id)
            .single();

        await supabase
            .from('contacts')
            .update({
                actual_revenue: (currentContact?.actual_revenue || 0) + amount,
                converted_at: contact.converted_at || new Date().toISOString(),
            })
            .eq('id', contact_id);

        // Send Purchase event to Facebook CAPI
        let capiResult = null;
        if (send_to_facebook) {
            const { data: fbConfig } = await supabase
                .from('facebook_configs')
                .select('*')
                .eq('user_id', user.id)
                .not('dataset_id', 'is', null)
                .single();

            if (fbConfig?.dataset_id) {
                try {
                    capiResult = await sendConversionEvent(
                        fbConfig.dataset_id,
                        fbConfig.page_access_token,
                        'Purchase',
                        {
                            email: contact.email,
                            phone: contact.phone,
                            firstName: contact.first_name,
                            lastName: contact.last_name,
                            externalId: contact.id,
                        },
                        {
                            value: amount,
                            currency: currency,
                            content_name: description || 'Lead Conversion',
                            content_type: revenue_type,
                        }
                    );

                    // Update revenue record with CAPI event ID
                    await supabase
                        .from('revenue_tracking')
                        .update({
                            capi_event_sent: true,
                            capi_event_id: capiResult.fbtrace_id,
                        })
                        .eq('id', revenue.id);

                    // Update contact
                    await supabase
                        .from('contacts')
                        .update({ conversion_event_sent: true })
                        .eq('id', contact_id);

                } catch (capiError) {
                    console.error('Failed to send CAPI event:', capiError);
                }
            }
        }

        return NextResponse.json({
            success: true,
            revenue: {
                id: revenue.id,
                amount,
                currency,
                contact_id,
            },
            capi_sent: !!capiResult,
            message: `Revenue of ${currency} ${amount} recorded successfully`,
        });
    } catch (error) {
        console.error('Revenue recording failed:', error);
        return NextResponse.json({
            error: 'Failed to record revenue'
        }, { status: 500 });
    }
}

/**
 * GET /api/revenue - Get revenue summary
 */
export async function GET(request: NextRequest) {
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const groupBy = searchParams.get('group_by') || 'campaign'; // 'campaign', 'ad', 'day'
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    try {
        let query = supabase
            .from('revenue_tracking')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (startDate) {
            query = query.gte('revenue_date', startDate);
        }
        if (endDate) {
            query = query.lte('revenue_date', endDate);
        }

        const { data: revenues, error } = await query;

        if (error) {
            return NextResponse.json({ error: 'Failed to fetch revenue' }, { status: 500 });
        }

        // Calculate totals
        const total = revenues?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;

        // Group by campaign
        const byCampaign: Record<string, { campaign_id: string; campaign_name: string; total: number; count: number }> = {};
        for (const r of revenues || []) {
            const key = r.facebook_campaign_id || 'unknown';
            if (!byCampaign[key]) {
                byCampaign[key] = {
                    campaign_id: r.facebook_campaign_id,
                    campaign_name: r.facebook_campaign_id || 'Manual/Unknown',
                    total: 0,
                    count: 0,
                };
            }
            byCampaign[key].total += r.amount || 0;
            byCampaign[key].count += 1;
        }

        // Get ad spend for ROAS calculation
        const { data: campaignMetrics } = await supabase
            .from('campaign_metrics')
            .select('campaign_id, lifetime_spend')
            .eq('user_id', user.id);

        const spendByCampaign: Record<string, number> = {};
        for (const cm of campaignMetrics || []) {
            spendByCampaign[cm.campaign_id] = cm.lifetime_spend || 0;
        }

        // Calculate ROAS per campaign
        const campaignRoas = Object.values(byCampaign).map(c => ({
            ...c,
            spend: spendByCampaign[c.campaign_id] || 0,
            roas: spendByCampaign[c.campaign_id] > 0
                ? (c.total / spendByCampaign[c.campaign_id]).toFixed(2)
                : 'N/A',
        }));

        return NextResponse.json({
            total_revenue: total,
            revenue_count: revenues?.length || 0,
            by_campaign: campaignRoas,
            recent: revenues?.slice(0, 10),
        });
    } catch (error) {
        console.error('Failed to get revenue:', error);
        return NextResponse.json({ error: 'Failed to get revenue' }, { status: 500 });
    }
}

