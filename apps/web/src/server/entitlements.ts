import "server-only";
import { hasPremiumInDatabase } from "@hotkey-tools/identity-core/entitlements";
import { parseStripeMode } from "@hotkey-tools/identity-core/billing-mode";
import { getDatabase } from "./db";
import { getEnv } from "./env";
export async function hasPremium(userId: string): Promise<boolean> {
  const mode = parseStripeMode((await getEnv()).STRIPE_MODE);
  return hasPremiumInDatabase(await getDatabase(), userId, mode);
}
