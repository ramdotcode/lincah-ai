-- 0024: Pipeline stage custom per akun (CRM Fase 7).
-- Membebaskan tahapan pipeline: tiap akun bisa buat/ubah/urutkan stage sendiri.
-- conversations.stage tetap menyimpan KEY stage (slug); definisi/urutan/warna ada
-- di tabel pipeline_stages. Jalankan manual di Supabase SQL Editor. Idempoten.

create table if not exists pipeline_stages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,                       -- slug stabil, = conversations.stage
  label text not null,                     -- nama tampilan (bebas diedit)
  color text not null default 'blue'
    check (color in ('red', 'orange', 'amber', 'emerald', 'sky', 'blue', 'violet', 'pink')),
  position integer not null default 0,     -- urutan di pipeline
  type text not null default 'open'
    check (type in ('open', 'won', 'lost')),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_pipeline_stages_key
  on pipeline_stages (user_id, key);

create index if not exists idx_pipeline_stages_user
  on pipeline_stages (user_id, position);

alter table pipeline_stages enable row level security;

drop policy if exists "Users can manage own pipeline stages" on pipeline_stages;
create policy "Users can manage own pipeline stages"
  on pipeline_stages for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Service role full access to pipeline stages" on pipeline_stages;
create policy "Service role full access to pipeline stages"
  on pipeline_stages for all
  to service_role
  using (true)
  with check (true);

-- Lepas check constraint lama agar stage custom (key bebas) boleh disimpan.
-- Validasi nilai stage kini di lapisan aplikasi (terhadap pipeline_stages milik akun).
alter table conversations drop constraint if exists conversations_stage_check;

-- Seed 5 stage default untuk setiap akun pemilik bot (identik perilaku lama)
insert into pipeline_stages (user_id, key, label, color, position, type)
select u.user_id, d.key, d.label, d.color, d.position, d.type
from (select distinct user_id from bots where user_id is not null) u
cross join (values
  ('new', 'New', 'blue', 0, 'open'),
  ('interested', 'Interested', 'sky', 1, 'open'),
  ('negotiating', 'Negotiating', 'amber', 2, 'open'),
  ('won', 'Won', 'emerald', 3, 'won'),
  ('lost', 'Lost', 'red', 4, 'lost')
) as d(key, label, color, position, type)
on conflict (user_id, key) do nothing;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
