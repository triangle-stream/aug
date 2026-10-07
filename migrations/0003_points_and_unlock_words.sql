ALTER TABLE steps ADD COLUMN points INTEGER NOT NULL DEFAULT 10;
ALTER TABLE steps ADD COLUMN unlock_word_hash TEXT;
ALTER TABLE steps ADD COLUMN word_verified_at TEXT;

CREATE INDEX IF NOT EXISTS idx_steps_word_verified_at ON steps(word_verified_at);
