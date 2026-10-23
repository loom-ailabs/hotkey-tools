import "server-only";

import { ApiError } from "./http";
import type { StripeMode } from "./billing-types";

export type { StripeMode } from "./billing-types";

/** Existing deployments remain in test mode until live is explicitly configured. */
export function parseStripeMode(value?: string): StripeMode {
  if (value === undefined) return "test";
  if (value === "test" || value === "live") return value;
  throw new ApiError(503, "invalid_billing_mode", "支付模式必须明确配置为 test 或 live。");
}
