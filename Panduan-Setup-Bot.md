# Panduan Setup Bot Lincah AI — Playbook untuk Tim

> Dokumen ini adalah panduan **mengisi konfigurasi bot** untuk bisnis apa pun: system prompt, knowledge, tools, pipeline, label, follow-up, sampai orchestration. Akurat per **15 Juli 2026** (setelah update orchestration parent-child, WA level akun, dan CRM 9 fase). Pendamping `Project-context.md` (fitur) dan `Project-context-technical.md` (teknis).
>
> **Cara pakai bersama Claude:** ketika tim bilang *"buatkan konfigurasi bot untuk [jenis bisnis]"*, Claude harus menghasilkan **paket konfigurasi lengkap siap copy-paste** mengikuti aturan menulis di bagian 2 dan format output di bagian 4. Contoh lengkap ada di bagian 3.

---

## 1. Peta Konfigurasi — apa diatur di mana

Sebelum mengisi apa pun, pahami pembagian **level akun** vs **level bot**:

| Level | Apa saja | Diatur di |
|---|---|---|
| **AKUN** (berlaku untuk semua bot) | Pipeline stages (kolom Kanban), Labels, Kontak, Koneksi WhatsApp (SATU nomor per akun), Tiket | CRM → **`/pipeline`** · `/monitor` (panel label) · `/platforms` |
| **BOT** (masing-masing bot punya sendiri) | System prompt, model AI, welcome message, kondisi handoff, Knowledge, Tools, Follow-up, Orchestration, token Telegram, widget | `/settings?id=<bot>` |

Konsekuensi penting:
- **Knowledge TIDAK dibagi antar bot.** Kalau pakai orchestration (bot induk + anak), fakta yang dibutuhkan semua bot (profil perusahaan, jam operasional) harus **disalin ke knowledge tiap bot**.
- **Pipeline & label dipakai bersama** semua bot dalam satu akun — desain sekali untuk seluruh bisnis.
- **Nomor WA cuma satu per akun** dan ditugaskan ke SATU bot penjawab. Kalau pakai orchestration, tugaskan ke **bot induk**.

### Urutan setup yang disarankan (checklist)
1. **Rancang di kertas dulu**: satu bot cukup, atau perlu orchestration? (lihat §2.8)
2. **Setup level akun dulu** (tidak butuh bot): pipeline stage di CRM → **`/pipeline`** sesuai alur jualan bisnis, dan **Labels** dari panel label di `/monitor` — nyalakan AI auto-label untuk label yang jelas kriterianya.
3. Buat bot di `/agents` (induk dulu, lalu anak-anaknya kalau ada).
4. Settings tiap bot — tab **General**: prompt, welcome, kondisi handoff, model. **Save**.
5. Tab **Knowledge Sources**: isi knowledge per bot. **Save per sumber.**
6. Tab **Integrations**: aktifkan AI Tools yang relevan + isi datanya; aktifkan widget bila perlu.
7. Tab **Followups**: aktifkan + pilih mode.
8. Tab **Orchestration** (di bot induk): aktifkan, tambah anak + kondisi assign, isi kondisi revert.
9. Hubungkan channel: `/platforms` untuk WA (pilih bot induk sebagai penjawab), token Telegram di bot, atau embed widget.
10. **Tes di simulator chat** (sidebar kanan Settings) — catatan: simulator hanya menguji prompt+knowledge dasar (belum melewati orchestration/tools/RAG); tes penuh lewat widget/Telegram.

---

## 2. Aturan Menulis per Komponen

### 2.1 Nama bot & pilihan model

- **Nama bot** dipakai router orchestration untuk mencocokkan jawaban AI → **harus khas dan tidak saling menjadi awalan** ("Sales" dan "Sales Support" berisiko tertukar; pakai "Tim Penjualan" dan "Dukungan Teknis").
- **Model AI per bot:**
  | Pilih | Kapan |
  |---|---|
  | **Groq (Llama 3.3 70B)** — default | Hampir selalu. Tercepat (±2 dtk), paling stabil. **Wajib dipertimbangkan kalau bot pakai Tools** (function calling memang selalu dieksekusi via Groq apa pun modelnya, tapi Groq end-to-end paling mulus) |
  | Z.AI GLM 5.2 | Butuh jawaban lebih luwes, toleransi ±5 dtk |
  | Nvidia Nemotron 3 Ultra 550B | Penjualan konsultatif kompleks / B2B yang butuh reasoning terbaik, toleransi 5–15 dtk |
  | DeepSeek v4 Flash | Jarang — reasoning model, lambat (±10 dtk) |
  - Semua non-Groq otomatis fallback ke Groq saat gagal, jadi memilih model "lambat" tidak membuat bot mati — hanya lebih lambat.

