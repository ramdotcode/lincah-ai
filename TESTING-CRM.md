# Test Manual CRM — Skenario per Fase

Murni skenario pengetesan: **Lakukan → Cek**. Centang `[x]` kalau hasilnya sesuai.
(Setup sistem/migrasi BUKAN di sini — lihat `WAJIB-MANUAL.md`.)

---

## Fase 0 — Navigasi Chat vs CRM

**Skenario 1: Tab pisah**
- [ ] Lakukan: buka dashboard → lihat top nav.
      Cek: ada 4 tab `Agents | Chat | CRM | Settings`.
- [ ] Lakukan: klik tab **Chat**.
      Cek: mendarat di Live Monitoring; sidebar = Live Monitoring, Tickets, Analytics.
- [ ] Lakukan: klik tab **CRM**.
      Cek: mendarat di Lead Database; sidebar = Lead Database, Contacts, Orders.
- [ ] Lakukan: ketik URL `/tickets` langsung di browser.
      Cek: tab **Chat** yang menyala (bukan CRM).

---

## Fase 1a — Kontak Otomatis dari Chat

**Skenario 2: Chat pertama bikin kontak (Telegram)**
- [ ] Lakukan: dari akun Telegram yang **belum pernah** chat, kirim "halo" ke bot.
      Cek: buka **CRM → Contacts** → ada baris baru dengan nama & username Telegram kamu, ikon pesawat kertas biru.
- [ ] Lakukan: kirim pesan kedua "test lagi" dari akun yang sama.
      Cek: refresh Contacts → masih **1 baris** (tidak duplikat).

**Skenario 3: WhatsApp otomatis isi nomor**
- [ ] Lakukan: chat bot dari nomor WA yang belum pernah chat.
      Cek: di Contacts muncul kontak baru, kolom **Phone sudah terisi nomor WA-nya** otomatis, ikon hijau.

**Skenario 4: Web widget**
- [ ] Lakukan: buka widget di jendela incognito, kirim pesan.
      Cek: kontak baru muncul dengan ikon globe ungu, nama "Anonymous" (bukan "Web Visitor").

---

## Fase 1b — AI Nyimpen Data Pelanggan Sendiri

> Setup sekali: bot → tab **Tools** → nyalakan **"Simpan Data Kontak (CRM)"** → Simpan Tool. Master **"Aktifkan AI Tools"** juga ON. Tunggu ±1 menit.

**Skenario 5: "Nama saya Budi" → masuk tabel CRM?** ⭐ (ini test intinya)
- [ ] Lakukan: chat ke bot: *"Halo, nama saya Budi Santoso, email saya budi@contoh.com"*.
      Cek: buka **CRM → Contacts** → kontak kamu sekarang **Name = Budi Santoso**, **Email = budi@contoh.com**.
- [ ] Cek juga: balasan bot **natural** — dia TIDAK bilang "data anda sudah saya simpan".

**Skenario 6: Kebutuhan masuk ke Notes**
- [ ] Lakukan: chat: *"Saya cari kaos polos untuk seragam kantor, budget 5 juta, butuh minggu depan"*.
      Cek: buka detail kontak → **Notes** berisi kebutuhan itu.

**Skenario 7: AI nggak boleh nimpa edit manual** ⭐
- [ ] Lakukan: di Contacts, edit nama kontak jadi **"Budi VIP"** (manual). Lalu chat ke bot: *"nama saya Anton"*.
      Cek: nama di Contacts **masih "Budi VIP"** — tidak berubah jadi Anton.
- [ ] Lakukan: chat kebutuhan baru: *"saya juga butuh hoodie 20 pcs"*.
      Cek: Notes **nambah** baris baru, catatan lama masih ada.

---

## Fase 1c — CRUD Halaman Contacts

**Skenario 8: Cari kontak**
- [ ] Lakukan: ketik nomor telepon (atau email/tag) di kotak search.
      Cek: kontaknya ketemu.

**Skenario 9: Bikin kontak manual**
- [ ] Lakukan: klik **New Contact** → isi nama "Test Manual", phone "0812xxx", tags "vip, tester" → Create.
      Cek: muncul di list, tanpa ikon platform; tag tampil sebagai 2 pill.

**Skenario 10: Edit & persist**
- [ ] Lakukan: klik ikon **pensil** di kontak mana pun → ubah Company jadi "PT Coba" → Save → **refresh halaman**.
      Cek: Company masih "PT Coba" setelah refresh.

**Skenario 11: Hapus kontak**
- [ ] Lakukan: Edit kontak "Test Manual" → ikon tempat sampah → "Yakin hapus?" → Hapus.
      Cek: hilang dari list. Buka **Chat → Live Monitoring** → percakapan lama TIDAK ikut kehapus.

