'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { NVIDIA_MODELS } from '@/lib/types';

interface FacebookConfig {
    id: string;
    page_id: string;
    page_name: string;
    ad_account_id: string | null;
    dataset_id: string | null;
    webhook_subscribed: boolean;
    created_at: string;
}

export default function SettingsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner" />
            </div>
        }>
            <SettingsContent />
        </Suspense>
    );
}

function SettingsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [facebookConfigs, setFacebookConfigs] = useState<FacebookConfig[]>([]);
    const [selectedModel, setSelectedModel] = useState('meta/llama-3.1-8b-instruct');
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [editingAdAccount, setEditingAdAccount] = useState<string | null>(null);
    const [adAccountInput, setAdAccountInput] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        checkAuthAndLoad();
    }, [searchParams]);

    async function checkAuthAndLoad() {
        try {
            // Check authentication first
            const authRes = await fetch('/api/auth/me');
            const authData = await authRes.json();

            if (!authData.authenticated) {
                router.push('/login');
                return;
            }

            setIsAuthenticated(true);

            // Check for URL params
            const success = searchParams.get('success');
            const error = searchParams.get('error');

            if (success === 'facebook_connected') {
                setMessage({ type: 'success', text: 'Facebook Page connected successfully!' });
            } else if (error) {
                setMessage({ type: 'error', text: `Error: ${error.replace(/_/g, ' ')}` });
            }

            loadSettings();
        } catch (err) {
            console.error('Auth check failed:', err);
            router.push('/login');
        }
    }

    async function loadSettings() {
        try {
            // Fetch Facebook configs
            const res = await fetch('/api/facebook-config');
            if (res.ok) {
                const data = await res.json();
                setFacebookConfigs(data.configs || []);
            }
            setLoading(false);
        } catch (error) {
            console.error('Failed to load settings:', error);
            setLoading(false);
        }
    }

    function connectFacebook() {
        window.location.href = '/api/auth/facebook';
    }

    async function disconnectFacebook(configId: string, pageName: string) {
        if (!confirm(`Are you sure you want to disconnect "${pageName}"?`)) {
            return;
        }

        setSaving(true);
        try {
            const res = await fetch(`/api/facebook-config/${configId}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                setMessage({ type: 'success', text: `"${pageName}" disconnected successfully!` });
                loadSettings(); // Refresh
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to disconnect' });
            }
        } catch (error) {
            console.error('Failed to disconnect:', error);
            setMessage({ type: 'error', text: 'Failed to disconnect page' });
        }
        setSaving(false);
    }

    async function saveAdAccount(configId: string) {
        setSaving(true);
        try {
            const res = await fetch('/api/facebook-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    config_id: configId,
                    ad_account_id: adAccountInput.trim() || null,
                }),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Ad Account updated successfully!' });
                setEditingAdAccount(null);
                loadSettings(); // Refresh
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to update' });
            }
        } catch (error) {
            console.error('Failed to save ad account:', error);
            setMessage({ type: 'error', text: 'Failed to save ad account' });
        }
        setSaving(false);
    }

    async function createCapiDataset(configId: string) {
        setSaving(true);
        try {
            const res = await fetch(`/api/facebook-config/${configId}/create-dataset`, {
                method: 'POST',
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: `CAPI Dataset created! ID: ${data.dataset_id}` });
                loadSettings(); // Refresh to show new dataset ID
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to create dataset' });
            }
        } catch (error) {
            console.error('Failed to create CAPI dataset:', error);
            setMessage({ type: 'error', text: 'Failed to create CAPI dataset' });
        }
        setSaving(false);
    }

    if (loading || isAuthenticated === null) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div className="min-h-screen p-8">
            {/* Header */}
            <header className="mb-8">
                <h1 className="text-4xl font-bold gradient-text mb-2">
                    Settings
                </h1>
                <p className="text-slate-400">
                    Configure your Facebook integration and AI preferences
                </p>
            </header>

            {/* Navigation */}
            <nav className="flex gap-4 mb-8">
                <Link href="/" className="btn-secondary">
                    Dashboard
                </Link>
                <Link href="/pipelines" className="btn-secondary">
                    Pipelines
                </Link>
                <Link href="/contacts" className="btn-secondary">
                    Contacts
                </Link>
                <Link href="/ads" className="btn-secondary">
                    Ads
                </Link>
                <Link href="/tenants" className="btn-secondary">
                    Tenants
                </Link>
                <Link href="/settings" className="btn-primary">
                    Settings
                </Link>
            </nav>

            {/* Message */}
            {message && (
                <div className={`mb-6 p-4 rounded-xl ${message.type === 'success'
                    ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                    : 'bg-red-500/20 border border-red-500/30 text-red-400'
                    }`}>
                    {message.text}
                    <button
                        onClick={() => setMessage(null)}
                        className="ml-4 text-sm underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Facebook Integration */}
                <div className="glass-card p-6">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        <span className="text-2xl">📘</span>
                        Facebook Integration
                    </h2>

                    {facebookConfigs.length === 0 ? (
                        <div className="text-center py-8">
                            <div className="text-6xl mb-4">🔗</div>
                            <h3 className="text-lg font-medium mb-2">Connect Your Facebook Page</h3>
                            <p className="text-slate-400 mb-6">
                                Connect your Facebook Page to start receiving leads from your ads automatically.
                            </p>
                            <button onClick={connectFacebook} className="btn-primary">
                                Connect Facebook
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {facebookConfigs.map((config) => (
                                <div key={config.id} className="p-4 rounded-xl bg-slate-800/50">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h3 className="font-medium">{config.page_name}</h3>
                                            <p className="text-sm text-slate-400">Page ID: {config.page_id}</p>
                                        </div>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.webhook_subscribed
                                            ? 'bg-green-500/20 text-green-400'
                                            : 'bg-yellow-500/20 text-yellow-400'
                                            }`}>
                                            {config.webhook_subscribed ? 'Active' : 'Pending'}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                                        <div>
                                            <p className="text-slate-500">Dataset ID</p>
                                            <div className="flex items-center gap-2">
                                                <p className="font-mono text-xs">{config.dataset_id || 'Not created'}</p>
                                                {!config.dataset_id && config.ad_account_id && (
                                                    <button
                                                        onClick={() => createCapiDataset(config.id)}
                                                        disabled={saving}
                                                        className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-2 py-1 rounded disabled:opacity-50"
                                                    >
                                                        {saving ? 'Creating...' : '+ Create'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-slate-500">Webhook</p>
                                            <p>{config.webhook_subscribed ? '✅ Subscribed' : '⏳ Not subscribed'}</p>
                                        </div>
                                    </div>

                                    {/* Ad Account Section */}
                                    <div className="border-t border-slate-700 pt-4">
                                        <p className="text-slate-500 text-sm mb-2">Ad Account ID</p>
                                        {editingAdAccount === config.id ? (
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    className="input-field flex-1"
                                                    placeholder="e.g., 123456789 or act_123456789"
                                                    value={adAccountInput}
                                                    onChange={(e) => setAdAccountInput(e.target.value)}
                                                />
                                                <button
                                                    onClick={() => saveAdAccount(config.id)}
                                                    disabled={saving}
                                                    className="btn-primary text-sm"
                                                >
                                                    {saving ? 'Saving...' : 'Save'}
                                                </button>
                                                <button
                                                    onClick={() => setEditingAdAccount(null)}
                                                    className="btn-secondary text-sm"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <p className="font-mono text-sm">
                                                    {config.ad_account_id || <span className="text-yellow-400">Not configured</span>}
                                                </p>
                                                <button
                                                    onClick={() => {
                                                        setEditingAdAccount(config.id);
                                                        setAdAccountInput(config.ad_account_id || '');
                                                    }}
                                                    className="text-indigo-400 text-sm hover:underline"
                                                >
                                                    {config.ad_account_id ? 'Edit' : 'Add'}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="border-t border-slate-700 pt-4 mt-4 flex gap-2">
                                        <button
                                            onClick={connectFacebook}
                                            className="btn-secondary text-sm flex-1"
                                        >
                                            🔄 Reconnect
                                        </button>
                                        <button
                                            onClick={() => disconnectFacebook(config.id, config.page_name)}
                                            disabled={saving}
                                            className="text-red-400 text-sm hover:underline px-3"
                                        >
                                            Disconnect
                                        </button>
                                    </div>
                                </div>
                            ))}

                            <button onClick={connectFacebook} className="btn-secondary w-full">
                                + Add Another Page
                            </button>
                        </div>
                    )}

                    {/* How to find Ad Account ID */}
                    <div className="mt-6 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
                        <h4 className="font-medium mb-2 text-indigo-300">💡 How to find your Ad Account ID</h4>
                        <ol className="text-sm text-slate-400 space-y-1 list-decimal list-inside">
                            <li>Go to <a href="https://business.facebook.com/settings/ad-accounts" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Facebook Business Settings</a></li>
                            <li>Click on &quot;Ad accounts&quot; in the left menu</li>
                            <li>Select your ad account</li>
                            <li>Copy the Ad Account ID (numbers only, e.g., 123456789)</li>
                        </ol>
                    </div>

                    {/* Webhook URL Info */}
                    <div className="mt-6 p-4 rounded-xl bg-slate-800/30 border border-slate-700">
                        <h4 className="font-medium mb-2">Webhook Configuration</h4>
                        <p className="text-sm text-slate-400 mb-2">
                            Use this URL in your Facebook App webhook settings:
                        </p>
                        <code className="block p-2 rounded bg-slate-900 text-xs text-indigo-400 break-all">
                            {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/facebook` : '/api/webhooks/facebook'}
                        </code>
                    </div>
                </div>

                {/* AI Settings */}
                <div className="glass-card p-6">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        <span className="text-2xl">🤖</span>
                        AI Configuration
                    </h2>

                    <div className="space-y-6">
                        {/* Model Selection */}
                        <div>
                            <label className="block text-sm font-medium mb-3">AI Model</label>
                            <div className="space-y-3">
                                {NVIDIA_MODELS.map((model) => (
                                    <label
                                        key={model.id}
                                        className={`flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-all ${selectedModel === model.id
                                            ? 'bg-indigo-500/20 border border-indigo-500/50'
                                            : 'bg-slate-800/50 border border-transparent hover:border-slate-600'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            name="model"
                                            value={model.id}
                                            checked={selectedModel === model.id}
                                            onChange={(e) => setSelectedModel(e.target.value)}
                                            className="mt-1"
                                        />
                                        <div>
                                            <h4 className="font-medium">{model.name}</h4>
                                            <p className="text-sm text-slate-400">{model.description}</p>
                                            <div className="flex gap-2 mt-2">
                                                <span className={`px-2 py-0.5 rounded text-xs ${model.speed === 'fast' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                                                    }`}>
                                                    {model.speed}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded text-xs ${model.reasoning === 'advanced' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-500/20 text-slate-400'
                                                    }`}>
                                                    {model.reasoning} reasoning
                                                </span>
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* NVIDIA API Key Status */}
                        <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700">
                            <h4 className="font-medium mb-2">NVIDIA NIM API</h4>
                            <p className="text-sm text-slate-400">
                                Get your free API key at{' '}
                                <a
                                    href="https://build.nvidia.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-indigo-400 hover:text-indigo-300"
                                >
                                    build.nvidia.com
                                </a>
                            </p>
                        </div>

                        <button className="btn-primary w-full">
                            Save Settings
                        </button>
                    </div>
                </div>

                {/* CAPI Event Mapping */}
                <div className="glass-card p-6 lg:col-span-2">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        <span className="text-2xl">📊</span>
                        CAPI Event Mapping
                    </h2>

                    <p className="text-slate-400 mb-6">
                        Configure which Facebook Conversion events are sent when contacts move through your pipeline stages.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[
                            { stage: 'New Lead', event: 'Lead', color: 'blue' },
                            { stage: 'Contacted', event: 'Contact', color: 'purple' },
                            { stage: 'Qualified', event: 'CompleteRegistration', color: 'yellow' },
                            { stage: 'Proposal', event: 'InitiateCheckout', color: 'green' },
                            { stage: 'Closed Won', event: 'Purchase', color: 'emerald' },
                        ].map((mapping) => (
                            <div key={mapping.stage} className="p-4 rounded-xl bg-slate-800/50">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className={`w-3 h-3 rounded-full bg-${mapping.color}-500`} />
                                    <span className="font-medium">{mapping.stage}</span>
                                </div>
                                <select className="input-field text-sm">
                                    <option value={mapping.event}>{mapping.event}</option>
                                    <option value="Lead">Lead</option>
                                    <option value="Contact">Contact</option>
                                    <option value="CompleteRegistration">CompleteRegistration</option>
                                    <option value="Schedule">Schedule</option>
                                    <option value="InitiateCheckout">InitiateCheckout</option>
                                    <option value="Purchase">Purchase</option>
                                    <option value="">No Event</option>
                                </select>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
                        <p className="text-sm text-indigo-300">
                            💡 <strong>Tip:</strong> CAPI events help Facebook optimize your ads by tracking real conversion data.
                            The more accurately you map stages to events, the better your ad targeting becomes.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
