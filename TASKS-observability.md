# Observability & Monitoring — Lincah AI

> Instruksi untuk Claude Code. Kerjakan task berurutan (Task 1 → 5). Setiap task punya acceptance criteria — jangan lanjut ke task berikutnya sebelum criteria terpenuhi.

## Konteks Proyek

- **App utama**: Next.js 16 (App Router) + TypeScript, deploy di Vercel. Webhook masuk di `/api/webhook/telegram` dan `/api/webhook/whatsapp`.
- **Bridge WhatsApp**: server Node.js terpisah di VPS (port 3001), pakai `@whiskeysockets/baileys` 7.0, sesi disimpan di folder `/sessions`. Multi-bot: tiap bot punya sesi WA sendiri.
- **Database**: Supabase (PostgreSQL) dengan RLS. Tabel utama: `bots`, `conversations`, `knowledge_sources`, `messages`.
- **AI**: Groq Cloud API — Llama 3.3 70B (respons utama) + Llama 3.1 8B (deteksi handoff), dipanggil paralel per pesan masuk.
- **Notifikasi**: sudah ada mekanisme notifikasi Telegram ke owner (dipakai untuk handoff) — REUSE ini untuk alert sistem.

**Tujuan**: sebagai operator, saya harus tahu (1) ada error atau tidak dan di mana, (2) latensi & pemakaian token Groq per bot, (3) status hidup/mati bridge WA dan tiap sesi — tanpa harus SSH atau buka log manual.

---

## Task 1 — Sentry di App Next.js

**Tujuan**: semua unhandled error dan error penting di webhook ter-capture otomatis.

1. Install Sentry via `npx @sentry/wizard@latest -i nextjs`. DSN dibaca dari env `SENTRY_DSN` (jangan hardcode).
2. Di kedua webhook handler (`/api/webhook/telegram`, `/api/webhook/whatsapp`):
   - Bungkus logika utama dengan try/catch.
   - Saat catch: `Sentry.captureException(err, { tags: { bot_id, channel } })` lalu tetap balas HTTP 200 ke platform (Telegram/bridge) agar tidak retry-storm, tapi log error-nya.
3. Wrap semua panggilan Groq API: capture error dengan tag tambahan `model` dan `error_type` (`rate_limit` untuk 429, `timeout`, `other`).
4. Tambahkan `SENTRY_DSN` ke `.env.example` dengan komentar.

**Acceptance criteria**:
- [ ] Error buatan (throw manual di webhook, di belakang flag env dev-only) muncul di Sentry dengan tag `bot_id` dan `channel`.
- [ ] Webhook tetap membalas 200 meski terjadi error internal.
- [ ] Build production tidak gagal karena Sentry (source map upload opsional, jangan blocking).

---

## Task 2 — Sentry di Bridge WhatsApp

**Tujuan**: error di bridge (komponen paling rapuh) tidak lagi senyap.

1. Install `@sentry/node` di project bridge, init di entry point paling awal, DSN dari env.
2. Capture di titik-titik ini:
   - Event `connection.update` Baileys saat status `close` — sertakan tag `bot_id`, `disconnect_reason` (kode dari `lastDisconnect`).
   - Gagal forward pesan ke webhook app utama (fetch error / non-2xx).
   - Gagal kirim pesan keluar ke WhatsApp.
   - `process.on('uncaughtException')` dan `unhandledRejection`.
3. Jangan capture reconnect normal yang berhasil — hanya kegagalan.

**Acceptance criteria**:
- [ ] Mematikan koneksi internet sesaat / logout paksa satu sesi menghasilkan event di Sentry dengan `bot_id` yang benar.
- [ ] Bridge tidak crash karena Sentry sendiri (init dibungkus try/catch, kalau DSN kosong → skip silently).

---

## Task 3 — Event Logging ke Supabase

**Tujuan**: metrik per pesan (latensi, token, biaya) tersimpan dan bisa di-query.

1. Buat migration tabel baru:

```sql
create table event_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  bot_id uuid references bots(id),
  conversation_id uuid,
  channel text,              -- 'telegram' | 'whatsapp'
  event_type text not null,  -- 'message_processed' | 'ai_error' | 'handoff' | 'webhook_error'
  latency_main_ms int,       -- durasi request Llama 70B
  latency_handoff_ms int,    -- durasi request Llama 8B
  prompt_tokens int,
  completion_tokens int,
  handoff_result boolean,
  error_message text,
  metadata jsonb default '{}'::jsonb
);
create index idx_event_logs_bot_created on event_logs (bot_id, created_at desc);
create index idx_event_logs_type_created on event_logs (event_type, created_at desc);
```

   RLS: hanya service role yang boleh insert; owner bot boleh select baris milik bot-nya.
2. Buat helper `lib/eventLog.ts` dengan fungsi `logEvent(payload)`:
   - Insert pakai Supabase **service role client** (bukan client user).
   - **Fire-and-forget + non-blocking**: kegagalan logging TIDAK BOLEH menggagalkan atau memperlambat balasan ke pelanggan. Bungkus try/catch, error logging cukup `console.error`.
