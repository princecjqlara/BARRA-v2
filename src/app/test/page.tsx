'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface StatusCheck {
    name: string;
    status: 'ok' | 'warning' | 'error';
    details: string;
    action?: string;
}

interface TestStep {
    step: string;
    status: 'success' | 'error' | 'skipped';
    details?: string;
}

export default function TestPage() {
    const [statusChecks, setStatusChecks] = useState<StatusCheck[]>([]);
    const [overallStatus, setOverallStatus] = useState<string>('loading');
    const [loading, setLoading] = useState(true);
    const [testingWebhook, setTestingWebhook] = useState(false);
    const [testingCapi, setTestingCapi] = useState(false);
    const [webhookResult, setWebhookResult] = useState<{ success: boolean; steps: TestStep[] } | null>(null);
    const [capiResult, setCapiResult] = useState<{ success: boolean; message: string; details?: Record<string, unknown> } | null>(null);
    const [testEventCode, setTestEventCode] = useState('');

    useEffect(() => {
        checkStatus();
    }, []);

    async function checkStatus() {
        try {
            setLoading(true);
            const res = await fetch('/api/test/status');
            const data = await res.json();

            setStatusChecks(data.checks || []);
            setOverallStatus(data.overall || 'error');
        } catch (error) {
            console.error('Failed to check status:', error);
            setOverallStatus('error');
        } finally {
            setLoading(false);
        }
    }

    async function testWebhook() {
        setTestingWebhook(true);
        setWebhookResult(null);

        try {
            const res = await fetch('/api/test/webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    first_name: 'Test',
                    last_name: 'Lead',
                    email: `test-${Date.now()}@example.com`,
                    phone: '+1234567890',
                }),
            });

            const data = await res.json();
            setWebhookResult({
                success: data.success,
                steps: data.steps || [],
            });

            // Refresh status
            checkStatus();
        } catch (error) {
            console.error('Test webhook failed:', error);
            setWebhookResult({
                success: false,
                steps: [{ step: 'Request', status: 'error', details: 'Failed to send test request' }],
            });
        } finally {
            setTestingWebhook(false);
        }
    }

    async function testCapi() {
        setTestingCapi(true);
        setCapiResult(null);

        try {
            const res = await fetch('/api/test/capi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event_name: 'Lead',
                    test_event_code: testEventCode || undefined,
                }),
            });

            const data = await res.json();
            setCapiResult({
                success: data.success,
                message: data.message || data.error,
                details: data.details,
            });
        } catch (error) {
            console.error('Test CAPI failed:', error);
            setCapiResult({
                success: false,
                message: 'Failed to send test event',
            });
        } finally {
            setTestingCapi(false);
        }
    }

    const statusIcon = (status: string) => {
        switch (status) {
            case 'ok':
            case 'success':
                return '✅';
            case 'warning':
            case 'skipped':
                return '⚠️';
            case 'error':
                return '❌';
            default:
                return '⏳';
        }
    };

    const statusColor = (status: string) => {
        switch (status) {
            case 'ok':
            case 'success':
                return 'text-green-400';
            case 'warning':
            case 'skipped':
                return 'text-yellow-400';
            case 'error':
                return 'text-red-400';
            default:
                return 'text-slate-400';
        }
    };

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
                    Test Mode
                </h1>
                <p className="text-slate-400">
                    Verify your CAPI and webhook integrations before going live
                </p>
            </header>

            {/* Navigation */}
            <nav className="flex gap-4 mb-8">
                <Link href="/" className="btn-secondary">Dashboard</Link>
                <Link href="/pipelines" className="btn-secondary">Pipelines</Link>
                <Link href="/contacts" className="btn-secondary">Contacts</Link>
                <Link href="/ads" className="btn-secondary">Ads</Link>
                <Link href="/tenants" className="btn-secondary">Tenants</Link>
                <Link href="/settings" className="btn-secondary">Settings</Link>
                <Link href="/test" className="btn-primary">Test Mode</Link>
            </nav>

            {/* Overall Status */}
            <div className={`glass-card p-6 mb-8 border-2 ${overallStatus === 'ok' ? 'border-green-500/50' :
                overallStatus === 'warning' ? 'border-yellow-500/50' :
                    'border-red-500/50'
                }`}>
                <div className="flex items-center gap-4">
                    <span className="text-4xl">
                        {overallStatus === 'ok' ? '🟢' : overallStatus === 'warning' ? '🟡' : '🔴'}
                    </span>
                    <div>
                        <h2 className="text-xl font-bold">
                            System Status: {overallStatus.toUpperCase()}
                        </h2>
                        <p className="text-slate-400">
                            {overallStatus === 'ok'
                                ? 'All systems operational. Ready for production!'
                                : overallStatus === 'warning'
                                    ? 'Some components need attention'
                                    : 'Critical issues detected'}
                        </p>
                    </div>
                    <button onClick={checkStatus} className="btn-secondary ml-auto">
                        🔄 Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Status Checks */}
                <div className="glass-card p-6">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        <span>🔍</span> Integration Checks
                    </h2>

                    <div className="space-y-3">
                        {statusChecks.map((check, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50">
                                <span className="text-xl">{statusIcon(check.status)}</span>
                                <div className="flex-1">
                                    <div className="font-medium">{check.name}</div>
                                    <div className={`text-sm ${statusColor(check.status)}`}>
                                        {check.details}
                                    </div>
                                    {check.action && (
                                        <div className="text-xs text-slate-500 mt-1">
                                            💡 {check.action}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Test Actions */}
                <div className="space-y-6">
                    {/* Test Webhook */}
                    <div className="glass-card p-6">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <span>🔗</span> Test Webhook (Simulate Lead)
                        </h2>
                        <p className="text-slate-400 text-sm mb-4">
                            This simulates receiving a lead from Facebook. It will create a test contact,
                            run AI analysis, and assign it to your pipeline.
                        </p>

                        <button
                            onClick={testWebhook}
                            disabled={testingWebhook}
                            className="btn-primary w-full mb-4"
                        >
                            {testingWebhook ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="spinner w-4 h-4" /> Testing...
                                </span>
                            ) : (
                                '🧪 Run Webhook Test'
                            )}
                        </button>

                        {webhookResult && (
                            <div className={`p-4 rounded-lg ${webhookResult.success ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                                <div className="font-medium mb-2">
                                    {webhookResult.success ? '✅ Test Passed!' : '❌ Test Failed'}
                                </div>
                                <div className="space-y-1">
                                    {webhookResult.steps.map((step, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm">
                                            <span>{statusIcon(step.status)}</span>
                                            <span className="font-medium">{step.step}:</span>
                                            <span className="text-slate-400">{step.details}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Test CAPI */}
                    <div className="glass-card p-6">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <span>📤</span> Test CAPI Event
                        </h2>
                        <p className="text-slate-400 text-sm mb-4">
                            Send a test conversion event to Facebook. You can verify it in
                            Events Manager → Test Events.
                        </p>

                        <div className="mb-4">
                            <label className="block text-sm mb-2">Test Event Code (optional)</label>
                            <input
                                type="text"
                                value={testEventCode}
                                onChange={(e) => setTestEventCode(e.target.value)}
                                placeholder="TEST12345"
                                className="input-field w-full"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Get this from Facebook Events Manager → Test Events
                            </p>
                        </div>

                        <button
                            onClick={testCapi}
                            disabled={testingCapi}
                            className="btn-primary w-full mb-4"
                        >
                            {testingCapi ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="spinner w-4 h-4" /> Sending...
                                </span>
                            ) : (
                                '📤 Send Test Event to Facebook'
                            )}
                        </button>

                        {capiResult && (
                            <div className={`p-4 rounded-lg ${capiResult.success ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                                <div className="font-medium mb-2">
                                    {capiResult.success ? '✅' : '❌'} {capiResult.message}
                                </div>
                                {capiResult.details && (
                                    <div className="text-sm text-slate-400">
                                        <div>Dataset: {String(capiResult.details.dataset_id)}</div>
                                        <div>Trace ID: {String(capiResult.details.fbtrace_id)}</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Instructions */}
            <div className="mt-8 glass-card p-6">
                <h2 className="text-xl font-semibold mb-4">📋 Testing Checklist</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h3 className="font-medium mb-2 text-indigo-400">Before Going Live:</h3>
                        <ol className="list-decimal list-inside space-y-2 text-slate-300 text-sm">
                            <li>Connect your Facebook Page in Settings</li>
                            <li>Create at least one pipeline with stages</li>
                            <li>Run the Webhook Test above</li>
                            <li>Send a Test CAPI Event</li>
                            <li>Verify events in Facebook Events Manager</li>
                            <li>Set up your Facebook App webhook URL</li>
                        </ol>
                    </div>
                    <div>
                        <h3 className="font-medium mb-2 text-indigo-400">Facebook Events Manager:</h3>
                        <ol className="list-decimal list-inside space-y-2 text-slate-300 text-sm">
                            <li>Go to Events Manager in Facebook Business Suite</li>
                            <li>Select your Dataset/Pixel</li>
                            <li>Click &quot;Test Events&quot; tab</li>
                            <li>Enter your Test Event Code</li>
                            <li>Events should appear within seconds</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
}
