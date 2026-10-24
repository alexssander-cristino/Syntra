-- Syntra contextual memory.
-- Execute once against the PostgreSQL database used by the backend.
CREATE TABLE IF NOT EXISTS public.user_memories (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content VARCHAR(500) NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(trim(content)) >= 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memories_user_content
  ON public.user_memories (user_id, lower(content));

CREATE INDEX IF NOT EXISTS idx_user_memories_user_updated
  ON public.user_memories (user_id, updated_at DESC);
