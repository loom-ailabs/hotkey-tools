import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { hasPremiumInDatabase } from "./entitlements";
import type { StripeMode } from "./billing-types";

const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

function migrate(db: DatabaseSync, file: string) {
  db.exec(
    readFileSync(new URL(`../../../apps/identity/migrations/${file}`, import.meta.url), "utf8"),
  );
}

function database(withMode = true) {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  migrate(db, "0001_identity.sql");
  if (withMode) {
    migrate(db, "0003_stripe_mode.sql");
    migrate(db, "0004_checkout_payload_version.sql");
  }
  db.exec(`INSERT INTO users (id, issuer, subject, created_at) VALUES
    ('alice', 'fixture', 'alice', 1), ('bob', 'fixture', 'bob', 1)`);
  const binding = {
    prepare(sql: string) {
      return {
        bind(...values: SQLInputValue[]) {
          return {
            async first() {
              return db.prepare(sql).get(...values) ?? null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, binding };
}

function grant(
  db: DatabaseSync,
  id: string,
  {
    owner = "alice",
    product = "hotkey-tools",
    feature = "premium-demo",
    status = "paid",
    mode,
    payloadVersion,
    revokedAt = null,
  }: {
    owner?: string;
    product?: string;
    feature?: string;
    status?: "pending" | "paid" | "refunded" | "expired";
    mode?: StripeMode;
    payloadVersion?: 1 | 2;
    revokedAt?: number | null;
  } = {},
) {
  db.prepare(`INSERT INTO orders
    (id, user_id, request_id, product_key, feature_key, stripe_price_id, amount, currency,
     status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'price_fixture', 100, 'usd', ?, 1, 1)`).run(
    id,
    owner,
    id,
    product,
    feature,
    status,
  );
  if (mode !== undefined)
    db.prepare("UPDATE orders SET stripe_mode = ?, checkout_payload_version = ? WHERE id = ?").run(
      mode,
      payloadVersion ?? (mode === "live" ? 2 : 1),
      id,
    );
  db.prepare(`INSERT INTO entitlements
    (order_id, user_id, product_key, feature_key, granted_at, revoked_at) VALUES (?, ?, ?, ?, 1, ?)`).run(
    id,
    owner,
    product,
    feature,
    revokedAt,
  );
}

describe("authoritative product grants", () => {
  it("isolates owners, products, features and revocations using actual SQL", async () => {
    const { db, binding } = database();
    grant(db, "other-owner", { owner: "bob" });
    grant(db, "other-product", { product: "other" });
    grant(db, "other-feature", { feature: "other" });
    grant(db, "revoked", { revokedAt: 1 });
    expect(await hasPremiumInDatabase(binding, "alice")).toBe(false);
    expect(await hasPremiumInDatabase(binding, "bob")).toBe(true);
    expect(await hasPremiumInDatabase(binding, "unknown")).toBe(false);
  });

  it("never uses a test purchase to authorize live access or the reverse", async () => {
    const { db, binding } = database();
    grant(db, "sandbox", { mode: "test" });
    grant(db, "production", { owner: "bob", mode: "live" });
    expect(await hasPremiumInDatabase(binding, "alice")).toBe(true);
    expect(await hasPremiumInDatabase(binding, "alice", "test")).toBe(true);
    expect(await hasPremiumInDatabase(binding, "alice", "live")).toBe(false);
    expect(await hasPremiumInDatabase(binding, "bob", "live")).toBe(true);
    expect(await hasPremiumInDatabase(binding, "bob", "test")).toBe(false);
  });

  it.each([
    ["test", 1, true],
    ["test", 2, true],
    ["live", 1, false],
    ["live", 2, true],
  ] as const)(
    "checks paid grant eligibility for %s payload version %i: %s",
    async (mode, payloadVersion, allowed) => {
      const { db, binding } = database();
      grant(db, "versioned", { mode, payloadVersion });
      expect(await hasPremiumInDatabase(binding, "alice", mode)).toBe(allowed);
    },
  );

  it.each(["pending", "refunded", "expired"] as const)(
    "rejects an unrevoked grant whose source order is %s",
    async (status) => {
      const { db, binding } = database();
      grant(db, "unpaid", { status, mode: "live" });
      expect(await hasPremiumInDatabase(binding, "alice", "live")).toBe(false);
      db.exec("UPDATE orders SET status='paid' WHERE id='unpaid'");
      expect(await hasPremiumInDatabase(binding, "alice", "live")).toBe(true);
    },
  );

  it.each(["user_id='bob'", "product_key='other'", "feature_key='other'"])(
    "rejects a grant inconsistent with its source order: %s",
    async (change) => {
      const { db, binding } = database();
      grant(db, "inconsistent", { mode: "live" });
      db.exec(`UPDATE orders SET ${change} WHERE id='inconsistent'`);
      expect(await hasPremiumInDatabase(binding, "alice", "live")).toBe(false);
    },
  );

  it("revokes only the refunded source while preserving another paid order in the same mode", async () => {
    const { db, binding } = database();
    grant(db, "live-a", { mode: "live" });
    grant(db, "live-b", { mode: "live" });
    grant(db, "sandbox", { mode: "test" });
    expect(await hasPremiumInDatabase(binding, "alice", "live")).toBe(true);
    db.exec(`BEGIN;
      UPDATE orders SET status='refunded' WHERE id='live-a';
      UPDATE entitlements SET revoked_at=2 WHERE order_id='live-a';
      COMMIT;`);
    expect(await hasPremiumInDatabase(binding, "alice", "live")).toBe(true);
    db.exec(`BEGIN;
      UPDATE orders SET status='refunded' WHERE id='live-b';
      UPDATE entitlements SET revoked_at=3 WHERE order_id='live-b';
      COMMIT;`);
    expect(await hasPremiumInDatabase(binding, "alice", "live")).toBe(false);
    expect(await hasPremiumInDatabase(binding, "alice", "test")).toBe(true);
  });

  it("propagates storage failures instead of treating them as valid access", async () => {
    const { db, binding } = database();
    db.exec("DROP TABLE entitlements");
    await expect(hasPremiumInDatabase(binding, "alice")).rejects.toThrow();
  });
});

describe("Stripe mode migration", () => {
  it("backfills existing payments and events as test without carrying their grants into live", async () => {
    const { db, binding } = database(false);
    grant(db, "historic");
    db.exec(`INSERT INTO stripe_events (id, type, order_id, received_at, processed_at)
      VALUES ('historic-event', 'checkout.session.completed', 'historic', 1, 2)`);
    migrate(db, "0003_stripe_mode.sql");
    migrate(db, "0004_checkout_payload_version.sql");
    expect(
      db.prepare("SELECT stripe_mode, amount, status FROM orders WHERE id='historic'").get(),
    ).toMatchObject({ stripe_mode: "test", amount: 100, status: "paid" });
    expect(
      db
        .prepare("SELECT stripe_mode, processed_at FROM stripe_events WHERE id='historic-event'")
        .get(),
    ).toMatchObject({ stripe_mode: "test", processed_at: 2 });
    expect(await hasPremiumInDatabase(binding, "alice")).toBe(true);
    expect(await hasPremiumInDatabase(binding, "alice", "live")).toBe(false);
  });

  it("defaults omitted modes to test and constrains both persisted modes", () => {
    const { db } = database();
    grant(db, "default-mode");
    db.exec(`INSERT INTO stripe_events (id, type, order_id, received_at)
      VALUES ('event', 'checkout.session.completed', 'default-mode', 1)`);
    for (const table of ["orders", "stripe_events"]) {
      expect(db.prepare(`SELECT stripe_mode FROM ${table}`).get()).toMatchObject({
        stripe_mode: "test",
      });
      expect(() => db.exec(`UPDATE ${table} SET stripe_mode='production'`)).toThrow(/CHECK/);
      expect(() => db.exec(`UPDATE ${table} SET stripe_mode=NULL`)).toThrow(/NOT NULL/);
      db.exec(`UPDATE ${table} SET stripe_mode='live'`);
      expect(db.prepare(`SELECT stripe_mode FROM ${table}`).get()).toMatchObject({
        stripe_mode: "live",
      });
    }
  });
});
