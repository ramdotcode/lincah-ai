-- RAG dengan pgvector (Fase E2): knowledge dipotong jadi chunk + embedding.
-- Saat total knowledge bot besar, webhook mengambil hanya chunk paling relevan
-- dengan pertanyaan pelanggan, bukan seluruh knowledge (hemat token & fokus).
-- Embedding: baai/bge-m3 via NVIDIA NIM (1024 dimensi).

create extension if not exists vector;

create table if not exists knowledge_chunks (
  id uuid primary key default uuid_generate_v4(),
  knowledge_source_id uuid not null references knowledge_sources(id) on delete cascade,
  bot_id uuid not null references bots(id) on delete cascade,
  -- Scope agent mengikuti knowledge_sources.agent_id (null = untuk semua agent)
  agent_id uuid references agents(id) on delete set null,
  chunk_index integer not null default 0,
  content text not null,
  embedding vector(1024),
  created_at timestamptz not null default now()
);

create index if not exists idx_knowledge_chunks_source
  on knowledge_chunks (knowledge_source_id);

create index if not exists idx_knowledge_chunks_embedding
  on knowledge_chunks using hnsw (embedding vector_cosine_ops);

-- Pencarian chunk paling relevan (cosine similarity).
-- p_agent_id null → hanya chunk shared; berisi id → shared + milik agent itu.
create or replace function match_knowledge_chunks(
  p_bot_id uuid,
  p_agent_id uuid,
  p_query_embedding vector(1024),
  p_match_count int default 6
)
returns table (
  content text,
  source_name text,
  source_type text,
  similarity float
)
language sql stable as $$
  select
    kc.content,
    ks.name as source_name,
    ks.type as source_type,
    1 - (kc.embedding <=> p_query_embedding) as similarity
  from knowledge_chunks kc
  join knowledge_sources ks on ks.id = kc.knowledge_source_id
  where kc.bot_id = p_bot_id
    and kc.embedding is not null
    and (kc.agent_id is null or kc.agent_id = p_agent_id)
  order by kc.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- RLS: chunk hanya diakses service role (webhook); user tidak perlu baca langsung
alter table knowledge_chunks enable row level security;

create policy "Service role full access to knowledge_chunks"
  on knowledge_chunks for all
  to service_role
  using (true)
  with check (true);
