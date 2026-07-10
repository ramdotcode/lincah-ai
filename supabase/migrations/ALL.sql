-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.bots (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  system_prompt text,
  transfer_condition text,
  stop_ai_after_handoff boolean DEFAULT true,
  silent_handoff boolean DEFAULT false,
  telegram_token text,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  welcome_message text,
  ai_model text DEFAULT 'groq'::text,
  ai_label text,
  ai_pipeline_status text,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  whatsapp_enabled boolean DEFAULT false,
  whatsapp_phone_number text,
  whatsapp_verify_token text,
  whatsapp_phone_id text,
  whatsapp_access_token text,
  whatsapp_bot_type text DEFAULT 'baileys'::text,
  CONSTRAINT bots_pkey PRIMARY KEY (id),
  CONSTRAINT bots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  bot_id uuid,
  chat_id text NOT NULL,
  platform text DEFAULT 'telegram'::text,
  status text DEFAULT 'active'::text,
  customer_name text,
  last_message text,
  last_message_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  name text,
  username text,
  history jsonb DEFAULT '[]'::jsonb,
  handoff_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb,
  stage text NOT NULL DEFAULT 'new'::text CHECK (stage = ANY (ARRAY['new'::text, 'interested'::text, 'negotiating'::text, 'won'::text, 'lost'::text])),
  stage_updated_at timestamp with time zone DEFAULT now(),
  stage_updated_by text CHECK (stage_updated_by = ANY (ARRAY['ai'::text, 'manual'::text])),
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.bots(id)
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  conversation_id uuid,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.knowledge_sources (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  bot_id uuid,
  type text NOT NULL,
  name text NOT NULL,
  content text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT knowledge_sources_pkey PRIMARY KEY (id),
  CONSTRAINT knowledge_sources_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.bots(id)
);
CREATE TABLE public.event_logs (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  bot_id uuid,
  conversation_id uuid,
  channel text NOT NULL,
  event_type text NOT NULL,
  latency_main_ms integer,
  latency_handoff_ms integer,
  prompt_tokens integer,
  completion_tokens integer,
  handoff_result boolean,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT event_logs_pkey PRIMARY KEY (id),
  CONSTRAINT event_logs_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.bots(id),
  CONSTRAINT event_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  role text NOT NULL DEFAULT 'owner'::text CHECK (role = ANY (ARRAY['admin'::text, 'owner'::text, 'agent'::text])),
  full_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);