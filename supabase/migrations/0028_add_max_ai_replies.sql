-- 0028: Batas jumlah balasan AI per percakapan, dipaksa lewat kode.
-- Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- Latar: aturan "bot cuma 2 balasan inti lalu handoff" sebelumnya dititipkan ke
-- transfer_condition, tapi handoff checker memakai model tier `fast` yang tidak
-- sanggup menalar riwayat percakapan — terbukti 3 Sep 2026 bot masih menjawab
-- 3 pesan setelah harga keluar, bahkan bilang "aku sambungin ke Rama" tanpa
-- handoff beneran. Batas ini sekarang dihitung deterministik di kode.
--
-- null / 0 = tidak dibatasi (perilaku lama, bot lain tidak terpengaruh).

alter table bots
  add column if not exists max_ai_replies integer;

comment on column bots.max_ai_replies is
  'Maksimum balasan AI per percakapan sebelum handoff dipaksa. null/0 = tanpa batas.';

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
