# Lincah AI — Konteks Proyek untuk Tim

> Dokumen ini adalah sumber kebenaran (source of truth) tentang platform Lincah AI per **8 Juli 2026**. Gunakan untuk menjawab pertanyaan tim tentang fitur, progress, arsitektur, dan kapasitas sistem.

---

## 1. Apa itu Lincah AI?

Lincah AI adalah **platform AI agent untuk customer service multi-channel** (Telegram & WhatsApp) dengan kemampuan **handoff otomatis ke manusia**. Bot AI menjawab pelanggan secara otomatis, dan ketika mendeteksi kondisi tertentu (misal pelanggan frustrasi, minta bicara dengan orang, atau topik sensitif), percakapan otomatis dialihkan ke admin manusia.

**Target pasar:** bisnis jasa/UMKM (contoh awal: servis AC, toko lokal), tapi didesain sebagai platform omnichannel AI CRM umum.

**Diferensiator utama:** pemrosesan AI paralel — respons ke pelanggan (Llama 3.3 70B) dan pengecekan kondisi handoff (Llama 3.1 8B) dijalankan bersamaan, sehingga latensi rendah.

---

## 2. Tech Stack

| Komponen | Teknologi |
|---|---|
| Frontend + Backend | Next.js 16.2.4 (App Router), TypeScript, Tailwind CSS 4, Framer Motion |
| Database | Supabase (PostgreSQL) dengan Row-Level Security |
| Auth | Supabase Auth — Email, Google OAuth, GitHub OAuth |
| AI/LLM | Groq Cloud API — Llama 3.3 70B Versatile (respons utama, temp 0.7) + Llama 3.1 8B Instant (deteksi handoff, temp 0) |
| WhatsApp | @whiskeysockets/baileys 7.0 (berbasis WhatsApp Web, BUKAN API resmi Meta) — via bridge server terpisah |
| Telegram | Bot API resmi via webhook |
| Hosting | Vercel (app utama) + VPS terpisah (WhatsApp bridge, port 3001) |

---

## 3. Fitur yang SUDAH JADI (Live)

1. **Login & Auth** — email, Google, GitHub via Supabase.
2. **Manajemen Agent/Bot** (`/agents`) — buat, edit, hapus bot; template Customer Service.
3. **Konfigurasi Bot** (`/settings`) — system prompt, kondisi transfer/handoff, welcome message, pilihan model AI, simulator chat untuk testing sebelum live.
4. **Knowledge Base** — admin bisa isi pengetahuan bisnis (teks, Q&A, produk, dll) yang otomatis dipakai AI saat menjawab. Catatan: masih "prompt stuffing" (semua knowledge dimasukkan ke prompt), belum pakai vector search/RAG.
5. **Live Chat Monitor** (`/monitor`) — dashboard real-time semua percakapan, admin bisa balas manual, ada fitur AI suggestion untuk membantu admin menyusun balasan.
6. **Leads/CRM** (`/leads`) — daftar semua kontak yang pernah chat, dengan pencarian dan filter.
7. **Integrasi Telegram** — full working via webhook.
8. **Integrasi WhatsApp** — working via Baileys bridge; scan QR code dari UI, multi-bot (tiap bot punya sesi WA sendiri), auto-reconnect.
9. **Handoff AI → Manusia** — otomatis berdasarkan kondisi yang dikonfigurasi; ada opsi `stop_ai_after_handoff` (AI diam setelah handoff) dan `silent_handoff` (handoff tanpa memberi tahu pelanggan).
10. **Notifikasi handoff ke owner** via Telegram (opsional).

## 4. Fitur yang BELUM JADI (Roadmap — semua belum dimulai kecuali dicatat)

