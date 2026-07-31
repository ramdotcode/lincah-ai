-- Pembayaran QRIS via Xendit (tool create_payment): AI membuat QR dinamis,
-- webhook Xendit menandai lunas. Aktif per bot lewat bot_tools (default mati).

-- 1. Izinkan tool baru 'create_payment' (pola sama dengan 0019)
alter table bot_tools drop constraint if exists bot_tools_tool_type_check;
alter table bot_tools add constraint bot_tools_tool_type_check
  check (tool_type in ('check_stock', 'check_shipping', 'create_order', 'update_contact', 'create_payment'));

-- 2. Tabel payments — satu baris per QR yang dibuat AI
create table if not exists payments (
  id uuid primary key default uuid_generate_v4(),
  bot_id uuid not null references bots(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  customer_contact text,
  provider text not null default 'xendit',
  external_id text,            -- id QR dari Xendit (qr_...)
  amount numeric not null,
  description text,
  qr_string text,              -- payload EMV QRIS, dirender jadi PNG oleh /api/payments/[id]/qr
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'expired', 'failed')),
  paid_at timestamptz,
  expires_at timestamptz,
  raw jsonb,                   -- payload callback Xendit terakhir (audit/debug)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_bot on payments (bot_id, created_at desc);
create index if not exists idx_payments_external on payments (external_id);

-- 3. RLS (pola sama dengan orders)
alter table payments enable row level security;

drop policy if exists "Users can view own payments" on payments;
create policy "Users can view own payments"
  on payments for select
  to authenticated
  using (exists (select 1 from bots b where b.id = payments.bot_id and b.user_id = auth.uid()));

drop policy if exists "Users can manage own payments" on payments;
create policy "Users can manage own payments"
  on payments for all
  to authenticated
  using (exists (select 1 from bots b where b.id = payments.bot_id and b.user_id = auth.uid()))
  with check (exists (select 1 from bots b where b.id = payments.bot_id and b.user_id = auth.uid()));

drop policy if exists "Service role full access to payments" on payments;
create policy "Service role full access to payments"
  on payments for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';
