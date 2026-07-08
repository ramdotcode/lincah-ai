-- Event logs table for observability (latency, tokens, errors)
create table event_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  bot_id uuid references bots(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  channel text not null,              -- 'telegram' | 'whatsapp'
  event_type text not null,           -- 'message_processed' | 'ai_error' | 'webhook_error' | 'handoff'
  latency_main_ms int,                -- durasi request Llama 70B (ms)
  latency_handoff_ms int,             -- durasi request Llama 8B (ms)
  prompt_tokens int,                  -- total prompt tokens
  completion_tokens int,              -- total completion tokens
  handoff_result boolean,             -- true jika AI recommend handoff
  error_message text,                 -- error message jika ada error
  metadata jsonb default '{}'::jsonb  -- additional context
);

-- Indexes for common queries
create index idx_event_logs_bot_created on event_logs (bot_id, created_at desc);
create index idx_event_logs_type_created on event_logs (event_type, created_at desc);
create index idx_event_logs_conv on event_logs (conversation_id);

-- RLS: service role can insert, owner can select their bot's logs
alter table event_logs enable row level security;

create policy "Service role can insert event logs"
  on event_logs for insert
  to service_role
  with check (true);

create policy "Users can view their bot's event logs"
  on event_logs for select
  to authenticated
  using (
    bot_id in (
      select id from bots where user_id = auth.uid()
    )
  );
