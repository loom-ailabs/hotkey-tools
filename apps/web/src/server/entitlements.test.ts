import { expect, it, vi } from "vitest";
const { getDatabase, hasPremiumInDatabase } = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  hasPremiumInDatabase: vi.fn(),
}));
vi.mock("./db", () => ({ getDatabase }));
vi.mock("@hotkey-tools/identity-core/entitlements", () => ({ hasPremiumInDatabase }));
import { hasPremium } from "./entitlements";
it("passes the current request D1 binding and verified identity to the shared query", async () => {
  const binding = { prepare: vi.fn() };
  getDatabase.mockResolvedValue(binding);
  hasPremiumInDatabase.mockResolvedValue(true);
  expect(await hasPremium("subject")).toBe(true);
  expect(hasPremiumInDatabase).toHaveBeenCalledWith(binding, "subject");
});
