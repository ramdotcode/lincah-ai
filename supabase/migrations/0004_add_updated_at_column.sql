-- Migration: Add updated_at column to bots table
-- Created at: 2026-04-23

ALTER TABLE bots 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
