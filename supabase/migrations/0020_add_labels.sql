-- 0020: Labels (CRM Fase 3) — label percakapan level akun, ala Cekat AI.
-- Jalankan manual di Supabase SQL Editor (seperti 0016-0019). Idempoten, aman di-re-run.

create table if not exists labels (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default 'blue'
    check (color in ('red', 'orange', 'amber', 'emerald', 'sky', 'blue', 'violet', 'pink')),
  created_at timestamptz not null default now()
);

-- Satu nama label unik per akun
create unique index if not exists uq_labels_user_name
  on labels (user_id, lower(name));

create index if not exists idx_labels_user on labels (user_id);

alter table labels enable row level security;

drop policy if exists "Users can manage own labels" on labels;
create policy "Users can manage own labels"
  on labels for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Service role full access to labels" on labels;
create policy "Service role full access to labels"
  on labels for all
  to service_role
  using (true)
  with check (true);

-- Penempelan label ke percakapan (maks 5 per percakapan — divalidasi di API)
create table if not exists conversation_labels (
  conversation_id uuid not null references conversations(id) on delete cascade,
  label_id uuid not null references labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, label_id)
);

create index if not exists idx_conversation_labels_label
  on conversation_labels (label_id);

alter table conversation_labels enable row level security;

drop policy if exists "Users can manage own conversation labels" on conversation_labels;
create policy "Users can manage own conversation labels"
  on conversation_labels for all
  to authenticated
  using (
    exists (
      select 1 from labels l
      where l.id = conversation_labels.label_id and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from labels l
      where l.id = conversation_labels.label_id and l.user_id = auth.uid()
    )
  );

drop policy if exists "Service role full access to conversation labels" on conversation_labels;
create policy "Service role full access to conversation labels"
  on conversation_labels for all
  to service_role
  using (true)
  with check (true);

-- Reload PostgREST schema cache agar tabel/relasi baru langsung terlihat oleh API
notify pgrst, 'reload schema';
