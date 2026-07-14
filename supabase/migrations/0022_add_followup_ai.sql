-- 0022: Follow-up mode AI-kontekstual (CRM Fase 5).
-- Menambah pilihan mode pada Auto Follow-up (Fase B, migrasi 0011):
--   'template' = pakai followup_template statis (perilaku lama, default)
--   'ai'       = AI menyusun pesan follow-up dari riwayat percakapan
-- Jalankan manual di Supabase SQL Editor. Idempoten, aman di-re-run.

alter table bots
  add column if not exists followup_mode text not null default 'template'
    check (followup_mode in ('template', 'ai'));

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
