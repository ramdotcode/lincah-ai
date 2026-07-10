-- Multi-role support via profiles table.
-- Roles: 'admin' (kelola semua + dashboard admin), 'owner' (pemilik bot, default),
--        'agent' (CS: balas percakapan saja — enforcement menyusul di API/RLS).

-- 1. PROFILES TABLE
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('admin', 'owner', 'agent')),
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Backfill: buat profile untuk semua user yang sudah ada
insert into profiles (id, full_name)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
from auth.users u
on conflict (id) do nothing;

-- 3. Auto-create profile saat user baru mendaftar
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. RLS (untuk development boleh dimatikan:
--    alter table profiles disable row level security;)
-- Helper security definer: policy profiles tidak boleh query profiles langsung
-- (menyebabkan infinite recursion di Supabase)
create or replace function public.get_user_role(uid uuid)
returns text
language sql
security definer set search_path = public
stable
as $$
  select role from profiles where id = uid;
$$;

alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select
  to authenticated
  using (id = auth.uid());

create policy "Users can update own profile (except role)"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- role hanya boleh diubah admin/service role, bukan user sendiri
    and role = public.get_user_role(auth.uid())
  );

create policy "Admins can view all profiles"
  on profiles for select
  to authenticated
  using (public.get_user_role(auth.uid()) = 'admin');

create policy "Service role full access to profiles"
  on profiles for all
  to service_role
  using (true)
  with check (true);

-- 5. updated_at otomatis
create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function public.set_profiles_updated_at();

-- 6. Jadikan dirimu admin (ganti email sesuai akunmu, lalu jalankan manual):
-- update profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'emailkamu@gmail.com');
