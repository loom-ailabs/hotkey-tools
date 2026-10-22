import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { hasPremiumInDatabase } from "./entitlements";

const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

function database() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(`CREATE TABLE entitlements (
    order_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, product_key TEXT NOT NULL,
    feature_key TEXT NOT NULL, revoked_at INTEGER
  )`);
  const binding = {
    prepare(sql: string) {
      return {
        bind(...values: string[]) {
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

describe("authoritative product grants", () => {
  it("isolates owners, products, features and revocations using actual SQL", async () => {
    const { db, binding } = database();
    db.exec(`INSERT INTO entitlements VALUES
      ('other-owner','bob','hotkey-tools','premium-demo',NULL),
      ('other-product','alice','other','premium-demo',NULL),
      ('other-feature','alice','hotkey-tools','other',NULL),
      ('revoked','alice','hotkey-tools','premium-demo',1)`);
    expect(await hasPremiumInDatabase(binding, "alice")).toBe(false);
    expect(await hasPremiumInDatabase(binding, "bob")).toBe(true);
    expect(await hasPremiumInDatabase(binding, "unknown")).toBe(false);
  });

  it("observes revocation on the next call and keeps another paid order effective", async () => {
    const { db, binding } = database();
    db.exec(`INSERT INTO entitlements VALUES
      ('order-a','alice','hotkey-tools','premium-demo',NULL),
      ('order-b','alice','hotkey-tools','premium-demo',NULL)`);
    expect(await hasPremiumInDatabase(binding, "alice")).toBe(true);
    db.exec("UPDATE entitlements SET revoked_at=1 WHERE order_id='order-a'");
    expect(await hasPremiumInDatabase(binding, "alice")).toBe(true);
    db.exec("UPDATE entitlements SET revoked_at=2 WHERE order_id='order-b'");
    expect(await hasPremiumInDatabase(binding, "alice")).toBe(false);
  });

  it("propagates storage failures instead of treating them as valid access", async () => {
    const { db, binding } = database();
    db.exec("DROP TABLE entitlements");
    await expect(hasPremiumInDatabase(binding, "alice")).rejects.toThrow();
  });
});