3. Panggil `logEvent` di alur pemrosesan pesan:
   - Ukur durasi kedua request Groq (mulai–selesai, `performance.now()`).
   - Ambil `usage.prompt_tokens` dan `usage.completion_tokens` dari response Groq (jumlahkan kedua model, atau simpan model utama saja bila struktur kode menyulitkan — beri komentar keputusan yang diambil).
   - Catat `handoff_result` dari jawaban model 8B.
   - Untuk error → `event_type: 'ai_error'` atau `'webhook_error'` dengan `error_message`.

**Acceptance criteria**:
- [ ] Setiap pesan masuk yang diproses AI menghasilkan tepat 1 baris `message_processed` dengan latensi dan token terisi.
- [ ] Mematikan Supabase logging (misal salah env) tidak membuat balasan ke pelanggan gagal.
- [ ] Query `select avg(latency_main_ms) from event_logs where created_at > now() - interval '1 hour'` mengembalikan angka masuk akal.

---

## Task 4 — Health Check & Heartbeat di Bridge

**Tujuan**: status bridge dan tiap sesi WA bisa dicek dari luar, dan disconnect senyap terdeteksi.

1. Tambahkan endpoint `GET /health` di bridge:

```json
{
  "status": "ok",
  "uptime_seconds": 12345,
  "sessions": [
    {
      "bot_id": "…",
      "state": "connected",        // connected | connecting | disconnected
      "last_message_at": "2026-07-08T09:00:00Z",
      "last_state_change_at": "…"
    }
  ]
}
```

   - `status` = `"degraded"` jika ada sesi `disconnected` > 2 menit; tetap HTTP 200 (uptime monitor eksternal cukup cek field `status`). Tambahkan juga `GET /health/simple` yang balas HTTP 503 saat degraded, untuk monitor yang hanya bisa cek status code.
   - Endpoint dilindungi header `x-health-token` yang dicocokkan dengan env `HEALTH_TOKEN` (`/health/simple` boleh tanpa token, tanpa detail sesi).
2. Simpan state per sesi di memory (Map keyed `bot_id`), update dari event Baileys `connection.update` dan setiap pesan masuk (`last_message_at`).
3. **Alert via Telegram** (pakai mekanisme notifikasi owner yang sudah ada, atau bot token + chat id dari env `ALERT_TELEGRAM_TOKEN` / `ALERT_TELEGRAM_CHAT_ID`):
   - Sesi berubah ke `disconnected` dan tidak kembali `connected` dalam 2 menit → kirim alert 1x (jangan spam; cooldown 15 menit per sesi).
   - Sesi kembali `connected` setelah alert → kirim pesan recovery 1x.
4. Interval checker: `setInterval` tiap 30 detik mengevaluasi state semua sesi untuk logika alert di atas.

**Acceptance criteria**:
- [ ] `curl -H "x-health-token: …" localhost:3001/health` menampilkan semua sesi dengan state benar.
- [ ] Logout paksa satu sesi → dalam ~2–3 menit alert masuk ke Telegram, dan hanya satu alert (tidak berulang tiap 30 detik).
- [ ] Reconnect → pesan recovery masuk.

---

## Task 5 — Halaman Admin `/admin/health`

**Tujuan**: satu halaman internal untuk melihat kesehatan sistem tanpa buka Supabase/Sentry.

1. Route `/admin/health` di app Next.js, hanya bisa diakses user login (pakai auth Supabase yang sudah ada); data yang ditampilkan hanya milik bot user tersebut (RLS dari Task 3 sudah menangani).
2. Tampilkan, dengan data dari `event_logs` (24 jam terakhir kecuali disebut lain):
   - Jumlah pesan diproses per jam (chart batang sederhana, boleh pakai library chart yang sudah ada di project; kalau belum ada, render bar pakai div + Tailwind saja, jangan tambah dependency berat).
   - Latensi AI: p50 dan p95 `latency_main_ms`.
   - Total `prompt_tokens + completion_tokens` hari ini (reset per hari, timezone Asia/Jakarta).
   - Jumlah handoff hari ini.
   - Daftar 20 error terakhir (`event_type` in `ai_error`,`webhook_error`) dengan waktu, bot, dan pesan error.
   - Status bridge: fetch `GET /health` bridge (URL dari env `WHATSAPP_BRIDGE_URL` yang sudah ada + `HEALTH_TOKEN`) dari server component/route handler — JANGAN dari browser (token bocor). Tampilkan state tiap sesi dengan indikator warna.
3. Auto-refresh data tiap 60 detik (polling sederhana cukup, tidak perlu websocket).
4. Query agregasi lakukan di SQL (via RPC/`.rpc()` atau query builder), bukan tarik semua baris lalu hitung di JS.

**Acceptance criteria**:
- [ ] Halaman menampilkan semua metrik di atas tanpa error saat `event_logs` kosong (empty state rapi).
- [ ] Bridge mati → kartu status bridge menampilkan "unreachable", halaman lain tetap berfungsi.
- [ ] User tidak login diarahkan ke halaman login.

---

## Aturan Umum (berlaku semua task)

- Semua secret/config baru lewat environment variable + update `.env.example`.
- Logging & monitoring tidak boleh menambah latensi berarti di jalur balasan pelanggan — semua penulisan log fire-and-forget.
- Jangan refactor besar-besaran kode existing; sisipkan instrumentasi seminimal mungkin di titik yang disebut.
- Tulis singkat di `docs/observability.md`: env var baru, cara tes tiap komponen, dan arti tiap `event_type`.
