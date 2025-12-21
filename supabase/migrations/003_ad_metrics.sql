-- Migration: Add Ad Performance Metrics
-- This adds tables and columns for tracking CTR, CPM, CPC, impressions, spend, etc.

-- Extend facebook_ads_cache with more metrics
ALTER TABLE facebook_ads_cache ADD COLUMN IF NOT EXISTS impressions BIGINT DEFAULT 0;
ALTER TABLE facebook_ads_cache ADD COLUMN IF NOT EXISTS clicks BIGINT DEFAULT 0;
ALTER TABLE facebook_ads_cache ADD COLUMN IF NOT EXISTS reach BIGINT DEFAULT 0;
ALTER TABLE facebook_ads_cache ADD COLUMN IF NOT EXISTS frequency DECIMAL(10,4) DEFAULT 0;
ALTER TABLE facebook_ads_cache ADD COLUMN IF NOT EXISTS ctr DECIMAL(10,4) DEFAULT 0;
ALTER TABLE facebook_ads_cache ADD COLUMN IF NOT EXISTS cpc DECIMAL(10,4) DEFAULT 0;
ALTER TABLE facebook_ads_cache ADD COLUMN IF NOT EXISTS cpm DECIMAL(10,4) DEFAULT 0;
ALTER TABLE facebook_ads_cache ADD COLUMN IF NOT EXISTS cpp DECIMAL(10,4) DEFAULT 0;
ALTER TABLE facebook_ads_cache ADD COLUMN IF NOT EXISTS cost_per_lead DECIMAL(10,4) DEFAULT 0;
ALTER TABLE facebook_ads_cache ADD COLUMN IF NOT EXISTS actions JSONB DEFAULT '[]';
ALTER TABLE facebook_ads_cache ADD COLUMN IF NOT EXISTS date_start DATE;
ALTER TABLE facebook_ads_cache ADD COLUMN IF NOT EXISTS date_stop DATE;
ALTER TABLE facebook_ads_cache ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- Create a table for daily ad metrics history
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

CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_user_id ON ad_metrics_daily(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_ad_id ON ad_metrics_daily(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_campaign_id ON ad_metrics_daily(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_date ON ad_metrics_daily(date);

-- Create a table for campaign-level metrics
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

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_user_id ON campaign_metrics(user_id);

-- Enable RLS
ALTER TABLE ad_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own ad_metrics_daily"
  ON ad_metrics_daily FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ad_metrics_daily"
  ON ad_metrics_daily FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ad_metrics_daily"
  ON ad_metrics_daily FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own campaign_metrics"
  ON campaign_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own campaign_metrics"
  ON campaign_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own campaign_metrics"
  ON campaign_metrics FOR UPDATE
  USING (auth.uid() = user_id);

-- Apply updated_at trigger
CREATE TRIGGER update_campaign_metrics_updated_at
  BEFORE UPDATE ON campaign_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create a view for ad performance dashboard
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
  -- Count contacts from this campaign
  (SELECT COUNT(*) FROM contacts c WHERE c.facebook_campaign_id = cm.campaign_id AND c.user_id = cm.user_id) as contact_count,
  -- Count conversions from this campaign
  (SELECT COALESCE(SUM(conv.event_value), 0) FROM conversions conv WHERE conv.facebook_campaign_id = cm.campaign_id AND conv.user_id = cm.user_id) as pipeline_revenue
FROM campaign_metrics cm;
