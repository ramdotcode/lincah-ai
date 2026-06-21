# Analisis Kompetitor: Lincah AI vs CekatAI

Dokumen ini membandingkan fitur saat ini dan rencana pengembangan **Lincah AI** dengan benchmark market-leader **CekatAI** untuk menentukan strategi positioning dan pengembangan fitur prioritas.

---

## 1. AI Agent Capabilities (Core Logic)

| Fitur | Lincah AI (Saat Ini & *Ongoing*) | CekatAI | Catatan Strategis |
| :--- | :--- | :--- | :--- |
| **Respon & Training** | LLM (Llama 3.3). Training via Teks & URL. | Human-like. Training via Data Upload & Website. | Lincah AI kompetitif di core logic LLM. |
| **Persona & Kontrol** | System Prompt & Tone (+ Advance Model). | Casual/Pro & Argesif/Santai. | Lincah AI sudah memiliki ini di tab Settings. |
| **Sales Flow (SOP)** | **Ongoing:** Guided Order Flow (AC Servis). | SOP Sales Flow (Keluhan -> Konsultasi). | Kekuatan Lincah AI ada di spesialisasi industri (AC). |
| **Upselling & Follow-up** | **Planned:** Auto follow-up setelah X jam. | Situational Upselling & Contextual Follow-up. | Perlu diperdalam di logika n8n/workflow. |
| **Multimodal** | Belum mendasar (Text-only). | Kirim/Baca Gambar, PDF, & Voice Note. | Prioritaskan "Melihat Gambar" (Bukti Transfer). |
| **UX Polish** | Single-response per message. | **Message Buffering** & **Multi-bubble**. | **PENTING:** Harus dicontek untuk kesan "Manusia". |

## 2. Platform & CRM Layer

| Fitur | Lincah AI (Saat Ini & *Ongoing*) | CekatAI | Catatan Strategis |
| :--- | :--- | :--- | :--- |
| **Omnichannel** | Telegram (Live), WhatsApp (Ongoing). | WA, IG, FB, & Marketplace. | Fokus WA adalah prioritas utama 100%. |
| **CRM Monitoring** | Dashboard Live Chat + Lead List. | CRM + Automatic Assignment 24/7. | Lincah AI sudah punya fondasi audit trail. |
| **Handoff System** | Hybrid Handoff (AI <-> Human). | Human handoff dengan visual diff. | Lincah AI punya keunggulan di **AI Copilot**. |
| **Marketing Tool** | Planned Broadcast & Campaign. | Broadcast masif & FB Pixel Integration. | Cocok untuk retensi customer servis AC berkala. |
| **Collaboration** | Manual reply by Admin. | Private Internal Notes & Agent Labels. | Tambahkan "Private Notes" untuk admin di CRM. |

## 3. Pricing & Positioning

| Aspek | CekatAI (SaaS Model) | Lincah AI (Custom Service) |
| :--- | :--- | :--- |
| **Entry Price** | **Rp 579.000 / Bulan** | Target < Rp 1.5jt/bulan operasional. |
| **MAU / Kuota** | Terbatas per Tier (1000 MAU). | Potensi "Unlimited" jika pakai server sendiri. |
| **Positioning** | Generalist AI Builder (SaaS). | Vertical Solution (CS Servis/Toko Lokal). |
| **Value Prop** | Feature-rich & Enterprise ready. | **Low cost, Specific Workflow, & High-touch support.** |

---

## 4. Insight & Inspirasi (Action Plan)

Berikut adalah beberapa fitur CekatAI yang sangat bernilai untuk diimplementasikan ke Lincah AI (n8n + Fonnte/Baileys):

1.  **Message Buffering (Debounce):**
    *   *Konsep:* Tunggu user selesai mengetik (misal: 3 detik diam) baru AI membalas.
    *   *Solusi:* Implementasikan di n8n menggunakan `Wait Node` + Cek timestamp pesan terakhir di database sebelum memproses ke AI.

2.  **Multi-bubble Response:**
    *   *Konsep:* Memecah jawaban panjang menjadi beberapa bubble chat kecil agar tidak terlihat seperti "tembok teks".
    *   *Solusi:* Buat utility function untuk split text berdasarkan newline atau panjang karakter tertentu sebelum dikirim ke WA.

3.  **Private Note / Internal Context:**
    *   *Konsep:* Admin bisa meninggalkan catatan di chat yang tidak terlihat oleh customer.
    *   *Solusi:* Tambahkan tabel `internal_notes` di database dan tampilkan di sidebar CRM `/monitor`.

4.  **SOP-driven Sales (Micro-Commitment):**
    *   *Konsep:* AI mengunci flow (misal: sebelum tanya alamat, jangan jawab soal harga dulu secara detail).
    *   *Solusi:* Gunakan "State Management" di database untuk melacak customer ada di tahap mana (Tanya Servis -> Isi Data -> Pilih Jadwal).

---
*Terakhir Diperbarui: 17 Juni 2026*
