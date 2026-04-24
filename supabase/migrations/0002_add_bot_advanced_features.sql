-- Migration: Add Advanced Bot Configuration Fields
-- Created at: 2026-04-23

-- 1. Add new columns for UI features
ALTER TABLE bots 
ADD COLUMN IF NOT EXISTS welcome_message TEXT,
ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS ai_label TEXT,
ADD COLUMN IF NOT EXISTS ai_pipeline_status TEXT;

-- 2. Clean up or refresh policies if needed
DROP POLICY IF EXISTS "Users can manage their own bots" ON bots;
CREATE POLICY "Users can manage their own bots" 
  ON bots FOR ALL 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to bots" ON bots;
CREATE POLICY "Service role full access to bots"
  ON bots FOR ALL
  USING (auth.role() = 'service_role');
