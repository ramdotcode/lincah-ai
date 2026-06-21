-- 6. KNOWLEDGE SOURCES TABLE
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'text', 'website', 'file', 'qna', 'product'
  name TEXT NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_bot_id ON knowledge_sources(bot_id);

-- RLS
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage knowledge for their bots" ON knowledge_sources
  FOR ALL USING (
    bot_id IN (SELECT id FROM bots WHERE user_id = auth.uid())
  );
CREATE POLICY "Service role full access to knowledge" ON knowledge_sources FOR ALL USING (auth.role() = 'service_role');
