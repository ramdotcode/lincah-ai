-- 0021: AI auto-label (CRM Fase 4) — tandai label mana yang boleh dipasang AI
-- secara otomatis berdasarkan isi percakapan (ala Cekat AI).
-- Jalankan manual di Supabase SQL Editor. Idempoten, aman di-re-run.

alter table labels
  add column if not exists ai_enabled boolean not null default false;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
