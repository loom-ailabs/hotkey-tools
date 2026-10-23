import "server-only";
import { SessionCrypto, type SessionCryptoConfig, type SessionData } from "./session-crypto";

export type { SessionData } from "./session-crypto";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const FLOW_TTL_MS = 10 * 60 * 1000;
export const SESSION_LEASE_MS = 30_000;
export type SessionPurpose = "auth" | "flow";

export type SessionSnapshot = {
  hash: string;
  data: SessionData;
  createdAt: number;
  expiresAt: number;
  version: number;
  refreshedAt: number | null;
  purpose: SessionPurpose;
};

type SessionRow = {
  id_hash: string;
  data: string;
  created_at: number;
  expires_at: number;
  version: number;
  refreshed_at: number | null;
  purpose: SessionPurpose;
};

function randomId(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function hashId(id: string): Promise<string | null> {
  // 32 bytes encode to 43 base64url characters; the final two padding bits are zero.
  if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(id)) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Atomic D1 authority. Refresh calls must finish within the fixed 30-second lease. */
export class SessionRepository {
  private readonly db: Pick<D1Database, "prepare" | "batch">;
  private readonly cipher: SessionCrypto;
  private readonly now: () => number;

  constructor(db: D1Database, config: SessionCryptoConfig & { now?: () => number }) {
    this.db = typeof db.withSession === "function" ? db.withSession("first-primary") : db;
    this.cipher = new SessionCrypto(config);
    this.now = config.now ?? Date.now;
  }

  async create(
    data: SessionData,
    purpose: SessionPurpose = "auth",
  ): Promise<{ id: string; expiresAt: number }> {
    const id = randomId();
    const hash = (await hashId(id))!;
    const createdAt = this.now();
    const expiresAt = createdAt + (purpose === "flow" ? FLOW_TTL_MS : SESSION_TTL_MS);
    const encrypted = await this.cipher.encrypt(hash, data);
    await this.db
      .prepare(`INSERT INTO auth_sessions
      (id_hash, data, created_at, expires_at, purpose, version) VALUES (?, ?, ?, ?, ?, 0)`)
      .bind(hash, encrypted, createdAt, expiresAt, purpose)
      .run();
    return { id, expiresAt };
  }

  /** Expired sessions are tombstoned; an abandoned refresh is never taken over. */
  async expireAbandonedLock(snapshot: Pick<SessionSnapshot, "hash">): Promise<boolean> {
    const now = this.now();
    const result = await this.db
      .prepare(`UPDATE auth_sessions SET
      revoked_at = ?, data = NULL, version = version + 1, lock_token = NULL, lock_until = NULL
      WHERE id_hash = ? AND revoked_at IS NULL
      AND (expires_at <= ? OR (lock_until IS NOT NULL AND lock_until <= ?))`)
      .bind(now, snapshot.hash, now, now)
      .run();
    return result.meta.changes === 1;
  }

  async read(id: string): Promise<SessionSnapshot | null> {
    const hash = await hashId(id);
    if (!hash) return null;
    await this.expireAbandonedLock({ hash });
    const row = await this.db
      .prepare(`SELECT id_hash, data, created_at, expires_at,
      version, refreshed_at, purpose FROM auth_sessions
      WHERE id_hash = ? AND revoked_at IS NULL AND expires_at > ?`)
      .bind(hash, this.now())
      .first<SessionRow>();
    if (!row) return null;
    const data = await this.cipher.decrypt(hash, row.data);
    if (!data) {
      await this.revoke(id);
      return null;
    }
    return {
      hash,
      data,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      version: row.version,
      refreshedAt: row.refreshed_at,
      purpose: row.purpose,
    };
  }

  async tryLock(snapshot: SessionSnapshot): Promise<string | null> {
    await this.expireAbandonedLock(snapshot);
    const token = randomId();
    const now = this.now();
    const result = await this.db
      .prepare(`UPDATE auth_sessions SET lock_token = ?, lock_until = ?
      WHERE id_hash = ? AND version = ? AND revoked_at IS NULL AND expires_at > ?
      AND lock_token IS NULL AND lock_until IS NULL`)
      .bind(token, now + SESSION_LEASE_MS, snapshot.hash, snapshot.version, now)
      .run();
    return result.meta.changes === 1 ? token : null;
  }

  async commit(snapshot: SessionSnapshot, lease: string, data: SessionData): Promise<boolean> {
    const encrypted = await this.cipher.encrypt(snapshot.hash, data);
    const now = this.now();
    const result = await this.db
      .prepare(`UPDATE auth_sessions SET data = ?, version = version + 1,
      refreshed_at = ?, lock_token = NULL, lock_until = NULL
      WHERE id_hash = ? AND version = ? AND revoked_at IS NULL AND expires_at > ?
      AND lock_token = ? AND lock_until > ?`)
      .bind(encrypted, now, snapshot.hash, snapshot.version, now, lease, now)
      .run();
    return result.meta.changes === 1;
  }

  async release(snapshot: SessionSnapshot, lease: string): Promise<void> {
    await this.expireAbandonedLock(snapshot);
    await this.db
      .prepare(`UPDATE auth_sessions SET lock_token = NULL, lock_until = NULL
      WHERE id_hash = ? AND version = ? AND revoked_at IS NULL AND lock_token = ?
      AND lock_until > ?`)
      .bind(snapshot.hash, snapshot.version, lease, this.now())
      .run();
  }

  /** A callback consumes its flow and creates a fresh, independently identified auth session. */
  async promote(
    flow: SessionSnapshot,
    lease: string,
    data: SessionData,
  ): Promise<{ id: string; expiresAt: number } | null> {
    if (flow.purpose !== "flow") return null;
    await this.expireAbandonedLock(flow);
    const id = randomId();
    const hash = (await hashId(id))!;
    const encrypted = await this.cipher.encrypt(hash, data);
    const now = this.now();
    const expiresAt = now + SESSION_TTL_MS;
    const condition = `id_hash = ? AND purpose = 'flow' AND version = ? AND revoked_at IS NULL
      AND expires_at > ? AND lock_token = ? AND lock_until > ?`;
    const result = await this.db.batch([
      this.db
        .prepare(`INSERT INTO auth_sessions
        (id_hash, data, created_at, expires_at, purpose, version)
        SELECT ?, ?, ?, ?, 'auth', 0 WHERE EXISTS (SELECT 1 FROM auth_sessions WHERE ${condition})`)
        .bind(hash, encrypted, now, expiresAt, flow.hash, flow.version, now, lease, now),
      this.db
        .prepare(`UPDATE auth_sessions SET revoked_at = ?, data = NULL, version = version + 1,
        lock_token = NULL, lock_until = NULL, promoted_hash = ? WHERE ${condition}`)
        .bind(now, hash, flow.hash, flow.version, now, lease, now),
    ]);
    return result[0]!.meta.changes === 1 ? { id, expiresAt } : null;
  }

  async revoke(id: string): Promise<void> {
    const hash = await hashId(id);
    if (!hash) return;
    // A logout holding the old flow cookie also invalidates an auth session that
    // the callback already created, even if its Set-Cookie response arrives late.
    await this.db
      .prepare(`UPDATE auth_sessions SET revoked_at = ?, data = NULL,
      version = version + 1, lock_token = NULL, lock_until = NULL
      WHERE (id_hash = ? OR id_hash = (SELECT promoted_hash FROM auth_sessions WHERE id_hash = ?))
      AND revoked_at IS NULL`)
      .bind(this.now(), hash, hash)
      .run();
  }
}
