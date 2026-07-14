-- CRM Tickets: tindak lanjut manual (eskalasi, komplain, follow-up).
-- Ticket milik akun (user_id), opsional terhubung ke percakapan.

create table if not exists tickets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  subject text not null,
  description text,
  customer_name text,
  customer_contact text,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tickets_user
  on tickets (user_id, status, created_at desc);

-- updated_at otomatis setiap baris berubah
-- (konsisten dengan pola trigger di conversations.stage_updated_at)
create or replace function public.set_ticket_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tickets_updated_at on tickets;
create trigger tickets_updated_at
  before update on tickets
  for each row execute function public.set_ticket_updated_at();

-- RLS
alter table tickets enable row level security;

create policy "Users can manage own tickets"
  on tickets for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Service role full access to tickets"
  on tickets for all
  to service_role
  using (true)
  with check (true);
