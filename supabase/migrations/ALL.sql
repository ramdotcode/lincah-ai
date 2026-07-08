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
  ai_model text DEFAULT 'standard'::text,
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