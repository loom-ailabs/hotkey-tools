CREATE TABLE IF NOT EXISTS hotkeys (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  combination TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hotkeys_name ON hotkeys(name);
