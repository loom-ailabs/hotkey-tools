"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";

export type Appearance = "light" | "dark" | "system";
export const isAppearance = (value: unknown): value is Appearance =>
  value === "light" || value === "dark" || value === "system";

function readPreference(): Appearance | undefined {
  const value = document.cookie
    .split("; ")
    .find((part) => part.startsWith("LOOM_THEME="))
    ?.split("=")[1];
  return isAppearance(value) ? value : undefined;
}
function PreferenceSync({
  initialTheme,
  onReady,
}: {
  initialTheme: Appearance;
  onReady: (value: boolean) => void;
}) {
  const { setTheme } = useTheme();
  useEffect(() => {
    const sync = () => {
      const preference = readPreference();
      if (preference) setTheme(preference);
    };
    // The parent-domain preference is authoritative across products. Update
    // origin-local storage before releasing the initial theme lock.
    setTheme(readPreference() ?? initialTheme);
    onReady(true);
    window.addEventListener("focus", sync);
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [setTheme, initialTheme, onReady]);
  return null;
}
export function AppearanceProvider({
  children,
  initialTheme = "dark",
}: {
  children: ReactNode;
  initialTheme?: Appearance;
}) {
  const [ready, setReady] = useState(false);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={initialTheme}
      forcedTheme={ready ? undefined : initialTheme}
      storageKey="loom-appearance"
      enableSystem
      disableTransitionOnChange
    >
      <PreferenceSync initialTheme={initialTheme} onReady={setReady} />
      {children}
    </ThemeProvider>
  );
}
export function useAppearance() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const setAppearance = (value: string) => {
    if (!isAppearance(value)) return;
    const hostname = window.location.hostname;
    const domain =
      hostname === "loom-labs.ai" || hostname.endsWith(".loom-labs.ai")
        ? "; Domain=.loom-labs.ai"
        : "";
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `LOOM_THEME=${value}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${secure}`;
    setTheme(value);
  };
  return {
    theme: isAppearance(theme) ? theme : ("dark" as Appearance),
    resolvedTheme,
    setAppearance,
  };
}
