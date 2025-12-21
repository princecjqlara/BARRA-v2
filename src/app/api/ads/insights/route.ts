import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import {
    getCampaignInsights,
    getAdAccountInsights,
    getLeadCount,
    getCostPerLead
} from '@/lib/services/adsInsightsService';

// GET /api/ads/insights - Get ad insights for the user
export async function GET(request: NextRequest) {
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const level = searchParams.get('level') || 'campaign'; // 'campaign' or 'ad'
    const datePreset = searchParams.get('date_preset') || 'last_30d';

    try {
        // Get user's Facebook config
        const { data: fbConfig, error: configError } = await supabase
            .from('facebook_configs')
            .select('*')
            .eq('user_id', user.id)
            .not('ad_account_id', 'is', null)
            .single();

        if (configError || !fbConfig?.ad_account_id) {
            return NextResponse.json({
                error: 'No ad account connected. Please connect your Facebook account first.'
            }, { status: 400 });
        }

        // Check if we have cached data
        const { data: cachedMetrics } = await supabase
            .from('campaign_metrics')
            .select('*')
            .eq('user_id', user.id)
            .order('last_synced_at', { ascending: false });

        // If cache is less than 15 minutes old, return cached data
        const cacheAge = cachedMetrics?.[0]?.last_synced_at
            ? (Date.now() - new Date(cachedMetrics[0].last_synced_at).getTime()) / 1000 / 60
            : Infinity;

        if (cacheAge < 15 && cachedMetrics && cachedMetrics.length > 0) {
            return NextResponse.json({
                insights: cachedMetrics,
                cached: true,
                cache_age_minutes: Math.round(cacheAge),
            });
        }

        // Fetch fresh data from Facebook
        let insights;
        if (level === 'campaign') {
            insights = await getCampaignInsights(
                fbConfig.ad_account_id,
                fbConfig.page_access_token,
                datePreset
            );
        } else {
            insights = await getAdAccountInsights(
                fbConfig.ad_account_id,
                fbConfig.page_access_token,
                datePreset
            );
        }

        // Transform and cache the data
        if (level === 'campaign') {
            for (const insight of insights) {
                const leads = getLeadCount(insight.actions);
                const costPerLead = getCostPerLead(insight.cost_per_action_type);

                await supabase
                    .from('campaign_metrics')
                    .upsert({
                        user_id: user.id,
                        campaign_id: insight.campaign_id,
                        campaign_name: insight.campaign_name,
                        status: (insight as { status?: string }).status || 'UNKNOWN',
                        objective: (insight as { objective?: string }).objective || 'UNKNOWN',
                        lifetime_impressions: insight.impressions,
                        lifetime_clicks: insight.clicks,
                        lifetime_reach: insight.reach,
                        lifetime_spend: insight.spend,
                        lifetime_leads: leads,
                        avg_ctr: insight.ctr,
                        avg_cpc: insight.cpc,
                        avg_cpm: insight.cpm,
                        avg_cost_per_lead: costPerLead,
                        last_synced_at: new Date().toISOString(),
                    }, {
                        onConflict: 'user_id,campaign_id',
                    });
            }
        }

        return NextResponse.json({
            insights: insights.map(insight => ({
                ...insight,
                leads: getLeadCount(insight.actions),
                cost_per_lead: getCostPerLead(insight.cost_per_action_type),
            })),
            cached: false,
        });
    } catch (error) {
        console.error('Failed to get ad insights:', error);
        return NextResponse.json({
            error: 'Failed to fetch ad insights from Facebook'
        }, { status: 500 });
    }
}

// POST /api/ads/insights - Force refresh ad insights
export async function POST(request: NextRequest) {
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const datePreset = body.date_preset || 'last_30d';

        // Get user's Facebook config
        const { data: fbConfig, error: configError } = await supabase
            .from('facebook_configs')
            .select('*')
            .eq('user_id', user.id)
            .not('ad_account_id', 'is', null)
            .single();

        if (configError || !fbConfig?.ad_account_id) {
            return NextResponse.json({
                error: 'No ad account connected'
            }, { status: 400 });
        }

        // Fetch campaign-level insights
        const campaignInsights = await getCampaignInsights(
            fbConfig.ad_account_id,
            fbConfig.page_access_token,
            datePreset
        );

        // Fetch ad-level insights
        const adInsights = await getAdAccountInsights(
            fbConfig.ad_account_id,
            fbConfig.page_access_token,
            datePreset
        );

        // Cache campaign metrics
        for (const insight of campaignInsights) {
            const leads = getLeadCount(insight.actions);
            const costPerLead = getCostPerLead(insight.cost_per_action_type);

            await supabase
                .from('campaign_metrics')
                .upsert({
                    user_id: user.id,
                    campaign_id: insight.campaign_id,
                    campaign_name: insight.campaign_name,
                    status: (insight as { status?: string }).status || 'UNKNOWN',
                    objective: (insight as { objective?: string }).objective || 'UNKNOWN',
                    lifetime_impressions: insight.impressions,
                    lifetime_clicks: insight.clicks,
                    lifetime_reach: insight.reach,
                    lifetime_spend: insight.spend,
                    lifetime_leads: leads,
                    avg_ctr: insight.ctr,
                    avg_cpc: insight.cpc,
                    avg_cpm: insight.cpm,
                    avg_cost_per_lead: costPerLead,
                    last_synced_at: new Date().toISOString(),
                }, {
                    onConflict: 'user_id,campaign_id',
                });
        }

        // Cache ad metrics
        for (const insight of adInsights) {
            const leads = getLeadCount(insight.actions);
            const costPerLead = getCostPerLead(insight.cost_per_action_type);

            await supabase
                .from('facebook_ads_cache')
                .upsert({
                    user_id: user.id,
                    ad_id: insight.ad_id,
                    ad_name: insight.ad_name,
                    adset_id: insight.adset_id,
                    adset_name: insight.adset_name,
                    campaign_id: insight.campaign_id,
                    campaign_name: insight.campaign_name,
                    impressions: insight.impressions,
                    clicks: insight.clicks,
                    reach: insight.reach,
                    spend: insight.spend,
                    ctr: insight.ctr,
                    cpc: insight.cpc,
                    cpm: insight.cpm,
                    cpp: insight.cpp,
                    frequency: insight.frequency,
                    cost_per_lead: costPerLead,
                    leads_count: leads,
                    actions: insight.actions || [],
                    date_start: insight.date_start,
                    date_stop: insight.date_stop,
                    last_synced_at: new Date().toISOString(),
                }, {
                    onConflict: 'user_id,ad_id',
                });
        }

        return NextResponse.json({
            synced: true,
            campaigns: campaignInsights.length,
            ads: adInsights.length,
        });
    } catch (error) {
        console.error('Failed to sync ad insights:', error);
        return NextResponse.json({
            error: 'Failed to sync ad insights'
        }, { status: 500 });
    }
}
