-- Persist simple user feedback on assistant messages.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS rating SMALLINT
  CHECK (rating IN (-1, 1));

CREATE INDEX IF NOT EXISTS idx_messages_conversation_rating
  ON public.messages (conversation_id, rating)
  WHERE rating IS NOT NULL;
