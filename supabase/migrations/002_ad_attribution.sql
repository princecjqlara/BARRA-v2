-- Migration: Add Ad Attribution and ROAS Tracking
-- This adds columns to track which ad, campaign, and form each lead came from

-- Add ad attribution columns to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS facebook_ad_id TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS facebook_adset_id TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS facebook_campaign_id TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS facebook_form_id TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS facebook_form_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS campaign_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS adset_name TEXT;

-- Add indexes for filtering by ad attribution
CREATE INDEX IF NOT EXISTS idx_contacts_ad_id ON contacts(facebook_ad_id);
CREATE INDEX IF NOT EXISTS idx_contacts_campaign_id ON contacts(facebook_campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_form_id ON contacts(facebook_form_id);
CREATE INDEX IF NOT EXISTS idx_contacts_page_id ON contacts(facebook_page_id);

-- Create a table to cache ad/campaign metadata
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
  leads_count INTEGER DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_facebook_ads_cache_user_id ON facebook_ads_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_ads_cache_campaign_id ON facebook_ads_cache(campaign_id);

-- Create conversion tracking table for ROAS calculation
CREATE TABLE IF NOT EXISTS conversions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  facebook_ad_id TEXT,
  facebook_campaign_id TEXT,
  event_name TEXT NOT NULL,
  event_value DECIMAL(10,2) DEFAULT 0,
  event_currency TEXT DEFAULT 'USD',
  capi_event_id TEXT,
  sent_to_facebook BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversions_user_id ON conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_conversions_contact_id ON conversions(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversions_ad_id ON conversions(facebook_ad_id);

-- Enable RLS on new tables
ALTER TABLE facebook_ads_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for facebook_ads_cache
CREATE POLICY "Users can view own facebook_ads_cache"
  ON facebook_ads_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own facebook_ads_cache"
  ON facebook_ads_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own facebook_ads_cache"
  ON facebook_ads_cache FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for conversions
CREATE POLICY "Users can view own conversions"
  ON conversions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversions"
  ON conversions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Apply updated_at trigger to new tables
CREATE TRIGGER update_facebook_ads_cache_updated_at
  BEFORE UPDATE ON facebook_ads_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create a view for ROAS analytics
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
