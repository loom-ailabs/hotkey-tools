// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchProfile: vi.fn(),
  fetchOrder: vi.fn(),
  createCheckout: vi.fn(),
  fetchPremium: vi.fn(),
}));
vi.mock("../api/access-api", () => api);

import { useManageAccess } from "./use-manage-access";

const profile = { user: { id: "user-1", name: "测试用户" }, entitlements: { premium: false } };

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, "", "/");
  api.fetchProfile.mockResolvedValue(profile);
});

afterEach(() => cleanup());

describe("manage account access", () => {
  it("retries a failed payment confirmation when the user refreshes status", async () => {
    window.history.replaceState({}, "", "/?checkout=success&order_id=order-1");
    api.fetchOrder.mockRejectedValueOnce(new Error("订单查询暂时失败。"));
    api.fetchOrder.mockResolvedValue({ status: "paid" });
    const { result } = renderHook(() => useManageAccess());

    await waitFor(() => expect(result.current.failure?.message).toBe("订单查询暂时失败。"));
    expect(api.fetchOrder).toHaveBeenCalledOnce();
    api.fetchProfile.mockResolvedValue({ ...profile, entitlements: { premium: true } });

    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => expect(result.current.notice).toBe("付款已确认，功能已解锁。"));
    expect(api.fetchOrder).toHaveBeenCalledTimes(2);
    expect(result.current.premium).toBe(true);
    expect(result.current.failure).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("keeps the same purchase request ID across failed checkout retries", async () => {
    api.createCheckout.mockRejectedValue(new Error("暂时无法打开收银台。"));
    const { result } = renderHook(() => useManageAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.purchase();
    });
    await act(async () => {
      await result.current.purchase();
    });

    expect(api.createCheckout).toHaveBeenCalledTimes(2);
    expect(api.createCheckout.mock.calls[0]?.[0]).toBeTruthy();
    expect(api.createCheckout.mock.calls[1]?.[0]).toBe(api.createCheckout.mock.calls[0]?.[0]);
    expect(result.current.failure?.message).toBe("暂时无法打开收银台。");
    expect(result.current.action).toBeNull();
  });
});
