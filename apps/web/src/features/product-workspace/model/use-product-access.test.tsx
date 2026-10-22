import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProductAccess } from "./use-product-access";

const response = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const profile = (premium: boolean) =>
  response(200, {
    code: 0,
    data: {
      user: { id: "same-logto-user" },
      entitlements: { premium },
    },
  });
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("product entitlement lifecycle", () => {
  it("returns login to the current product path and query without a legacy hash", async () => {
    window.history.replaceState(null, "", "/pricing?source=product&plan=pro#legacy");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(profile(false)));
    const { result } = renderHook(() => useProductAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const login = new URL(result.current.loginUrl, window.location.origin);
    expect(login.pathname).toBe("/api/auth/login");
    const target = new URL(login.searchParams.get("returnTo")!);
    expect(target.origin).toBe(window.location.origin);
    expect(target.pathname).toBe("/pricing");
    expect(target.search).toBe("?source=product&plan=pro");
    expect(target.hash).toBe("");
  });

  it("removes the demo when a refund invalidates previously loaded entitlement", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(profile(true))
      .mockResolvedValueOnce(response(200, { code: 0, data: { unlocked: true } }))
      .mockResolvedValueOnce(response(403, { code: 2003, msg: "购买后可访问示例高级功能。" }))
      .mockResolvedValueOnce(profile(false));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useProductAccess());
    await waitFor(() => expect(result.current.profile?.entitlements.premium).toBe(true));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.unlocked).toBe(true);
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.unlocked).toBe(false);
    expect(result.current.profile?.entitlements.premium).toBe(false);
    expect(result.current.error).toBe("购买后可访问示例高级功能。");
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/premium")).toHaveLength(2);
  });

  it("clears a previous result when refreshed account has no active entitlement", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(profile(true))
        .mockResolvedValueOnce(response(200, { code: 0, data: { unlocked: true } }))
        .mockResolvedValueOnce(profile(false)),
    );
    const { result } = renderHook(() => useProductAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.unlocked).toBe(true);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.unlocked).toBe(false);
  });
});
