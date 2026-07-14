# Wajib Dijalankan Manual (Setup Sistem)

Daftar langkah yang **tidak otomatis** ikut deploy — harus dijalankan tangan sendiri supaya sistem berfungsi. Ini bukan checklist testing (itu ada di `TESTING-CRM.md`), ini setup wajib.

> Konvensi proyek: migrasi SQL TIDAK dijalankan otomatis oleh CI/CD. Setiap file migrasi baru = buka **Supabase Dashboard → SQL Editor → copy-paste seluruh isi file → Run**. Semua migrasi ditulis idempoten (aman di-re-run).

## Migrasi Supabase (urut)

| File | Untuk | Status |
|---|---|---|
| `supabase/migrations/0016_add_orchestration.sql` | Orchestration parent-child bot | ✅ sudah |
| `supabase/migrations/0017_add_whatsapp_connections.sql` | WA level akun (`whatsapp_connections`) | ✅ sudah |
| `supabase/migrations/0018_add_tickets.sql` | Tabel `tickets` (halaman Tickets) | ✅ sudah |
| `supabase/migrations/0019_add_contacts.sql` | Tabel `contacts` + link `conversations.contact_id` + izinkan tool `update_contact` + backfill | ✅ sudah (14 Jul 2026) |
| `supabase/migrations/0020_add_labels.sql` | Tabel `labels` + `conversation_labels` (CRM Fase 3) | ✅ sudah (14 Jul 2026) |
| `supabase/migrations/0021_add_label_ai.sql` | Kolom `labels.ai_enabled` — AI auto-label (CRM Fase 4) | ✅ sudah (14 Jul 2026) |
| `supabase/migrations/0022_add_followup_ai.sql` | Kolom `bots.followup_mode` — follow-up AI-kontekstual (CRM Fase 5) | ✅ sudah (14 Jul 2026) |
| `supabase/migrations/0023_add_contact_identities.sql` | Tabel `contact_identities` — merge kontak lintas kanal (CRM Fase 6) | ✅ sudah (14 Jul 2026) |
| `supabase/migrations/0024_add_pipeline_stages.sql` | Tabel `pipeline_stages` — stage pipeline custom per akun (CRM Fase 7) | ✅ sudah (14 Jul 2026) |
| `supabase/migrations/0025_add_followup_labels.sql` | Kolom `bots.followup_label_ids` — trigger follow-up by label (CRM Fase 8) | ⬜ **BELUM — jalankan ini** |
| `supabase/migrations/0026_add_deal_value.sql` | Kolom `conversations.deal_value` — nilai deal & forecast (CRM Fase 9) | ⬜ **BELUM — jalankan ini** |

Setelah menjalankan migrasi yang menambah kolom/tabel baru, kalau API mengeluh kolom tidak dikenal, jalankan sekali di SQL Editor:
```sql
notify pgrst, 'reload schema';
```
(0019 dan 0020 sudah menyertakan ini di akhir file.)

## Non-SQL (infra)

| Langkah | Untuk | Status |
|---|---|---|
| Rename folder sesi WA di VPS (`43.157.248.134`) dari `bot_id` → `user_id` | Migrasi 0017 (WA level akun) — worker pakai key sesi = user_id | Sesuai catatan proyek; cek kalau WA tidak connect |
| `TELEGRAM_WEBHOOK_SECRET`, `BRIDGE_SHARED_TOKEN`, dst. di env Vercel | Verifikasi origin webhook | Sudah berjalan |

## Cara update file ini

Setiap kali ada migrasi/langkah manual baru dari pengembangan, tambahkan barisnya ke tabel di atas dengan status ⬜, dan ubah jadi ✅ setelah dijalankan.
