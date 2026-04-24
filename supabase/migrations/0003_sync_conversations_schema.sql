-- Migration: Sync Conversations Schema for Telegram Webhook & History
-- Created at: 2026-04-23

-- 1. Tambah kolom yang dibutuhkan untuk data user Telegram & History AI
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS handoff_at TIMESTAMP WITH TIME ZONE;

-- 2. Update status default agar sesuai dengan logika di kode (active)
ALTER TABLE conversations 
ALTER COLUMN status SET DEFAULT 'active';

-- 3. Tambah kolom metadata tambahan untuk CRM yang lebih baik
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
