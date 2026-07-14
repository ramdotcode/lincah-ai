-- 0019: CRM Contacts — kontak nyata milik akun, tidak lagi turunan dari conversations.
-- Jalankan manual di Supabase SQL Editor (seperti 0016-0018). Idempoten, aman di-re-run.

create table if not exists contacts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Identitas kanal (null untuk kontak manual tanpa kanal)
  platform text check (platform in ('telegram', 'whatsapp', 'webchat')),
  external_id text,                       -- = conversations.chat_id
  name text,
  username text,
  phone text,
  email text,
  company text,
  address text,
  notes text,
  tags text[] not null default '{}',
  source text not null default 'auto'
    check (source in ('auto', 'manual')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Satu kontak per identitas kanal per akun (kontak manual boleh tanpa identitas)
create unique index if not exists uq_contacts_identity
  on contacts (user_id, platform, external_id)
  where platform is not null and external_id is not null;

create index if not exists idx_contacts_user
  on contacts (user_id, updated_at desc);

create or replace function public.set_contact_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_updated_at on contacts;
create trigger contacts_updated_at
  before update on contacts
  for each row execute function public.set_contact_updated_at();

alter table contacts enable row level security;

drop policy if exists "Users can manage own contacts" on contacts;
create policy "Users can manage own contacts"
  on contacts for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Service role full access to contacts" on contacts;
create policy "Service role full access to contacts"
  on contacts for all
  to service_role
  using (true)
  with check (true);

-- Link conversations -> contacts
alter table conversations
  add column if not exists contact_id uuid references contacts(id) on delete set null;

create index if not exists idx_conversations_contact
  on conversations (contact_id);

-- Izinkan tool baru 'update_contact' (0013 punya check constraint lama)
alter table bot_tools drop constraint if exists bot_tools_tool_type_check;
alter table bot_tools add constraint bot_tools_tool_type_check
  check (tool_type in ('check_stock', 'check_shipping', 'create_order', 'update_contact'));

-- ===== Backfill: buat kontak dari percakapan lama (idempoten) =====
insert into contacts (user_id, platform, external_id, name, username, phone, last_seen_at, source)
select distinct on (b.user_id, coalesce(c.platform, 'telegram'), c.chat_id)
  b.user_id,
  coalesce(c.platform, 'telegram'),
  c.chat_id,
  coalesce(nullif(c.customer_name, ''), nullif(c.name, '')),
  nullif(c.username, ''),
  case when coalesce(c.platform, 'telegram') = 'whatsapp' then c.chat_id end,
  c.last_message_at,
  'auto'
from conversations c
join bots b on b.id = c.bot_id
where c.chat_id is not null
order by b.user_id, coalesce(c.platform, 'telegram'), c.chat_id,
  c.last_message_at desc nulls last
on conflict (user_id, platform, external_id)
  where platform is not null and external_id is not null
  do nothing;

-- Tautkan percakapan lama ke kontaknya
update conversations c
set contact_id = ct.id
from bots b, contacts ct
where b.id = c.bot_id
  and ct.user_id = b.user_id
  and ct.platform = coalesce(c.platform, 'telegram')
  and ct.external_id = c.chat_id
  and c.contact_id is null;

-- Reload PostgREST schema cache agar kolom/relasi baru langsung terlihat oleh API
notify pgrst, 'reload schema';
