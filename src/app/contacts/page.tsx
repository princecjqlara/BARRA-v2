'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Contact {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    source: 'webhook' | 'manual' | 'import';
    // Ad Attribution
    facebook_ad_id?: string;
    facebook_campaign_id?: string;
    facebook_form_id?: string;
    facebook_page_id?: string;
    ad_name?: string;
    campaign_name?: string;
    // Analysis
    ai_analysis?: {
        summary: string;
        intent: string;
        urgency: 'low' | 'medium' | 'high';
        tags: string[];
    };
    contact_stage_assignments?: {
        id: string;
        pipeline_stages: {
            name: string;
            color: string;
        };
    }[];
    created_at: string;
}

export default function ContactsPage() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0 });

    useEffect(() => {
        loadContacts();
    }, [search]);

    async function loadContacts() {
        try {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            params.set('limit', String(pagination.limit));
            params.set('offset', String(pagination.offset));

            const res = await fetch(`/api/contacts?${params}`);
            const data = await res.json();

            setContacts(data.contacts || []);
            setPagination(data.pagination || { total: 0, limit: 50, offset: 0 });
        } catch (error) {
            console.error('Failed to load contacts:', error);
        } finally {
            setLoading(false);
        }
    }

    async function analyzeUnanalyzed() {
        try {
            const unanalyzedIds = contacts
                .filter(c => !c.ai_analysis)
                .map(c => c.id);

            if (unanalyzedIds.length === 0) {
                alert('All contacts are already analyzed!');
                return;
            }

            const res = await fetch('/api/ai/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contact_ids: unanalyzedIds }),
            });

            const data = await res.json();
            alert(`Analyzed ${data.analyzed} contacts!`);
            loadContacts();
        } catch (error) {
            console.error('Analysis failed:', error);
            alert('Analysis failed. Please try again.');
        }
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
                    Contacts
                </h1>
                <p className="text-slate-400">
                    View and manage all your leads
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
                <Link href="/contacts" className="btn-primary">
                    Contacts
                </Link>
                <Link href="/ads" className="btn-secondary">
                    Ads
                </Link>
                <Link href="/settings" className="btn-secondary">
                    Settings
                </Link>
            </nav>

            {/* Actions Bar */}
            <div className="flex flex-wrap gap-4 mb-6">
                <input
                    type="text"
                    placeholder="Search contacts..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-field w-64"
                />

                <button onClick={() => setShowAddModal(true)} className="btn-secondary">
                    + Add Contact
                </button>

                <button onClick={analyzeUnanalyzed} className="btn-primary">
                    🔍 Analyze Unanalyzed
                </button>

                <div className="ml-auto text-slate-400">
                    {pagination.total} contacts
                </div>
            </div>

            {/* Contacts Table */}
            <div className="glass-card overflow-hidden">
                <table className="w-full">
                    <thead className="bg-slate-800/50">
                        <tr>
                            <th className="text-left p-4 font-medium">Contact</th>
                            <th className="text-left p-4 font-medium">Ad Source</th>
                            <th className="text-left p-4 font-medium">Stage</th>
                            <th className="text-left p-4 font-medium">Urgency</th>
                            <th className="text-left p-4 font-medium">Added</th>
                            <th className="text-left p-4 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {contacts.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-slate-400">
                                    <div className="text-4xl mb-2">📭</div>
                                    No contacts found
                                </td>
                            </tr>
                        ) : (
                            contacts.map((contact) => (
                                <tr
                                    key={contact.id}
                                    className="border-t border-slate-700/50 hover:bg-slate-800/30 transition-colors"
                                >
                                    <td className="p-4">
                                        <div>
                                            <div className="font-medium">{contact.full_name || 'Unknown'}</div>
                                            <div className="text-sm text-slate-400">{contact.email}</div>
                                            {contact.phone && (
                                                <div className="text-sm text-slate-500">{contact.phone}</div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        {contact.campaign_name || contact.ad_name ? (
                                            <div className="max-w-[150px]">
                                                {contact.campaign_name && (
                                                    <div className="text-xs text-slate-300 truncate" title={contact.campaign_name}>
                                                        📊 {contact.campaign_name}
                                                    </div>
                                                )}
                                                {contact.ad_name && (
                                                    <div className="text-xs text-slate-500 truncate" title={contact.ad_name}>
                                                        📢 {contact.ad_name}
                                                    </div>
                                                )}
                                                {contact.facebook_ad_id && (
                                                    <div className="text-xs text-slate-600 font-mono truncate" title={contact.facebook_ad_id}>
                                                        ID: {contact.facebook_ad_id.slice(-8)}
                                                    </div>
                                                )}
                                            </div>
                                        ) : contact.source === 'webhook' ? (
                                            <span className="text-xs text-green-400">🔗 Facebook</span>
                                        ) : contact.source === 'manual' ? (
                                            <span className="text-xs text-blue-400">✍️ Manual</span>
                                        ) : (
                                            <span className="text-xs text-yellow-400">📥 Import</span>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        {contact.contact_stage_assignments?.[0]?.pipeline_stages ? (
                                            <span
                                                className="px-2 py-1 rounded-full text-xs font-medium"
                                                style={{
                                                    backgroundColor: `${contact.contact_stage_assignments[0].pipeline_stages.color}20`,
                                                    color: contact.contact_stage_assignments[0].pipeline_stages.color
                                                }}
                                            >
                                                {contact.contact_stage_assignments[0].pipeline_stages.name}
                                            </span>
                                        ) : (
                                            <span className="text-slate-500 text-sm">Unassigned</span>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        {contact.ai_analysis ? (
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium badge-${contact.ai_analysis.urgency}`}>
                                                {contact.ai_analysis.urgency}
                                            </span>
                                        ) : (
                                            <span className="text-slate-500 text-sm">Not analyzed</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-sm text-slate-400">
                                        {new Date(contact.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="p-4">
                                        <button
                                            onClick={() => setSelectedContact(contact)}
                                            className="text-indigo-400 hover:text-indigo-300 text-sm"
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Contact Detail Modal */}
            {selectedContact && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="glass-card max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-2xl font-bold">{selectedContact.full_name || 'Unknown'}</h2>
                                <p className="text-slate-400">{selectedContact.email}</p>
                            </div>
                            <button
                                onClick={() => setSelectedContact(null)}
                                className="text-slate-400 hover:text-white text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-slate-500">Phone</label>
                                    <p>{selectedContact.phone || 'N/A'}</p>
                                </div>
                                <div>
                                    <label className="text-sm text-slate-500">Source</label>
                                    <p className="capitalize">{selectedContact.source}</p>
                                </div>
                            </div>

                            {selectedContact.ai_analysis && (
                                <div className="p-4 rounded-lg bg-slate-800/50">
                                    <h4 className="font-medium mb-2">AI Analysis</h4>
                                    <p className="text-sm text-slate-300 mb-2">{selectedContact.ai_analysis.summary}</p>
                                    <div className="flex flex-wrap gap-2">
                                        <span className={`px-2 py-1 rounded text-xs badge-${selectedContact.ai_analysis.urgency}`}>
                                            {selectedContact.ai_analysis.urgency} urgency
                                        </span>
                                        {selectedContact.ai_analysis.tags.map((tag, i) => (
                                            <span key={i} className="px-2 py-1 rounded text-xs bg-slate-700">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="mt-2 text-sm text-slate-400">
                                        <strong>Intent:</strong> {selectedContact.ai_analysis.intent}
                                    </div>
                                </div>
                            )}

                            {/* Ad Attribution */}
                            {(selectedContact.facebook_ad_id || selectedContact.campaign_name) && (
                                <div className="p-4 rounded-lg bg-indigo-900/30 border border-indigo-500/30">
                                    <h4 className="font-medium mb-3 flex items-center gap-2">
                                        <span>📊</span> Ad Attribution
                                    </h4>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        {selectedContact.campaign_name && (
                                            <div>
                                                <label className="text-slate-500 text-xs">Campaign</label>
                                                <p className="text-slate-300">{selectedContact.campaign_name}</p>
                                            </div>
                                        )}
                                        {selectedContact.ad_name && (
                                            <div>
                                                <label className="text-slate-500 text-xs">Ad</label>
                                                <p className="text-slate-300">{selectedContact.ad_name}</p>
                                            </div>
                                        )}
                                        {selectedContact.facebook_campaign_id && (
                                            <div>
                                                <label className="text-slate-500 text-xs">Campaign ID</label>
                                                <p className="font-mono text-xs text-slate-400">{selectedContact.facebook_campaign_id}</p>
                                            </div>
                                        )}
                                        {selectedContact.facebook_ad_id && (
                                            <div>
                                                <label className="text-slate-500 text-xs">Ad ID</label>
                                                <p className="font-mono text-xs text-slate-400">{selectedContact.facebook_ad_id}</p>
                                            </div>
                                        )}
                                        {selectedContact.facebook_form_id && (
                                            <div>
                                                <label className="text-slate-500 text-xs">Form ID</label>
                                                <p className="font-mono text-xs text-slate-400">{selectedContact.facebook_form_id}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-4">
                                <button className="btn-secondary flex-1">
                                    Move to Stage
                                </button>
                                <button className="btn-primary flex-1">
                                    Send Message
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Contact Modal */}
            {showAddModal && (
                <AddContactModal
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => {
                        setShowAddModal(false);
                        loadContacts();
                    }}
                />
            )}
        </div>
    );
}

function AddContactModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
    });
    const [saving, setSaving] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);

        try {
            const res = await fetch('/api/contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (res.ok) {
                onSuccess();
            } else {
                alert('Failed to create contact');
            }
        } catch (error) {
            console.error('Failed to create contact:', error);
            alert('Failed to create contact');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="glass-card max-w-md w-full p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Add Contact</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">
                        ×
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm mb-1">First Name</label>
                            <input
                                type="text"
                                value={formData.first_name}
                                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                className="input-field"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm mb-1">Last Name</label>
                            <input
                                type="text"
                                value={formData.last_name}
                                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                className="input-field"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm mb-1">Email</label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="input-field"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm mb-1">Phone</label>
                        <input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className="input-field"
                        />
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button type="button" onClick={onClose} className="btn-secondary flex-1">
                            Cancel
                        </button>
                        <button type="submit" className="btn-primary flex-1" disabled={saving}>
                            {saving ? 'Saving...' : 'Add Contact'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
