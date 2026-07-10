-- CRM Pipeline (Fase A): kolom stage pada conversations.
-- Setiap conversation adalah lead; stage merepresentasikan posisi di pipeline penjualan.
-- Nilai valid: 'new' | 'interested' | 'negotiating' | 'won' | 'lost'.

-- 1. Kolom stage
alter table conversations
  add column if not exists stage text not null default 'new'
    check (stage in ('new', 'interested', 'negotiating', 'won', 'lost')),
  add column if not exists stage_updated_at timestamptz default now(),
  add column if not exists stage_updated_by text
    check (stage_updated_by in ('ai', 'manual'));

-- 2. stage_updated_at otomatis setiap stage berubah
--    (konsisten dengan pola trigger updated_at di profiles)
create or replace function public.set_conversation_stage_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_stage_updated_at on conversations;
create trigger conversations_stage_updated_at
  before update on conversations
  for each row execute function public.set_conversation_stage_updated_at();

-- 3. Index untuk query Kanban per bot + stage dan kandidat follow-up (Fase B)
create index if not exists idx_conversations_bot_stage
  on conversations (bot_id, stage);

-- Catatan RLS: conversations sudah dilindungi RLS via join ke bots.user_id;
-- kolom baru otomatis tercakup policy yang ada (tidak perlu policy baru).
