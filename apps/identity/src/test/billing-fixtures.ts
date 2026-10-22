import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import Stripe from "stripe";
import { vi } from "vitest";
import type { OrderRow } from "../server/billing";

export const databaseBinding = { value: undefined as D1Database | undefined };
export const environmentBinding = { value: {} as Record<string, string> };

// Execute the application's migration and batch SQL against SQLite, including rollback.
// This does not replace the documented integration check against a real D1 deployment.
export class SQLiteD1 {
  readonly raw = new DatabaseSync(":memory:");
  failNextGrant = false;

  constructor() {
    this.raw.exec(
      readFileSync(new URL("../../migrations/0001_identity.sql", import.meta.url), "utf8"),
    );
    this.raw.exec(
      "INSERT INTO users(id,issuer,subject,created_at) VALUES ('alice','https://id.example','alice',1),('bob','https://id.example','bob',1)",
    );
  }

  prepare(sql: string) {
    return new SQLiteStatement(this, sql);
  }

  async batch(statements: SQLiteStatement[]) {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(statement.execute());
      this.raw.exec("COMMIT");
      return results;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }

  binding() {
    return this as unknown as D1Database;
  }
}

class SQLiteStatement {
  private values: (string | number | null)[] = [];
  constructor(
    private readonly db: SQLiteD1,
    private readonly sql: string,
  ) {}
  bind(...values: (string | number | null)[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (this.db.raw.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }
  async run() {
    return this.execute();
  }
  execute() {
    if (this.db.failNextGrant && this.sql.startsWith("INSERT INTO entitlements")) {
      this.db.failNextGrant = false;
      throw new Error("Simulated grant write failure");
    }
    const result = this.db.raw.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

export const config = {
  appUrl: "https://app.example",
  secretKey: "sk_test_offline_fixture",
  webhookSecret: "whsec_offline_fixture",
  priceId: "price_premium",
};
export const requestId = "7a517e89-7ac5-43ad-8618-8a4bfbc53d52";
export const orderId = "e454113c-24b7-4269-ae96-65ee98625af3";

export function seedOrder(db: SQLiteD1, id = orderId, user = "alice"): OrderRow {
  db.raw
    .prepare(`INSERT INTO orders
    (id,user_id,request_id,product_key,feature_key,stripe_price_id,amount,currency,created_at,updated_at)
    VALUES (?, ?, ?, 'hotkey-tools','premium-demo','price_premium', 1200, 'usd', ?, ?)`)
    .run(id, user, id, Date.now(), Date.now());
  return db.raw.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow;
}

export function stripeFixture(order: OrderRow) {
  const metadata = {
    app_key: "hotkey-tools-identity",
    order_id: order.id,
    user_id: order.user_id,
    product_key: order.product_key,
    feature_key: order.feature_key,
  };
  const session = {
    id: "cs_test_payment",
    object: "checkout.session",
    livemode: false,
    mode: "payment",
    client_reference_id: order.id,
    metadata,
    amount_total: order.amount,
    currency: order.currency,
    payment_intent: "pi_test_payment" as string | { id: string } | null,
    payment_status: "paid",
    status: "complete",
    url: "https://checkout.stripe.com/c/pay/cs_test_payment",
  };
  const intent = {
    id: "pi_test_payment",
    livemode: false,
    metadata: { ...metadata },
    amount: order.amount,
    amount_received: order.amount,
    currency: order.currency,
    status: "succeeded",
  };
  const line = {
    quantity: 1,
    price: { id: order.stripe_price_id, unit_amount: order.amount, currency: order.currency },
    amount_total: order.amount,
  };
  const refunds: { status: string; currency: string; amount: number }[] = [];
  const api = {
    prices: {
      retrieve: vi.fn(async () => ({
        id: "price_premium",
        livemode: false,
        active: true,
        type: "one_time",
        billing_scheme: "per_unit",
        unit_amount: 1200,
        currency: "usd",
      })),
    },
    checkout: {
      sessions: {
        retrieve: vi.fn(async () => session),
        listLineItems: vi.fn(async () => ({ data: [line], has_more: false })),
        list: vi.fn(async () => ({ data: [session], has_more: false })),
        create: vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({
          ...session,
          status: "open",
          metadata: params.metadata,
          client_reference_id: params.client_reference_id,
        })),
      },
    },
    paymentIntents: { retrieve: vi.fn(async () => intent) },
    refunds: {
      list: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          yield* refunds;
        },
      })),
    },
  };
  return { stripe: api as unknown as Stripe, api, session, intent, line, refunds };
}

export function completedEvent(id = "evt_completed"): Stripe.Event {
  return {
    id,
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: "cs_test_payment",
        metadata: { app_key: "hotkey-tools-identity", order_id: orderId },
      },
    },
  } as unknown as Stripe.Event;
}

export function refundEvent(id = "evt_refunded"): Stripe.Event {
  return {
    id,
    type: "refund.updated",
    livemode: false,
    data: { object: { id: "re_test", payment_intent: "pi_test_payment" } },
  } as unknown as Stripe.Event;
}
