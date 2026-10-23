"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@hotkey-tools/i18n";

export type ProductProfile = {
  user: { id: string; name?: string; email?: string; picture?: string } | null;
  entitlements: { premium: boolean };
};

class AccessError extends Error {
  constructor(readonly type?: string) {
    super("access_request_failed");
  }
}
async function readApi<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin" });
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AccessError();
  }
  const body = value as { code?: unknown; error?: { type?: unknown }; data?: unknown };
  if (!response.ok || body.code !== 0) {
    throw new AccessError(typeof body.error?.type === "string" ? body.error.type : undefined);
  }
  return body.data as T;
}

export function useProductAccess() {
  const t = useTranslations("Web");
  const [profile, setProfile] = useState<ProductProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [loginUrl, setLoginUrl] = useState("/api/auth/login");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await readApi<ProductProfile>("/api/me");
      setProfile(next);
      if (!next.entitlements.premium) setUnlocked(false);
      setError("");
    } catch (cause) {
      setProfile(null);
      setUnlocked(false);
      setError(
        cause instanceof AccessError && cause.type === "session_busy"
          ? t("errorBusy")
          : t("errorAccount"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => {
    const returnTo = new URL(window.location.href);
    returnTo.hash = "";
    const query = new URLSearchParams({ returnTo: returnTo.toString() });
    setLoginUrl(`/api/auth/login?${query.toString()}`);
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  const run = async () => {
    setRunning(true);
    setUnlocked(false);
    setError("");
    try {
      const result = await readApi<{ unlocked: boolean }>("/api/premium");
      if (!result.unlocked) throw new AccessError();
      setUnlocked(true);
    } catch (cause) {
      // Refresh the current entitlement after a rejected operation, including refunds.
      await refresh();
      const kind = cause instanceof AccessError ? cause.type : undefined;
      setError(
        kind === "premium_required"
          ? t("errorPremium")
          : kind === "unauthenticated" || kind === "session_renewal_failed"
            ? t("errorAuth")
            : kind === "session_busy"
              ? t("errorBusy")
              : t("errorDemo"),
      );
    } finally {
      setRunning(false);
    }
  };
  return { profile, loading, running, unlocked, error, loginUrl, refresh, run };
}
