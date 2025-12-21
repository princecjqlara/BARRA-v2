-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Facebook Configurations (per-user)
CREATE TABLE facebook_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  ad_account_id TEXT,
  dataset_id TEXT,
  webhook_subscribed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, page_id)
);

-- Contacts
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  facebook_lead_id TEXT,
  facebook_page_id TEXT,
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  custom_fields JSONB DEFAULT '{}',
  ai_analysis JSONB,
  source TEXT DEFAULT 'webhook' CHECK (source IN ('webhook', 'manual', 'import')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_facebook_lead_id ON contacts(facebook_lead_id);
CREATE INDEX idx_contacts_email ON contacts(email);

-- Pipelines
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pipelines_user_id ON pipelines(user_id);

-- Pipeline Stages
CREATE TABLE pipeline_stages (
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

CREATE INDEX idx_pipeline_stages_pipeline_id ON pipeline_stages(pipeline_id);

-- Contact Stage Assignments
CREATE TABLE contact_stage_assignments (
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

CREATE INDEX idx_contact_stage_contact_id ON contact_stage_assignments(contact_id);
CREATE INDEX idx_contact_stage_stage_id ON contact_stage_assignments(stage_id);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  platform TEXT DEFAULT 'messenger' CHECK (platform IN ('messenger', 'whatsapp', 'instagram')),
  facebook_message_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_messages_contact_id ON messages(contact_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);

-- AI Analysis Logs
CREATE TABLE ai_analysis_logs (
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

CREATE INDEX idx_ai_logs_user_id ON ai_analysis_logs(user_id);

-- Enable Row Level Security
ALTER TABLE facebook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_stage_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY "Users can view own facebook_configs"
  ON facebook_configs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own facebook_configs"
  ON facebook_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own facebook_configs"
  ON facebook_configs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own facebook_configs"
  ON facebook_configs FOR DELETE
  USING (auth.uid() = user_id);

-- Contacts policies
CREATE POLICY "Users can view own contacts"
  ON contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contacts"
  ON contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contacts"
  ON contacts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts"
  ON contacts FOR DELETE
  USING (auth.uid() = user_id);

-- Pipelines policies
CREATE POLICY "Users can view own pipelines"
  ON pipelines FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pipelines"
  ON pipelines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pipelines"
  ON pipelines FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pipelines"
  ON pipelines FOR DELETE
  USING (auth.uid() = user_id);

-- Pipeline stages policies (via pipeline ownership)
CREATE POLICY "Users can view own pipeline_stages"
  ON pipeline_stages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM pipelines 
    WHERE pipelines.id = pipeline_stages.pipeline_id 
    AND pipelines.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own pipeline_stages"
  ON pipeline_stages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM pipelines 
    WHERE pipelines.id = pipeline_stages.pipeline_id 
    AND pipelines.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own pipeline_stages"
  ON pipeline_stages FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM pipelines 
    WHERE pipelines.id = pipeline_stages.pipeline_id 
    AND pipelines.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own pipeline_stages"
  ON pipeline_stages FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM pipelines 
    WHERE pipelines.id = pipeline_stages.pipeline_id 
    AND pipelines.user_id = auth.uid()
  ));

-- Contact stage assignments policies
CREATE POLICY "Users can view own contact_stage_assignments"
  ON contact_stage_assignments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM contacts 
    WHERE contacts.id = contact_stage_assignments.contact_id 
    AND contacts.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own contact_stage_assignments"
  ON contact_stage_assignments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM contacts 
    WHERE contacts.id = contact_stage_assignments.contact_id 
    AND contacts.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own contact_stage_assignments"
  ON contact_stage_assignments FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM contacts 
    WHERE contacts.id = contact_stage_assignments.contact_id 
    AND contacts.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own contact_stage_assignments"
  ON contact_stage_assignments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM contacts 
    WHERE contacts.id = contact_stage_assignments.contact_id 
    AND contacts.user_id = auth.uid()
  ));

-- Messages policies
CREATE POLICY "Users can view own messages"
  ON messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- AI Analysis Logs policies
CREATE POLICY "Users can view own ai_analysis_logs"
  ON ai_analysis_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai_analysis_logs"
  ON ai_analysis_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role bypass for webhooks (server-side operations)
-- Note: Use service_role key for webhook handlers to bypass RLS

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_facebook_configs_updated_at
  BEFORE UPDATE ON facebook_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pipelines_updated_at
  BEFORE UPDATE ON pipelines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pipeline_stages_updated_at
  BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contact_stage_assignments_updated_at
  BEFORE UPDATE ON contact_stage_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