### 2.2 System prompt (AI Agent Behavior)

Kerangka wajib (4 blok):
```
[PERAN] Kamu adalah <nama persona> dari <nama bisnis>, <satu kalimat bidang bisnis>.
[GAYA] <tone: ramah/formal/santai-sopan>, Bahasa Indonesia, maksimal <3-4> kalimat per balasan.
[TUGAS] <apa yang harus aktif dilakukan: gali kebutuhan → rekomendasi → arahkan ke aksi berikutnya>.
[BATASAN] Jangan mengarang harga/fakta di luar knowledge. Kalau tidak tahu, tawarkan sambungkan ke tim. <larangan spesifik bisnis>.
```
Aturan menulis:
- **Selalu Bahasa Indonesia** (pesan ke pelanggan wajib Indonesia).
- Batasi panjang balasan ("maksimal 4 kalimat") — chat WA/widget tidak nyaman untuk paragraf panjang.
- Beri **arah aksi**: prompt yang bagus selalu menyuruh bot menggerakkan percakapan (tanya kebutuhan → tawarkan paket → minta data pesanan), bukan sekadar menjawab.
- Kalau bot punya tool Catat Pesanan: tulis eksplisit data apa yang harus dikumpulkan sebelum mencatat ("minta nama lengkap + alamat, konfirmasi item & jumlah, baru catat pesanan").
- **Ingat: AI hanya melihat 10 pesan terakhir.** Untuk percakapan panjang, suruh bot merangkum/konfirmasi ulang data penting sebelum aksi ("sebelum mencatat, ulangi pesanan lengkap dan minta konfirmasi").
- Jangan menulis daftar harga/produk di prompt — itu tugasnya **knowledge** (lebih mudah di-update, ikut RAG).

### 2.3 Welcome message

Satu-dua kalimat, sebut nama bisnis, tawarkan bantuan spesifik, boleh 1 emoji. Contoh pola: `Halo! Selamat datang di <bisnis> 👋 Ada yang bisa kami bantu seputar <layanan utama>?`

### 2.4 Kondisi transfer/handoff (Agent Transfer Conditions)

Kalimat bahasa natural, dievaluasi Groq 8B **di setiap pesan masuk** dengan jawaban YES/NO. Kalau YES → status `pending`, AI diam (jika `stop_ai_after_handoff`), admin dinotifikasi.

- Tulis sebagai **daftar kondisi eksplisit**, bukan tema samar. Semakin luas kalimatnya, semakin gampang bot "menyerah".
- Pola aman (default yang disarankan):
  ```
  HANYA jika: pelanggan secara eksplisit minta bicara dengan manusia/admin/CS,
  pelanggan marah atau frustrasi setelah 2+ balasan, atau membahas pembatalan/refund/komplain hukum.
  ```
- Kata **"HANYA jika"** penting — tanpa itu, komplain ringan pun bisa ter-handoff.
- Opsi terkait di tab General: `stop_ai_after_handoff` (AI diam setelah handoff — biasanya ON), `silent_handoff` (handoff tanpa memberi tahu pelanggan — biasanya OFF).

### 2.5 Knowledge Base

Mekanisme yang memengaruhi cara menulis:
- Total knowledge ≤ ±6.000 karakter → **masuk utuh ke prompt** setiap pesan.
- Total > ±6.000 karakter → **RAG otomatis**: dipotong chunk ±800 karakter (overlap 100), tiap pesan hanya ±6 chunk paling relevan yang dikirim ke AI.

Aturan menulis knowledge (PENTING untuk akurasi RAG):
1. **Satu sumber = satu topik** (Profil, Paket & Harga, Proses, Garansi/SLA, Pembayaran, FAQ). Jangan campur.
2. **Tiap paragraf harus berdiri sendiri** — karena bisa terpotong jadi chunk terpisah. Ulangi nama entitas di tiap paragraf: tulis "Paket Toko Online Rp 9.000.000 mencakup ...", JANGAN "Paket ini juga mencakup ..." (kata "ini" kehilangan makna di chunk lain).
3. Tulis **fakta padat**, bukan kalimat pemasaran. Angka harus persis: harga, durasi, syarat, jam operasional.
4. Untuk harga/paket: tulis format konsisten `<Nama paket> <harga>: <isi>, <durasi pengerjaan>, <ketentuan>.`
5. **Antisipasi pertanyaan menjebak**: refund, pembatalan, garansi, komplain — kalau tidak ditulis, bot akan mengarang atau menjawab "tidak tahu".
6. Isi minimal yang layak untuk bisnis jualan (target 5–7 sumber):
   - Profil bisnis (siapa, sejak kapan, keunggulan, jam operasional, kontak/alamat)
   - Produk/paket & harga (+ add-on)
   - Proses pemesanan/pengerjaan langkah demi langkah
   - Ketentuan pembayaran (rekening resmi ATAS NAMA, termin, invoice)
   - Garansi / kebijakan refund / SLA support
   - FAQ (5–10 tanya-jawab tersering)
