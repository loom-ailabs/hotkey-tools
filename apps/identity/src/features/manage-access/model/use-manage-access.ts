"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "@hotkey-tools/i18n";
import { ApiRequestError } from "@/shared/api";
import { createCheckout, fetchOrder, fetchPremium, fetchProfile } from "../api/access-api";
import type { Profile } from "./types";

const errorKeys = {
  AUTH_NOT_CONFIGURED: "configuration",
  database_not_configured: "configuration",
  billing_not_configured: "configuration",
  sandbox_required: "sandbox",
  invalid_price_configuration: "sandbox",
  unauthenticated: "authentication",
  session_renewal_failed: "authentication",
  session_busy: "busy",
  premium_required: "permission",
  invalid_origin: "origin",
  order_not_found: "orderUnavailable",
  order_unavailable: "orderUnavailable",
  order_closed: "checkoutClosed",
  checkout_closed: "checkoutClosed",
  checkout_attempt_expired: "checkoutClosed",
  checkout_unavailable: "checkoutUnavailable",
  already_unlocked: "alreadyUnlocked",
  service_unavailable: "unavailable",
} as const;
type ErrorKey = (typeof errorKeys)[keyof typeof errorKeys];
type FallbackKey = "profile" | "order" | "refresh" | "purchase" | "premium";

export function useManageAccess() {
  const t = useTranslations("Access");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<"purchase" | "premium" | null>(null);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState<Error | null>(null);
  const [featureResult, setFeatureResult] = useState("");
  const [pollVersion, setPollVersion] = useState(0);
  const requestId = useRef<string | null>(null);

  const asError = useCallback(
    (error: unknown, fallback: FallbackKey) => {
      if (error instanceof ApiRequestError) {
        const key = Object.hasOwn(errorKeys, error.type ?? "")
          ? errorKeys[error.type as keyof typeof errorKeys]
          : fallback;
        return new ApiRequestError(
          t(`errors.${key as ErrorKey | FallbackKey}`),
          error.status,
          error.code,
          error.type,
        );
      }
      // Transport errors and upstream messages are never shown in the wrong language.
      return new Error(t(`errors.${fallback}`));
    },
    [t],
  );

  const reloadProfile = useCallback(async (signal?: AbortSignal) => {
    const result = await fetchProfile(signal);
    if (!signal?.aborted) setProfile(result);
    return result;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    reloadProfile(controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailure(asError(error, "profile"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadProfile, asError]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "cancelled") {
      setNotice(t("notices.cancelled"));
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
          setNotice(t(order.status === "paid" ? "notices.paid" : "notices.refunded"));
          if (order.status === "paid")
            window.history.replaceState({}, "", window.location.pathname);
          return;
        }
        attempts += 1;
        if (attempts < 15) {
          setNotice(t("notices.confirming"));
          timer = setTimeout(poll, 2000);
        } else {
          setNotice(t("notices.pending"));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setFailure(asError(error, "order"));
        }
      }
    };
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [reloadProfile, pollVersion, t, asError]);

  const refresh = async () => {
    setRefreshing(true);
    setFailure(null);
    setPollVersion((value) => value + 1);
    try {
      await reloadProfile();
    } catch (error) {
      setFailure(asError(error, "refresh"));
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
        setNotice(t("notices.alreadyPaid"));
      } else if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
      } else {
        setFailure(new Error(t("errors.openCheckout")));
      }
    } catch (error) {
      setFailure(asError(error, "purchase"));
    } finally {
      setAction(null);
    }
  };

  const usePremium = async () => {
    setAction("premium");
    setFailure(null);
    try {
      await fetchPremium();
      setFeatureResult(t("notices.premiumVerified"));
    } catch (error) {
      setFailure(asError(error, "premium"));
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
