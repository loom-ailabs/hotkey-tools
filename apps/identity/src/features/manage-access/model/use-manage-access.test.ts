// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { NextIntlClientProvider } from "@hotkey-tools/i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/shared/api";
import zh from "../../../../../../packages/i18n/messages/zh/access.json";
import en from "../../../../../../packages/i18n/messages/en/access.json";

const api = vi.hoisted(() => ({
  fetchProfile: vi.fn(),
  fetchOrder: vi.fn(),
  createCheckout: vi.fn(),
  fetchPremium: vi.fn(),
}));
vi.mock("../api/access-api", () => api);

import { useManageAccess } from "./use-manage-access";

const profile = { user: { id: "user-1", name: "测试用户" }, entitlements: { premium: false } };
const messages = { zh, en };

function renderAccess(locale: "zh" | "en" = "zh") {
  return renderHook(() => useManageAccess(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(NextIntlClientProvider, {
        locale,
        messages: { Access: messages[locale] },
        timeZone: "UTC",
        children,
      }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, "", "/");
  api.fetchProfile.mockResolvedValue(profile);
});

afterEach(() => cleanup());

describe("manage account access", () => {
  it.each([
    ["en", "invalid_billing_mode"],
    ["zh", "invalid_billing_mode"],
    ["en", "billing_mode_mismatch"],
    ["zh", "billing_mode_mismatch"],
  ] as const)("maps %s %s to a safe localized configuration failure", async (locale, type) => {
    api.fetchProfile.mockRejectedValue(
      new ApiRequestError("raw provider configuration", 503, 1099, type),
    );
    const { result } = renderAccess(locale);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.configurationMissing).toBe(true);
    expect(result.current.failure?.message).toBe(messages[locale].errors.configuration);
  });
  it.each(["zh", "en"] as const)(
    "retries payment confirmation in %s without dropping the page locale",
    async (locale) => {
      const pathname = locale === "en" ? "/en" : "/";
      window.history.replaceState({}, "", `${pathname}?checkout=success&order_id=order-1`);
      api.fetchOrder.mockRejectedValueOnce(new Error("订单查询暂时失败。"));
      api.fetchOrder.mockResolvedValue({ status: "paid" });
      const { result } = renderAccess(locale);

      await waitFor(() =>
        expect(result.current.failure?.message).toBe(messages[locale].errors.order),
      );
      expect(api.fetchOrder).toHaveBeenCalledOnce();
      api.fetchProfile.mockResolvedValue({ ...profile, entitlements: { premium: true } });

      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => expect(result.current.notice).toBe(messages[locale].notices.paid));
      expect(api.fetchOrder).toHaveBeenCalledTimes(2);
      expect(result.current.premium).toBe(true);
      expect(result.current.failure).toBeNull();
      expect(window.location.search).toBe("");
      expect(window.location.pathname).toBe(pathname);
    },
  );

  it("keeps the same purchase request ID across failed checkout retries", async () => {
    api.createCheckout.mockRejectedValue(new Error("暂时无法打开收银台。"));
    const { result } = renderAccess();
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
    expect(result.current.failure?.message).toBe(zh.errors.purchase);
    expect(result.current.action).toBeNull();
  });

  it.each(["zh", "en"] as const)(
    "maps configuration errors by type in %s, preserving retry state",
    async (locale) => {
      api.fetchProfile.mockRejectedValue(
        new ApiRequestError("服务端中文详情", 503, 1001, "AUTH_NOT_CONFIGURED"),
      );
      const { result } = renderAccess(locale);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.configurationMissing).toBe(true);
      expect(result.current.failure?.message).toBe(messages[locale].errors.configuration);

      api.fetchProfile.mockResolvedValue(profile);
      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.configurationMissing).toBe(false);
      expect(result.current.failure).toBeNull();
    },
  );

  it("does not display an unknown server message or transport detail in English", async () => {
    api.fetchProfile.mockRejectedValue(
      new ApiRequestError("服务端中文详情", 502, 1999, "future_error"),
    );
    const { result } = renderAccess("en");
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failure?.message).toBe(en.errors.profile);
    expect(result.current.configurationMissing).toBe(false);
  });

  it("localizes premium success and a session renewal failure instead of server messages", async () => {
    api.fetchProfile.mockResolvedValue({ ...profile, entitlements: { premium: true } });
    api.fetchPremium.mockResolvedValue({ message: "服务端中文成功说明" });
    const { result } = renderAccess("en");
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.usePremium();
    });
    expect(result.current.featureResult).toBe(en.notices.premiumVerified);

    api.fetchPremium.mockRejectedValue(
      new ApiRequestError("服务端中文错误", 503, 1007, "session_renewal_failed"),
    );
    await act(async () => {
      await result.current.usePremium();
    });
    expect(result.current.failure?.message).toBe(en.errors.authentication);
    expect(result.current.action).toBeNull();
  });
});
