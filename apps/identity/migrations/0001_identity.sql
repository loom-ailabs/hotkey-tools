PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  name TEXT,
  email TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (issuer, subject)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'refunded', 'expired')),
  checkout_session_id TEXT UNIQUE,
  checkout_url TEXT,
  payment_intent_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER,
  refunded_at INTEGER,
  UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS orders_user_created ON orders(user_id, created_at DESC);

-- An entitlement belongs to one payment. Refunding it never revokes another purchase.
CREATE TABLE IF NOT EXISTS entitlements (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  product_key TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS entitlements_user_feature
  ON entitlements(user_id, product_key, feature_key, revoked_at);

-- Event insertion, state change, grant/revoke and processed_at commit in one D1 batch.
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  received_at INTEGER NOT NULL,
  processed_at INTEGER
);
