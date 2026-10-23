import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FLOW_TTL_MS,
  SESSION_LEASE_MS,
  SESSION_TTL_MS,
  SessionRepository,
} from "./session-repository";

const config = {
  appId: "test-app",
  endpoint: "https://auth.example.test",
  cookieSecret: "fixture-key-with-at-least-thirty-two-characters",
};
const data = { idToken: "fixture-id-token", refreshToken: "old-refresh-token" };
const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

function setup(sessionApi = true) {
  const raw = new DatabaseSync(":memory:");
  databases.push(raw);
  raw.exec(
    readFileSync(
      new URL("../../../apps/identity/migrations/0002_sessions.sql", import.meta.url),
      "utf8",
    ),
  );
  let now = 1_800_000_000_000;
  let failBatchAt = -1;
  const binding = {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      return {
        bind(...parameters: SQLInputValue[]) {
          values = parameters;
          return this;
        },
        async first() {
          return raw.prepare(sql).get(...values) ?? null;
        },
        async run() {
          return {
            success: true,
            meta: { changes: Number(raw.prepare(sql).run(...values).changes) },
          };
        },
      };
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      raw.exec("BEGIN");
      try {
        const results = [];
        for (const [index, statement] of statements.entries()) {
          if (failBatchAt === index) throw new Error("fixture transaction failure");
          results.push(await statement.run());
        }
        raw.exec("COMMIT");
        return results;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
    ...(sessionApi ? { withSession: vi.fn(() => binding) } : {}),
  };
  const db = binding as unknown as D1Database;
  const repository = new SessionRepository(db, { ...config, now: () => now });
  return {
    raw,
    binding,
    db,
    repository,
    advance: (ms: number) => {
      now += ms;
    },
    setFailure: (index: number) => {
      failBatchAt = index;
    },
    now: () => now,
  };
}

describe("D1 opaque session authority", () => {
  it("stores only a SHA-256 identifier and encrypted SDK data with an absolute 14-day limit", async () => {
    const { raw, repository, now, binding } = setup();
    const created = await repository.create(data);
    expect(Buffer.from(created.id, "base64url")).toHaveLength(32);
    expect(created.expiresAt).toBe(now() + SESSION_TTL_MS);
    const snapshot = await repository.read(created.id);
    expect(snapshot).toMatchObject({
      data,
      version: 0,
      purpose: "auth",
      createdAt: now(),
      refreshedAt: null,
    });
    expect(snapshot?.hash).toMatch(/^[a-f0-9]{64}$/);
    const persisted = JSON.stringify(raw.prepare("SELECT * FROM auth_sessions").get());
    expect(persisted).not.toContain(created.id);
    expect(persisted).not.toContain(data.refreshToken);
    expect(binding.withSession).toHaveBeenCalledWith("first-primary");
  });

  it("works without the optional D1 sessions API and rejects unknown or malformed identifiers", async () => {
    const { repository } = setup(false);
    const created = await repository.create(data);
    expect(await repository.read(created.id)).not.toBeNull();
    for (const invalid of ["", "not-a-session", "x".repeat(42), "!".repeat(43), "x".repeat(43)]) {
      expect(await repository.read(invalid)).toBeNull();
      await repository.revoke(invalid);
    }
  });

  it("does not query D1 for anonymous or non-canonical 256-bit identifiers", async () => {
    const { repository, binding } = setup();
    const prepare = vi.spyOn(binding, "prepare");
    for (const invalid of ["", "x".repeat(43), "A".repeat(42), "!".repeat(43), "A".repeat(44)]) {
      expect(await repository.read(invalid)).toBeNull();
      await repository.revoke(invalid);
    }
    expect(prepare).not.toHaveBeenCalled();
    expect(await repository.read("A".repeat(43))).toBeNull();
    expect(prepare).toHaveBeenCalled();
  });

  it("expires auth and flow sessions at their exact non-sliding deadlines", async () => {
    const { repository, advance } = setup();
    const auth = await repository.create(data);
    const flow = await repository.create(data, "flow");
    expect(flow.expiresAt).toBe(auth.expiresAt - SESSION_TTL_MS + FLOW_TTL_MS);
    advance(FLOW_TTL_MS);
    expect(await repository.read(flow.id)).toBeNull();
    expect(await repository.read(auth.id)).not.toBeNull();
    advance(SESSION_TTL_MS - FLOW_TTL_MS);
    expect(await repository.read(auth.id)).toBeNull();
  });

  it("allows only one concurrent refresh lease across independent repository instances", async () => {
    const { repository, db } = setup();
    const other = new SessionRepository(db, { ...config, now: () => 1_800_000_000_000 });
    const created = await repository.create(data);
    const snapshot = (await repository.read(created.id))!;
    const attempts = await Promise.all(
      Array.from({ length: 12 }, (_, i) => (i % 2 ? repository : other).tryLock(snapshot)),
    );
    expect(attempts.filter(Boolean)).toHaveLength(1);
    expect(await repository.read(created.id)).toMatchObject({ version: 0, data });
  });

  it("commits once, preserves the deadline and rejects stale versions or wrong lease tokens", async () => {
    const { repository, advance, now } = setup();
    const created = await repository.create(data);
    const snapshot = (await repository.read(created.id))!;
    const lease = (await repository.tryLock(snapshot))!;
    expect(await repository.commit(snapshot, "wrong", data)).toBe(false);
    advance(1_000);
    const refreshed = { ...data, refreshToken: "rotated-refresh-token" };
    expect(await repository.commit(snapshot, lease, refreshed)).toBe(true);
    expect(await repository.commit(snapshot, lease, data)).toBe(false);
    expect(await repository.tryLock(snapshot)).toBeNull();
    expect(await repository.read(created.id)).toMatchObject({
      data: refreshed,
      version: 1,
      refreshedAt: now(),
      expiresAt: created.expiresAt,
      createdAt: snapshot.createdAt,
    });
  });

  it("releases only the current owner's unexpired lease", async () => {
    const { repository } = setup();
    const created = await repository.create(data);
    const snapshot = (await repository.read(created.id))!;
    const lease = (await repository.tryLock(snapshot))!;
    await repository.release(snapshot, "wrong");
    expect(await repository.tryLock(snapshot)).toBeNull();
    await repository.release(snapshot, lease);
    const next = await repository.tryLock(snapshot);
    expect(next).toEqual(expect.any(String));
    expect(next).not.toBe(lease);
    await repository.release(snapshot, lease);
    expect(await repository.commit(snapshot, next!, data)).toBe(true);
  });

  it.each(["read", "tryLock", "release"])(
    "revokes an abandoned lease on %s instead of reusing its upstream refresh token",
    async (method) => {
      const { repository, raw, advance } = setup();
      const created = await repository.create(data);
      const snapshot = (await repository.read(created.id))!;
      const lease = (await repository.tryLock(snapshot))!;
      advance(SESSION_LEASE_MS);
      if (method === "read") expect(await repository.read(created.id)).toBeNull();
      else if (method === "tryLock") expect(await repository.tryLock(snapshot)).toBeNull();
      else await repository.release(snapshot, lease);
      expect(await repository.commit(snapshot, lease, data)).toBe(false);
      expect(await repository.read(created.id)).toBeNull();
      expect(
        raw.prepare("SELECT data,revoked_at,lock_token FROM auth_sessions").get(),
      ).toMatchObject({ data: null, revoked_at: expect.any(Number), lock_token: null });
    },
  );

  it("prevents logout and expiry racing with refresh from reviving a session", async () => {
    const { repository, raw, advance } = setup();
    const created = await repository.create(data);
    const snapshot = (await repository.read(created.id))!;
    const lease = (await repository.tryLock(snapshot))!;
    await repository.revoke(created.id);
    await repository.revoke(created.id);
    expect(await repository.commit(snapshot, lease, data)).toBe(false);
    expect(await repository.tryLock(snapshot)).toBeNull();
    expect(await repository.read(created.id)).toBeNull();
    expect(raw.prepare("SELECT version FROM auth_sessions").get()?.version).toBe(1);
    const expiring = await repository.create(data);
    const last = (await repository.read(expiring.id))!;
    advance(SESSION_TTL_MS - 1);
    const lastLease = (await repository.tryLock(last))!;
    advance(1);
    expect(await repository.commit(last, lastLease, data)).toBe(false);
  });

  it("rejects ciphertext replacement or a different application namespace and clears corrupted data", async () => {
    const { repository, raw, db } = setup();
    const first = await repository.create(data);
    const second = await repository.create(data);
    const rows = raw.prepare("SELECT id_hash,data FROM auth_sessions ORDER BY rowid").all();
    raw
      .prepare("UPDATE auth_sessions SET data=? WHERE id_hash=?")
      .run(rows[0]!.data!, rows[1]!.id_hash!);
    expect(await repository.read(second.id)).toBeNull();
    const other = new SessionRepository(db, { ...config, appId: "other-app" });
    expect(await other.read(first.id)).toBeNull();
    expect(
      raw.prepare("SELECT COUNT(*) AS count FROM auth_sessions WHERE data IS NULL").get()?.count,
    ).toBe(2);
  });

  it("atomically promotes a one-time flow to a new auth identifier with a fresh 14-day deadline", async () => {
    const { repository, advance, now } = setup();
    const flow = await repository.create({ signInSession: "fixture-state-pkce" }, "flow");
    const snapshot = (await repository.read(flow.id))!;
    const lease = (await repository.tryLock(snapshot))!;
    advance(1_000);
    const auth = await repository.promote(snapshot, lease, data);
    expect(auth?.id).not.toBe(flow.id);
    expect(auth?.expiresAt).toBe(now() + SESSION_TTL_MS);
    expect(await repository.read(flow.id)).toBeNull();
    expect(await repository.read(auth!.id)).toMatchObject({
      purpose: "auth",
      data,
      version: 0,
      createdAt: now(),
    });
    expect(await repository.promote(snapshot, lease, data)).toBeNull();
    const authenticated = (await repository.read(auth!.id))!;
    expect(await repository.promote(authenticated, "unused", data)).toBeNull();
  });

  it.each(["logout", "lease", "expiry", "wrong lease"])(
    "does not promote a flow after %s",
    async (reason) => {
      const { repository, advance, raw } = setup();
      const flow = await repository.create(data, "flow");
      const snapshot = (await repository.read(flow.id))!;
      const lease = (await repository.tryLock(snapshot))!;
      if (reason === "logout") await repository.revoke(flow.id);
      else if (reason === "lease") advance(SESSION_LEASE_MS);
      else if (reason === "expiry") advance(FLOW_TTL_MS);
      expect(
        await repository.promote(snapshot, reason === "wrong lease" ? "wrong" : lease, data),
      ).toBeNull();
      expect(
        raw.prepare("SELECT COUNT(*) AS count FROM auth_sessions WHERE purpose='auth'").get()
          ?.count,
      ).toBe(0);
    },
  );

  it("rolls back auth creation if flow consumption fails, allowing a safe retry", async () => {
    const { repository, raw, setFailure } = setup();
    const flow = await repository.create(data, "flow");
    const snapshot = (await repository.read(flow.id))!;
    const lease = (await repository.tryLock(snapshot))!;
    setFailure(1);
    await expect(repository.promote(snapshot, lease, data)).rejects.toThrow(
      "fixture transaction failure",
    );
    expect(raw.prepare("SELECT COUNT(*) AS count FROM auth_sessions").get()?.count).toBe(1);
    expect(await repository.read(flow.id)).not.toBeNull();
    setFailure(-1);
    expect(await repository.promote(snapshot, lease, data)).not.toBeNull();
  });

  it("revokes an already promoted auth session when logout precedes the callback response", async () => {
    const { repository, raw } = setup();
    const flow = await repository.create(data, "flow");
    const snapshot = (await repository.read(flow.id))!;
    const lease = (await repository.tryLock(snapshot))!;
    const auth = (await repository.promote(snapshot, lease, data))!;
    const authenticated = (await repository.read(auth.id))!;
    const refreshLease = (await repository.tryLock(authenticated))!;
    await repository.revoke(flow.id);
    expect(await repository.read(auth.id)).toBeNull();
    expect(await repository.commit(authenticated, refreshLease, data)).toBe(false);
    expect(
      raw.prepare("SELECT COUNT(*) AS count FROM auth_sessions WHERE revoked_at IS NULL").get()
        ?.count,
    ).toBe(0);
    expect(
      raw.prepare("SELECT COUNT(*) AS count FROM auth_sessions WHERE data IS NOT NULL").get()
        ?.count,
    ).toBe(0);
  });
});
