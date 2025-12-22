'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface DashboardStats {
  totalContacts: number;
  newLeadsToday: number;
  activePipelines: number;
  conversionsSent: number;
}

interface RecentContact {
  id: string;
  full_name: string;
  email: string;
  ai_analysis?: {
    summary: string;
    urgency: 'low' | 'medium' | 'high';
  };
  created_at: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalContacts: 0,
    newLeadsToday: 0,
    activePipelines: 0,
    conversionsSent: 0,
  });
  const [recentContacts, setRecentContacts] = useState<RecentContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  async function checkAuthAndLoad() {
    try {
      // Check if user is authenticated
      const authRes = await fetch('/api/auth/me');
      const authData = await authRes.json();

      if (!authData.authenticated) {
        // Redirect to login if not authenticated
        router.push('/login');
        return;
      }

      setIsAuthenticated(true);
      setIsAdmin(authData.isAdmin || false);
      loadDashboardData();
    } catch (err) {
      console.error('Auth check failed:', err);
      router.push('/login');
    }
  }


  async function loadDashboardData() {
    try {
      // Fetch contacts
      const contactsRes = await fetch('/api/contacts?limit=5');
      const contactsData = await contactsRes.json();

      // Fetch pipelines
      const pipelinesRes = await fetch('/api/pipelines');
      const pipelinesData = await pipelinesRes.json();

      setStats({
        totalContacts: contactsData.pagination?.total || 0,
        newLeadsToday: contactsData.contacts?.filter((c: RecentContact) =>
          new Date(c.created_at).toDateString() === new Date().toDateString()
        ).length || 0,
        activePipelines: pipelinesData.pipelines?.length || 0,
        conversionsSent: 0, // TODO: Track this
      });

      setRecentContacts(contactsData.contacts || []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading || isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  // If somehow not authenticated after loading, redirect
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-4xl font-bold gradient-text mb-2">
          Lead Pipeline
        </h1>
        <p className="text-slate-400">
          AI-powered lead management with Facebook CAPI integration
        </p>
      </header>

      {/* Navigation */}
      <nav className="flex gap-4 mb-8">
        <Link href="/" className="btn-primary">
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
        {isAdmin && (
          <Link href="/tenants" className="btn-secondary">
            Tenants
          </Link>
        )}
        <Link href="/settings" className="btn-secondary">
          Settings
        </Link>
      </nav>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Contacts"
          value={stats.totalContacts}
          icon="👥"
          color="blue"
        />
        <StatCard
          title="New Leads Today"
          value={stats.newLeadsToday}
          icon="🆕"
          color="green"
        />
        <StatCard
          title="Active Pipelines"
          value={stats.activePipelines}
          icon="📊"
          color="purple"
        />
        <StatCard
          title="CAPI Events Sent"
          value={stats.conversionsSent}
          icon="📤"
          color="orange"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Leads */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Recent Leads</h2>
            <Link href="/contacts" className="text-indigo-400 hover:text-indigo-300 text-sm">
              View All →
            </Link>
          </div>

          {recentContacts.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-4xl mb-4">📭</p>
              <p>No contacts yet. Connect your Facebook Page to start receiving leads!</p>
              <Link href="/settings" className="btn-primary mt-4 inline-block">
                Connect Facebook
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {recentContacts.map((contact) => (
                <div key={contact.id} className="contact-card">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{contact.full_name || 'Unknown'}</h3>
                      <p className="text-sm text-slate-400">{contact.email}</p>
                    </div>
                    {contact.ai_analysis && (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium badge-${contact.ai_analysis.urgency}`}>
                        {contact.ai_analysis.urgency}
                      </span>
                    )}
                  </div>
                  {contact.ai_analysis?.summary && (
                    <p className="text-sm text-slate-300 mt-2 line-clamp-2">
                      {contact.ai_analysis.summary}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    {new Date(contact.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-semibold mb-6">Quick Actions</h2>
          <div className="space-y-4">
            <QuickAction
              title="Generate Pipeline"
              description="Let AI create a pipeline based on your leads"
              icon="🤖"
              href="/pipelines?action=generate"
            />
            <QuickAction
              title="Analyze Contacts"
              description="Run AI analysis on unanalyzed contacts"
              icon="🔍"
              onClick={() => analyzeContacts()}
            />
            <QuickAction
              title="Import Contacts"
              description="Manually add contacts to your pipeline"
              icon="📥"
              href="/contacts?action=import"
            />
            <QuickAction
              title="Connect Facebook"
              description="Set up Facebook Page and CAPI"
              icon="🔗"
              href="/settings"
            />
          </div>
        </div>
      </div>
    </div>
  );

  async function analyzeContacts() {
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      alert(`Analyzed ${data.analyzed} contacts!`);
      loadDashboardData();
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed. Please try again.');
    }
  }
}

function StatCard({ title, value, icon, color }: {
  title: string;
  value: number;
  icon: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
}) {
  const colorClasses = {
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    green: 'from-green-500/20 to-green-600/10 border-green-500/30',
    purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
    orange: 'from-orange-500/20 to-orange-600/10 border-orange-500/30',
  };

  return (
    <div className={`glass-card p-6 bg-gradient-to-br ${colorClasses[color]} animate-fade-in`}>
      <div className="flex items-center gap-4">
        <span className="text-4xl">{icon}</span>
        <div>
          <p className="text-3xl font-bold">{value}</p>
          <p className="text-sm text-slate-400">{title}</p>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ title, description, icon, href, onClick }: {
  title: string;
  description: string;
  icon: string;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 transition-all cursor-pointer group">
      <span className="text-2xl group-hover:scale-110 transition-transform">{icon}</span>
      <div>
        <h3 className="font-medium group-hover:text-indigo-400 transition-colors">{title}</h3>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return <button onClick={onClick} className="w-full text-left">{content}</button>;
}
