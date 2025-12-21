-- ============================================================================
-- MIGRATION: Add Multi-Tenancy Support
-- ============================================================================
-- This allows users (agencies) to manage multiple tenants (clients/sub-accounts)
-- ============================================================================

-- Create tenants table
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

CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active) WHERE is_active = true;

-- Add tenant_id to related tables
ALTER TABLE facebook_configs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE revenue_tracking ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

-- Create indexes for tenant filtering
CREATE INDEX IF NOT EXISTS idx_facebook_configs_tenant ON facebook_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_tenant ON pipelines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversions_tenant ON conversions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_revenue_tracking_tenant ON revenue_tracking(tenant_id);

-- Enable RLS on tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenants
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

-- Apply updated_at trigger
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create a view for tenant statistics
CREATE OR REPLACE VIEW tenant_stats AS
SELECT 
  t.id as tenant_id,
  t.user_id,
  t.name as tenant_name,
  t.is_active,
  -- Counts
  (SELECT COUNT(*) FROM contacts c WHERE c.tenant_id = t.id) as contact_count,
  (SELECT COUNT(*) FROM pipelines p WHERE p.tenant_id = t.id) as pipeline_count,
  (SELECT COUNT(*) FROM facebook_configs fc WHERE fc.tenant_id = t.id) as page_count,
  -- Revenue
  (SELECT COALESCE(SUM(r.amount), 0) FROM revenue_tracking r WHERE r.tenant_id = t.id) as total_revenue,
  -- Recent activity
  (SELECT MAX(c.created_at) FROM contacts c WHERE c.tenant_id = t.id) as last_lead_at,
  t.created_at
FROM tenants t;

-- ============================================================================
-- MIGRATION COMPLETE!
-- ============================================================================
