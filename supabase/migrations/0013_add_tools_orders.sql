-- AI tool use (Fase D): bot bisa "bertindak" — cek stok, cek ongkir, catat pesanan.
-- Tools dieksekusi via function calling (Groq Llama 3.3 70B).

-- 1. Toggle per bot
alter table bots
  add column if not exists tools_enabled boolean default false;

-- 2. Konfigurasi tool per bot. Satu baris per jenis tool.
create table if not exists bot_tools (
  id uuid primary key default uuid_generate_v4(),
  bot_id uuid not null references bots(id) on delete cascade,
  tool_type text not null
    check (tool_type in ('check_stock', 'check_shipping', 'create_order')),
  enabled boolean not null default true,
  -- check_stock : { products: [{name, price, stock}] }
  -- check_shipping: { rates: [{destination, cost, eta_days}], biteship_api_key?, origin? }
  -- create_order : {} (menulis ke tabel orders)
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bot_id, tool_type)
);

create index if not exists idx_bot_tools_bot on bot_tools (bot_id, enabled);

-- 3. Pesanan yang dicatat AI lewat tool create_order
create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  bot_id uuid not null references bots(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  customer_name text,
  customer_contact text,
  items jsonb not null default '[]',
  address text,
  notes text,
  status text not null default 'new'
    check (status in ('new', 'confirmed', 'paid', 'shipped', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_bot on orders (bot_id, created_at desc);

-- 4. RLS
alter table bot_tools enable row level security;
alter table orders enable row level security;

create policy "Users can view own bot_tools"
  on bot_tools for select
  to authenticated
  using (exists (select 1 from bots b where b.id = bot_tools.bot_id and b.user_id = auth.uid()));

create policy "Users can manage own bot_tools"
  on bot_tools for all
  to authenticated
  using (exists (select 1 from bots b where b.id = bot_tools.bot_id and b.user_id = auth.uid()))
  with check (exists (select 1 from bots b where b.id = bot_tools.bot_id and b.user_id = auth.uid()));

create policy "Service role full access to bot_tools"
  on bot_tools for all
  to service_role
  using (true)
  with check (true);

create policy "Users can view own orders"
  on orders for select
  to authenticated
  using (exists (select 1 from bots b where b.id = orders.bot_id and b.user_id = auth.uid()));

create policy "Users can manage own orders"
  on orders for all
  to authenticated
  using (exists (select 1 from bots b where b.id = orders.bot_id and b.user_id = auth.uid()))
  with check (exists (select 1 from bots b where b.id = orders.bot_id and b.user_id = auth.uid()));

create policy "Service role full access to orders"
  on orders for all
  to service_role
  using (true)
  with check (true);
