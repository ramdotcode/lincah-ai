-- Auto Follow-up (Fase B): konfigurasi per bot + tabel tracking followups.

-- 1. Konfigurasi follow-up per bot
alter table bots
  add column if not exists followup_enabled boolean default false,
  add column if not exists followup_delay_hours integer default 24,
  add column if not exists followup_max_count integer default 2,
  add column if not exists followup_template text,
  add column if not exists followup_stages text[] default '{interested,negotiating}',
  -- Proteksi WhatsApp (Baileys): maksimal follow-up per bot per jam
  add column if not exists followup_wa_hourly_limit integer default 10;

-- 2. Tabel tracking follow-up
create table if not exists followups (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sent', 'cancelled', 'failed')),
  attempt_number integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_followups_conversation
  on followups (conversation_id, status);

-- 3. RLS: user hanya lihat followups milik bot-nya (via conversations → bots)
alter table followups enable row level security;

create policy "Users can view own followups"
  on followups for select
  to authenticated
  using (
    exists (
      select 1 from conversations c
      join bots b on b.id = c.bot_id
      where c.id = followups.conversation_id
        and b.user_id = auth.uid()
    )
  );

create policy "Service role full access to followups"
  on followups for all
  to service_role
  using (true)
  with check (true);
