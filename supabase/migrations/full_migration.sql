-- ============================================================================
-- COMPLETE DATABASE MIGRATION: Lead Pipeline SaaS with Facebook CAPI
-- ============================================================================
-- Run this entire script in Supabase SQL Editor
-- This creates ALL tables, indexes, RLS policies, triggers, and views
-- Last Updated: 2025-12-22
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PART 1: CORE TABLES
-- ============================================================================

-- 1.1 Facebook Configurations (per-user)
CREATE TABLE IF NOT EXISTS facebook_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  ad_account_id TEXT,
  dataset_id TEXT,
  webhook_subscribed BOOLEAN DEFAULT false,
  tenant_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, page_id)
);

-- 1.2 Contacts (Leads)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Facebook Lead Data
  facebook_lead_id TEXT,
  facebook_page_id TEXT,
  -- Ad Attribution
  facebook_ad_id TEXT,
  facebook_adset_id TEXT,
  facebook_campaign_id TEXT,
  facebook_form_id TEXT,
  facebook_form_name TEXT,
  ad_name TEXT,
  campaign_name TEXT,
  adset_name TEXT,
  -- Contact Information
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  custom_fields JSONB DEFAULT '{}',
  -- AI Analysis
  ai_analysis JSONB,
  -- Lead Quality & Value
  lead_value DECIMAL(12,2) DEFAULT 0,
  actual_revenue DECIMAL(12,2) DEFAULT 0,
  lead_quality_score INTEGER DEFAULT 0,
  converted_at TIMESTAMP WITH TIME ZONE,
  conversion_event_sent BOOLEAN DEFAULT false,
  -- Multi-tenancy
  tenant_id UUID,
  -- Source & Timestamps
  source TEXT DEFAULT 'webhook' CHECK (source IN ('webhook', 'manual', 'import')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.3 Pipelines
CREATE TABLE IF NOT EXISTS pipelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  ai_generated BOOLEAN DEFAULT false,
  tenant_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.4 Pipeline Stages
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#6366f1',
  requirements JSONB DEFAULT '{"criteria": []}',
  capi_event_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.5 Contact Stage Assignments
CREATE TABLE IF NOT EXISTS contact_stage_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  assigned_by TEXT DEFAULT 'ai' CHECK (assigned_by IN ('ai', 'manual')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(contact_id, pipeline_id)
);

-- 1.6 Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  platform TEXT DEFAULT 'messenger' CHECK (platform IN ('messenger', 'whatsapp', 'instagram')),
  facebook_message_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.7 AI Analysis Logs
CREATE TABLE IF NOT EXISTS ai_analysis_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('analyze_contact', 'suggest_pipeline', 'assign_stage', 'reanalyze', 'bulk_assign')),
  model_used TEXT NOT NULL,
  input_summary TEXT,
  output_summary TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- PART 2: AD TRACKING TABLES
-- ============================================================================

-- 2.1 Facebook Ads Cache (stores ad metadata and metrics)
CREATE TABLE IF NOT EXISTS facebook_ads_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_id TEXT NOT NULL,
  ad_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  page_id TEXT,
  status TEXT,
  -- Lead & Revenue
  leads_count INTEGER DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  -- Performance Metrics
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  reach BIGINT DEFAULT 0,
  frequency DECIMAL(10,4) DEFAULT 0,
  ctr DECIMAL(10,4) DEFAULT 0,
  cpc DECIMAL(10,4) DEFAULT 0,
  cpm DECIMAL(10,4) DEFAULT 0,
  cpp DECIMAL(10,4) DEFAULT 0,
  cost_per_lead DECIMAL(10,4) DEFAULT 0,
  actions JSONB DEFAULT '[]',
  date_start DATE,
  date_stop DATE,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, ad_id)
);