**Skenario 12: Tombol History**
- [ ] Lakukan: klik ikon **jam/history** pada kontak yang punya chat.
      Cek: kebuka `/monitor?id=...`.
- [ ] Cek juga: pada kontak manual tanpa chat, tombol history **redup/disabled**.

---

## Fase 2 — Halaman Detail Kontak

**Skenario 13: Buka detail**
- [ ] Lakukan: di Contacts, **klik nama** kontak yang paling aktif.
      Cek: kebuka halaman `/contacts/<id>` — header nama + ikon platform + last seen.

**Skenario 14: Edit inline**
- [ ] Lakukan: di panel Profile kiri, klik field **Phone** → ketik nomor → tekan Enter (atau ✓) → refresh halaman.
      Cek: nomor tersimpan.

**Skenario 15: Semua chat lintas bot kumpul**
- [ ] (Butuh kontak yang pernah chat ke ≥2 bot / atau minimal 1) Lakukan: lihat section **Conversations**.
      Cek: semua percakapan kontak ini tampil dengan nama bot + stage badge; klik salah satu → kebuka Live Monitoring percakapan itu.

**Skenario 16: Order nyambung ke kontak**
- [ ] Lakukan: chat ke bot sampai AI mencatat pesanan (tool Catat Pesanan ON): *"pesan kaos polos hitam 2, nama Budi, kirim ke Jl. Merdeka 1 Jakarta"* → konfirmasi.
      Cek: buka detail kontak → section **Orders** menampilkan pesanan itu dengan status `new`.

**Skenario 17: Tiket nyambung ke kontak**
- [ ] Lakukan: buat tiket baru di **Chat → Tickets** DENGAN memilih/mengisi `conversation_id` milik kontak itu (kalau form belum ada pilihan percakapan, buat via percakapan handoff).
      Cek: tiket muncul di section **Tickets** detail kontak.
      Catatan: tiket yang dibuat TANPA link percakapan memang tidak muncul di sini (by design).

**Skenario 18: ID ngawur**
- [ ] Lakukan: buka `/contacts/abc-ngawur-123`.
      Cek: tampil "Contact not found" + tombol back — bukan halaman error/crash.

---

## Fase 3 — Labels *(setelah migrasi 0020 dijalankan — lihat WAJIB-MANUAL.md)*

**Skenario 19: Bikin label**
- [ ] Lakukan: buka **Chat → Live Monitoring** → pilih satu percakapan → di panel percakapan cari bagian **Labels** → buat label baru "prioritas" warna merah.
      Cek: label kepasang di percakapan itu.

**Skenario 20: Maksimal 5 label**
- [ ] Lakukan: pasang 5 label ke satu percakapan, lalu coba pasang label ke-6.
      Cek: ditolak/tidak bisa (batas 5).

**Skenario 21: Filter by label**
- [ ] Lakukan: di Live Monitoring, pilih filter label "prioritas".
      Cek: hanya percakapan berlabel itu yang tampil.

**Skenario 22: Label kepakai lintas percakapan**
- [ ] Lakukan: pasang label "prioritas" yang sama ke percakapan lain.
      Cek: muncul di dropdown tanpa bikin ulang; hapus label dari daftar (kelola label) → hilang dari semua percakapan.

---

## Fase 4 — AI Auto-Label *(setelah migrasi 0021 dijalankan — lihat WAJIB-MANUAL.md)*

**Skenario 23: Nyalakan AI untuk sebuah label**
- [ ] Lakukan: di Live Monitoring → panel Labels → **+** → buka **"Kelola label & AI otomatis"** → klik ikon ✨ pada label "komplain" (buat dulu kalau belum ada).
      Cek: ikon ✨ berubah ungu (ON).

**Skenario 24: AI masang label sendiri** ⭐
- [ ] Lakukan: dari akun pelanggan, chat ke bot: *"barang yang saya terima rusak, saya kecewa, mau refund"* → tunggu bot balas → refresh Live Monitoring.
      Cek: percakapan itu otomatis punya label **komplain** (tanpa kamu pasang manual).
- [ ] Cek juga: balasan bot ke pelanggan tetap normal & tidak lebih lambat dari biasanya.

**Skenario 25: AI nggak asal tempel**
- [ ] Lakukan: chat biasa: *"halo, jam buka toko sampai jam berapa?"*.
      Cek: label "komplain" TIDAK terpasang di percakapan itu.

**Skenario 26: AI hormati batas & label manual**
- [ ] Lakukan: pasang 5 label manual di satu percakapan, lalu chat yang harusnya memicu label AI.
      Cek: tidak ada label ke-6 — batas 5 tetap dihormati.
- [ ] Lakukan: matikan ✨ pada label "komplain" → chat komplain baru di percakapan lain.
      Cek: label TIDAK terpasang otomatis lagi (tunggu ±1 menit karena cache).

