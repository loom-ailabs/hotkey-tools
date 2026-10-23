import { describe, expect, it, vi } from "vitest";
import { getBillingPresentationMode } from "./billing-presentation";
const runtime = vi.hoisted(() => ({ mode: undefined as string | undefined }));
vi.mock("./env", () => ({ getEnv: async () => ({ STRIPE_MODE: runtime.mode }) }));
describe("request-time billing presentation", () => {
  it("reads each runtime change and fails closed for an invalid mode", async () => {
    runtime.mode = undefined;
    expect(await getBillingPresentationMode()).toBe("test");
    runtime.mode = "live";
    expect(await getBillingPresentationMode()).toBe("live");
    runtime.mode = "invalid";
    await expect(getBillingPresentationMode()).rejects.toMatchObject({
      code: "invalid_billing_mode",
    });
    runtime.mode = "test";
    expect(await getBillingPresentationMode()).toBe("test");
  });
});
