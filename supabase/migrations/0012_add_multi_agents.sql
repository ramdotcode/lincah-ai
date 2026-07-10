-- Multi-agent routing (Fase C): satu bot (channel WA/Telegram) bisa punya
-- beberapa AI agent (sales/support/billing). Router 8B memilih agent per pesan.

-- 1. Toggle per bot
alter table bots
  add column if not exists multi_agent_enabled boolean default false;

-- 2. Tabel agents: sub-agent milik satu bot
create table if not exists agents (
  id uuid primary key default uuid_generate_v4(),
  bot_id uuid not null references bots(id) on delete cascade,
  name text not null,
  -- Deskripsi tugas agent, dipakai router untuk memutuskan chat masuk ke mana
  description text,
  system_prompt text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agents_bot on agents (bot_id, active);

-- 3. Knowledge bisa di-scope ke satu agent (null = dipakai semua agent)
alter table knowledge_sources
  add column if not exists agent_id uuid references agents(id) on delete set null;

-- 4. Agent aktif per percakapan (stickiness + fallback saat router gagal)
alter table conversations
  add column if not exists active_agent_id uuid references agents(id) on delete set null;

-- 5. RLS: user hanya kelola agents milik bot-nya
alter table agents enable row level security;

create policy "Users can view own agents"
  on agents for select
  to authenticated
  using (
    exists (
      select 1 from bots b
      where b.id = agents.bot_id and b.user_id = auth.uid()
    )
  );

create policy "Users can manage own agents"
  on agents for all
  to authenticated
  using (
    exists (
      select 1 from bots b
      where b.id = agents.bot_id and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from bots b
      where b.id = agents.bot_id and b.user_id = auth.uid()
    )
  );

create policy "Service role full access to agents"
  on agents for all
  to service_role
  using (true)
  with check (true);