7. Kalau pakai orchestration: **knowledge spesialis masuk ke bot anak yang relevan** (harga → bot sales, SLA → bot support), dan **profil bisnis disalin ke SEMUA bot**.

### 2.6 AI Tools (tab Integrations)

Aktifkan toggle **AI Tools** dulu, lalu per tool. Maks 3 ronde tool per balasan; function calling selalu dieksekusi via Groq.

| Tool | Kapan diaktifkan | Cara isi config |
|---|---|---|
| **Cek Stok & Harga** (`check_stock`) | Bisnis punya daftar produk/paket berharga tetap. Untuk JASA: pakai "stok" sebagai **slot pengerjaan yang tersedia** | Daftar produk: `nama` (tulis lengkap + deskripsi singkat dalam nama), `harga`, `stok` |
| **Cek Ongkir** (`check_shipping`) | Hanya bisnis yang mengirim barang fisik | Tarif per kota: `destination`, `cost`, `eta_days` |
| **Catat Pesanan** (`create_order`) | Hampir selalu ON untuk bot jualan — pesanan masuk `/orders` dengan nomor referensi | Tanpa config; yang penting system prompt menyuruh kumpulkan nama + item + alamat + konfirmasi dulu |
| **Update Kontak** (`update_contact`) | **Selalu ON** — AI otomatis menyimpan nama/telepon/email/alamat/catatan pelanggan ke CRM saat disebutkan | Tanpa config; bantu dengan kalimat prompt: "kalau pelanggan menyebut nama/kontak/alamat, simpan ke data kontak" |

Data produk di tool `check_stock` **tidak menggantikan knowledge** — tetap tulis detail paket di knowledge (tool hanya menjawab harga/stok terkini, knowledge menjelaskan isinya).

### 2.7 Pipeline Stages, Labels, Deal Value (level akun)

**Pipeline (CRM → `/pipeline`)** — kolom Kanban di `/leads`, diklasifikasi otomatis AI per pesan:
- Default: `Baru → Tertarik → Negosiasi → Menang / Kalah`. Ganti hanya kalau alur bisnis beda (mis. jasa: `Baru → Konsultasi → Penawaran Terkirim → Deal / Batal`).
- Tiap stage bertipe `open` / `won` / `lost`. Nilai deal stage `open` masuk **forecast pipeline**; `won` masuk nilai kemenangan. AI **tidak pernah** memindahkan ke stage tipe `lost` (hanya manual).
- **Nama stage = satu-satunya petunjuk untuk AI classifier** → pakai label deskriptif yang bisa ditebak dari isi chat ("Penawaran Terkirim" lebih baik daripada "S3"). AI hanya bergerak MAJU sesuai urutan; stage yang digeser manual tidak ditimpa AI kecuali pelanggan chat lagi.
- Jumlah ideal 4–6 stage. Ingat: berlaku untuk SEMUA bot di akun.

**Labels (panel di `/monitor`)** — maks 5 per percakapan, 8 warna:
- Buat 3–6 label operasional. Contoh umum: `Hot Lead`, `Komplain`, `Tanya Harga`, `Sudah Bayar`, `VIP`.
- **AI auto-label**: nyalakan `ai_enabled` hanya untuk label yang kriterianya jelas dari isi chat (`Komplain`, `Tanya Harga`, `Hot Lead`). Label status internal (`VIP`, `Sudah Bayar`) biarkan manual. Nama label harus self-explanatory — itu satu-satunya yang dibaca classifier.
- Label bisa jadi **trigger follow-up** (lihat 2.8) — kalau berencana pakai, buat labelnya dari awal.

**Deal value** — diisi manual per lead di `/leads` (inline, Rp). Biasakan tim mengisi saat lead masuk stage penawaran supaya forecast di `/stats` berguna.

### 2.8 Auto Follow-up (tab Followups)

- **Delay**: 24 jam umumnya pas (jasa B2B boleh 48). **Maks**: 2 kali. **Limit WA/jam**: biarkan 10 (proteksi banned).
- **Stage yang di-follow-up**: pilih stage "panas" saja (mis. Tertarik + Negosiasi). Jangan follow-up stage `Baru` (terlalu agresif) atau `Menang/Kalah`.
- **Trigger by label** (opsional): centang label tertentu → percakapan berlabel itu di-follow-up **terlepas dari stage-nya**. Cocok untuk label `Hot Lead`.
- **Mode pesan**:
  - **Template** — konsisten & aman; wajib pakai `{nama}`: `Halo {nama}, menindaklanjuti chat Anda dengan <bisnis> — masih ada yang bisa kami bantu? 😊`
  - **AI Contextual** — Groq 70B menyusun 1–2 kalimat sesuai isi percakapan & tone bot (gagal → otomatis jatuh ke template, jadi **template tetap wajib diisi**). Pilih AI untuk bot sales (follow-up nyambung dengan diskusi paket); pilih Template untuk pesan seragam/formal.
