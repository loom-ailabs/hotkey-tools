"use client";

import Image from "next/image";
import { localizeUrl, useTranslations } from "@hotkey-tools/i18n";
import { Link, useLocaleSwitcher } from "@hotkey-tools/i18n/navigation";
import { Badge, PreferencesMenu } from "@hotkey-tools/ui";
import { ArrowUpRight, FlaskConical, ShieldCheck } from "lucide-react";
import { ManageAccess } from "@/features/manage-access";

export function IdentityPage() {
  const t = useTranslations("Access");
  const { locale, switchLocale } = useLocaleSwitcher();
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 sm:px-8">
      <header className="flex h-20 items-center justify-between gap-4 border-b">
        <Link
          href={localizeUrl("https://www.loom-labs.ai/", locale)}
          className="flex items-center gap-2.5 rounded-md text-base font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("homeLabel")}
        >
          <Image
            src="/loom-mark.svg"
            alt=""
            width={36}
            height={36}
            className="size-9 opacity-85 dark:invert"
            unoptimized
            priority
          />
          Loom AI
        </Link>
        <div className="flex items-center gap-3">
          <Badge variant="warning">
            <FlaskConical className="size-3.5" aria-hidden="true" />
            Sandbox
          </Badge>
          <PreferencesMenu
            locale={locale}
            onLocaleChange={switchLocale}
            labels={{
              settings: t("settings"),
              theme: t("theme"),
              light: t("light"),
              dark: t("dark"),
              system: t("system"),
              language: t("language"),
            }}
          />
        </div>
      </header>
      <main className="flex-1 space-y-10 py-10 sm:py-14">
        <div className="max-w-2xl space-y-4">
          <p className="text-xs font-medium tracking-widest text-link">{t("eyebrow")}</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            {t("title")}
          </h1>
          <p className="text-sm leading-7 text-muted-foreground">{t("description")}</p>
        </div>
        <ManageAccess />
        <p className="flex items-center justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          {t("security")}
        </p>
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t py-6 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} Loom AI</span>
        <Link
          href={localizeUrl("https://www.loom-labs.ai/workspace", locale)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("back")}
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
