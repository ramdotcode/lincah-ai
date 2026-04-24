# Lincah AI - Agentic Chat Platform

Platform untuk membuat dan mengelola AI Agent yang terhubung ke Telegram, dengan fitur human handoff otomatis.

## Fitur Utama
1. **AI Response (Llama 3.3 70B)**: Memberikan jawaban pintar ke user.
2. **Handoff Checker (Llama 3.1 8B)**: Secara paralel mengecek apakah user butuh bantuan manusia.
3. **Dashboard Real-time**: Monitor percakapan dan balas manual via dashboard.
4. **Settings Fleksibel**: Atur system prompt dan kondisi transfer kapan saja.

## Cara Setup

### 1. Database (Supabase)
- Buat project baru di Supabase.
- Jalankan SQL yang ada di folder `supabase/migrations/` secara berurutan di SQL Editor Supabase.
- File pertama adalah `0001_initial_schema.sql`.

### 2. Environment Variables
- Copy `.env.example` menjadi `.env.local`.
- Isi value dari:
  - **Supabase**: URL, Anon Key, dan Service Role Key (ada di Project Settings > API).
  - **Groq**: API Key (dapat di [console.groq.com](https://console.groq.com)).
  - **Telegram**: Bot Token dari BotFather.

### 3. Install & Run
```bash
npm install
npm run dev
```

### 4. Set Webhook Telegram
Setelah deploy (misal ke Vercel atau via ngrok), jalankan perintah ini (ganti domain dan token):
```bash
curl -X POST https://api.telegram.org/bot[YOUR_BOT_TOKEN]/setWebhook?url=https://[YOUR_DOMAIN]/api/webhook/telegram
```

## Teknologi
- **Frontend**: Next.js 15, Tailwind CSS, Framer Motion, Lucide Icons.
- **Backend**: Next.js API Routes, Supabase (Auth & Database).
- **AI**: Groq SDK (Llama 3 models).