- Channel widget (`webchat`) tidak pernah di-follow-up (tidak bisa di-push). Pelanggan yang keburu membalas otomatis batal.

### 2.9 Orchestration Parent-Child (tab Orchestration di bot INDUK)

**Kapan perlu:** bisnis punya ≥2 "divisi" dengan gaya/knowledge/tools yang benar-benar beda (Sales vs Support vs Billing), ATAU satu bot mulai gagal karena prompt+knowledge terlalu gemuk. **Kalau satu persona cukup — jangan pakai orchestration.** Satu bot dengan knowledge rapi lebih mudah dirawat.

Cara kerja: bot **induk** menerima semua chat. Tiap pesan, Groq 8B mengevaluasi kondisi; chat bisa **di-handoff ke bot anak** (prompt+model+knowledge+tools anak yang dipakai) dan anak **memegang chat terus** (sticky) sampai **kondisi revert** terpenuhi → kembali ke induk.

Langkah:
1. Buat bot anak sebagai **bot biasa di `/agents`** — isi General + Knowledge + Tools masing-masing secara lengkap (anak = bot mandiri penuh).
2. Di bot induk → tab Orchestration → aktifkan → tambah anak di canvas + tulis **kondisi assign** per anak; isi **kondisi revert** di node induk.
3. Hubungkan channel ke **bot induk** (WA di `/platforms` pilih induk; widget pakai bot-id induk).

Aturan menulis kondisi (bahasa natural, dievaluasi Groq 8B):
- **Kondisi assign** = "kapan chat DISERAHKAN ke anak ini". Tulis dari sudut pandang topik pesan pelanggan, konkret + contoh kata kunci:
  ```
  Pelanggan menanyakan harga, paket, penawaran, ingin memesan, atau membandingkan layanan.
  ```
- Kondisi antar-anak harus **saling eksklusif** — kalau dua kondisi tumpang tindih, hasil routing tidak stabil.
- **Kondisi revert** (di induk) = "kapan chat DIKEMBALIKAN ke induk". Pola aman:
  ```
  Pelanggan mengganti topik ke hal di luar tugas agent saat ini, atau kebutuhannya sudah selesai dan ia menanyakan hal baru.
  ```
- Nama anak muncul di jawaban router → **nama bot anak harus unik dan bukan awalan nama anak lain**.
- Induk sebaiknya berperan sebagai **resepsionis**: prompt-nya fokus menyapa, menggali kebutuhan awal, dan menjawab pertanyaan umum; biarkan spesialisasi di anak.
- Fail-safe bawaan: router error/ragu → chat tetap di pemegang saat ini. Handoff ke manusia (transfer condition) tetap berlaku di bot mana pun yang sedang memegang.

### 2.10 Channel

- **WhatsApp**: `/platforms` → pilih bot penjawab (bot induk kalau orchestration) + nomor → start session → scan QR. Satu nomor per akun. Baileys (bukan API resmi) → hindari perilaku spam; follow-up sudah dibatasi otomatis.
- **Telegram**: isi token bot (dari @BotFather) di settings bot; webhook di-set ke URL publik.
- **Widget web**: aktifkan di Integrations → tempel `<script src=".../widget.js" data-bot-id="<BOT_INDUK>" defer>` di website.

---

## 3. CONTOH LENGKAP — Chatbot Jualan Jasa Pembuatan Website

> Studi kasus: **"LancarWeb"**, agensi fiktif pembuatan website untuk UMKM. Arsitektur: **1 bot induk + 2 bot anak** (orchestration), karena sales dan support butuh gaya + knowledge + tools berbeda. Semua teks siap copy-paste. Untuk bisnis lebih sederhana, cukup pakai konfigurasi "LancarWeb Sales" saja sebagai bot tunggal (tanpa §3.5).

### 3.0 Arsitektur

```
                    ┌─────────────────────┐
   WA / Widget ───▶ │  LancarWeb CS       │  (INDUK — resepsionis)
                    └─────┬──────────┬────┘
        assign: jualan ▼             ▼ assign: kendala teknis
            ┌───────────────┐   ┌──────────────────┐
            │ Tim Penjualan │   │ Dukungan Teknis  │
            │ (tools: stok, │   │ (knowledge SLA,  │
            │ order, kontak)│   │ garansi)         │
            └───────────────┘   └──────────────────┘
```

### 3.1 Level akun (sekali saja)