-- 2.2 Conversions (CAPI events sent to Facebook)
CREATE TABLE IF NOT EXISTS conversions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  pipeline_stage_id UUID REFERENCES pipeline_stages(id),
  facebook_ad_id TEXT,
  facebook_campaign_id TEXT,
  event_name TEXT NOT NULL,
  event_value DECIMAL(10,2) DEFAULT 0,
  event_currency TEXT DEFAULT 'USD',
  capi_event_id TEXT,
  sent_to_facebook BOOLEAN DEFAULT false,
  notes TEXT,
  tenant_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.3 Daily Ad Metrics History
CREATE TABLE IF NOT EXISTS ad_metrics_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_id TEXT NOT NULL,
  adset_id TEXT,
  campaign_id TEXT,
  date DATE NOT NULL,
  -- Core metrics
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  reach BIGINT DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  -- Calculated metrics
  ctr DECIMAL(10,4) DEFAULT 0,
  cpc DECIMAL(10,4) DEFAULT 0,
  cpm DECIMAL(10,4) DEFAULT 0,
  cpp DECIMAL(10,4) DEFAULT 0,
  frequency DECIMAL(10,4) DEFAULT 0,
  -- Lead-specific
  leads INTEGER DEFAULT 0,
  cost_per_lead DECIMAL(10,4) DEFAULT 0,
  -- Additional metrics
  unique_clicks BIGINT DEFAULT 0,
  unique_ctr DECIMAL(10,4) DEFAULT 0,
  inline_link_clicks BIGINT DEFAULT 0,
  outbound_clicks BIGINT DEFAULT 0,
  -- Conversion metrics
  conversions INTEGER DEFAULT 0,
  conversion_value DECIMAL(10,2) DEFAULT 0,
  roas DECIMAL(10,4) DEFAULT 0,
  -- Raw actions data
  actions JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, ad_id, date)
);

-- 2.4 Campaign-Level Metrics
CREATE TABLE IF NOT EXISTS campaign_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  status TEXT,
  objective TEXT,
  -- Lifetime metrics
  lifetime_impressions BIGINT DEFAULT 0,
  lifetime_clicks BIGINT DEFAULT 0,
  lifetime_reach BIGINT DEFAULT 0,
  lifetime_spend DECIMAL(12,2) DEFAULT 0,
  lifetime_leads INTEGER DEFAULT 0,
  -- Calculated lifetime metrics
  avg_ctr DECIMAL(10,4) DEFAULT 0,
  avg_cpc DECIMAL(10,4) DEFAULT 0,
  avg_cpm DECIMAL(10,4) DEFAULT 0,
  avg_cost_per_lead DECIMAL(10,4) DEFAULT 0,
  -- ROAS
  total_revenue DECIMAL(12,2) DEFAULT 0,
  roas DECIMAL(10,4) DEFAULT 0,
  -- Timestamps
  start_time TIMESTAMP WITH TIME ZONE,
  stop_time TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, campaign_id)
);

-- 2.5 Revenue Tracking
CREATE TABLE IF NOT EXISTS revenue_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  facebook_ad_id TEXT,
  facebook_campaign_id TEXT,
  -- Revenue details
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  revenue_type TEXT CHECK (revenue_type IN ('sale', 'subscription', 'upsell', 'recurring', 'other')),
  description TEXT,
  -- CAPI tracking
  capi_event_sent BOOLEAN DEFAULT false,
  capi_event_id TEXT,
  -- Multi-tenancy
  tenant_id UUID,
  -- Timestamps
  revenue_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- PART 3: MULTI-TENANCY
-- ============================================================================

-- 3.1 Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  -- Contact info
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  -- Settings
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key constraints for tenant_id
ALTER TABLE facebook_configs 
  ADD CONSTRAINT fk_facebook_configs_tenant 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;

ALTER TABLE contacts 
  ADD CONSTRAINT fk_contacts_tenant 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;

ALTER TABLE pipelines 
  ADD CONSTRAINT fk_pipelines_tenant 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;

ALTER TABLE conversions 
  ADD CONSTRAINT fk_conversions_tenant 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;

