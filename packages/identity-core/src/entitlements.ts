import "server-only";
export const PRODUCT_KEY = "hotkey-tools";
export const FEATURE_KEY = "premium-demo";
export async function hasPremiumInDatabase(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT order_id FROM entitlements
 WHERE user_id = ? AND product_key = ? AND feature_key = ? AND revoked_at IS NULL LIMIT 1`)
    .bind(userId, PRODUCT_KEY, FEATURE_KEY)
    .first<{ order_id: string }>();
  return row !== null;
}
