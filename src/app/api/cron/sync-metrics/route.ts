import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getCampaignInsights, getAdAccountInsights, getLeadCount, getCostPerLead } from '@/lib/services/adsInsightsService';

/**
 * GET /api/cron/sync-metrics - Sync ad metrics from Facebook
 * 
 * This endpoint is designed to be called by cron-job.org
 * Set up at: https://cron-job.org
 * 
 * Headers required:
 *   Authorization: Bearer YOUR_CRON_SECRET
 * 
 * Recommended schedule: Every 15-30 minutes
 */
export async function GET(request: NextRequest) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.log('⚠️ CRON_SECRET not configured');
        return NextResponse.json({
            error: 'Cron not configured',
            message: 'Set CRON_SECRET in environment variables'
        }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
        console.log('❌ Invalid cron authorization');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 CRON: Starting Ad Metrics Sync');
    console.log('Time:', new Date().toISOString());

    const supabase = createServerClient();
    const results: { user_id: string; campaigns: number; ads: number; error?: string }[] = [];

    try {
        // Get all users with Facebook Ad Accounts configured
        const { data: fbConfigs, error: configError } = await supabase
            .from('facebook_configs')
            .select('*')
            .not('ad_account_id', 'is', null);

        if (configError || !fbConfigs?.length) {
            console.log('⚠️ No Facebook configs with ad accounts found');
            return NextResponse.json({
                success: true,
                message: 'No ad accounts to sync',
                synced: 0,
            });
        }

        console.log(`📊 Found ${fbConfigs.length} ad account(s) to sync`);

        // Sync each user's ad account
        for (const config of fbConfigs) {
            console.log(`\n👤 Syncing user: ${config.user_id}`);

            try {
                // Fetch campaign insights
                const campaigns = await getCampaignInsights(
                    config.ad_account_id,
                    config.page_access_token,
                    'last_30d'
                );

                console.log(`   📈 Found ${campaigns.length} campaigns`);

                // Upsert campaign metrics
                for (const campaign of campaigns) {
                    await supabase
                        .from('campaign_metrics')
                        .upsert({
                            user_id: config.user_id,
                            campaign_id: campaign.campaign_id,
                            campaign_name: campaign.campaign_name,
                            status: campaign.status,
                            objective: campaign.objective,
                            lifetime_impressions: campaign.impressions,
                            lifetime_clicks: campaign.clicks,
                            lifetime_reach: campaign.reach,
                            lifetime_spend: campaign.spend,
                            lifetime_leads: getLeadCount(campaign.actions),
                            avg_ctr: campaign.ctr,
                            avg_cpc: campaign.cpc,
                            avg_cpm: campaign.cpm,
                            avg_cost_per_lead: getCostPerLead(campaign.cost_per_action_type),
                            last_synced_at: new Date().toISOString(),
                        }, {
                            onConflict: 'user_id,campaign_id',
                        });
                }

                // Fetch ad-level insights
                const ads = await getAdAccountInsights(
                    config.ad_account_id,
                    config.page_access_token,
                    'last_30d'
                );

                console.log(`   📢 Found ${ads.length} ads`);

                // Upsert ad cache
                for (const ad of ads) {
                    await supabase
                        .from('facebook_ads_cache')
                        .upsert({
                            user_id: config.user_id,
                            ad_id: ad.ad_id,
                            ad_name: ad.ad_name,
                            campaign_id: ad.campaign_id,
                            campaign_name: ad.campaign_name,
                            impressions: ad.impressions,
                            clicks: ad.clicks,
                            reach: ad.reach,
                            spend: ad.spend,
                            ctr: ad.ctr,
                            cpc: ad.cpc,
                            cpm: ad.cpm,
                            leads_count: getLeadCount(ad.actions),
                            cost_per_lead: getCostPerLead(ad.cost_per_action_type),
                            last_synced_at: new Date().toISOString(),
                        }, {
                            onConflict: 'user_id,ad_id',
                        });
                }

                results.push({
                    user_id: config.user_id,
                    campaigns: campaigns.length,
                    ads: ads.length,
                });

                console.log(`   ✅ Sync complete for user`);

            } catch (userError) {
                console.error(`   ❌ Error syncing user ${config.user_id}:`, userError);
                results.push({
                    user_id: config.user_id,
                    campaigns: 0,
                    ads: 0,
                    error: userError instanceof Error ? userError.message : 'Unknown error',
                });
            }
        }

        const totalCampaigns = results.reduce((sum, r) => sum + r.campaigns, 0);
        const totalAds = results.reduce((sum, r) => sum + r.ads, 0);
        const errors = results.filter(r => r.error).length;

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ CRON: Ad Metrics Sync Complete');
        console.log(`   Users synced: ${results.length}`);
        console.log(`   Total campaigns: ${totalCampaigns}`);
        console.log(`   Total ads: ${totalAds}`);
        console.log(`   Errors: ${errors}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        return NextResponse.json({
            success: true,
            message: 'Ad metrics synced successfully',
            synced_at: new Date().toISOString(),
            stats: {
                users: results.length,
                campaigns: totalCampaigns,
                ads: totalAds,
                errors: errors,
            },
            results,
        });

    } catch (error) {
        console.error('❌ CRON sync failed:', error);
        return NextResponse.json({
            success: false,
            error: 'Sync failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

// Also support POST for cron-job.org flexibility
export async function POST(request: NextRequest) {
    return GET(request);
}