**Pipeline (CRM → `/pipeline`):**
| Urutan | Label | Tipe | Warna |
|---|---|---|---|
| 1 | Baru | open | blue |
| 2 | Konsultasi | open | sky |
| 3 | Penawaran Terkirim | open | amber |
| 4 | Deal | won | emerald |
| 5 | Batal | lost | red |

**Labels (buat di panel label `/monitor`):**
| Label | Warna | AI auto-label? |
|---|---|---|
| Hot Lead | red | ✅ ON |
| Tanya Harga | amber | ✅ ON |
| Komplain | orange | ✅ ON |
| Sudah DP | emerald | ❌ manual |
| Klien Lama | violet | ❌ manual |

**WhatsApp (`/platforms`):** bot penjawab = **LancarWeb CS**, nomor bisnis, start session + scan QR.

### 3.2 BOT INDUK — "LancarWeb CS"

**Tab General**

Model: **Groq**. · `stop_ai_after_handoff`: ON · `silent_handoff`: OFF

System prompt:
```
Kamu adalah CS LancarWeb, agensi pembuatan website untuk UMKM di Bandung.
Gaya: ramah, sopan, Bahasa Indonesia santai-profesional, maksimal 3 kalimat per balasan.
Tugasmu adalah resepsionis: sapa pelanggan, pahami kebutuhannya (mau buat website baru, tanya harga, atau ada kendala website), dan jawab pertanyaan umum tentang LancarWeb dari knowledge.
Jangan membahas detail harga paket atau menangani keluhan teknis mendalam — cukup gali kebutuhan awalnya.
Jangan mengarang informasi di luar knowledge. Jika pelanggan menyebut nama/nomor/alamat, simpan ke data kontak.
```

Welcome message:
```
Halo! Selamat datang di LancarWeb 👋 Mau buat website baru, tanya-tanya paket, atau ada kendala dengan website Anda?
```

Transfer condition:
```
HANYA jika: pelanggan secara eksplisit minta bicara dengan manusia/admin/CS,
pelanggan marah atau frustrasi setelah 2+ balasan bot,
atau membahas refund, pembatalan kontrak, atau ancaman hukum.
```

**Tab Knowledge Sources** (induk cukup profil + FAQ umum)

Sumber 1 — Nama: `Profil LancarWeb`
```
LancarWeb adalah agensi pembuatan website untuk UMKM yang berdiri sejak 2022 di Bandung, dengan tim 8 orang (developer, desainer, dan project manager). LancarWeb sudah menyelesaikan 120+ website untuk toko, kafe, klinik, dan jasa profesional di seluruh Indonesia.
Layanan utama LancarWeb: landing page, website company profile, toko online, serta maintenance bulanan.
Keunggulan LancarWeb: pengerjaan cepat (mulai 5 hari kerja), semua paket sudah termasuk domain + hosting 1 tahun, garansi perbaikan bug 3 bulan, dan support via WhatsApp di jam kerja.
Jam operasional LancarWeb: Senin–Jumat 09.00–18.00 WIB, Sabtu 09.00–13.00 WIB. Email: halo@lancarweb.id. Kantor: Jl. Dipatiukur No. 22, Bandung.
```

Sumber 2 — Nama: `FAQ Umum LancarWeb`
```
Berapa lama website LancarWeb jadi? Tergantung paket: landing page 5 hari kerja, company profile 10 hari kerja, toko online 20 hari kerja, dihitung setelah DP dan materi (logo, foto, teks) diterima.
Apakah harga LancarWeb sudah termasuk domain dan hosting? Ya, semua paket LancarWeb termasuk domain .com/.id dan hosting selama 1 tahun pertama. Perpanjangan tahun berikutnya Rp 600.000/tahun (domain + hosting).
Apakah bisa cicil atau bayar bertahap? Ya, semua paket memakai termin DP 50% saat mulai dan pelunasan 50% saat website siap dipublikasikan.
Apakah LancarWeb menerima revisi? Ya, tiap paket punya kuota revisi (2–3x revisi minor). Revisi di luar kuota atau perubahan besar dihitung terpisah mulai Rp 200.000.
Apakah website yang sudah jadi bisa dikelola sendiri? Ya, klien mendapat akses admin penuh dan video tutorial pengelolaan. Ada juga paket maintenance Rp 300.000/bulan jika ingin dikelola tim LancarWeb.
```

**Tab Integrations:** AI Tools ON → hanya **Update Kontak** ON. (Tools jualan ada di bot anak.) Widget ON kalau mau dipasang di website sendiri.

**Tab Followups:** OFF di induk (follow-up dilakukan bot Sales — lihat 3.4). *(Alternatif: kalau ingin semua follow-up seragam dari satu pintu, aktifkan di induk saja dan matikan di anak.)*

