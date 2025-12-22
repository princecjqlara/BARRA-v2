/**
 * Facebook Ads Insights API Service
 * Fetches ad performance metrics: CTR, CPM, CPC, impressions, spend, etc.
 */

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface AdInsight {
    ad_id: string;
    ad_name?: string;
    adset_id?: string;
    adset_name?: string;
    campaign_id?: string;
    campaign_name?: string;
    date_start: string;
    date_stop: string;
    // Core metrics
    impressions: number;
    clicks: number;
    reach: number;
    spend: number;
    // Calculated metrics
    ctr: number;
    cpc: number;
    cpm: number;
    cpp: number;
    frequency: number;
    // Additional metrics
    unique_clicks?: number;
    unique_ctr?: number;
    inline_link_clicks?: number;
    outbound_clicks?: number;
    // Actions (leads, purchases, etc.)
    actions?: { action_type: string; value: string }[];
    cost_per_action_type?: { action_type: string; value: string }[];
}

export interface CampaignInsight {
    campaign_id: string;
    campaign_name: string;
    status: string;
    objective: string;
    date_start: string;
    date_stop: string;
    impressions: number;
    clicks: number;
    reach: number;
    spend: number;
    ctr: number;
    cpc: number;
    cpm: number;
    frequency: number;
    actions?: { action_type: string; value: string }[];
    cost_per_action_type?: { action_type: string; value: string }[];
}

/**
 * Get insights for all ads in an ad account
 */
