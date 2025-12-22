'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface CampaignInsight {
    campaign_id: string;
    campaign_name: string;
    status: string;
    objective: string;
    impressions: number;
    clicks: number;
    reach: number;
    spend: number;
    ctr: number;
    cpc: number;
    cpm: number;
    frequency: number;
    leads: number;
    cost_per_lead: number;
}

interface AdInsight {
    ad_id: string;
    ad_name: string;
    campaign_name: string;
    impressions: number;
    clicks: number;
    reach: number;
    spend: number;
    ctr: number;
    cpc: number;
    cpm: number;
    leads: number;
    cost_per_lead: number;
}

export default function AdsPage() {
    const [campaigns, setCampaigns] = useState<CampaignInsight[]>([]);
    const [ads, setAds] = useState<AdInsight[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [activeTab, setActiveTab] = useState<'campaigns' | 'ads'>('campaigns');
    const [datePreset, setDatePreset] = useState('last_30d');
    const [error, setError] = useState<string | null>(null);
    const [cached, setCached] = useState(false);

    useEffect(() => {
        loadInsights();
    }, [datePreset]);

    async function loadInsights() {
        try {
            setLoading(true);
            setError(null);

            const [campaignsRes, adsRes] = await Promise.all([
                fetch(`/api/ads/insights?level=campaign&date_preset=${datePreset}`),
                fetch(`/api/ads/insights?level=ad&date_preset=${datePreset}`),
            ]);

            const campaignsData = await campaignsRes.json();
            const adsData = await adsRes.json();

            if (campaignsData.error) {
                setError(campaignsData.error);
                setCampaigns([]);
                setAds([]);
                return;
            }

            if (adsData.error) {
                // Still show campaigns even if ads fail
                setCampaigns(campaignsData.insights || []);
                setAds([]);
                setCached(campaignsData.cached || false);
                return;
            }

            setCampaigns(campaignsData.insights || []);
            setAds(adsData.insights || []);
            setCached(campaignsData.cached || false);
        } catch (err) {
            console.error('Failed to load insights:', err);
            setError('Failed to load ad insights. Please check your connection.');
            setCampaigns([]);
            setAds([]);
        } finally {
            setLoading(false);
        }
    }

    async function syncInsights() {
        setSyncing(true);
        try {
            const res = await fetch('/api/ads/insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date_preset: datePreset }),
            });

            const data = await res.json();
            if (data.synced) {
                await loadInsights();
            } else {
                setError(data.error || 'Failed to sync');
            }
        } catch (err) {
            console.error('Failed to sync:', err);
            setError('Failed to sync insights');
        } finally {
            setSyncing(false);
        }
    }

    function formatNumber(num: number): string {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return num.toString();
    }

    function formatMoney(amount: number): string {
        return `$${amount.toFixed(2)}`;
    }

    function formatPercent(value: number): string {
        return `${value.toFixed(2)}%`;
    }

    // Calculate totals
    const totals = campaigns.reduce(
        (acc, c) => ({
            impressions: acc.impressions + c.impressions,
            clicks: acc.clicks + c.clicks,
            reach: acc.reach + c.reach,
            spend: acc.spend + c.spend,
            leads: acc.leads + c.leads,
        }),
        { impressions: 0, clicks: 0, reach: 0, spend: 0, leads: 0 }
    );

    const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const avgCpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
    const avgCpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
    const avgCpl = totals.leads > 0 ? totals.spend / totals.leads : 0;

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="min-h-screen p-8">
            {/* Header */}
            <header className="mb-8">
                <h1 className="text-4xl font-bold gradient-text mb-2">
                    Ad Analytics
                </h1>
                <p className="text-slate-400">
                    Track your Facebook ad performance metrics
                </p>
            </header>

            {/* Navigation */}
            <nav className="flex gap-4 mb-8">
                <Link href="/" className="btn-secondary">Dashboard</Link>
                <Link href="/pipelines" className="btn-secondary">Pipelines</Link>
                <Link href="/contacts" className="btn-secondary">Contacts</Link>
                <Link href="/ads" className="btn-primary">Ads</Link>
                <Link href="/tenants" className="btn-secondary">Tenants</Link>
                <Link href="/settings" className="btn-secondary">Settings</Link>
            </nav>

            {/* Error */}
            {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400">
                    {error}
                </div>
            )}

            {/* Controls */}
            <div className="flex flex-wrap gap-4 mb-8">
                <select
                    className="input-field w-48"
                    value={datePreset}
                    onChange={(e) => setDatePreset(e.target.value)}
                >
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last_7d">Last 7 Days</option>
                    <option value="last_14d">Last 14 Days</option>
                    <option value="last_30d">Last 30 Days</option>
                    <option value="last_90d">Last 90 Days</option>
                    <option value="lifetime">Lifetime</option>
                </select>

                <button
                    onClick={syncInsights}
                    className="btn-primary"
                    disabled={syncing}
                >
                    {syncing ? (
                        <span className="flex items-center gap-2">
                            <div className="spinner w-4 h-4" /> Syncing...
                        </span>
                    ) : (
                        '🔄 Sync from Facebook'
                    )}
                </button>

                {cached && (
                    <span className="text-sm text-slate-500 flex items-center">
                        📦 Showing cached data
                    </span>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
                <div className="glass-card p-4">
                    <div className="text-2xl font-bold">{formatNumber(totals.impressions)}</div>
                    <div className="text-sm text-slate-400">Impressions</div>
                </div>
                <div className="glass-card p-4">
                    <div className="text-2xl font-bold">{formatNumber(totals.clicks)}</div>
                    <div className="text-sm text-slate-400">Clicks</div>
                </div>
                <div className="glass-card p-4">
                    <div className="text-2xl font-bold">{formatPercent(avgCtr)}</div>
                    <div className="text-sm text-slate-400">Avg CTR</div>
                </div>
                <div className="glass-card p-4">
                    <div className="text-2xl font-bold">{formatMoney(totals.spend)}</div>
                    <div className="text-sm text-slate-400">Total Spend</div>
                </div>
                <div className="glass-card p-4">
                    <div className="text-2xl font-bold">{totals.leads}</div>
                    <div className="text-sm text-slate-400">Leads</div>
                </div>
                <div className="glass-card p-4">
                    <div className="text-2xl font-bold">{formatMoney(avgCpl)}</div>
                    <div className="text-sm text-slate-400">Cost/Lead</div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setActiveTab('campaigns')}
                    className={activeTab === 'campaigns' ? 'btn-primary' : 'btn-secondary'}
                >
                    Campaigns ({campaigns.length})
                </button>
                <button
                    onClick={() => setActiveTab('ads')}
                    className={activeTab === 'ads' ? 'btn-primary' : 'btn-secondary'}
                >
                    Ads ({ads.length})
                </button>
            </div>

            {/* Campaigns Table */}
            {activeTab === 'campaigns' && (
                <div className="glass-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-800/50">
                                <tr>
                                    <th className="text-left p-4 font-medium">Campaign</th>
                                    <th className="text-left p-4 font-medium">Status</th>
                                    <th className="text-right p-4 font-medium">Impressions</th>
                                    <th className="text-right p-4 font-medium">Clicks</th>
                                    <th className="text-right p-4 font-medium">CTR</th>
                                    <th className="text-right p-4 font-medium">CPC</th>
                                    <th className="text-right p-4 font-medium">CPM</th>
                                    <th className="text-right p-4 font-medium">Spend</th>
                                    <th className="text-right p-4 font-medium">Leads</th>
                                    <th className="text-right p-4 font-medium">CPL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaigns.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="p-8 text-center text-slate-400">
                                            <div className="text-4xl mb-2">📊</div>
                                            No campaign data available
                                        </td>
                                    </tr>
                                ) : (
                                    campaigns.map((campaign) => (
                                        <tr
                                            key={campaign.campaign_id}
                                            className="border-t border-slate-700/50 hover:bg-slate-800/30"
                                        >
                                            <td className="p-4">
                                                <div className="font-medium">{campaign.campaign_name}</div>
                                                <div className="text-xs text-slate-500 font-mono">
                                                    {campaign.campaign_id}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${campaign.status === 'ACTIVE'
                                                    ? 'bg-green-500/20 text-green-400'
                                                    : campaign.status === 'PAUSED'
                                                        ? 'bg-yellow-500/20 text-yellow-400'
                                                        : 'bg-slate-500/20 text-slate-400'
                                                    }`}>
                                                    {campaign.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-mono">
                                                {formatNumber(campaign.impressions)}
                                            </td>
                                            <td className="p-4 text-right font-mono">
                                                {formatNumber(campaign.clicks)}
                                            </td>
                                            <td className="p-4 text-right font-mono">
                                                {formatPercent(campaign.ctr)}
                                            </td>
                                            <td className="p-4 text-right font-mono">
                                                {formatMoney(campaign.cpc)}
                                            </td>
                                            <td className="p-4 text-right font-mono">
                                                {formatMoney(campaign.cpm)}
                                            </td>
                                            <td className="p-4 text-right font-mono font-medium">
                                                {formatMoney(campaign.spend)}
                                            </td>
                                            <td className="p-4 text-right font-mono text-green-400">
                                                {campaign.leads}
                                            </td>
                                            <td className="p-4 text-right font-mono">
                                                {campaign.leads > 0 ? formatMoney(campaign.cost_per_lead) : '-'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Ads Table */}
            {activeTab === 'ads' && (
                <div className="glass-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-800/50">
                                <tr>
                                    <th className="text-left p-4 font-medium">Ad</th>
                                    <th className="text-left p-4 font-medium">Campaign</th>
                                    <th className="text-right p-4 font-medium">Impressions</th>
                                    <th className="text-right p-4 font-medium">Clicks</th>
                                    <th className="text-right p-4 font-medium">CTR</th>
                                    <th className="text-right p-4 font-medium">CPC</th>
                                    <th className="text-right p-4 font-medium">CPM</th>
                                    <th className="text-right p-4 font-medium">Spend</th>
                                    <th className="text-right p-4 font-medium">Leads</th>
                                    <th className="text-right p-4 font-medium">CPL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ads.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="p-8 text-center text-slate-400">
                                            <div className="text-4xl mb-2">📢</div>
                                            No ad data available
                                        </td>
                                    </tr>
                                ) : (
                                    ads.map((ad) => (
                                        <tr
                                            key={ad.ad_id}
                                            className="border-t border-slate-700/50 hover:bg-slate-800/30"
                                        >
                                            <td className="p-4">
                                                <div className="font-medium">{ad.ad_name}</div>
                                                <div className="text-xs text-slate-500 font-mono">
                                                    {ad.ad_id}
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm text-slate-400">
                                                {ad.campaign_name}
                                            </td>
                                            <td className="p-4 text-right font-mono">
                                                {formatNumber(ad.impressions)}
                                            </td>
                                            <td className="p-4 text-right font-mono">
                                                {formatNumber(ad.clicks)}
                                            </td>
                                            <td className="p-4 text-right font-mono">
                                                {formatPercent(ad.ctr)}
                                            </td>
                                            <td className="p-4 text-right font-mono">
                                                {formatMoney(ad.cpc)}
                                            </td>
                                            <td className="p-4 text-right font-mono">
                                                {formatMoney(ad.cpm)}
                                            </td>
                                            <td className="p-4 text-right font-mono font-medium">
                                                {formatMoney(ad.spend)}
                                            </td>
                                            <td className="p-4 text-right font-mono text-green-400">
                                                {ad.leads}
                                            </td>
                                            <td className="p-4 text-right font-mono">
                                                {ad.leads > 0 ? formatMoney(ad.cost_per_lead) : '-'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Metric Definitions */}
            <div className="mt-8 glass-card p-6">
                <h3 className="text-lg font-semibold mb-4">📖 Metric Definitions</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                        <span className="font-medium text-indigo-400">CTR</span>
                        <p className="text-slate-400">Click-Through Rate = Clicks / Impressions</p>
                    </div>
                    <div>
                        <span className="font-medium text-indigo-400">CPC</span>
                        <p className="text-slate-400">Cost Per Click = Spend / Clicks</p>
                    </div>
                    <div>
                        <span className="font-medium text-indigo-400">CPM</span>
                        <p className="text-slate-400">Cost Per 1000 Impressions</p>
                    </div>
                    <div>
                        <span className="font-medium text-indigo-400">CPL</span>
                        <p className="text-slate-400">Cost Per Lead = Spend / Leads</p>
                    </div>
                    <div>
                        <span className="font-medium text-indigo-400">Reach</span>
                        <p className="text-slate-400">Unique people who saw your ad</p>
                    </div>
                    <div>
                        <span className="font-medium text-indigo-400">Impressions</span>
                        <p className="text-slate-400">Total times your ad was shown</p>
                    </div>
                    <div>
                        <span className="font-medium text-indigo-400">Frequency</span>
                        <p className="text-slate-400">Avg times each person saw your ad</p>
                    </div>
                    <div>
                        <span className="font-medium text-indigo-400">ROAS</span>
                        <p className="text-slate-400">Return on Ad Spend = Revenue / Spend</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
