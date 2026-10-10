CREATE TABLE IF NOT EXISTS financial_journal (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  action TEXT NOT NULL,
  record_id TEXT NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(18,0) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_financial_journal_user_recent ON financial_journal(user_id, id DESC);
