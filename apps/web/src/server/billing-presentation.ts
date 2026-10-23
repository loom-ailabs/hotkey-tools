import "server-only";
import { parseStripeMode } from "@hotkey-tools/identity-core/billing-mode";
import { getEnv } from "./env";

export async function getBillingPresentationMode() {
  return parseStripeMode((await getEnv()).STRIPE_MODE);
}