export async function getAdAccountInsights(
    adAccountId: string,
    accessToken: string,
    datePreset: string = 'last_30d'
): Promise<AdInsight[]> {
    const formattedAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

    const fields = [
        'ad_id',
        'ad_name',
        'adset_id',
        'adset_name',
        'campaign_id',
        'campaign_name',
        'impressions',
        'clicks',
        'reach',
        'spend',
        'ctr',
        'cpc',
        'cpm',
        'cpp',
        'frequency',
        'unique_clicks',
        'unique_ctr',
        'inline_link_clicks',
        'outbound_clicks',
        'actions',
        'cost_per_action_type',
        'date_start',
        'date_stop',
    ].join(',');

    const response = await fetch(
        `${GRAPH_API_BASE}/${formattedAccountId}/insights?` +
        `fields=${fields}` +
        `&level=ad` +
        `&date_preset=${datePreset}` +
        `&access_token=${accessToken}`
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get ad insights: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return (data.data || []).map(parseInsight);
}

/**
 * Get insights for all campaigns in an ad account
 */
export async function getCampaignInsights(
    adAccountId: string,
    accessToken: string,
    datePreset: string = 'last_30d'
): Promise<CampaignInsight[]> {
    const formattedAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

    const fields = [
        'campaign_id',
        'campaign_name',
        'impressions',
        'clicks',
        'reach',
        'spend',
        'ctr',
        'cpc',
        'cpm',
        'frequency',
        'actions',
        'cost_per_action_type',
        'date_start',
        'date_stop',
    ].join(',');

    const response = await fetch(
        `${GRAPH_API_BASE}/${formattedAccountId}/insights?` +
        `fields=${fields}` +
        `&level=campaign` +
        `&date_preset=${datePreset}` +
        `&access_token=${accessToken}`
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get campaign insights: ${JSON.stringify(error)}`);
    }

    const data = await response.json();

    // Also get campaign status and objective
    const campaignsResponse = await fetch(
        `${GRAPH_API_BASE}/${formattedAccountId}/campaigns?` +
        `fields=id,name,status,objective` +
        `&access_token=${accessToken}`
    );

    const campaignsData = await campaignsResponse.json();
    const campaignMeta: Record<string, { status: string; objective: string }> = {};

    for (const campaign of campaignsData.data || []) {
        campaignMeta[campaign.id] = {
            status: campaign.status,
            objective: campaign.objective,
        };
    }

    return (data.data || []).map((insight: Record<string, unknown>) => ({
        ...parseInsight(insight),
        status: campaignMeta[insight.campaign_id as string]?.status || 'UNKNOWN',
        objective: campaignMeta[insight.campaign_id as string]?.objective || 'UNKNOWN',
    }));
}

/**
 * Get daily breakdown of ad insights
 */
export async function getAdInsightsDaily(
    adAccountId: string,
    accessToken: string,
    startDate: string,
    endDate: string
): Promise<AdInsight[]> {
    const formattedAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

    const fields = [
        'ad_id',
        'ad_name',
        'adset_id',
        'adset_name',
        'campaign_id',
        'campaign_name',
        'impressions',
        'clicks',
        'reach',
        'spend',
        'ctr',
        'cpc',
        'cpm',
        'cpp',
        'frequency',
        'actions',
        'cost_per_action_type',
        'date_start',
        'date_stop',
    ].join(',');

    const response = await fetch(
        `${GRAPH_API_BASE}/${formattedAccountId}/insights?` +
        `fields=${fields}` +
        `&level=ad` +
        `&time_increment=1` +
        `&time_range={"since":"${startDate}","until":"${endDate}"}` +
        `&access_token=${accessToken}`
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get daily ad insights: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return (data.data || []).map(parseInsight);
}

/**
 * Get insights for a specific ad
 */
export async function getAdInsights(
    adId: string,
    accessToken: string,
    datePreset: string = 'lifetime'
): Promise<AdInsight | null> {
    const fields = [
        'ad_id',
        'ad_name',
        'adset_id',
        'adset_name',
        'campaign_id',
        'campaign_name',
        'impressions',
        'clicks',
        'reach',
        'spend',
        'ctr',
        'cpc',
        'cpm',
        'cpp',
        'frequency',
        'unique_clicks',
        'unique_ctr',
        'inline_link_clicks',
        'outbound_clicks',
        'actions',
        'cost_per_action_type',
        'date_start',
        'date_stop',
    ].join(',');

    const response = await fetch(
        `${GRAPH_API_BASE}/${adId}/insights?` +
        `fields=${fields}` +
        `&date_preset=${datePreset}` +
        `&access_token=${accessToken}`
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get ad insights: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return data.data?.[0] ? parseInsight(data.data[0]) : null;
}

/**
 * Parse raw insight data into typed format
 */
function parseInsight(raw: Record<string, unknown>): AdInsight {
    return {
        ad_id: raw.ad_id as string || '',
        ad_name: raw.ad_name as string,
        adset_id: raw.adset_id as string,
        adset_name: raw.adset_name as string,
        campaign_id: raw.campaign_id as string,
        campaign_name: raw.campaign_name as string,
        date_start: raw.date_start as string || '',
        date_stop: raw.date_stop as string || '',
        impressions: parseInt(raw.impressions as string || '0', 10),
        clicks: parseInt(raw.clicks as string || '0', 10),
        reach: parseInt(raw.reach as string || '0', 10),
        spend: parseFloat(raw.spend as string || '0'),
        ctr: parseFloat(raw.ctr as string || '0'),
        cpc: parseFloat(raw.cpc as string || '0'),
        cpm: parseFloat(raw.cpm as string || '0'),
        cpp: parseFloat(raw.cpp as string || '0'),
        frequency: parseFloat(raw.frequency as string || '0'),
        unique_clicks: raw.unique_clicks ? parseInt(raw.unique_clicks as string, 10) : undefined,
        unique_ctr: raw.unique_ctr ? parseFloat(raw.unique_ctr as string) : undefined,
        inline_link_clicks: raw.inline_link_clicks ? parseInt(raw.inline_link_clicks as string, 10) : undefined,
        outbound_clicks: raw.outbound_clicks ? parseInt(raw.outbound_clicks as string, 10) : undefined,
        actions: raw.actions as { action_type: string; value: string }[],
        cost_per_action_type: raw.cost_per_action_type as { action_type: string; value: string }[],
    };
}

/**
 * Extract lead count from actions
 */
export function getLeadCount(actions?: { action_type: string; value: string }[]): number {
    if (!actions) return 0;
    const leadAction = actions.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
    return leadAction ? parseInt(leadAction.value, 10) : 0;
}

/**
 * Extract cost per lead from cost_per_action_type
 */
export function getCostPerLead(costPerAction?: { action_type: string; value: string }[]): number {
    if (!costPerAction) return 0;
    const leadCost = costPerAction.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
    return leadCost ? parseFloat(leadCost.value) : 0;
}

/**
 * Get all metrics for a specific ad (used in contact detail view)
 */
export async function getMetricsForAd(
    adId: string,
    accessToken: string
): Promise<{
    impressions: number;
    clicks: number;
    reach: number;
    spend: number;
    ctr: number;
    cpc: number;
    cpm: number;
    leads: number;
    cost_per_lead: number;
} | null> {
    const insights = await getAdInsights(adId, accessToken, 'lifetime');

    if (!insights) return null;

    return {
        impressions: insights.impressions,
        clicks: insights.clicks,
        reach: insights.reach,
        spend: insights.spend,
        ctr: insights.ctr,
        cpc: insights.cpc,
        cpm: insights.cpm,
        leads: getLeadCount(insights.actions),
        cost_per_lead: getCostPerLead(insights.cost_per_action_type),
    };
}
