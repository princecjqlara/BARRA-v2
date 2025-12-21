-- Migration: Add Revenue Tracking and Lead Quality
-- This enables accurate ROAS calculation and lead value tracking

-- Add revenue/value fields to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_value DECIMAL(12,2) DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS actual_revenue DECIMAL(12,2) DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_quality_score INTEGER DEFAULT 0; -- 0-100
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS conversion_event_sent BOOLEAN DEFAULT false;

-- Create index for converted contacts
CREATE INDEX IF NOT EXISTS idx_contacts_converted ON contacts(converted_at) WHERE converted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_lead_quality ON contacts(lead_quality_score);

-- Add value tracking to conversions
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS pipeline_stage_id UUID REFERENCES pipeline_stages(id);
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create a table for tracking revenue by source
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
  -- Timestamps
  revenue_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_tracking_user_id ON revenue_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_tracking_contact_id ON revenue_tracking(contact_id);
CREATE INDEX IF NOT EXISTS idx_revenue_tracking_ad_id ON revenue_tracking(facebook_ad_id);
CREATE INDEX IF NOT EXISTS idx_revenue_tracking_campaign_id ON revenue_tracking(facebook_campaign_id);

-- Enable RLS
ALTER TABLE revenue_tracking ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own revenue_tracking"
  ON revenue_tracking FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own revenue_tracking"
  ON revenue_tracking FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own revenue_tracking"
  ON revenue_tracking FOR UPDATE
  USING (auth.uid() = user_id);

-- Create a comprehensive ROAS view
CREATE OR REPLACE VIEW campaign_roas AS
SELECT 
  c.user_id,
  c.facebook_campaign_id,
  c.campaign_name,
  -- Lead metrics
  COUNT(DISTINCT c.id) as total_leads,
  COUNT(DISTINCT CASE WHEN c.converted_at IS NOT NULL THEN c.id END) as converted_leads,
  ROUND(COUNT(DISTINCT CASE WHEN c.converted_at IS NOT NULL THEN c.id END)::DECIMAL / 
        NULLIF(COUNT(DISTINCT c.id), 0) * 100, 2) as conversion_rate,
  -- Revenue
  COALESCE(SUM(c.actual_revenue), 0) as total_revenue,
  ROUND(AVG(c.actual_revenue) FILTER (WHERE c.actual_revenue > 0), 2) as avg_revenue_per_customer,
  -- Quality
  ROUND(AVG(c.lead_quality_score), 0) as avg_lead_quality,
  COUNT(DISTINCT CASE WHEN c.lead_quality_score >= 70 THEN c.id END) as high_quality_leads,
  -- Calculated from campaign_metrics
  cm.lifetime_spend as ad_spend,
  -- ROAS
  CASE 
    WHEN cm.lifetime_spend > 0 THEN ROUND(COALESCE(SUM(c.actual_revenue), 0) / cm.lifetime_spend, 2)
    ELSE 0 
  END as roas,
  -- Profit
  COALESCE(SUM(c.actual_revenue), 0) - COALESCE(cm.lifetime_spend, 0) as profit
FROM contacts c
LEFT JOIN campaign_metrics cm ON cm.campaign_id = c.facebook_campaign_id AND cm.user_id = c.user_id
WHERE c.facebook_campaign_id IS NOT NULL
GROUP BY 
  c.user_id,
  c.facebook_campaign_id,
  c.campaign_name,
  cm.lifetime_spend;

-- Create a view for ad-level ROAS
CREATE OR REPLACE VIEW ad_roas AS
SELECT 
  c.user_id,
  c.facebook_ad_id,
  c.ad_name,
  c.facebook_campaign_id,
  c.campaign_name,
  -- Lead metrics
  COUNT(DISTINCT c.id) as total_leads,
  COUNT(DISTINCT CASE WHEN c.converted_at IS NOT NULL THEN c.id END) as converted_leads,
  -- Revenue
  COALESCE(SUM(c.actual_revenue), 0) as total_revenue,
  -- Quality
  ROUND(AVG(c.lead_quality_score), 0) as avg_lead_quality,
  -- Spend from facebook_ads_cache
  fac.spend as ad_spend,
  -- ROAS
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
