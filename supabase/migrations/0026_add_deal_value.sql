-- 0026: Nilai deal & forecast pipeline (CRM Fase 9).
-- Tiap lead (conversation) bisa punya perkiraan nilai transaksi → total pipeline
-- & forecast revenue. Jalankan manual di Supabase SQL Editor. Idempoten.

alter table conversations
  add column if not exists deal_value numeric;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
