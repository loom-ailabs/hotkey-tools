import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deferred,
  idToken,
  protocolFixture,
  sdkData,
  sqliteSession,
} from "../test/session-fixtures";
import { SessionManager } from "./session-manager";
import { SESSION_LEASE_MS, SESSION_TTL_MS } from "./session-repository";

describe("authoritative automatic session renewal", () => {
  let database: ReturnType<typeof sqliteSession>;
  let protocol: Awaited<ReturnType<typeof protocolFixture>>;
  let manager: SessionManager;
  beforeEach(async () => {
    database = sqliteSession();
    protocol = await protocolFixture();
    vi.stubGlobal("fetch", protocol.fetcher);
    manager = new SessionManager(protocol.config, database.db, {
      now: () => Date.now(),
      pause: () => new Promise((resolve) => setTimeout(resolve, 1)),
    });
  });
  afterEach(async () => {
    database.raw.close();
    await protocol.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not refresh a fresh session and rejects anonymous, flow, missing or malformed identity data", async () => {
    const auth = await manager.repository.create(sdkData());
    expect(await manager.context(auth.id)).toMatchObject({
      isAuthenticated: true,
      claims: { sub: "fixture-subject" },
    });
    expect(protocol.grants).toHaveLength(0);
    expect(await manager.context("invalid")).toEqual({ isAuthenticated: false });
    const flow = await manager.repository.create(sdkData(), "flow");
    expect(await manager.context(flow.id)).toEqual({ isAuthenticated: false });
    for (const data of [
      {},
      { idToken: "not-a-token", refreshToken: "fixture" },
      { idToken: idToken() },
      sdkData({ sub: "" }),
      sdkData({ exp: "tomorrow" }),
    ]) {
      const invalid = await manager.repository.create(data as Record<string, string>);
      expect(await manager.context(invalid.id)).toEqual({ isAuthenticated: false });
      expect(await manager.repository.read(invalid.id)).toBeNull();
    }
  });

  it.each(["expired identity", "near-expiry identity", "expired access", "bad access cache"])(
    "refreshes %s through the real SDK and preserves its absolute deadline",
    async (reason) => {
      const data = sdkData(
        reason === "expired identity"
          ? { exp: Math.floor(Date.now() / 1000) - 3600 }
          : reason === "near-expiry identity"
            ? { exp: Math.floor(Date.now() / 1000) + 40 }
            : {},
      );
      if (reason === "expired access")
        data.accessToken = JSON.stringify({ "@": { token: "fixture", expiresAt: 1 } });
      if (reason === "bad access cache") data.accessToken = "invalid";
      const auth = await manager.repository.create(data);
      expect(await manager.context(auth.id)).toMatchObject({
        isAuthenticated: true,
        claims: { sub: "fixture-subject" },
      });
      expect(protocol.grants).toHaveLength(1);
      const snapshot = await manager.repository.read(auth.id);
      expect(snapshot).toMatchObject({
        version: 1,
        expiresAt: auth.expiresAt,
        data: { refreshToken: "fixture-refresh-new" },
      });
      expect(snapshot?.refreshedAt).toEqual(expect.any(Number));
      expect(await manager.context(auth.id)).toMatchObject({ isAuthenticated: true });
      expect(protocol.grants).toHaveLength(1);
    },
  );

  it("serializes refresh across independent app workers so twelve requests use one grant", async () => {
    const other = new SessionManager(protocol.config, database.db, {
      now: () => Date.now(),
      pause: () => new Promise((resolve) => setTimeout(resolve, 1)),
    });
    const auth = await manager.repository.create(sdkData({ exp: 1 }));
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) => (index % 2 ? manager : other).context(auth.id)),
    );
    expect(results.every((context) => context.isAuthenticated)).toBe(true);
    expect(protocol.grants).toHaveLength(1);
    expect(await manager.repository.read(auth.id)).toMatchObject({ version: 1 });
  });

  it.each([
    "changed subject",
    "missing subject",
    "near-expiry identity",
    "missing refresh token",
    "issuer",
    "audience",
    "signature",
  ])("revokes rather than retaining partial SDK writes after %s", async (reason) => {
    protocol.respond(async () =>
      Response.json({
        access_token: "fixture-access-new",
        refresh_token: reason === "missing refresh token" ? undefined : "fixture-refresh-new",
        id_token: idToken(
          reason === "changed subject"
            ? { sub: "attacker-subject" }
            : reason === "missing subject"
              ? { sub: "" }
              : reason === "near-expiry identity"
                ? { exp: Math.floor(Date.now() / 1000) + 40 }
                : reason === "issuer"
                  ? { iss: "https://other.example" }
                  : reason === "audience"
                    ? { aud: "other-app" }
                    : {},
          reason === "signature",
        ),
        expires_in: 3600,
      }),
    );
    const auth = await manager.repository.create(sdkData({ exp: 1 }));
    if (reason === "missing refresh token") {
      // OAuth refresh responses may omit RT; the SDK must preserve its current RT.
      expect(await manager.context(auth.id)).toMatchObject({ isAuthenticated: true });
      expect((await manager.repository.read(auth.id))?.data.refreshToken).toBe(
        "fixture-refresh-old",
      );
    } else {
      await expect(manager.context(auth.id)).rejects.toMatchObject({
        code: "session_renewal_failed",
        status: 503,
      });
      expect(await manager.context(auth.id)).toEqual({ isAuthenticated: false });
      expect(await manager.repository.read(auth.id)).toBeNull();
    }
    expect(protocol.grants).toHaveLength(1);
  });

  it.each(["network", "invalid_grant"])(
    "does not replay an old refresh token after %s failure",
    async (reason) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      protocol.respond(async () => {
        if (reason === "network") throw new TypeError("fixture network failure");
        return Response.json(
          { error: "invalid_grant", error_description: "fixture revoked" },
          { status: 400 },
        );
      });
      const auth = await manager.repository.create(sdkData({ exp: 1 }));
      await expect(manager.context(auth.id)).rejects.toMatchObject({
        code: "session_renewal_failed",
      });
      expect(await manager.context(auth.id)).toEqual({ isAuthenticated: false });
      expect(protocol.grants).toHaveLength(1);
      expect(await manager.repository.read(auth.id)).toBeNull();
    },
  );

  it("cannot commit a rotated token after a sibling app logs out during refresh", async () => {
    const started = deferred<void>();
    const reply = deferred<Response>();
    protocol.respond(async () => {
      started.resolve();
      return reply.promise;
    });
    const auth = await manager.repository.create(sdkData({ exp: 1 }));
    const refresh = manager.context(auth.id);
    await started.promise;
    const sibling = new SessionManager(protocol.config, database.db);
    expect(await sibling.signOut(auth.id, "", "https://www.loom-labs.ai/")).toContain(
      "/session/end",
    );
    reply.resolve(
      Response.json({
        access_token: "fixture-access-new",
        refresh_token: "fixture-refresh-new",
        id_token: idToken(),
        expires_in: 3600,
      }),
    );
    expect(await refresh).toEqual({ isAuthenticated: false });
    expect(await manager.repository.read(auth.id)).toBeNull();
    expect(protocol.revocations.map((body) => body.get("token"))).toContain("fixture-refresh-new");
  });

  it("revokes after D1 commit failure instead of resurrecting the old or rotated snapshot", async () => {
    const auth = await manager.repository.create(sdkData({ exp: 1 }));
    database.failCommit();
    await expect(manager.context(auth.id)).rejects.toMatchObject({
      code: "session_renewal_failed",
    });
    expect(await manager.repository.read(auth.id)).toBeNull();
    expect(await manager.context(auth.id)).toEqual({ isAuthenticated: false });
    expect(protocol.grants).toHaveLength(1);
  });

  it("does not slide the fourteen-day deadline after renewal and rejects the exact boundary", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const auth = await manager.repository.create(sdkData({ exp: 1 }));
    vi.setSystemTime(auth.expiresAt - 61_000);
    expect(await manager.context(auth.id)).toMatchObject({ isAuthenticated: true });
    expect((await manager.repository.read(auth.id))?.expiresAt).toBe(auth.expiresAt);
    expect(auth.expiresAt - (await manager.repository.read(auth.id))!.createdAt).toBe(
      SESSION_TTL_MS,
    );
    vi.setSystemTime(auth.expiresAt);
    expect(await manager.context(auth.id)).toEqual({ isAuthenticated: false });
    expect(protocol.grants).toHaveLength(1);
  });

  it("revokes an abandoned refresh without replaying its potentially consumed RT", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const auth = await manager.repository.create(sdkData({ exp: 1 }));
    const snapshot = (await manager.repository.read(auth.id))!;
    await manager.repository.tryLock(snapshot);
    vi.setSystemTime(Date.now() + SESSION_LEASE_MS);
    expect(await manager.context(auth.id)).toEqual({ isAuthenticated: false });
    expect(protocol.grants).toHaveLength(0);
  });

  it("bounds waiting on an active owner without attempting a second grant", async () => {
    const auth = await manager.repository.create(sdkData({ exp: 1 }));
    await manager.repository.tryLock((await manager.repository.read(auth.id))!);
    const waiter = new SessionManager(protocol.config, database.db, { pause: async () => {} });
    await expect(waiter.context(auth.id)).rejects.toMatchObject({ code: "session_busy" });
    expect(protocol.grants).toHaveLength(0);
  });

  it("waits using its default bounded pause and resumes after the previous owner releases", async () => {
    const auth = await manager.repository.create(sdkData({ exp: 1 }));
    const snapshot = (await manager.repository.read(auth.id))!;
    const lease = (await manager.repository.tryLock(snapshot))!;
    const waiter = new SessionManager(protocol.config, database.db);
    const waiting = waiter.context(auth.id);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await manager.repository.release(snapshot, lease);
    expect(await waiting).toMatchObject({ isAuthenticated: true });
    expect(protocol.grants).toHaveLength(1);
  });

  it("saves an independent short-lived PKCE flow and consumes it once on a validated callback", async () => {
    const started = await manager.start({
      redirectUri: "https://login.loom-labs.ai/api/auth/callback",
      postRedirectUri: "https://www.loom-labs.ai/workspace",
    });
    const authorization = new URL(started.url);
    expect(authorization.searchParams.get("scope")).toContain("offline_access");
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    const callback = `https://login.loom-labs.ai/api/auth/callback?code=fixture-code&state=${authorization.searchParams.get("state")}`;
    const complete = await manager.complete(started.flow.id, callback);
    expect(complete.returnedUrl).toBe("https://www.loom-labs.ai/workspace");
    expect(complete.session.id).not.toBe(started.flow.id);
    expect(await manager.repository.read(started.flow.id)).toBeNull();
    expect(await manager.context(complete.session.id)).toMatchObject({ isAuthenticated: true });
    await expect(manager.complete(started.flow.id, callback)).rejects.toMatchObject({
      code: "invalid_auth_callback",
    });
    expect(protocol.grants).toHaveLength(1);
    expect(protocol.grants[0]?.get("grant_type")).toBe("authorization_code");
  });

  it("rejects a forged callback before a token request and keeps local logout authoritative on remote failure", async () => {
    const started = await manager.start({
      redirectUri: "https://login.loom-labs.ai/api/auth/callback",
    });
    await expect(
      manager.complete(
        started.flow.id,
        "https://login.loom-labs.ai/api/auth/callback?code=fixture&state=forged",
      ),
    ).rejects.toThrow();
    expect(protocol.grants).toHaveLength(0);
    expect(await manager.repository.read(started.flow.id)).toBeNull();
    const auth = await manager.repository.create(sdkData());
    protocol.makeUnavailable();
    expect(await manager.signOut(auth.id, "", "https://www.loom-labs.ai/")).toContain(
      "/session/end",
    );
    expect(await manager.context(auth.id)).toEqual({ isAuthenticated: false });
    const cold = new SessionManager(
      { ...protocol.config, endpoint: `${protocol.config.endpoint}/cold` },
      database.db,
    );
    expect(await cold.signOut("", "", "https://www.loom-labs.ai/")).toBe(
      "https://www.loom-labs.ai/",
    );
  });

  it.each(["missing RT", "empty subject", "expired", "nonintegral expiry"])(
    "does not promote a callback with %s",
    async (invalid) => {
      protocol.respond(async () =>
        Response.json({
          access_token: "fixture-access",
          refresh_token: invalid === "missing RT" ? undefined : "fixture-refresh-new",
          id_token: idToken(
            invalid === "empty subject"
              ? { sub: "" }
              : invalid === "expired"
                ? { exp: 1 }
                : invalid === "nonintegral expiry"
                  ? { exp: Date.now() / 1000 + 3600.5 }
                  : {},
          ),
          expires_in: 3600,
        }),
      );
      const started = await manager.start({
        redirectUri: "https://login.loom-labs.ai/api/auth/callback",
      });
      const state = new URL(started.url).searchParams.get("state");
      await expect(
        manager.complete(
          started.flow.id,
          `https://login.loom-labs.ai/api/auth/callback?code=fixture&state=${state}`,
        ),
      ).rejects.toThrow();
      expect(await manager.repository.read(started.flow.id)).toBeNull();
      expect(
        database.raw
          .prepare("SELECT COUNT(*) AS count FROM auth_sessions WHERE purpose='auth'")
          .get()?.count,
      ).toBe(0);
    },
  );

  it("rejects concurrent callbacks and cannot promote a flow revoked during token exchange", async () => {
    const started = await manager.start({
      redirectUri: "https://login.loom-labs.ai/api/auth/callback",
    });
    const state = new URL(started.url).searchParams.get("state");
    const callback = `https://login.loom-labs.ai/api/auth/callback?code=fixture&state=${state}`;
    const entered = deferred<void>();
    const reply = deferred<Response>();
    protocol.respond(async () => {
      entered.resolve();
      return reply.promise;
    });
    const first = manager.complete(started.flow.id, callback);
    await entered.promise;
    await expect(manager.complete(started.flow.id, callback)).rejects.toMatchObject({
      code: "invalid_auth_callback",
    });
    await manager.repository.revoke(started.flow.id);
    reply.resolve(
      Response.json({
        access_token: "fixture-access",
        refresh_token: "fixture-refresh-new",
        id_token: idToken(),
        expires_in: 3600,
      }),
    );
    await expect(first).rejects.toMatchObject({ code: "invalid_auth_callback" });
    const auth = await manager.repository.create(sdkData());
    await expect(manager.complete(auth.id, callback)).rejects.toMatchObject({
      code: "invalid_auth_callback",
    });
    expect(protocol.grants).toHaveLength(1);
  });

  it("replaces the known flow before starting another login so its late callback cannot survive logout", async () => {
    const options = { redirectUri: "https://login.loom-labs.ai/api/auth/callback" };
    const original = await manager.start(options);
    const state = new URL(original.url).searchParams.get("state");
    const entered = deferred<void>();
    const reply = deferred<Response>();
    protocol.respond(async () => {
      entered.resolve();
      return reply.promise;
    });
    const callback = manager.complete(
      original.flow.id,
      `${options.redirectUri}?code=fixture&state=${state}`,
    );
    await entered.promise;
    const replacement = await manager.start(options, original.flow.id);
    expect(await manager.repository.read(original.flow.id)).toBeNull();
    await manager.signOut("", replacement.flow.id, "https://www.loom-labs.ai/");
    reply.resolve(
      Response.json({
        access_token: "fixture-access",
        refresh_token: "fixture-refresh-new",
        id_token: idToken(),
        expires_in: 3600,
      }),
    );
    await expect(callback).rejects.toMatchObject({ code: "invalid_auth_callback" });
    expect(await manager.repository.read(replacement.flow.id)).toBeNull();
    expect(
      database.raw
        .prepare(
          "SELECT COUNT(*) AS count FROM auth_sessions WHERE purpose='auth' AND revoked_at IS NULL",
        )
        .get()?.count,
    ).toBe(0);
    expect(protocol.grants).toHaveLength(1);
  });
});
