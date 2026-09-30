PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS game (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  title TEXT NOT NULL,
  birthday_at TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 172800,
  entry_question TEXT NOT NULL,
  entry_answer_hash TEXT NOT NULL,
  started_at TEXT,
  expires_at TEXT,
  completed_at TEXT,
  active_session_hash TEXT
);

CREATE TABLE IF NOT EXISTS steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position INTEGER NOT NULL UNIQUE,
  question TEXT NOT NULL,
  answer_hash TEXT NOT NULL,
  reward_title TEXT NOT NULL,
  reward_text TEXT,
  latitude REAL,
  longitude REAL,
  locker_code TEXT,
  locker_revealed_at TEXT,
  unlocked_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  step_id INTEGER,
  attempted_at TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(step_id) REFERENCES steps(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