**Tab Orchestration:** toggle ON.

Kondisi revert (di node induk):
```
Pelanggan mengganti topik ke hal di luar tugas agent saat ini (misal sedang di penjualan tapi bertanya kendala teknis, atau sebaliknya), atau urusannya sudah selesai dan ia menanyakan hal baru.
```

Anak 1 — pilih bot **Tim Penjualan**, kondisi assign:
```
Pelanggan menanyakan harga, paket website, promo, portofolio, proses pemesanan, ingin memesan website baru, atau sedang bernegosiasi.
```

Anak 2 — pilih bot **Dukungan Teknis**, kondisi assign:
```
Pelanggan yang websitenya SUDAH JADI mengalami kendala: error, website down, bug, minta revisi, tanya garansi, atau perpanjangan domain/hosting.
```

### 3.3 BOT ANAK 1 — "Tim Penjualan"

**Tab General** — Model: **Groq** (pakai tools). Transfer condition: samakan dengan induk.

System prompt:
```
Kamu adalah Tim Penjualan LancarWeb, agensi pembuatan website untuk UMKM.
Gaya: hangat, antusias, Bahasa Indonesia santai-sopan, maksimal 4 kalimat per balasan.
Alur kerjamu: (1) gali kebutuhan — jenis usaha, tujuan website, referensi yang disukai; (2) rekomendasikan SATU paket paling pas beserta harganya dari knowledge; (3) tangani keberatan dengan data (keunggulan, garansi, termin DP 50%); (4) kalau pelanggan siap memesan, minta nama lengkap + nomor WhatsApp + alamat, konfirmasi ulang paket dan totalnya, lalu catat pesanannya dan sebutkan nomor referensinya.
Gunakan tool cek stok untuk memastikan slot pengerjaan bulan ini sebelum menjanjikan jadwal. Simpan nama/kontak/alamat pelanggan ke data kontak begitu disebutkan.
Jangan memberi diskon di luar knowledge dan jangan mengarang fitur paket.
```

Welcome message (dipakai bila bot ini dites langsung): `Halo! Saya Tim Penjualan LancarWeb 😊 Boleh tahu jenis usaha Anda dan website seperti apa yang dibutuhkan?`

**Tab Knowledge Sources**

Sumber 1 — `Profil LancarWeb` → **salin persis dari induk (3.2)**.

Sumber 2 — Nama: `Paket & Harga LancarWeb`
```
Paket Landing Page Rp 1.750.000: 1 halaman panjang (hero, layanan, testimoni, kontak), desain dari template premium yang dikustomisasi, tombol WhatsApp, gratis domain + hosting 1 tahun, pengerjaan 5 hari kerja, 2x revisi minor.
Paket Company Profile Rp 4.900.000: website 5 halaman (Beranda, Tentang, Layanan, Galeri, Kontak), desain custom sesuai brand, SEO dasar (meta tag, sitemap, Google Business Profile), email bisnis 2 akun, gratis domain + hosting 1 tahun, pengerjaan 10 hari kerja, 3x revisi.
Paket Toko Online Rp 8.900.000: katalog produk tanpa batas, keranjang belanja, pembayaran otomatis via Midtrans, notifikasi pesanan ke WhatsApp admin, dashboard pengelolaan, training online 1 sesi, gratis domain + hosting 1 tahun, pengerjaan 20 hari kerja, 3x revisi.
Add-on LancarWeb: artikel SEO Rp 150.000/artikel, copywriting konten Rp 500.000/website, maintenance bulanan Rp 300.000/bulan, jasa foto produk Rp 900.000/25 foto (khusus area Bandung).
Semua harga paket LancarWeb adalah harga tetap, tidak ada biaya tersembunyi. Diskon hanya ada saat promo resmi yang diumumkan LancarWeb.
```

Sumber 3 — Nama: `Proses Pemesanan LancarWeb`
```
Cara memesan website di LancarWeb: (1) Konsultasi gratis via chat untuk menentukan paket. (2) Pelanggan mengirim data pemesanan: nama, nomor WhatsApp, alamat, dan paket yang dipilih — bot mencatat pesanan dan memberi nomor referensi. (3) Tim LancarWeb mengirim invoice DP 50%; pembayaran HANYA ke rekening resmi BCA 7750-123-456 a.n. PT Lancar Digital Kreatif. (4) Setelah DP diterima, dibuat grup WhatsApp khusus klien dan pengerjaan dimulai; klien mengirim materi (logo, foto, teks). (5) Klien review desain awal, lalu development. (6) Preview di link staging, revisi sesuai kuota paket. (7) Pelunasan 50%, website dipublikasikan ke domain utama, serah terima akses admin + video tutorial. Setelah serah terima berlaku garansi bug 3 bulan.
Slot pengerjaan LancarWeb terbatas per bulan agar kualitas terjaga — cek ketersediaan slot sebelum menjanjikan jadwal mulai.
```

