-- 0025: Trigger follow-up berdasarkan label (CRM Fase 8).
-- Selain stage, follow-up bisa dipicu bila percakapan punya label tertentu.
-- Jalankan manual di Supabase SQL Editor. Idempoten.

alter table bots
  add column if not exists followup_label_ids uuid[] not null default '{}';

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