- **Phase 1 — RAG sesungguhnya:** chunking dokumen, vector embeddings (pgvector), semantic search, upload file PDF/DOCX, website scraper.
- **Phase 2 — Order flow terstruktur:** state machine untuk pemesanan multi-step, tabel orders, cancel/reschedule.
- **Phase 3 — Dashboard Analytics:** grafik volume chat, handoff rate, conversion funnel, export CSV/PDF. (Halaman `/dashboard` saat ini masih placeholder onboarding.)
- **Phase 4 — Notifikasi & Broadcast:** broadcast message, auto-followup, reminder.
- **Phase 5 — Hardening:** rate limiting, anti-spam, Redis caching, Sentry, sanitasi input.
- **Phase 6 — CRM lanjutan:** tagging leads, catatan admin, export CSV, assignment agent.
- **Phase 7 — Scheduling/booking:** slot ketersediaan, sinkronisasi Google Calendar.
- **Phase 8 — AI lanjutan:** auto-labeling, A/B testing prompt, evaluasi kualitas AI.
- **Phase 9 — Omnichannel:** Instagram DM, Facebook Messenger, widget live chat website, multi-admin/team management. (Telegram ✅ dan WhatsApp ✅ sudah jalan.)
- **Phase 10 — UX polish:** typing indicator, multi-bubble, dukungan gambar/multimodal, mobile responsiveness.

---

## 5. Cara Kerja (Arsitektur)

Alur pesan masuk:

1. Pelanggan kirim pesan di Telegram/WhatsApp.
2. Pesan masuk ke webhook (`/api/webhook/telegram` atau `/api/webhook/whatsapp`; untuk WA, bridge server Baileys yang meneruskan).
3. Sistem cari bot & percakapan di database; percakapan baru dibuat otomatis dengan status `active`.
4. **Jika status percakapan `pending` (sudah handoff ke manusia) atau `closed`** → AI tidak menjawab, pesan hanya disimpan, admin dinotifikasi.
5. Jika masih `active` → ambil knowledge base bot, lalu kirim **2 request AI paralel ke Groq**: satu untuk menyusun jawaban, satu untuk cek kondisi handoff (jawaban YES/NO).
6. Jika handoff = YES → status jadi `pending`, pelanggan diberi tahu sedang disambungkan ke agent (kecuali silent mode).
7. Jika tidak → jawaban AI dikirim balik ke pelanggan lewat platform masing-masing.
8. Semua riwayat percakapan disimpan di database (kolom JSONB `history`); AI hanya melihat **10 pesan terakhir** sebagai konteks.

Komponen deployment:
- **App utama di Vercel** (serverless) — semua halaman & API.
- **WhatsApp bridge di VPS terpisah** — menjaga koneksi WebSocket ke WhatsApp, menyimpan sesi login WA di folder `/sessions` di disk.
- **Supabase** — database & auth (managed).
- **Groq Cloud** — semua pemrosesan AI.

Data utama di database: `bots` (konfigurasi tiap bot), `conversations` (percakapan + history), `knowledge_sources` (knowledge base), `messages` (arsip, jarang dipakai).

---

## 6. Kapasitas & Skalabilitas (PENTING untuk pertanyaan "kuat berapa user?")

### Kondisi saat ini
Sistem ini **MVP** — cocok untuk volume **kecil-menengah, kira-kira sampai ~1.000 pesan/hari atau puluhan-ratusan pelanggan aktif bersamaan**. Belum siap untuk ribuan pengguna simultan tanpa pekerjaan tambahan.

### Jawaban untuk "bisa ga dipake 5.000 orang?"
**Tergantung polanya:**
- **5.000 total kontak/leads terdaftar** → ✅ Bisa. Database Supabase menangani ini dengan mudah.
- **5.000 orang chatting tersebar sepanjang hari** (misal beberapa ratus pesan/jam) → ⚠️ Kemungkinan bisa, tapi berisiko kena rate limit Groq API dan bridge WhatsApp bisa jadi bottleneck.
- **5.000 orang chatting bersamaan dalam waktu singkat** → ❌ Belum bisa. Perlu upgrade arsitektur dulu (lihat bawah).

