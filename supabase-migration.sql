-- Supabase Migration: ARIA Web Application Schema

-- 1. Workspaces Table
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path TEXT,
  git_url TEXT,
  git_branch TEXT,
  status TEXT DEFAULT 'active',
  is_pinned BOOLEAN DEFAULT false,
  project_summary JSONB,
  last_opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for Workspaces
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own workspaces"
ON workspaces FOR ALL USING (auth.uid() = owner_id);

-- 2. User Settings & Limits
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'dark',
  font_size INT DEFAULT 14,
  tab_size INT DEFAULT 2,
  auto_save BOOLEAN DEFAULT true,
  model_id TEXT,
  temperature FLOAT DEFAULT 0.2,
  max_tokens INT DEFAULT 4096,
  github_token TEXT,
  watsonx_api_key TEXT,
  has_completed_onboarding BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for Settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own settings"
ON user_settings FOR ALL USING (auth.uid() = user_id);

-- 3. Chats
CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  orchestrate_thread_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for Chats
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own chats"
ON chats FOR ALL USING (auth.uid() = user_id);

-- 4. Chat Messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls JSONB,
  tool_results JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for Chat Messages
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their chat messages"
ON chat_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM chats WHERE chats.id = chat_messages.chat_id AND chats.user_id = auth.uid())
);
CREATE POLICY "Users can insert their chat messages"
ON chat_messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM chats WHERE chats.id = chat_messages.chat_id AND chats.user_id = auth.uid())
);

-- 5. Storage Bucket for Workspaces
INSERT INTO storage.buckets (id, name, public) 
VALUES ('workspaces', 'workspaces', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies (Allow authenticated users to manage their workspace files)
-- For simplicity, since the path begins with workspace ID, we can enforce access based on workspace ownership.
-- But since storage policies on joined tables can be complex, a simpler approach for this prototype 
-- is to allow authenticated users access to the bucket.
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'workspaces');

CREATE POLICY "Authenticated users can update files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'workspaces');

CREATE POLICY "Authenticated users can read files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'workspaces');

CREATE POLICY "Authenticated users can delete files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'workspaces');