---

## Fase 5 — Follow-up AI-Kontekstual *(setelah migrasi 0022 dijalankan — lihat WAJIB-MANUAL.md)*

> Setup: Settings → tab **Followups** → Aktifkan Auto Follow-up. Untuk tes cepat, set **Delay = 1 jam** (nanti dites dengan mengakali `last_message_at`, atau sabar). Pilih **Mode pesan = AI Kontekstual** → Save Changes.

**Skenario 27: Pilih mode AI tersimpan**
- [ ] Lakukan: pilih kartu **AI Kontekstual** → Save Changes → refresh halaman.
      Cek: kartu AI Kontekstual masih terpilih; label editor bawah berubah jadi "Template cadangan".

**Skenario 28: Follow-up nyambung ke isi chat** ⭐
- [ ] Lakukan: buat percakapan Telegram/WA yang jelas konteksnya (mis. pelanggan tanya "ada kaos polos hitam ukuran L?"), lalu diamkan sampai lewat delay. Tunggu cron jalan (tiap ±20 menit) atau picu manual (lihat catatan di bawah).
      Cek: pesan follow-up yang masuk **menyebut konteksnya** (kaos polos / ukuran L), bukan kalimat generik "masih ada yang bisa dibantu".
- [ ] Cek juga: nadanya ikut persona bot (lihat System Prompt bot).

**Skenario 29: Fallback ke template kalau AI gagal**
- [ ] (Sulit dipaksa manual — cukup verifikasi logika) Cek: bila generator AI gagal/kosong, yang terkirim adalah **template cadangan**. Lihat metadata event `followup_sent` di log: `mode: 'ai'` (berhasil) atau summary `ai_fallback` naik (jatuh ke template).

**Skenario 30: Mode Template masih sama seperti dulu**
- [ ] Lakukan: ganti Mode ke **Template** → Save → picu follow-up.
      Cek: pesan = template `{nama}` statis, persis perilaku lama.

> Catatan memicu follow-up tanpa menunggu lama: di Supabase, set `last_message_at` percakapan ke waktu lampau (`update conversations set last_message_at = now() - interval '25 hours' where id = '...'`), pastikan `stage` termasuk yang di-follow-up (interested/negotiating) & `status = active`, lalu tunggu cron berikutnya (maks 20 menit) atau panggil `/api/cron/followups` dengan header `Authorization: Bearer <CRON_SECRET>`.

---

## Fase 6 — Merge Kontak Lintas Kanal *(setelah migrasi 0023 dijalankan — lihat WAJIB-MANUAL.md)*

**Skenario 31: Gabungkan 2 kontak** ⭐
- [ ] Prasyarat: punya 2 kontak yang sebenarnya orang sama (mis. 1 dari WhatsApp, 1 dari Telegram). Kalau belum, chat bot dari WA lalu dari Telegram pakai identitas berbeda.
- [ ] Lakukan: di halaman Contacts → klik tombol **Merge** → centang 2 kontak itu → klik **Merge (2)** → di modal pilih mana yang jadi **Utama** → **Gabungkan**.
      Cek: list menyusut jadi 1 kontak; kontak utama sekarang menampilkan **2 ikon kanal** (WA + Telegram) di sebelah namanya.

**Skenario 32: Data & percakapan ikut pindah**
- [ ] Lakukan: buka detail kontak hasil merge.
      Cek: section **Channels** menampilkan kedua kanal; section **Conversations** berisi percakapan dari KEDUA kontak asal; tags & notes tergabung; field kosong pada utama terisi dari kontak yang di-merge.

**Skenario 33: Chat berikutnya tidak bikin kontak baru** ⭐ (uji durabilitas)
- [ ] Lakukan: kirim pesan baru dari kanal kontak yang tadi di-merge (yang BUKAN identitas primer utama).
      Cek: percakapan itu nyambung ke kontak utama yang sama — TIDAK muncul kontak baru terpisah lagi.

**Skenario 34: Batal & guard**
- [ ] Lakukan: klik Merge → centang hanya 1 kontak.
      Cek: tombol Merge tetap disabled (butuh minimal 2). Klik **Batal** → mode seleksi hilang.

---

## Fase 7 — Stage Pipeline Custom *(setelah migrasi 0024 dijalankan — lihat WAJIB-MANUAL.md)*

**Skenario 35: Bikin stage baru** ⭐
- [ ] Lakukan: buka **CRM → Pipeline** (`/pipeline`, tanpa perlu pilih bot) → ketik "Survey" di kotak bawah, pilih warna → **Tambah**.
      Cek: stage "Survey" muncul di daftar. Buka **CRM → Leads** (Kanban) → ada kolom baru "Survey".

