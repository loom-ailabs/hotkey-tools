-- Only a hash of the random browser identifier is stored. SDK tokens remain encrypted.
-- Absolute lifetime does not move on refresh. Abandoned refresh leases fail closed.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id_hash TEXT PRIMARY KEY,
  data TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  purpose TEXT NOT NULL CHECK (purpose IN ('auth', 'flow')),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  refreshed_at INTEGER,
  revoked_at INTEGER,
  lock_token TEXT,
  lock_until INTEGER,
  promoted_hash TEXT,
  CHECK ((lock_token IS NULL) = (lock_until IS NULL)),
  CHECK (revoked_at IS NULL OR data IS NULL)
);
CREATE INDEX IF NOT EXISTS auth_sessions_expires ON auth_sessions(expires_at);
