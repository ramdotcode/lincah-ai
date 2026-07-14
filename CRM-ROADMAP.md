# CRM — Sisa Pekerjaan & Roadmap

Ringkasan status per 14 Jul 2026 (akhir sesi pengembangan CRM). Dokumen terkait:
- `WAJIB-MANUAL.md` — migrasi yang wajib dijalankan manual + statusnya
- `TESTING-CRM.md` — skenario test manual per fase (45 skenario)

---

## ⏳ WAJIB dilakukan sebelum lanjut (belum selesai)

- [ ] **Jalankan migrasi `0025_add_followup_labels.sql`** di Supabase SQL Editor
- [ ] **Jalankan migrasi `0026_add_deal_value.sql`** di Supabase SQL Editor
- [ ] **Tes menyeluruh** ikut `TESTING-CRM.md` (Fase 0–9 + Regresi Cepat)

> Migrasi 0019–0024 SUDAH dijalankan. Kode Fase 1–9 sudah selesai & lolos build + 332 unit test, TAPI belum dites manual end-to-end oleh user.

---

## ✅ Sudah selesai (9 fase CRM)

| Fase | Fitur | Migrasi |
|---|---|---|
| 1 | Tabel `contacts` nyata + AI auto-capture (`update_contact`) | 0019 |
| 2 | Halaman detail kontak (`/contacts/[id]`) | — |
| 3 | Labels (`/api/labels`, panel di Monitor) | 0020 |
| 4 | AI auto-label | 0021 |
| 5 | Follow-up AI-kontekstual (mode Template vs AI) | 0022 |
| 6 | Merge kontak lintas kanal (`contact_identities`) | 0023 |
| 7 | Stage pipeline custom (tab Pipeline di Settings) | 0024 |
| 8 | Follow-up trigger by label | 0025 |
| 9 | Deal value + forecast pipeline | 0026 |

---

## 🔜 Roadmap belum dikerjakan (prioritas kasar)

### Besar
- [ ] **Deals board terpisah** — satu kontak bisa punya >1 deal (sekarang deal = nilai di 1 conversation). Butuh tabel `deals` (contact_id, title, value, stage, owner, close_date) + board sendiri. Nilai bisnis tinggi, effort besar.
- [ ] **Broadcast outbound** — kirim pesan massal ke segmen kontak (by tag/stage/label) + template WA + analytics. Ala Cekat. Effort besar (+ risiko ban WA, perlu rate-limit ketat seperti follow-up).

### Sedang
- [ ] **Agent assignment ke UI** — kolom `conversations.active_agent_id` sudah ada di DB tapi belum diekspos; tambah assign lead/tiket ke agent + filter "milik saya".
- [ ] **Tiket lengkap** — edit isi tiket (subjek/deskripsi), delete, assign ke agent, catatan internal, link ke contact langsung (sekarang cuma via conversation_id).
- [ ] **Activity timeline per kontak** — log otomatis (stage berubah, tiket dibuat, order masuk, follow-up terkirim) di halaman detail kontak.

### Kecil / polish
- [ ] **Noise kontak webchat** — tiap sesi widget bikin kontak baru; ubah agar kontak dibuat hanya saat visitor kasih info (nama/email/telp).
- [ ] **Merge kontak: undo/split** — merge saat ini permanen. Tambah "pisahkan identitas" bila salah gabung.
- [ ] **AI stage: deskripsi per stage** — saat ini AI klasifikasi stage custom hanya dari LABEL. Tambah field `description` opsional di `pipeline_stages` agar akurasi AI naik untuk stage bernama singkat.
- [ ] **Trigger follow-up by label — timing per label** (ala Cekat: "jika label X tak dibalas Y jam"). Sekarang timing masih ikut delay global bot.
- [ ] **Deal value oleh AI** — `create_order` bisa otomatis isi `deal_value` dari total harga order.

---

## Catatan teknis penting (untuk sesi berikutnya)

- Semua migrasi dijalankan MANUAL di Supabase SQL Editor (konvensi proyek), tidak otomatis via CI. Idempoten, aman re-run.
- Semua fitur AI (auto-label, stage classify, contextual followup) pakai Groq — fail-safe: error/pre-migrasi → jatuh ke perilaku lama.
- `conversations.stage` menyimpan KEY stage (slug), definisi ada di `pipeline_stages`. Label bebas diedit tanpa merusak data.
- Kontak: sumber kebenaran identitas kanal = `contact_identities` (bukan lagi kolom `contacts.platform`).