ALTER TABLE revenue_tracking 
  ADD CONSTRAINT fk_revenue_tracking_tenant 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;

-- ============================================================================
-- PART 4: INDEXES
-- ============================================================================

-- Contacts indexes
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_facebook_lead_id ON contacts(facebook_lead_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_ad_id ON contacts(facebook_ad_id);
CREATE INDEX IF NOT EXISTS idx_contacts_campaign_id ON contacts(facebook_campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_form_id ON contacts(facebook_form_id);
CREATE INDEX IF NOT EXISTS idx_contacts_page_id ON contacts(facebook_page_id);
CREATE INDEX IF NOT EXISTS idx_contacts_converted ON contacts(converted_at) WHERE converted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_lead_quality ON contacts(lead_quality_score);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);

-- Pipelines indexes
CREATE INDEX IF NOT EXISTS idx_pipelines_user_id ON pipelines(user_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_tenant ON pipelines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline_id ON pipeline_stages(pipeline_id);

-- Assignments indexes
CREATE INDEX IF NOT EXISTS idx_contact_stage_contact_id ON contact_stage_assignments(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_stage_stage_id ON contact_stage_assignments(stage_id);

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);

-- AI logs indexes
CREATE INDEX IF NOT EXISTS idx_ai_logs_user_id ON ai_analysis_logs(user_id);

-- Facebook configs indexes
CREATE INDEX IF NOT EXISTS idx_facebook_configs_user_id ON facebook_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_configs_tenant ON facebook_configs(tenant_id);

-- Facebook ads cache indexes
CREATE INDEX IF NOT EXISTS idx_facebook_ads_cache_user_id ON facebook_ads_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_ads_cache_campaign_id ON facebook_ads_cache(campaign_id);

-- Conversions indexes
CREATE INDEX IF NOT EXISTS idx_conversions_user_id ON conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_conversions_contact_id ON conversions(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversions_ad_id ON conversions(facebook_ad_id);
CREATE INDEX IF NOT EXISTS idx_conversions_tenant ON conversions(tenant_id);

-- Ad metrics daily indexes
CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_user_id ON ad_metrics_daily(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_ad_id ON ad_metrics_daily(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_campaign_id ON ad_metrics_daily(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_date ON ad_metrics_daily(date);

-- Campaign metrics indexes
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_user_id ON campaign_metrics(user_id);

-- Revenue tracking indexes
CREATE INDEX IF NOT EXISTS idx_revenue_tracking_user_id ON revenue_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_tracking_contact_id ON revenue_tracking(contact_id);
CREATE INDEX IF NOT EXISTS idx_revenue_tracking_ad_id ON revenue_tracking(facebook_ad_id);
CREATE INDEX IF NOT EXISTS idx_revenue_tracking_campaign_id ON revenue_tracking(facebook_campaign_id);
CREATE INDEX IF NOT EXISTS idx_revenue_tracking_tenant ON revenue_tracking(tenant_id);

-- Tenants indexes
CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active) WHERE is_active = true;

-- ============================================================================
-- PART 5: ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE facebook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_stage_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_ads_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies: facebook_configs
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own facebook_configs" ON facebook_configs;
CREATE POLICY "Users can view own facebook_configs"
  ON facebook_configs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own facebook_configs" ON facebook_configs;
CREATE POLICY "Users can insert own facebook_configs"
  ON facebook_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own facebook_configs" ON facebook_configs;
CREATE POLICY "Users can update own facebook_configs"
  ON facebook_configs FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own facebook_configs" ON facebook_configs;
CREATE POLICY "Users can delete own facebook_configs"
  ON facebook_configs FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- RLS Policies: contacts
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own contacts" ON contacts;
CREATE POLICY "Users can view own contacts"
  ON contacts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own contacts" ON contacts;
CREATE POLICY "Users can insert own contacts"
  ON contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own contacts" ON contacts;
CREATE POLICY "Users can update own contacts"
  ON contacts FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own contacts" ON contacts;
CREATE POLICY "Users can delete own contacts"
  ON contacts FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- RLS Policies: pipelines
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own pipelines" ON pipelines;
CREATE POLICY "Users can view own pipelines"
  ON pipelines FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own pipelines" ON pipelines;
CREATE POLICY "Users can insert own pipelines"
  ON pipelines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own pipelines" ON pipelines;
CREATE POLICY "Users can update own pipelines"
  ON pipelines FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own pipelines" ON pipelines;
CREATE POLICY "Users can delete own pipelines"
  ON pipelines FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- RLS Policies: pipeline_stages
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own pipeline_stages" ON pipeline_stages;
CREATE POLICY "Users can view own pipeline_stages"
  ON pipeline_stages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM pipelines 
    WHERE pipelines.id = pipeline_stages.pipeline_id 
    AND pipelines.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can insert own pipeline_stages" ON pipeline_stages;
CREATE POLICY "Users can insert own pipeline_stages"
  ON pipeline_stages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM pipelines 
    WHERE pipelines.id = pipeline_stages.pipeline_id 
    AND pipelines.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update own pipeline_stages" ON pipeline_stages;
CREATE POLICY "Users can update own pipeline_stages"
  ON pipeline_stages FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM pipelines 
    WHERE pipelines.id = pipeline_stages.pipeline_id 
    AND pipelines.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can delete own pipeline_stages" ON pipeline_stages;
CREATE POLICY "Users can delete own pipeline_stages"
  ON pipeline_stages FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM pipelines 
    WHERE pipelines.id = pipeline_stages.pipeline_id 
    AND pipelines.user_id = auth.uid()
  ));

-- ============================================================================
-- RLS Policies: contact_stage_assignments
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own contact_stage_assignments" ON contact_stage_assignments;
CREATE POLICY "Users can view own contact_stage_assignments"
  ON contact_stage_assignments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM contacts 
    WHERE contacts.id = contact_stage_assignments.contact_id 
    AND contacts.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can insert own contact_stage_assignments" ON contact_stage_assignments;
CREATE POLICY "Users can insert own contact_stage_assignments"
  ON contact_stage_assignments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM contacts 
    WHERE contacts.id = contact_stage_assignments.contact_id 
    AND contacts.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update own contact_stage_assignments" ON contact_stage_assignments;
CREATE POLICY "Users can update own contact_stage_assignments"
  ON contact_stage_assignments FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM contacts 
    WHERE contacts.id = contact_stage_assignments.contact_id 
    AND contacts.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can delete own contact_stage_assignments" ON contact_stage_assignments;
CREATE POLICY "Users can delete own contact_stage_assignments"
  ON contact_stage_assignments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM contacts 
    WHERE contacts.id = contact_stage_assignments.contact_id 
    AND contacts.user_id = auth.uid()
  ));

-- ============================================================================
-- RLS Policies: messages
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own messages" ON messages;
CREATE POLICY "Users can view own messages"
  ON messages FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own messages" ON messages;
CREATE POLICY "Users can insert own messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS Policies: ai_analysis_logs
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own ai_analysis_logs" ON ai_analysis_logs;
CREATE POLICY "Users can view own ai_analysis_logs"
  ON ai_analysis_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own ai_analysis_logs" ON ai_analysis_logs;
CREATE POLICY "Users can insert own ai_analysis_logs"
  ON ai_analysis_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS Policies: facebook_ads_cache
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own facebook_ads_cache" ON facebook_ads_cache;
CREATE POLICY "Users can view own facebook_ads_cache"
  ON facebook_ads_cache FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own facebook_ads_cache" ON facebook_ads_cache;
CREATE POLICY "Users can insert own facebook_ads_cache"
  ON facebook_ads_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own facebook_ads_cache" ON facebook_ads_cache;
CREATE POLICY "Users can update own facebook_ads_cache"
  ON facebook_ads_cache FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- RLS Policies: conversions
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own conversions" ON conversions;
CREATE POLICY "Users can view own conversions"
  ON conversions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own conversions" ON conversions;
CREATE POLICY "Users can insert own conversions"
  ON conversions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS Policies: ad_metrics_daily
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own ad_metrics_daily" ON ad_metrics_daily;
CREATE POLICY "Users can view own ad_metrics_daily"
  ON ad_metrics_daily FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own ad_metrics_daily" ON ad_metrics_daily;
CREATE POLICY "Users can insert own ad_metrics_daily"
  ON ad_metrics_daily FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own ad_metrics_daily" ON ad_metrics_daily;
CREATE POLICY "Users can update own ad_metrics_daily"
  ON ad_metrics_daily FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- RLS Policies: campaign_metrics
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own campaign_metrics" ON campaign_metrics;
CREATE POLICY "Users can view own campaign_metrics"
  ON campaign_metrics FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own campaign_metrics" ON campaign_metrics;
CREATE POLICY "Users can insert own campaign_metrics"
  ON campaign_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own campaign_metrics" ON campaign_metrics;
CREATE POLICY "Users can update own campaign_metrics"
  ON campaign_metrics FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- RLS Policies: revenue_tracking
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own revenue_tracking" ON revenue_tracking;
CREATE POLICY "Users can view own revenue_tracking"
  ON revenue_tracking FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own revenue_tracking" ON revenue_tracking;
CREATE POLICY "Users can insert own revenue_tracking"
  ON revenue_tracking FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own revenue_tracking" ON revenue_tracking;
CREATE POLICY "Users can update own revenue_tracking"
  ON revenue_tracking FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- RLS Policies: tenants
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own tenants" ON tenants;
CREATE POLICY "Users can view own tenants"
  ON tenants FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own tenants" ON tenants;
CREATE POLICY "Users can insert own tenants"
  ON tenants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own tenants" ON tenants;
CREATE POLICY "Users can update own tenants"
  ON tenants FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own tenants" ON tenants;
CREATE POLICY "Users can delete own tenants"
  ON tenants FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- PART 6: FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_facebook_configs_updated_at ON facebook_configs;
CREATE TRIGGER update_facebook_configs_updated_at
  BEFORE UPDATE ON facebook_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pipelines_updated_at ON pipelines;
CREATE TRIGGER update_pipelines_updated_at
  BEFORE UPDATE ON pipelines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pipeline_stages_updated_at ON pipeline_stages;
CREATE TRIGGER update_pipeline_stages_updated_at
  BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_contact_stage_assignments_updated_at ON contact_stage_assignments;
CREATE TRIGGER update_contact_stage_assignments_updated_at
  BEFORE UPDATE ON contact_stage_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_facebook_ads_cache_updated_at ON facebook_ads_cache;
CREATE TRIGGER update_facebook_ads_cache_updated_at
  BEFORE UPDATE ON facebook_ads_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaign_metrics_updated_at ON campaign_metrics;
CREATE TRIGGER update_campaign_metrics_updated_at
  BEFORE UPDATE ON campaign_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 7: VIEWS FOR ANALYTICS
-- ============================================================================

-- 7.1 Ad Performance Stats View
CREATE OR REPLACE VIEW ad_performance_stats AS
SELECT 
  c.user_id,
  c.facebook_campaign_id,
  c.campaign_name,
  c.facebook_ad_id,
  c.ad_name,
  c.facebook_page_id,
  COUNT(DISTINCT c.id) as total_leads,
  COUNT(DISTINCT CASE WHEN conv.event_name = 'Purchase' THEN conv.id END) as conversions,
  COALESCE(SUM(conv.event_value), 0) as total_revenue,
  MAX(c.created_at) as last_lead_at
FROM contacts c
LEFT JOIN conversions conv ON conv.contact_id = c.id
WHERE c.facebook_ad_id IS NOT NULL
GROUP BY 
  c.user_id,
  c.facebook_campaign_id,
  c.campaign_name,
  c.facebook_ad_id,
  c.ad_name,
  c.facebook_page_id;

-- 7.2 Ad Performance Dashboard View
CREATE OR REPLACE VIEW ad_performance_dashboard AS
SELECT 
  cm.user_id,
  cm.campaign_id,
  cm.campaign_name,
  cm.status,
  cm.objective,
  cm.lifetime_impressions,
  cm.lifetime_clicks,
  cm.lifetime_reach,
  cm.lifetime_spend,
  cm.lifetime_leads,
  cm.avg_ctr,
  cm.avg_cpc,
  cm.avg_cpm,
  cm.avg_cost_per_lead,
  cm.total_revenue,
  cm.roas,
  cm.last_synced_at,
  (SELECT COUNT(*) FROM contacts c WHERE c.facebook_campaign_id = cm.campaign_id AND c.user_id = cm.user_id) as contact_count,
  (SELECT COALESCE(SUM(conv.event_value), 0) FROM conversions conv WHERE conv.facebook_campaign_id = cm.campaign_id AND conv.user_id = cm.user_id) as pipeline_revenue
FROM campaign_metrics cm;

-- 7.3 Campaign ROAS View
CREATE OR REPLACE VIEW campaign_roas AS
SELECT 
  c.user_id,
  c.facebook_campaign_id,
  c.campaign_name,
  COUNT(DISTINCT c.id) as total_leads,
  COUNT(DISTINCT CASE WHEN c.converted_at IS NOT NULL THEN c.id END) as converted_leads,
  ROUND(COUNT(DISTINCT CASE WHEN c.converted_at IS NOT NULL THEN c.id END)::DECIMAL / 
        NULLIF(COUNT(DISTINCT c.id), 0) * 100, 2) as conversion_rate,
  COALESCE(SUM(c.actual_revenue), 0) as total_revenue,
  ROUND(AVG(c.actual_revenue) FILTER (WHERE c.actual_revenue > 0), 2) as avg_revenue_per_customer,
  ROUND(AVG(c.lead_quality_score), 0) as avg_lead_quality,
  COUNT(DISTINCT CASE WHEN c.lead_quality_score >= 70 THEN c.id END) as high_quality_leads,
  cm.lifetime_spend as ad_spend,
  CASE 
    WHEN cm.lifetime_spend > 0 THEN ROUND(COALESCE(SUM(c.actual_revenue), 0) / cm.lifetime_spend, 2)
    ELSE 0 
  END as roas,
  COALESCE(SUM(c.actual_revenue), 0) - COALESCE(cm.lifetime_spend, 0) as profit
FROM contacts c
LEFT JOIN campaign_metrics cm ON cm.campaign_id = c.facebook_campaign_id AND cm.user_id = c.user_id
WHERE c.facebook_campaign_id IS NOT NULL
GROUP BY 
  c.user_id,
  c.facebook_campaign_id,
  c.campaign_name,
  cm.lifetime_spend;

-- 7.4 Ad-Level ROAS View
CREATE OR REPLACE VIEW ad_roas AS
SELECT 
  c.user_id,
  c.facebook_ad_id,
  c.ad_name,
  c.facebook_campaign_id,
  c.campaign_name,
  COUNT(DISTINCT c.id) as total_leads,
  COUNT(DISTINCT CASE WHEN c.converted_at IS NOT NULL THEN c.id END) as converted_leads,
  COALESCE(SUM(c.actual_revenue), 0) as total_revenue,
  ROUND(AVG(c.lead_quality_score), 0) as avg_lead_quality,
  fac.spend as ad_spend,
  CASE 
    WHEN fac.spend > 0 THEN ROUND(COALESCE(SUM(c.actual_revenue), 0) / fac.spend, 2)
    ELSE 0 
  END as roas
FROM contacts c
LEFT JOIN facebook_ads_cache fac ON fac.ad_id = c.facebook_ad_id AND fac.user_id = c.user_id
WHERE c.facebook_ad_id IS NOT NULL
GROUP BY 
  c.user_id,
  c.facebook_ad_id,
  c.ad_name,
  c.facebook_campaign_id,
  c.campaign_name,
  fac.spend;

-- 7.5 Tenant Statistics View
CREATE OR REPLACE VIEW tenant_stats AS
SELECT 
  t.id as tenant_id,
  t.user_id,
  t.name as tenant_name,
  t.is_active,
  (SELECT COUNT(*) FROM contacts c WHERE c.tenant_id = t.id) as contact_count,
  (SELECT COUNT(*) FROM pipelines p WHERE p.tenant_id = t.id) as pipeline_count,
  (SELECT COUNT(*) FROM facebook_configs fc WHERE fc.tenant_id = t.id) as page_count,
  (SELECT COALESCE(SUM(r.amount), 0) FROM revenue_tracking r WHERE r.tenant_id = t.id) as total_revenue,
  (SELECT MAX(c.created_at) FROM contacts c WHERE c.tenant_id = t.id) as last_lead_at,
  t.created_at
FROM tenants t;

-- ============================================================================
-- PART 8: SERVICE ROLE POLICIES (for webhooks/background jobs)
-- ============================================================================

-- Allow service role to bypass RLS for webhook processing
DROP POLICY IF EXISTS "Service role can manage all facebook_configs" ON facebook_configs;
CREATE POLICY "Service role can manage all facebook_configs"
  ON facebook_configs FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all contacts" ON contacts;
CREATE POLICY "Service role can manage all contacts"
  ON contacts FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all messages" ON messages;
CREATE POLICY "Service role can manage all messages"
  ON messages FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all pipelines" ON pipelines;
CREATE POLICY "Service role can manage all pipelines"
  ON pipelines FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all pipeline_stages" ON pipeline_stages;
CREATE POLICY "Service role can manage all pipeline_stages"
  ON pipeline_stages FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all contact_stage_assignments" ON contact_stage_assignments;
CREATE POLICY "Service role can manage all contact_stage_assignments"
  ON contact_stage_assignments FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all ai_analysis_logs" ON ai_analysis_logs;
CREATE POLICY "Service role can manage all ai_analysis_logs"
  ON ai_analysis_logs FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all conversions" ON conversions;
CREATE POLICY "Service role can manage all conversions"
  ON conversions FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all facebook_ads_cache" ON facebook_ads_cache;
CREATE POLICY "Service role can manage all facebook_ads_cache"
  ON facebook_ads_cache FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all ad_metrics_daily" ON ad_metrics_daily;
CREATE POLICY "Service role can manage all ad_metrics_daily"
  ON ad_metrics_daily FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all campaign_metrics" ON campaign_metrics;
CREATE POLICY "Service role can manage all campaign_metrics"
  ON campaign_metrics FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all revenue_tracking" ON revenue_tracking;
CREATE POLICY "Service role can manage all revenue_tracking"
  ON revenue_tracking FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can manage all tenants" ON tenants;
CREATE POLICY "Service role can manage all tenants"
  ON tenants FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- MIGRATION COMPLETE!
-- ============================================================================
-- Your database is now ready for the Lead Pipeline SaaS with:
-- ✅ Core tables (contacts, pipelines, stages, messages)
-- ✅ Facebook integration (pages, ads, webhooks)
-- ✅ Ad attribution tracking (campaign, ad, form)
-- ✅ Performance metrics (CTR, CPC, CPM, CPL)
-- ✅ Revenue tracking and ROAS calculation
-- ✅ Lead quality scoring
-- ✅ Multi-tenancy support
-- ✅ Row Level Security on all tables
-- ✅ Service role policies for webhooks
-- ✅ Analytics views for dashboards
-- ============================================================================
