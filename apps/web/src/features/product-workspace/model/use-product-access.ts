"use client";

import { useCallback, useEffect, useState } from "react";

export type ProductProfile = {
  user: { id: string; name?: string; email?: string } | null;
  entitlements: { premium: boolean };
};

async function readApi<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin" });
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("服务暂时不可用，请稍后重试。");
  }
  const body = value as { code?: unknown; msg?: unknown; data?: unknown };
  if (!response.ok || body.code !== 0) {
    throw new Error(typeof body.msg === "string" ? body.msg : "请求失败，请稍后重试。");
  }
  return body.data as T;
}

export function useProductAccess() {
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
      setError(cause instanceof Error ? cause.message : "暂时无法读取账号，请重试。");
    } finally {
      setLoading(false);
    }
  }, []);
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
      if (!result.unlocked) throw new Error("请刷新账号状态后重试。");
      setUnlocked(true);
    } catch (cause) {
      // Refresh the current entitlement after a rejected operation, including refunds.
      await refresh();
      setError(cause instanceof Error ? cause.message : "暂时无法打开演示，请重试。");
    } finally {
      setRunning(false);
    }
  };
  return { profile, loading, running, unlocked, error, loginUrl, refresh, run };
}
