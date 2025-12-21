'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface Pipeline {
    id: string;
    name: string;
    description: string;
    is_default: boolean;
    ai_generated: boolean;
    pipeline_stages: PipelineStage[];
}

interface PipelineStage {
    id: string;
    name: string;
    description: string;
    order_index: number;
    color: string;
    capi_event_name?: string;
}

interface Contact {
    id: string;
    full_name: string;
    email: string;
    ai_analysis?: {
        summary: string;
        urgency: 'low' | 'medium' | 'high';
    };
    contact_stage_assignments?: {
        stage_id: string;
    }[];
}

interface PipelineSuggestion {
    name: string;
    description: string;
    stages: {
        name: string;
        description: string;
        order_index: number;
        color: string;
        capi_event_name?: string;
    }[];
    reasoning: string;
}

export default function PipelinesPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner" />
            </div>
        }>
            <PipelinesContent />
        </Suspense>
    );
}

function PipelinesContent() {
    const searchParams = useSearchParams();
    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [suggestion, setSuggestion] = useState<PipelineSuggestion | null>(null);
    const [showSuggestionModal, setShowSuggestionModal] = useState(false);

    useEffect(() => {
        loadData();

        if (searchParams.get('action') === 'generate') {
            generatePipeline();
        }
    }, [searchParams]);

    async function loadData() {
        try {
            const [pipelinesRes, contactsRes] = await Promise.all([
                fetch('/api/pipelines'),
                fetch('/api/contacts'),
            ]);

            const pipelinesData = await pipelinesRes.json();
            const contactsData = await contactsRes.json();

            setPipelines(pipelinesData.pipelines || []);
            setContacts(contactsData.contacts || []);

            if (pipelinesData.pipelines?.length > 0) {
                const defaultPipeline = pipelinesData.pipelines.find((p: Pipeline) => p.is_default) || pipelinesData.pipelines[0];
                setSelectedPipeline(defaultPipeline);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    }

    async function generatePipeline() {
        setGenerating(true);
        try {
            const res = await fetch('/api/ai/suggest-pipeline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });

            const data = await res.json();

            if (data.error) {
                alert(data.error);
                return;
            }

            setSuggestion(data.suggestion);
            setShowSuggestionModal(true);
        } catch (error) {
            console.error('Failed to generate pipeline:', error);
            alert('Failed to generate pipeline. Please try again.');
        } finally {
            setGenerating(false);
        }
    }

    async function acceptSuggestion() {
        if (!suggestion) return;

        try {
            const res = await fetch('/api/pipelines', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: suggestion.name,
                    description: suggestion.description,
                    is_default: pipelines.length === 0,
                    ai_generated: true,
                    stages: suggestion.stages,
                }),
            });

            const data = await res.json();

            if (data.pipeline) {
                setPipelines([data.pipeline, ...pipelines]);
                setSelectedPipeline(data.pipeline);
                setShowSuggestionModal(false);
                setSuggestion(null);

                // Auto-assign contacts
                await fetch('/api/ai/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pipeline_id: data.pipeline.id }),
                });

                loadData();
            }
        } catch (error) {
            console.error('Failed to create pipeline:', error);
            alert('Failed to create pipeline.');
        }
    }

    function getContactsForStage(stageId: string): Contact[] {
        return contacts.filter(c =>
            c.contact_stage_assignments?.some(a => a.stage_id === stageId)
        );
    }

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
                    Pipelines
                </h1>
                <p className="text-slate-400">
                    Manage your sales pipelines and track leads
                </p>
            </header>

            {/* Navigation */}
            <nav className="flex gap-4 mb-8">
                <Link href="/" className="btn-secondary">
                    Dashboard
                </Link>
                <Link href="/pipelines" className="btn-primary">
                    Pipelines
                </Link>
                <Link href="/contacts" className="btn-secondary">
                    Contacts
                </Link>
                <Link href="/ads" className="btn-secondary">
                    Ads
                </Link>
                <Link href="/settings" className="btn-secondary">
                    Settings
                </Link>
            </nav>

            {/* Pipeline Selector and Actions */}
            <div className="flex flex-wrap gap-4 mb-8">
                <select
                    className="input-field w-64"
                    value={selectedPipeline?.id || ''}
                    onChange={(e) => {
                        const pipeline = pipelines.find(p => p.id === e.target.value);
                        setSelectedPipeline(pipeline || null);
                    }}
                >
                    {pipelines.length === 0 ? (
                        <option value="">No pipelines yet</option>
                    ) : (
                        pipelines.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))
                    )}
                </select>

                <button
                    onClick={generatePipeline}
                    className="btn-primary"
                    disabled={generating}
                >
                    {generating ? (
                        <span className="flex items-center gap-2">
                            <div className="spinner w-4 h-4" /> Generating...
                        </span>
                    ) : (
                        '🤖 Generate with AI'
                    )}
                </button>

                <button className="btn-secondary">
                    + Create Manual
                </button>
            </div>

            {/* Kanban Board */}
            {selectedPipeline ? (
                <div className="overflow-x-auto pb-4">
                    <div className="flex gap-4 min-w-max">
                        {selectedPipeline.pipeline_stages?.map((stage) => (
                            <KanbanColumn
                                key={stage.id}
                                stage={stage}
                                contacts={getContactsForStage(stage.id)}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <div className="glass-card p-12 text-center">
                    <div className="text-6xl mb-4">📊</div>
                    <h3 className="text-xl font-medium mb-2">No Pipeline Yet</h3>
                    <p className="text-slate-400 mb-6">
                        Create your first pipeline manually or let AI generate one based on your contacts.
                    </p>
                    <button onClick={generatePipeline} className="btn-primary" disabled={generating}>
                        {generating ? 'Generating...' : '🤖 Generate with AI'}
                    </button>
                </div>
            )}

            {/* AI Suggestion Modal */}
            {showSuggestionModal && suggestion && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="glass-card max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
                        <h2 className="text-2xl font-bold mb-4">🤖 AI Pipeline Suggestion</h2>

                        <div className="mb-6">
                            <h3 className="text-lg font-semibold">{suggestion.name}</h3>
                            <p className="text-slate-400">{suggestion.description}</p>
                        </div>

                        <div className="mb-6">
                            <h4 className="font-medium mb-3">Suggested Stages:</h4>
                            <div className="space-y-2">
                                {suggestion.stages.map((stage, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50"
                                    >
                                        <div
                                            className="w-4 h-4 rounded-full"
                                            style={{ backgroundColor: stage.color }}
                                        />
                                        <div className="flex-1">
                                            <span className="font-medium">{stage.name}</span>
                                            <p className="text-sm text-slate-400">{stage.description}</p>
                                        </div>
                                        {stage.capi_event_name && (
                                            <span className="text-xs px-2 py-1 rounded bg-indigo-500/20 text-indigo-400">
                                                {stage.capi_event_name}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mb-6 p-4 rounded-lg bg-slate-800/30">
                            <h4 className="font-medium mb-2">AI Reasoning:</h4>
                            <p className="text-sm text-slate-300">{suggestion.reasoning}</p>
                        </div>

                        <div className="flex gap-4">
                            <button onClick={acceptSuggestion} className="btn-primary flex-1">
                                ✅ Accept & Create
                            </button>
                            <button
                                onClick={() => setShowSuggestionModal(false)}
                                className="btn-secondary flex-1"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function KanbanColumn({ stage, contacts }: { stage: PipelineStage; contacts: Contact[] }) {
    return (
        <div className="kanban-column w-72 p-4">
            <div className="flex items-center gap-2 mb-4">
                <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                />
                <h3 className="font-semibold">{stage.name}</h3>
                <span className="ml-auto bg-slate-700 px-2 py-0.5 rounded-full text-xs">
                    {contacts.length}
                </span>
            </div>

            {stage.capi_event_name && (
                <div className="mb-3 text-xs text-indigo-400">
                    📤 Sends: {stage.capi_event_name}
                </div>
            )}

            <div className="space-y-3">
                {contacts.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                        No contacts
                    </div>
                ) : (
                    contacts.map(contact => (
                        <div key={contact.id} className="contact-card">
                            <h4 className="font-medium text-sm">{contact.full_name || 'Unknown'}</h4>
                            <p className="text-xs text-slate-400 truncate">{contact.email}</p>
                            {contact.ai_analysis && (
                                <div className="mt-2 flex items-center gap-2">
                                    <span className={`px-1.5 py-0.5 rounded text-xs badge-${contact.ai_analysis.urgency}`}>
                                        {contact.ai_analysis.urgency}
                                    </span>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
