-- Enable uuid-ossp extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. BOTS TABLE (Initial Base)
CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  system_prompt TEXT,
  transfer_condition TEXT,
  stop_ai_after_handoff BOOLEAN DEFAULT TRUE,
  silent_handoff BOOLEAN DEFAULT FALSE,
  telegram_token TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. CONVERSATIONS TABLE
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  platform TEXT DEFAULT 'telegram',
  status TEXT DEFAULT 'ai_active',
  customer_name TEXT,
  last_message TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. INDICES
CREATE INDEX IF NOT EXISTS idx_conversations_bot_id ON conversations(bot_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

-- 5. RLS
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own bots" ON bots FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to bots" ON bots FOR ALL USING (auth.role() = 'service_role');