**Tab Integrations — AI Tools ON:**
- **Cek Stok & Harga** ON — "stok" = slot pengerjaan bulan berjalan:
  | Produk | Harga | Stok |
  |---|---|---|
  | Paket Landing Page (1 halaman, jadi 5 hari kerja) | 1750000 | 6 |
  | Paket Company Profile (5 halaman + SEO dasar, 10 hari kerja) | 4900000 | 4 |
  | Paket Toko Online (e-commerce + Midtrans, 20 hari kerja) | 8900000 | 2 |
- **Catat Pesanan** ON · **Update Kontak** ON · **Cek Ongkir** OFF (jasa, bukan barang).

**Tab Followups:**
- Enabled ON · Delay `24` jam · Maks `2` · Limit WA/jam `10`
- Stage: ✅ Konsultasi, ✅ Penawaran Terkirim
- Trigger label: ✅ Hot Lead
- **Mode: AI Contextual** (follow-up nyambung dengan paket yang sedang dibahas), template cadangan:
```
Halo {nama}, menindaklanjuti diskusi website Anda dengan LancarWeb — apakah masih ada yang ingin ditanyakan soal paketnya? 😊
```

### 3.4 BOT ANAK 2 — "Dukungan Teknis"

**Tab General** — Model: **Groq**.

System prompt:
```
Kamu adalah Dukungan Teknis LancarWeb untuk klien yang websitenya sudah jadi.
Gaya: empatik, tenang, solutif, Bahasa Indonesia, maksimal 4 kalimat.
Alur kerjamu: (1) minta detail masalah — alamat website (URL), gejala/pesan error, sejak kapan; (2) tentukan kategorinya (KRITIS/MAYOR/MINOR) dan sampaikan SLA respon sesuai knowledge; (3) yakinkan bahwa laporan diteruskan ke tim teknis dan update akan diberikan.
Jangan menjanjikan waktu perbaikan di luar SLA di knowledge. Simpan nama dan kontak pelapor ke data kontak, dan catat ringkasan masalah di catatan kontak.
```

Transfer condition (lebih longgar dari induk — komplain berat memang harus ke manusia):
```
Jika: pelanggan minta bicara dengan manusia/admin, website pelanggan down total dan ia sangat panik/marah, pelanggan komplain berulang karena masalah tidak kunjung selesai, atau membahas refund/kompensasi.
```

**Tab Knowledge Sources**

Sumber 1 — `Profil LancarWeb` → **salin persis dari induk (3.2)**.

Sumber 2 — Nama: `Garansi & SLA Support LancarWeb`
```
Garansi LancarWeb: semua website bergaransi perbaikan bug fungsional GRATIS selama 3 bulan sejak serah terima, tanpa syarat. Setelah masa garansi, perbaikan mengikuti paket maintenance (Rp 300.000/bulan) atau tarif per perbaikan mulai Rp 200.000.
Kategori masalah dan SLA respon LancarWeb (jam kerja Senin–Jumat 09.00–18.00 WIB, Sabtu 09.00–13.00 WIB):
- KRITIS (website tidak bisa diakses sama sekali / error di semua halaman): respon maksimal 2 jam kerja, target pemulihan 1x24 jam. Diprioritaskan tim teknis.
- MAYOR (fitur penting tidak berfungsi, misal form pemesanan atau pembayaran): respon maksimal 4 jam kerja, target perbaikan 2x24 jam.
- MINOR (typo, tampilan bergeser, permintaan perubahan kecil): respon 1 hari kerja, dikerjakan maksimal 5 hari kerja.
Cara melapor ke Dukungan Teknis LancarWeb: sebutkan alamat website, deskripsi masalah, sejak kapan terjadi, dan screenshot bila ada.
Perpanjangan domain dan hosting LancarWeb: Rp 600.000/tahun, reminder dikirim 30 hari sebelum jatuh tempo. Keterlambatan perpanjangan membuat website nonaktif sementara sampai pembayaran diterima.
```

**Tab Integrations:** AI Tools ON → **Update Kontak** ON saja.

**Tab Followups:** OFF (tidak pantas mem-follow-up orang yang komplain).

### 3.5 Uji cepat setelah setup (via widget bot induk / Telegram)

