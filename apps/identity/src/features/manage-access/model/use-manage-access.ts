"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "@/shared/api";
import { createCheckout, fetchOrder, fetchPremium, fetchProfile } from "../api/access-api";
import type { Profile } from "./types";

const asError = (error: unknown, fallback: string) =>
  error instanceof Error ? error : new Error(fallback);

export function useManageAccess() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<"purchase" | "premium" | null>(null);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState<Error | null>(null);
  const [featureResult, setFeatureResult] = useState("");
  const [pollVersion, setPollVersion] = useState(0);
  const requestId = useRef<string | null>(null);

  const reloadProfile = useCallback(async (signal?: AbortSignal) => {
    const result = await fetchProfile(signal);
    if (!signal?.aborted) setProfile(result);
    return result;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    reloadProfile(controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailure(asError(error, "无法读取登录状态。"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadProfile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "cancelled") {
      setNotice("付款已取消，你可以随时重新购买。");
      return;
    }
    const orderId = params.get("order_id");
    if (params.get("checkout") !== "success" || !orderId) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const poll = async () => {
      try {
        const order = await fetchOrder(orderId, controller.signal);
        if (controller.signal.aborted) return;
        if (order.status === "paid" || order.status === "refunded") {
          await reloadProfile(controller.signal);
          if (controller.signal.aborted) return;
          setNotice(order.status === "paid" ? "付款已确认，功能已解锁。" : "这笔订单已退款。");
          if (order.status === "paid") window.history.replaceState({}, "", "/");
          return;
        }
        attempts += 1;
        if (attempts < 15) {
          setNotice("正在确认付款结果，请稍候…");
          timer = setTimeout(poll, 2000);
        } else {
          setNotice("付款结果仍在处理中，可点击刷新状态重新查询。关闭页面不会影响到账确认。");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setFailure(asError(error, "暂时无法查询订单，请刷新状态重试。"));
        }
      }
    };
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [reloadProfile, pollVersion]);

  const refresh = async () => {
    setRefreshing(true);
    setFailure(null);
    setPollVersion((value) => value + 1);
    try {
      await reloadProfile();
    } catch (error) {
      setFailure(asError(error, "无法刷新账号状态，请稍后重试。"));
    } finally {
      setRefreshing(false);
    }
  };

  const purchase = async () => {
    if (!profile?.user) {
      window.location.assign("/api/auth/login?destination=checkout");
      return;
    }
    setAction("purchase");
    setFailure(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await createCheckout(requestId.current);
      if (result.status === "paid") {
        await reloadProfile();
        setNotice("这笔订单已付款，功能已解锁。");
      } else if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
      } else {
        throw new Error("暂时无法打开收银台，请稍后重试。");
      }
    } catch (error) {
      setFailure(asError(error, "暂时无法发起购买。"));
    } finally {
      setAction(null);
    }
  };

  const usePremium = async () => {
    setAction("premium");
    setFailure(null);
    try {
      const result = await fetchPremium();
      setFeatureResult(result.message ?? "权限验证通过，可以使用高级功能。");
    } catch (error) {
      setFailure(asError(error, "暂时无法使用该功能。"));
    } finally {
      setAction(null);
    }
  };

  const configurationMissing =
    failure instanceof ApiRequestError &&
    ["AUTH_NOT_CONFIGURED", "database_not_configured", "billing_not_configured"].includes(
      failure.type ?? "",
    );

  return {
    profile,
    loading,
    refreshing,
    action,
    notice,
    failure,
    featureResult,
    configurationMissing,
    premium: profile?.entitlements.premium ?? false,
    purchase,
    usePremium,
    refresh,
  };
}
