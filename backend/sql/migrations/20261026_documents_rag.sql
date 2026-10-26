-- User-owned text documents for private retrieval-augmented generation (RAG).
-- Apply to the same PostgreSQL database configured in DATABASE_URL.
CREATE TABLE IF NOT EXISTS public.documents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  filename VARCHAR(180) NOT NULL,
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_user_created
  ON public.documents (user_id, created_at DESC, id DESC);