| # | Kirim pesan | Ekspektasi |
|---|---|---|
| 1 | "Halo, saya punya usaha katering, mau bikin website. Paketnya apa aja?" | Handoff ke **Tim Penjualan**, rekomendasi paket + harga dari knowledge; stage naik ke `Konsultasi`; label `Tanya Harga` terpasang otomatis |
| 2 | "Slot bulan ini masih ada buat Toko Online?" | Tool cek stok terpanggil, jawab sisa slot |
| 3 | "Oke saya ambil Company Profile. Nama saya Dewi, WA 0812xxx, alamat Jl. Anggrek 5 Bandung" | Tool catat pesanan → nomor referensi; pesanan muncul di `/orders`; kontak Dewi terisi otomatis di `/contacts` |
| 4 | (sesi baru) "Website saya yang kalian buat error 500 semua halaman sejak pagi!" | Handoff ke **Dukungan Teknis**, menyebut kategori KRITIS + SLA 2 jam; label `Komplain` |
| 5 | "Sambungkan saya ke manusia sekarang!" | Status percakapan `pending`, AI diam, admin dinotifikasi |
| 6 | Set deal value lead Dewi di `/leads` = 4900000 | Muncul di forecast pipeline `/stats` |

---

## 4. Format Output — saat tim minta "buatkan konfigurasi bot untuk bisnis X"

Claude harus menghasilkan **paket konfigurasi lengkap** dengan struktur persis ini (semua teks siap copy-paste, Bahasa Indonesia):

```markdown
# Paket Konfigurasi Bot — <Nama Bisnis>

## A. Arsitektur yang disarankan
(1 bot tunggal ATAU induk + anak; alasannya 2-3 kalimat; diagram sederhana bila orchestration)

## B. Setup level akun
- Pipeline stages: tabel (urutan, label, tipe open/won/lost, warna)
- Labels: tabel (nama, warna, ai_enabled ya/tidak)
- Channel: bot mana yang dihubungkan ke WA/widget

## C. Bot <nama> (ulangi blok ini per bot)
- Tab General: model + alasannya, system prompt (blok kode), welcome message,
  transfer condition, stop_ai_after_handoff/silent_handoff
- Tab Knowledge: 3-7 sumber, masing-masing nama + isi lengkap (blok kode),
  fakta bisnis yang belum diketahui ditulis sebagai placeholder <ISI: ...>
- Tab Integrations: tool mana ON/OFF + data config (tabel produk/tarif)
- Tab Followups: enabled, delay, maks, stage, trigger label, mode + template
- Tab Orchestration (hanya bot induk): kondisi revert + tabel anak (nama bot, kondisi assign)

## D. Skenario uji cepat
(5-8 pesan uji + ekspektasi hasilnya, seperti §3.5)
```

Ketentuan tambahan saat menyusun:
1. **Tanya dulu bila fakta bisnis belum ada** (nama bisnis, produk/harga, jam operasional, rekening, kebijakan refund) — atau tulis placeholder `<ISI: ...>` yang jelas, JANGAN mengarang angka.
2. Default yang dipakai bila tim tidak minta khusus: model **Groq**, `stop_ai_after_handoff` ON, `silent_handoff` OFF, follow-up delay 24 jam maks 2x, `update_contact` selalu ON, pipeline default 5 stage.
3. Orchestration hanya diusulkan bila memang ada ≥2 divisi yang jelas berbeda; selain itu 1 bot.
4. Knowledge ditulis mengikuti aturan §2.5 (paragraf mandiri, nama entitas diulang, fakta padat).

---

## 5. Kesalahan Umum (hindari!)

1. **Menaruh harga/detail produk di system prompt** — taruh di knowledge (bisa di-update tanpa mengubah perilaku, ikut RAG).
2. **Transfer condition terlalu luas** ("pelanggan komplain") — bot jadi gampang menyerah; selalu pakai pola "HANYA jika ...".
3. **Nama bot anak saling menjadi awalan** ("Sales" & "Sales B2B") — router bisa salah pilih; pakai nama yang benar-benar beda.
4. **Kondisi assign antar-anak tumpang tindih** — routing tidak stabil; pastikan saling eksklusif.
5. **Lupa menyalin profil bisnis ke knowledge bot anak** — anak tidak mewarisi knowledge induk; ia bot mandiri.
6. **Paragraf knowledge yang bergantung konteks** ("paket ini", "seperti di atas") — pecah RAG; tiap paragraf harus berdiri sendiri.
7. **Lupa klik Save per tab / per sumber knowledge** — perubahan hilang.
8. **Follow-up di stage `Baru` atau di bot support** — terkesan spam; follow-up hanya untuk lead panas di jalur sales.
9. **Mengubah pipeline stages tanpa sadar itu level AKUN** — semua bot & lead ikut berubah.
10. **Menghubungkan WA ke bot anak** — chat tidak akan melewati router; WA harus ke bot induk.
11. **Menguji orchestration/tools lewat simulator settings** — simulator belum melewati jalur itu; uji lewat widget atau Telegram.
12. **Mengarang rekening/nomor kontak di knowledge contoh** — selalu konfirmasi data sensitif ke pemilik bisnis.
