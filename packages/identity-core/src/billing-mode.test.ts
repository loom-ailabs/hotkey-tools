import { describe, expect, it } from "vitest";
import { parseStripeMode } from "./billing-mode";

describe("explicit Stripe mode", () => {
  it("keeps an unconfigured existing deployment in test mode", () => {
    expect(parseStripeMode()).toBe("test");
  });

  it.each(["test", "live"] as const)("accepts the exact %s mode", (mode) => {
    expect(parseStripeMode(mode)).toBe(mode);
  });

  it.each(["", " ", "\ttest", "test ", "TEST", "Live", "production", "sk_live_fixture"])(
    "rejects invalid configuration %j instead of inferring a payment environment",
    (value) => {
      expect(() => parseStripeMode(value)).toThrow(
        expect.objectContaining({ status: 503, code: "invalid_billing_mode" }),
      );
    },
  );
});
