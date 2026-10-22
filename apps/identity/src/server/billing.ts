import "server-only";

import Stripe from "stripe";
import { getDatabase } from "./db";
import { getEnv } from "./env";
import { ApiError } from "./http";

import {
  PRODUCT_KEY,
  FEATURE_KEY,
  hasPremiumInDatabase,
} from "@hotkey-tools/identity-core/entitlements";
export { PRODUCT_KEY, FEATURE_KEY } from "@hotkey-tools/identity-core/entitlements";
const APPLICATION_KEY = "hotkey-tools-identity";
const MAX_WEBHOOK_BYTES = 1_048_576;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CheckoutUser = { id: string; email?: string; name?: string };
type OrderStatus = "pending" | "paid" | "refunded" | "expired";
export type OrderRow = {
  id: string;
  user_id: string;
  request_id: string;
  product_key: string;
  feature_key: string;
  stripe_price_id: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  checkout_session_id: string | null;
  checkout_url: string | null;
  payment_intent_id: string | null;
  created_at: number;
  updated_at: number;
  paid_at: number | null;
  refunded_at: number | null;
};

type BillingConfig = {
  appUrl: string;
  secretKey: string;
  webhookSecret: string;
  priceId: string;
};

export function getBillingConfig(env: Awaited<ReturnType<typeof getEnv>>): BillingConfig {
  const { APP_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID } = env;
  if (!APP_URL || !STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !STRIPE_PRICE_ID) {
    throw new ApiError(503, "billing_not_configured", "Stripe Sandbox 尚未配置完整。");
  }
  if (!STRIPE_SECRET_KEY.startsWith("sk_test_") || !STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) {
    throw new ApiError(503, "sandbox_required", "此示例只接受 Stripe Sandbox 密钥。");
  }
  if (!STRIPE_PRICE_ID.startsWith("price_")) {
    throw new ApiError(503, "invalid_price_configuration", "请配置 Sandbox 中的单次固定价格。");
  }
  return {
    appUrl: new URL(APP_URL).origin,
    secretKey: STRIPE_SECRET_KEY,
    webhookSecret: STRIPE_WEBHOOK_SECRET,
    priceId: STRIPE_PRICE_ID,
  };
}

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 15_000,
  });
}

function objectId(value: { id: string } | string | null): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function metadataFor(order: OrderRow): Record<string, string> {
  return {
    app_key: APPLICATION_KEY,
    order_id: order.id,
    user_id: order.user_id,
    product_key: order.product_key,
    feature_key: order.feature_key,
  };
}

function validMetadata(metadata: Stripe.Metadata | null, order: OrderRow): boolean {
  const expected = metadataFor(order);
  return Object.entries(expected).every(([key, value]) => metadata?.[key] === value);
}

function invalidPayment(message = "Stripe 支付信息与本地订单不一致。") {
  return new ApiError(400, "payment_mismatch", message);
}

export async function hasPremium(userId: string): Promise<boolean> {
  const db = await getDatabase();
  return hasPremiumInDatabase(db, userId);
}