**Skenario 36: Ubah & urutkan**
- [ ] Lakukan: di halaman Pipeline, ganti label "New" jadi "Prospek" (klik teksnya, edit, klik luar), ganti warnanya, lalu klik panah naik/turun untuk memindah urutan.
      Cek: di Leads, kolom ikut berubah nama/warna/urutan.

**Skenario 37: Drag lead ke stage custom**
- [ ] Lakukan: di Leads Kanban, seret satu kartu ke kolom "Survey".
      Cek: kartu pindah & menetap setelah refresh (tersimpan).

**Skenario 38: AI pakai stage custom** ⭐
- [ ] Lakukan: pastikan ada stage custom bernada jelas (mis. "Survey" = "sedang menjadwalkan kunjungan"). Chat ke bot seolah pelanggan minta jadwal survey. Tunggu bot balas.
      Cek: stage percakapan itu berpindah otomatis ke stage yang relevan (lihat di Leads / badge). Catatan: AI menilai dari LABEL stage, jadi beri nama stage yang deskriptif.

**Skenario 39: Follow-up & Analytics ikut**
- [ ] Lakukan: Settings → Followups → daftar "Stage yang di-follow-up" sekarang menampilkan stage custom (tipe Aktif) — pilih salah satu.
      Cek: di **Chat → Analytics**, "Lead Funnel" menampilkan stage custom-mu, bukan lagi 5 stage lama.

**Skenario 40: Hapus stage**
- [ ] Lakukan: di halaman Pipeline, hapus salah satu stage yang ada lead-nya.
      Cek: stage hilang; lead-nya pindah ke stage pertama (tidak hilang). Tidak bisa menghapus kalau tinggal 1 stage.

---

## Fase 8 — Follow-up Trigger by Label *(setelah migrasi 0025 dijalankan — lihat WAJIB-MANUAL.md)*

**Skenario 41: Follow-up dipicu label** ⭐
- [ ] Prasyarat: punya minimal 1 label (mis. "belum bayar"). Settings → Followups → aktifkan, lalu di bagian **"Trigger tambahan by label"** centang label itu → Save.
- [ ] Lakukan: pasang label "belum bayar" ke satu percakapan yang stage-nya DI LUAR daftar stage follow-up (mis. stage "new"), lalu diamkan melewati delay.
      Cek: percakapan itu tetap dapat follow-up — walau stage-nya tidak termasuk yang di-follow-up (dipicu oleh label).

**Skenario 42: Tanpa label, perilaku lama**
- [ ] Lakukan: kosongkan trigger label → Save.
      Cek: follow-up hanya menyasar percakapan sesuai stage seperti sebelumnya (tidak ada perubahan).

---

## Fase 9 — Deal Value & Forecast *(setelah migrasi 0026 dijalankan — lihat WAJIB-MANUAL.md)*

**Skenario 43: Isi nilai deal** ⭐
- [ ] Lakukan: CRM → Leads → view **Table** → di kolom **Deal Value** salah satu lead, ketik angka (mis. 5000000) → tekan Enter/klik luar.
      Cek: angka tersimpan (refresh halaman → tetap ada), tampil ter-format "5.000.000".

**Skenario 44: Total per stage & forecast**
- [ ] Lakukan: isi deal value di beberapa lead di stage berbeda → buka view **Kanban**.
      Cek: header tiap kolom stage menampilkan total nilainya (mis. "Rp 12jt"); kartu lead menampilkan nilainya (hijau).
- [ ] Cek header halaman Leads: muncul ringkasan "Pipeline Rp X · Won Rp Y".

**Skenario 45: Forecast di Analytics**
- [ ] Lakukan: buka **Chat → Analytics**.
      Cek: ada 2 kartu baru — **Nilai Pipeline (belum closing)** = jumlah deal di stage tipe Aktif, dan **Nilai Menang (won)** = jumlah deal di stage tipe Menang.

---

## Regresi Cepat (tiap selesai fase baru, ulangi 5 menit ini)

- [ ] Chat bot Telegram/WA/widget → masih dibalas normal.
- [ ] Tool lama: tanya stok & ongkir → masih dijawab dari data tool.
- [ ] `/leads` drag-drop kartu antar stage → masih jalan.
- [ ] Buat tiket + ubah statusnya → masih jalan.
- [ ] Trigger handoff → bot berhenti membalas (status pending).

---

## Bukan Bug (known behavior)

- Kontak WA dan Telegram orang yang sama = **2 kontak terpisah** (merge lintas kanal belum ada).
- Sesi widget baru = kontak webchat baru (bisa noise).
- Toggle tool baru butuh ±60 detik efektif di webhook (cache).
- AI hanya mengisi kolom **kosong**; Notes selalu ditambah di bawah, tidak menimpa.
