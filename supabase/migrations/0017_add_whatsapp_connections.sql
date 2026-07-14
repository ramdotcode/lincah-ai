-- Koneksi WhatsApp naik ke level AKUN: satu user hanya boleh punya satu nomor
-- WA (user_id unique). bot_id = AI agent yang menjawab pesan masuk.
-- Kolom whatsapp_* lama di bots dibiarkan (dipakai fallback transisi webhook),
-- tapi tidak ditulis lagi oleh aplikasi.
--
-- Key sesi worker Baileys ikut berubah: dari bot_id → user_id. Sesi lama di
-- VPS tetap dikenali webhook (fallback), tapi supaya pengiriman (followup/
-- reply manual) konsisten, rename folder sesi di VPS:
--   mv sessions/auth_info_<bot_id> sessions/auth_info_<user_id> && pm2 restart wa-worker
-- atau cukup Reset QR dari halaman Connected Platforms.

create table if not exists whatsapp_connections (
  id uuid primary key default uuid_generate_v4(),
  -- unique = enforce 1 akun 1 WA
  user_id uuid not null unique references auth.users(id) on delete cascade,
  -- AI agent yang menjawab chat WA masuk
  bot_id uuid not null references bots(id) on delete cascade,
  enabled boolean not null default true,
  phone_number text,
  bot_type text not null default 'baileys',
  phone_id text,
  access_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_connections_bot on whatsapp_connections (bot_id);

-- Migrasikan koneksi yang ada: satu per user, prioritas bot yang WA-nya aktif
insert into whatsapp_connections (user_id, bot_id, enabled, phone_number, bot_type, phone_id, access_token)
select distinct on (user_id)
  user_id,
  id,
  coalesce(whatsapp_enabled, false),
  whatsapp_phone_number,
  coalesce(whatsapp_bot_type, 'baileys'),
  whatsapp_phone_id,
  whatsapp_access_token
from bots
where user_id is not null
  and (whatsapp_enabled = true or whatsapp_phone_number is not null)
order by user_id, (whatsapp_enabled is true) desc, updated_at desc nulls last
on conflict (user_id) do nothing;

-- RLS
alter table whatsapp_connections enable row level security;

create policy "Users can view own whatsapp connection"
  on whatsapp_connections for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can manage own whatsapp connection"
  on whatsapp_connections for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Service role full access to whatsapp connections"
  on whatsapp_connections for all
  to service_role
  using (true)
  with check (true);
