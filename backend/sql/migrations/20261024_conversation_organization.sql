-- Syntra: organização de conversas
-- Execute uma vez no PostgreSQL/Supabase existente.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_user_pinned_updated
  ON conversations (user_id, is_pinned DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_user_archived_updated
  ON conversations (user_id, archived_at, updated_at DESC);
