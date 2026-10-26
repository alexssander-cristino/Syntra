-- Optional timing metadata for assistant generations.
-- Requires the baseline public.messages table to exist first.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS generation_ms INTEGER
  CHECK (generation_ms IS NULL OR generation_ms >= 0);
