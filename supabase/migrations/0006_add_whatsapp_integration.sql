-- 0006_add_whatsapp_integration.sql

-- Add WhatsApp specific columns to bots table
ALTER TABLE bots 
ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS whatsapp_phone_number TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_verify_token TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_phone_id TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_bot_type TEXT DEFAULT 'baileys';

-- Add indices for faster lookup
CREATE INDEX IF NOT EXISTS idx_bots_whatsapp_phone_number ON bots(whatsapp_phone_number);

-- Update conversations platform constraint if needed (not strictly enforced by schema, but good to know)
-- In migration 0001 it was just TEXT DEFAULT 'telegram'
