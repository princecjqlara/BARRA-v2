'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Tenant {
    id: string;
    name: string;
    description?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    is_active: boolean;
    created_at: string;
    stats: {
        contacts: number;
        pipelines: number;
        pages: number;
        revenue: number;
    };
}

export default function TenantsPage() {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        login_email: '',
        login_password: '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        checkAdmin();
    }, []);

    async function checkAdmin() {
        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();
            setIsAdmin(data.isAdmin);

            if (data.isAdmin) {
                loadTenants();
            } else {
                setLoading(false);
            }
        } catch (err) {
            console.error('Failed to check admin status:', err);
            setIsAdmin(false);
            setLoading(false);
        }
    }

    async function loadTenants() {
        try {
            setLoading(true);
            const res = await fetch('/api/tenants');
            const data = await res.json();
            if (data.tenants) {
                setTenants(data.tenants);
            }
        } catch (err) {
            console.error('Failed to load tenants:', err);
            setError('Failed to load tenants');
        } finally {
            setLoading(false);
        }
    }

    function openAddModal() {
        setEditingTenant(null);
        setFormData({
            name: '',
            description: '',
            contact_name: '',
            contact_email: '',
            contact_phone: '',
            login_email: '',
            login_password: '',
        });
        setShowModal(true);
    }

    function openEditModal(tenant: Tenant) {
        setEditingTenant(tenant);
        setFormData({
            name: tenant.name,
            description: tenant.description || '',
            contact_name: tenant.contact_name || '',
            contact_email: tenant.contact_email || '',
            contact_phone: tenant.contact_phone || '',
            login_email: '',
            login_password: '',
        });
        setShowModal(true);
    }

    async function saveTenant() {
        if (!formData.name.trim()) {
            setError('Tenant name is required');
            return;
        }

        // Require email and password for new tenants
        if (!editingTenant) {
            if (!formData.login_email.trim()) {
                setError('Login email is required for new tenants');
                return;
            }
            if (!formData.login_password || formData.login_password.length < 6) {
                setError('Password must be at least 6 characters');
                return;
            }
        }

        setSaving(true);
        setError(null);

        try {
            const method = editingTenant ? 'PUT' : 'POST';
            const body = editingTenant
                ? { id: editingTenant.id, ...formData }
                : formData;

            const res = await fetch('/api/tenants', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (data.success) {
                setShowModal(false);
                loadTenants();
            } else {
                setError(data.error || 'Failed to save tenant');
            }
        } catch (err) {
            console.error('Failed to save tenant:', err);
            setError('Failed to save tenant');
        } finally {
            setSaving(false);
        }
    }

    async function deleteTenant(tenant: Tenant) {
        if (!confirm(`Are you sure you want to delete "${tenant.name}"? This will unlink all associated data.`)) {
            return;
        }

        try {
            const res = await fetch(`/api/tenants?id=${tenant.id}`, {
                method: 'DELETE',
            });

            const data = await res.json();

            if (data.success) {
                loadTenants();
            } else {
                setError(data.error || 'Failed to delete tenant');
            }
        } catch (err) {
            console.error('Failed to delete tenant:', err);
            setError('Failed to delete tenant');
        }
    }

    async function toggleActive(tenant: Tenant) {
        try {
            const res = await fetch('/api/tenants', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: tenant.id,
                    is_active: !tenant.is_active,
                }),
            });

            const data = await res.json();

            if (data.success) {
                loadTenants();
            }
        } catch (err) {
            console.error('Failed to toggle tenant:', err);
        }
    }

    function formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount);
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner" />
            </div>
        );
    }

    // Access denied for non-admins
    if (!isAdmin) {
        return (
            <div className="min-h-screen p-8">
                <header className="mb-8">
                    <h1 className="text-4xl font-bold gradient-text mb-2">
                        Access Denied
                    </h1>
                </header>

                <nav className="flex gap-4 mb-8">
                    <Link href="/" className="btn-secondary">Dashboard</Link>
                    <Link href="/pipelines" className="btn-secondary">Pipelines</Link>
                    <Link href="/contacts" className="btn-secondary">Contacts</Link>
                    <Link href="/ads" className="btn-secondary">Ads</Link>
                    <Link href="/settings" className="btn-secondary">Settings</Link>
                </nav>

                <div className="glass-card p-12 text-center max-w-lg mx-auto">
                    <div className="text-6xl mb-4">🔒</div>
                    <h2 className="text-2xl font-bold mb-4">Admin Access Required</h2>
                    <p className="text-slate-400 mb-6">
                        Only administrators can access the Tenants management page.
                        Please contact your administrator if you need access.
                    </p>
                    <Link href="/" className="btn-primary">
                        Go to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-8">
            {/* Header */}
            <header className="mb-8">
                <h1 className="text-4xl font-bold gradient-text mb-2">
                    Tenants
                </h1>
                <p className="text-slate-400">
                    Manage your clients and sub-accounts
                </p>
            </header>

            {/* Navigation */}
            <nav className="flex gap-4 mb-8">
                <Link href="/" className="btn-secondary">Dashboard</Link>
                <Link href="/pipelines" className="btn-secondary">Pipelines</Link>
                <Link href="/contacts" className="btn-secondary">Contacts</Link>
                <Link href="/ads" className="btn-secondary">Ads</Link>
                <Link href="/tenants" className="btn-primary">Tenants</Link>
                <Link href="/settings" className="btn-secondary">Settings</Link>
            </nav>

            {/* Error */}
            {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400">
                    {error}
                    <button onClick={() => setError(null)} className="ml-4 underline">Dismiss</button>
                </div>
            )}

            {/* Add Button */}
            <div className="mb-6">
                <button onClick={openAddModal} className="btn-primary">
                    ➕ Add Tenant
                </button>
            </div>

            {/* Tenants Grid */}
            {tenants.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <div className="text-6xl mb-4">🏢</div>
                    <h3 className="text-xl font-semibold mb-2">No Tenants Yet</h3>
                    <p className="text-slate-400 mb-6">
                        Create tenants to organize your clients and manage their Facebook pages separately.
                    </p>
                    <button onClick={openAddModal} className="btn-primary">
                        Create Your First Tenant
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {tenants.map((tenant) => (
                        <div
                            key={tenant.id}
                            className={`glass-card p-6 ${!tenant.is_active ? 'opacity-60' : ''}`}
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h3 className="text-xl font-semibold">{tenant.name}</h3>
                                    {tenant.description && (
                                        <p className="text-sm text-slate-400 mt-1">{tenant.description}</p>
                                    )}
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${tenant.is_active
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-slate-500/20 text-slate-400'
                                    }`}>
                                    {tenant.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>

                            {/* Contact Info */}
                            {(tenant.contact_name || tenant.contact_email) && (
                                <div className="mb-4 text-sm text-slate-400">
                                    {tenant.contact_name && <div>👤 {tenant.contact_name}</div>}
                                    {tenant.contact_email && <div>📧 {tenant.contact_email}</div>}
                                    {tenant.contact_phone && <div>📱 {tenant.contact_phone}</div>}
                                </div>
                            )}

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                    <div className="text-lg font-bold">{tenant.stats.contacts}</div>
                                    <div className="text-xs text-slate-400">Contacts</div>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                    <div className="text-lg font-bold">{tenant.stats.pipelines}</div>
                                    <div className="text-xs text-slate-400">Pipelines</div>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                    <div className="text-lg font-bold">{tenant.stats.pages}</div>
                                    <div className="text-xs text-slate-400">FB Pages</div>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                    <div className="text-lg font-bold text-green-400">
                                        {formatCurrency(tenant.stats.revenue)}
                                    </div>
                                    <div className="text-xs text-slate-400">Revenue</div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => openEditModal(tenant)}
                                    className="btn-secondary flex-1 text-sm"
                                >
                                    ✏️ Edit
                                </button>
                                <button
                                    onClick={() => toggleActive(tenant)}
                                    className="btn-secondary text-sm"
                                >
                                    {tenant.is_active ? '⏸️' : '▶️'}
                                </button>
                                <button
                                    onClick={() => deleteTenant(tenant)}
                                    className="btn-secondary text-sm text-red-400 hover:bg-red-500/20"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="glass-card p-6 w-full max-w-md mx-4">
                        <h2 className="text-2xl font-bold mb-6">
                            {editingTenant ? 'Edit Tenant' : 'Add New Tenant'}
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Tenant Name *
                                </label>
                                <input
                                    type="text"
                                    className="input-field w-full"
                                    placeholder="e.g., Acme Corp"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Description
                                </label>
                                <textarea
                                    className="input-field w-full"
                                    placeholder="Brief description of this tenant"
                                    rows={2}
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            {/* Login Credentials - only for new tenants */}
                            {!editingTenant && (
                                <div className="border-t border-slate-700 pt-4">
                                    <h3 className="text-sm font-medium mb-3 text-slate-400">Login Credentials *</h3>
                                    <p className="text-xs text-slate-500 mb-3">
                                        Create login credentials for this tenant
                                    </p>
                                    <div className="space-y-3">
                                        <input
                                            type="email"
                                            className="input-field w-full"
                                            placeholder="Login Email *"
                                            value={formData.login_email}
                                            onChange={(e) => setFormData({ ...formData, login_email: e.target.value })}
                                            required
                                        />
                                        <input
                                            type="password"
                                            className="input-field w-full"
                                            placeholder="Password (min 6 characters) *"
                                            value={formData.login_password}
                                            onChange={(e) => setFormData({ ...formData, login_password: e.target.value })}
                                            minLength={6}
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="border-t border-slate-700 pt-4">
                                <h3 className="text-sm font-medium mb-3 text-slate-400">Contact Information</h3>

                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        className="input-field w-full"
                                        placeholder="Contact Name"
                                        value={formData.contact_name}
                                        onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                                    />
                                    <input
                                        type="email"
                                        className="input-field w-full"
                                        placeholder="Contact Email"
                                        value={formData.contact_email}
                                        onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                                    />
                                    <input
                                        type="tel"
                                        className="input-field w-full"
                                        placeholder="Contact Phone"
                                        value={formData.contact_phone}
                                        onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="btn-secondary flex-1"
                                disabled={saving}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveTenant}
                                className="btn-primary flex-1"
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : editingTenant ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
