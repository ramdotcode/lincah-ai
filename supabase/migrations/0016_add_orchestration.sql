-- AI Agent Orchestration (parent-child handoff), menggantikan multi-agent
-- routing lama (0012). Bot yang dibuka = parent; child = bot lain milik user
-- yang dipinjam "otaknya" (prompt, knowledge, model). Perpindahan chat terjadi
-- hanya saat kondisi natural-language terpenuhi — bukan klasifikasi per pesan.
-- Tabel agents lama dibiarkan (tidak destruktif) tapi tidak dipakai runtime.

-- 1. Konfigurasi orchestration di bot parent
alter table bots
  add column if not exists orchestration_enabled boolean default false,
  -- Kondisi kapan chat yang sedang dipegang child dikembalikan ke parent
  add column if not exists revert_to_parent_condition text,
  -- Posisi node parent di kanvas ({x, y}); null = auto-layout
  add column if not exists orchestration_parent_position jsonb;

-- 2. Assignment child: bot lain + kondisi kapan chat dilempar ke dia
create table if not exists agent_assignments (
  id uuid primary key default uuid_generate_v4(),
  parent_bot_id uuid not null references bots(id) on delete cascade,
  child_bot_id uuid not null references bots(id) on delete cascade,
  -- Kondisi natural language, dievaluasi model kecil tiap pesan masuk
  assign_condition text not null,
  -- Posisi node child di kanvas ({x, y}); null = auto-layout
  position jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_assignments_no_self check (parent_bot_id <> child_bot_id),
  constraint agent_assignments_unique_child unique (parent_bot_id, child_bot_id)
);

create index if not exists idx_agent_assignments_parent on agent_assignments (parent_bot_id);

-- 3. Pemegang chat saat ini per percakapan (null = parent yang pegang).
--    active_agent_id lama dibiarkan; kolom baru menunjuk ke bots, bukan agents.
alter table conversations
  add column if not exists active_child_bot_id uuid references bots(id) on delete set null;

-- 4. RLS: user hanya kelola assignment milik bot parent-nya
alter table agent_assignments enable row level security;

create policy "Users can view own agent assignments"
  on agent_assignments for select
  to authenticated
  using (
    exists (
      select 1 from bots b
      where b.id = agent_assignments.parent_bot_id and b.user_id = auth.uid()
    )
  );

create policy "Users can manage own agent assignments"
  on agent_assignments for all
  to authenticated
  using (
    exists (
      select 1 from bots b
      where b.id = agent_assignments.parent_bot_id and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from bots b
      where b.id = agent_assignments.parent_bot_id and b.user_id = auth.uid()
    )
  );

create policy "Service role full access to agent assignments"
  on agent_assignments for all
  to service_role
  using (true)
  with check (true);