### Bottleneck yang diketahui
1. **WhatsApp bridge = single instance.** Satu proses Node.js menangani semua sesi WA. Kalau proses mati, semua pesan WA berhenti sampai restart. Belum ada clustering/failover.
2. **Sesi WA disimpan di disk** — lambat kalau bot sangat banyak; rencana pindah ke Redis.
3. **Tidak ada rate limiting** di webhook — spam/lonjakan bisa menghabiskan kuota Groq.
4. **Tidak ada message queue** — pemrosesan pesan blocking (webhook menunggu AI selesai).
5. **Tidak ada caching** — konfigurasi bot & knowledge di-query dari DB setiap pesan masuk.
6. **Knowledge base tanpa embedding** — kalau knowledge sangat besar (>10K token), prompt membengkak → AI melambat dan biaya naik.
7. **Groq API punya rate limit** sesuai tier langganan — ini batas eksternal yang harus dicek.
8. **Risiko Baileys:** karena memakai reverse-engineering WhatsApp Web (bukan API resmi Meta), ada risiko nomor diblokir WhatsApp jika volume/perilaku mencurigakan. Untuk skala besar/enterprise, sebaiknya migrasi ke WhatsApp Business API resmi (kolom database sudah disiapkan untuk ini: `whatsapp_bot_type` bisa 'baileys' atau 'meta').

### Yang diperlukan untuk scale ke ribuan user simultan
- Redis untuk caching config/knowledge + penyimpanan sesi WA.
- Message queue (BullMQ) agar pemrosesan pesan asinkron.
- Rate limiting per user/endpoint.
- Clustering bridge server (PM2/multiple instance).
- Vector embeddings (pgvector) untuk knowledge base.
- Pertimbangkan WhatsApp Business API resmi.

---

## 7. FAQ Cepat

**Q: WhatsApp-nya pakai API resmi?**
A: Belum. Pakai Baileys (berbasis WhatsApp Web, scan QR). Gratis tapi ada risiko banned untuk volume tinggi. Struktur sudah disiapkan untuk migrasi ke Meta API resmi.

**Q: AI-nya pakai apa? ChatGPT?**
A: Bukan. Pakai Llama 3.3 70B via Groq Cloud (cepat & murah). Model kecil Llama 3.1 8B khusus untuk deteksi kapan harus dialihkan ke manusia.

**Q: Bisa dipakai lebih dari satu bisnis/bot?**
A: Ya, multi-bot. Tiap user bisa punya banyak bot, masing-masing dengan prompt, knowledge, dan nomor WA/token Telegram sendiri.

**Q: Kalau admin mau ambil alih chat dari AI?**
A: Bisa, lewat halaman Monitor — ubah status percakapan lalu balas manual. AI juga otomatis menyerahkan chat kalau kondisi handoff terpenuhi.

**Q: Data pelanggan disimpan di mana? Aman?**
A: Di Supabase (PostgreSQL) dengan Row-Level Security — tiap user hanya bisa akses data bot miliknya sendiri.

**Q: Bisa upload PDF/file untuk knowledge?**
A: Belum. Saat ini knowledge diinput sebagai teks/Q&A lewat UI. Upload file dan scraping website ada di roadmap Phase 1.

**Q: Ada analytics/laporan?**
A: Baru statistik dasar (total leads, pending handoff). Dashboard analytics lengkap ada di roadmap Phase 3.

**Q: Berapa biaya operasionalnya?**
A: Komponen biaya: Vercel (bisa gratis untuk mulai), Supabase (free tier tersedia), Groq API (bayar per token, relatif murah), VPS untuk WhatsApp bridge (~$5-10/bulan). Baileys sendiri gratis (tidak seperti WhatsApp Business API yang berbayar per percakapan).

---

## 8. Status Proyek Terkini (per 8 Juli 2026)

Pekerjaan terakhir difokuskan pada: perbaikan UX knowledge resource, stabilisasi koneksi WhatsApp (fix infinite restart loop pada sesi), perbaikan UI status WhatsApp, dan persiapan deployment ke Vercel dengan URL bridge yang configurable via environment variable.

**Tahap:** MVP fungsional — fitur inti (bot AI, Telegram, WhatsApp, handoff, knowledge base, monitor, leads) sudah jalan. Roadmap Phase 1–10 (RAG, order flow, analytics, broadcast, hardening, dll.) belum dimulai.