export async function getOrderForUser(id: string, userId: string) {
  const db = await getDatabase();
  const order = await db
    .prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<OrderRow>();
  if (!order) throw new ApiError(404, "order_not_found", "未找到此订单。");
  return {
    id: order.id,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

/** The service accepts a Stripe client so storage and failure paths can be tested offline. */
export class BillingService {
  constructor(
    private readonly db: D1Database,
    private readonly stripe: Stripe,
    private readonly config: BillingConfig,
  ) {}

  private async getOrder(id: string): Promise<OrderRow> {
    const order = await this.db
      .prepare("SELECT * FROM orders WHERE id = ?")
      .bind(id)
      .first<OrderRow>();
    if (!order) throw new ApiError(503, "order_unavailable", "本地订单暂不可用，请稍后重试。");
    return order;
  }

  async createCheckout(user: CheckoutUser, requestId: string) {
    if (!REQUEST_ID_PATTERN.test(requestId)) {
      throw new ApiError(
        400,
        "invalid_request_id",
        "requestId 必须为 UUID，重试时应使用同一个值。",
      );
    }
    let order = await this.db
      .prepare("SELECT * FROM orders WHERE user_id = ? AND request_id = ?")
      .bind(user.id, requestId)
      .first<OrderRow>();

    if (!order) {
      if (await hasPremiumInDatabase(this.db, user.id)) {
        throw new ApiError(409, "already_unlocked", "此账号已经解锁示例高级功能。");
      }
      const price = await this.stripe.prices.retrieve(this.config.priceId);
      if (
        price.livemode ||
        !price.active ||
        price.type !== "one_time" ||
        price.billing_scheme !== "per_unit" ||
        !Number.isSafeInteger(price.unit_amount) ||
        !price.unit_amount ||
        price.unit_amount <= 0
      ) {
        throw new ApiError(503, "invalid_price_configuration", "需要启用的 Sandbox 单次固定价格。");
      }
      const now = Date.now();
      const orderId = crypto.randomUUID();
      // Persist intent before calling Stripe. A retry reuses the stored price and order id.
      await this.db
        .prepare(
          `INSERT INTO orders
           (id, user_id, request_id, product_key, feature_key, stripe_price_id, amount, currency, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, request_id) DO NOTHING`,
        )
        .bind(
          orderId,
          user.id,
          requestId,
          PRODUCT_KEY,
          FEATURE_KEY,
          price.id,
          price.unit_amount,
          price.currency,
          now,
          now,
        )
        .run();
      order = await this.db
        .prepare("SELECT * FROM orders WHERE user_id = ? AND request_id = ?")
        .bind(user.id, requestId)
        .first<OrderRow>();
      if (!order) throw new ApiError(503, "order_unavailable", "无法创建本地订单。");
    }

    if (order.status !== "pending") {
      throw new ApiError(409, "order_closed", "此支付尝试已结束，请刷新订单状态。");
    }
    if (order.checkout_session_id) {
      const session = await this.stripe.checkout.sessions.retrieve(order.checkout_session_id);
      if (session.status !== "open" || !session.url) {
        throw new ApiError(409, "checkout_closed", "Checkout 已结束，请查看订单状态后重新发起。");
      }
      return { orderId: order.id, checkoutUrl: session.url, status: order.status };
    }
    // Stripe only retains idempotency keys for a limited window. Never recreate an uncertain old attempt.
    if (Date.now() - order.created_at > 23 * 60 * 60 * 1000) {
      throw new ApiError(
        409,
        "checkout_attempt_expired",
        "此支付尝试已过期，请使用新的 requestId。",
      );
    }
    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.create(
        {
          mode: "payment",
          allowed_payment_method_types: ["card"],
          adaptive_pricing: { enabled: false },
          automatic_tax: { enabled: false },
          allow_promotion_codes: false,
          line_items: [{ price: order.stripe_price_id, quantity: 1 }],
          client_reference_id: order.id,
          metadata: metadataFor(order),
          payment_intent_data: { metadata: metadataFor(order) },
          success_url: `${this.config.appUrl}/?checkout=success&order_id=${order.id}`,
          cancel_url: `${this.config.appUrl}/?checkout=cancelled&order_id=${order.id}`,
        },
        { idempotencyKey: `identity-checkout:${order.id}` },
      );
    } catch (cause) {
      // Keep pending intent. The same request id can recover a lost Stripe response.
      throw new ApiError(
        502,
        "checkout_unavailable",
        "Checkout 暂不可用，请用相同 requestId 重试。",
        { cause },
      );
    }
    if (session.livemode || !session.url || !validMetadata(session.metadata, order)) {
      throw invalidPayment();
    }
    await this.db
      .prepare(
        `UPDATE orders SET checkout_session_id = ?, checkout_url = ?, updated_at = ?
         WHERE id = ? AND (checkout_session_id IS NULL OR checkout_session_id = ?)`,
      )
      .bind(session.id, session.url, Date.now(), order.id, session.id)
      .run();
    return { orderId: order.id, checkoutUrl: session.url, status: order.status };
  }

  private async loadPayment(sessionId: string, order: OrderRow) {
    const [session, lines] = await Promise.all([
      this.stripe.checkout.sessions.retrieve(sessionId),
      this.stripe.checkout.sessions.listLineItems(sessionId, { limit: 2 }),
    ]);
    const line = lines.data[0];
    if (
      session.livemode ||
      session.mode !== "payment" ||
      session.client_reference_id !== order.id ||
      !validMetadata(session.metadata, order) ||
      (order.checkout_session_id !== null && order.checkout_session_id !== session.id) ||
      session.amount_total !== order.amount ||
      session.currency !== order.currency ||
      lines.has_more ||
      lines.data.length !== 1 ||
      line?.quantity !== 1 ||
      line.price?.id !== order.stripe_price_id ||
      line.price?.unit_amount !== order.amount ||
      line.price?.currency !== order.currency ||
      line.amount_total !== order.amount
    ) {
      throw invalidPayment();
    }
    const paymentIntentId = objectId(session.payment_intent);
    if (
      !paymentIntentId ||
      (order.payment_intent_id !== null && order.payment_intent_id !== paymentIntentId)
    ) {
      throw invalidPayment();
    }
    const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    if (
      intent.livemode ||
      !validMetadata(intent.metadata, order) ||
      intent.currency !== order.currency ||
      intent.amount !== order.amount ||
      intent.amount_received !== order.amount ||
      intent.status !== "succeeded"
    ) {
      throw invalidPayment();
    }
    let refunded = 0;
    // Refunds can arrive before checkout.completed. Read current successful refunds rather than event order.
    for await (const refund of this.stripe.refunds.list({
      payment_intent: intent.id,
      limit: 100,
    })) {
      if (refund.status === "succeeded" && refund.currency === order.currency)
        refunded += refund.amount;
    }
    return { session, paymentIntentId, fullyRefunded: refunded >= order.amount };
  }

  private async applyEvent(
    event: Stripe.Event,
    order: OrderRow,
    status: "paid" | "refunded" | "expired",
    sessionId: string,
    paymentIntentId: string | null,
  ) {
    const now = Date.now();
    const eventIsNew = "EXISTS (SELECT 1 FROM stripe_events WHERE id = ? AND processed_at IS NULL)";
    const statements = [
      this.db
        .prepare(
          "INSERT OR IGNORE INTO stripe_events (id, type, order_id, received_at) VALUES (?, ?, ?, ?)",
        )
        .bind(event.id, event.type, order.id, now),
    ];
    if (status === "refunded") {
      statements.push(
        this.db
          .prepare(`UPDATE orders SET status = 'refunded', checkout_session_id = ?, payment_intent_id = ?,
          refunded_at = COALESCE(refunded_at, ?), updated_at = ? WHERE id = ? AND ${eventIsNew}`)
          .bind(sessionId, paymentIntentId, now, now, order.id, event.id),
        this.db
          .prepare(`UPDATE entitlements SET revoked_at = COALESCE(revoked_at, ?)
          WHERE order_id = ? AND ${eventIsNew}`)
          .bind(now, order.id, event.id),
      );
    } else if (status === "paid") {
      statements.push(
        this.db
          .prepare(`UPDATE orders SET status = 'paid', checkout_session_id = ?, payment_intent_id = ?,
          paid_at = COALESCE(paid_at, ?), updated_at = ? WHERE id = ? AND status != 'refunded' AND ${eventIsNew}`)
          .bind(sessionId, paymentIntentId, now, now, order.id, event.id),
        this.db
          .prepare(`INSERT INTO entitlements (order_id, user_id, product_key, feature_key, granted_at)
          SELECT id, user_id, product_key, feature_key, ? FROM orders
          WHERE id = ? AND status = 'paid' AND ${eventIsNew}
          ON CONFLICT(order_id) DO NOTHING`)
          .bind(now, order.id, event.id),
      );
    } else {
      statements.push(
        this.db
          .prepare(`UPDATE orders SET status = 'expired', updated_at = ?
          WHERE id = ? AND status = 'pending' AND ${eventIsNew}`)
          .bind(now, order.id, event.id),
      );
    }
    statements.push(
      this.db
        .prepare("UPDATE stripe_events SET processed_at = ? WHERE id = ? AND processed_at IS NULL")
        .bind(now, event.id),
    );
    // D1 batch is a transaction: a failed grant/revoke does not consume the event.
    await this.db.batch(statements);
  }

  async handleEvent(event: Stripe.Event): Promise<{ received: true; ignored?: true }> {
    if (event.livemode !== false)
      throw new ApiError(400, "sandbox_required", "不接受 Live 模式事件。");
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired") {
      const eventSession = event.data.object as Stripe.Checkout.Session;
      if (eventSession.metadata?.app_key !== APPLICATION_KEY)
        return { received: true, ignored: true };
      const order = await this.getOrder(eventSession.metadata.order_id ?? "");
      if (event.type === "checkout.session.expired") {
        const current = await this.stripe.checkout.sessions.retrieve(eventSession.id);
        if (
          !validMetadata(current.metadata, order) ||
          current.livemode ||
          current.client_reference_id !== order.id ||
          (order.checkout_session_id !== null && order.checkout_session_id !== current.id)
        )
          throw invalidPayment();
        if (current.status === "expired")
          await this.applyEvent(event, order, "expired", current.id, null);
      } else {
        const payment = await this.loadPayment(eventSession.id, order);
        if (payment.session.status !== "complete" || payment.session.payment_status !== "paid")
          throw invalidPayment();
        await this.applyEvent(
          event,
          order,
          payment.fullyRefunded ? "refunded" : "paid",
          payment.session.id,
          payment.paymentIntentId,
        );
      }
      return { received: true };
    }
    if (
      event.type === "charge.refunded" ||
      event.type === "refund.created" ||
      event.type === "refund.updated"
    ) {
      const object = event.data.object as Stripe.Charge | Stripe.Refund;
      const intentId = objectId(object.payment_intent);
      if (!intentId) return { received: true, ignored: true };
      const intent = await this.stripe.paymentIntents.retrieve(intentId);
      if (intent.livemode) throw invalidPayment();
      if (intent.metadata.app_key !== APPLICATION_KEY) return { received: true, ignored: true };
      const order = await this.getOrder(intent.metadata.order_id ?? "");
      let sessionId = order.checkout_session_id;
      if (!sessionId) {
        const sessions = await this.stripe.checkout.sessions.list({
          payment_intent: intentId,
          limit: 2,
        });
        if (sessions.has_more || sessions.data.length !== 1) throw invalidPayment();
        sessionId = sessions.data[0]!.id;
      }
      const payment = await this.loadPayment(sessionId, order);
      if (payment.paymentIntentId !== intentId) throw invalidPayment();
      // Partial/pending/failed refunds do not remove a fully paid entitlement.
      if (payment.fullyRefunded)
        await this.applyEvent(event, order, "refunded", sessionId, intentId);
      return { received: true };
    }
    return { received: true, ignored: true };
  }
}

export async function createCheckout(user: CheckoutUser, requestId: string) {
  const config = getBillingConfig(await getEnv());
  return new BillingService(
    await getDatabase(),
    createStripeClient(config.secretKey),
    config,
  ).createCheckout(user, requestId);
}

export async function verifyStripeEvent(
  rawBody: string,
  signature: string,
  stripe: Stripe,
  secret: string,
) {
  try {
    return await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    throw new ApiError(400, "invalid_webhook_signature", "Stripe webhook 签名无效。");
  }
}

export async function handleStripeWebhook(request: Request) {
  const config = getBillingConfig(await getEnv());
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    throw new ApiError(400, "missing_webhook_signature", "缺少 Stripe webhook 签名。");
  if (Number(request.headers.get("content-length")) > MAX_WEBHOOK_BYTES)
    throw new ApiError(413, "webhook_too_large", "Webhook 超过大小限制。");
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES)
    throw new ApiError(413, "webhook_too_large", "Webhook 超过大小限制。");
  const stripe = createStripeClient(config.secretKey);
  const event = await verifyStripeEvent(rawBody, signature, stripe, config.webhookSecret);
  return new BillingService(await getDatabase(), stripe, config).handleEvent(event);
}
