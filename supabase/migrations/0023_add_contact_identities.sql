-- 0023: Merge kontak lintas kanal (CRM Fase 6).
-- Satu kontak kini bisa punya banyak identitas kanal (WA + Telegram + webchat).
-- `contact_identities` menjadi sumber kebenaran pencocokan kanal; kolom
-- contacts.platform/external_id tetap dipertahankan sebagai identitas PRIMER
-- (untuk tampilan & backward-compat). Jalankan manual di Supabase SQL Editor.
-- Idempoten, aman di-re-run.

create table if not exists contact_identities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  platform text not null check (platform in ('telegram', 'whatsapp', 'webchat')),
  external_id text not null,
  created_at timestamptz not null default now()
);

-- Satu identitas kanal hanya boleh dimiliki oleh SATU kontak per akun
create unique index if not exists uq_contact_identities
  on contact_identities (user_id, platform, external_id);

create index if not exists idx_contact_identities_contact
  on contact_identities (contact_id);

alter table contact_identities enable row level security;

drop policy if exists "Users can manage own contact identities" on contact_identities;
create policy "Users can manage own contact identities"
  on contact_identities for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Service role full access to contact identities" on contact_identities;
create policy "Service role full access to contact identities"
  on contact_identities for all
  to service_role
  using (true)
  with check (true);

-- Backfill: setiap kontak yang punya identitas primer → satu baris identitas.
-- Kontak manual tanpa kanal (platform/external_id null) dilewati.
insert into contact_identities (user_id, contact_id, platform, external_id)
select c.user_id, c.id, c.platform, c.external_id
from contacts c
where c.platform is not null and c.external_id is not null
on conflict (user_id, platform, external_id) do nothing;

-- Reload PostgREST schema cache agar tabel/relasi baru langsung terlihat oleh API
notify pgrst, 'reload schema';
