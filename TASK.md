# Lincah AI — Task List

> Update task dengan centang `[x]` setelah selesai.

---

## 📦 Fase 1: RAG (Retrieval-Augmented Generation)

- [ ] **Chunking dokumen** — Potong `knowledge_sources.content` jadi potongan kecil (256-512 token) dengan overlap
- [ ] **Embedding** — Generate vector embeddings dari tiap chunk (pake Groq embedding atau OpenAI text-embedding-3)
- [ ] **Vector Store** — Setup pgvector di Supabase (tabel `knowledge_embeddings`)
- [ ] **Semantic Search** — Waktu user chat, embed pertanyaan → cari top-K chunk relevan (cosine similarity)
- [ ] **Dynamic Context Injection** — Ganti prompt stuffing dengan kirim cuma chunk relevan ke LLM
- [ ] **Fallback** — Kalo gak ada chunk relevan, kasih tahu user (bukan halusinasi)
- [ ] **Admin UI: Upload File (PDF/DOCX/TXT)** — Parse isi file, simpan ke knowledge_sources
- [ ] **Admin UI: Website Scraper** — Crawl & extract konten website jadi knowledge

---

## 🛒 Fase 2: Alur Pemesanan (Structured Conversation)

- [ ] **State machine chat** — Bot bisa jalanin flow bertahap (pilih layanan → isi alamat → pilih jadwal → konfirmasi)
- [ ] **Tabel `orders`** — Simpan data order (customer, service, address, schedule, status, notes)
- [ ] **Form wizard di chat** — Bot ngumpulin data step-by-step, validasi tiap langkah
- [ ] **Generate order summary** — Ringkasan order + ticket ID otomatis
- [ ] **Multi-session order** — Handle user order sambil tetap bisa tanya2 lain
- [ ] **Cancel/ubah order** — User bisa cancel atau ubah order lewat chat

---

## 📊 Fase 3: Dashboard & Analytics

- [ ] **Grafik volume chat** — Line chart per hari/minggu/bulan
- [ ] **Grafik handoff rate** — Berapa % chat yang diangkat admin
- [ ] **Grafik order conversion** — Dari leads jadi order
- [ ] **Response time** — Rata-rata waktu respon AI vs admin
- [ ] **Top knowledge queries** — Topik apa yang paling sering ditanyakan
- [ ] **Export laporan** — Download CSV/PDF

---

## 🔔 Fase 4: Notifikasi & Broadcast

- [ ] **Notifikasi order ke owner WhatsApp** — Format rapi (order ID, service, jadwal, kontak)
- [ ] **Notifikasi handoff ke owner WhatsApp** — Admin perlu turun tangan
- [ ] **Auto-followup** — Chat otomatis setelah X jam inactive
- [ ] **Broadcast promo** — Kirim pesan massal ke leads (dengan opt-out)
- [ ] **Reminder jadwal** — Pengingat H-1 ke customer
- [ ] **Post-service review** — Minta rating setelah order selesai

---

## 🛡️ Fase 5: Hardening & Infrastructure

- [ ] **Rate limiting** — Batasi request per user per menit (di API routes)
- [ ] **Anti-spam** — Deteksi pesan berulang/nge-spam
- [ ] **WhatsApp 24h session compliance** — Gak kirim pesan outbound di luar window
- [ ] **Opt-out handler** — User bisa berhenti terima broadcast
- [ ] **Sentry / error tracking** — Pantau error di production
- [ ] **Caching (Redis atau in-memory)** — Cache knowledge, konfigurasi bot, dll
- [ ] **Logging terstruktur** — Ganti console.log dengan pino/Sentry
- [ ] **Input sanitasi** — Validasi & bersihin input dari webhook

---

## 📋 Fase 6: CRM & Admin Enhancements

- [ ] **Search conversation** — Cari chat berdasarkan nama/pesan
- [ ] **Filter & sort** — Filter by platform, status, tanggal
- [ ] **Export leads** — Download data leads ke CSV
- [ ] **Private notes** — Catatan internal admin per lead
- [ ] **Lead segmentation** — Tag/label customer
- [ ] **Agent assignment** — Tentukan admin mana yang handle chat
- [ ] **Riwayat order per customer** — Lihat semua order customer

---

## 📅 Fase 7: Penjadwalan

- [ ] **Slot availability** — Tentukan jam yang tersedia per hari
- [ ] **Booking & double-booking prevention** — Cegah 2 order di jam sama
- [ ] **Reschedule via chat** — Customer bisa ubah jadwal lewat bot
- [ ] **Teknisi management** — Assign teknisi ke tiap order
- [ ] **Google Calendar sync** — Sinkronisasi jadwal ke Google Calendar

---

## ⚙️ Fase 8: Advanced AI & Settings

- [ ] **AI Actions: Auto-labeling** — Detect intent → label otomatis
- [ ] **AI Actions: Pipeline update** — Ubah status lead otomatis (new → contacted → qualified → order)
- [ ] **AI Evaluation** — Thumbs up/down per jawaban, track quality score
- [ ] **A/B Testing prompt** — Bandingkan performa 2 prompt berbeda
- [ ] **Tab Followups** — Konfigurasi auto-followup di UI
- [ ] **Tab Orchestration** — Workflow AI custom

---

## 🌐 Fase 9: Omnichannel & Integrasi Tambahan

- [ ] **Instagram DM** — Webhook + send API
- [ ] **Facebook Messenger** — Webhook + send API
- [ ] **Website live chat widget** — Embed di website customer
- [ ] **Multi-language / i18n** — Support bahasa lain (EN/ID)
- [ ] **Team management** — Multi-admin, role-based access

---

## 🎨 Fase 10: UX Polish

- [ ] **Typing indicator** — Kirim "sedang mengetik..." pas bot proses jawaban
- [ ] **Multi-bubble response** — Pisah jawaban panjang jadi beberapa bubble
- [ ] **Message buffering** — Tunggu user selesai ngetik baru proses
- [ ] **Image/multimodal** — Kirim & terima gambar
- [ ] **Dark mode polish** — Pastikan semua komponen konsisten
- [ ] **Responsive mobile** — Optimasi tampilan HP
