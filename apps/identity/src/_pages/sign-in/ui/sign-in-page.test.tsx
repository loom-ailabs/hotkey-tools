import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "@hotkey-tools/i18n";
import { describe, expect, it, vi } from "vitest";
import zh from "../../../../../../packages/i18n/messages/zh/sign-in.json";
import en from "../../../../../../packages/i18n/messages/en/sign-in.json";
import { SignInPage } from "./sign-in-page";

const preference = vi.hoisted(() => ({ locale: "zh" as "zh" | "en" }));
vi.mock("@hotkey-tools/i18n/navigation", () => ({
  useLocaleSwitcher: () => ({ locale: preference.locale, switchLocale: vi.fn() }),
}));

describe("login page composition", () => {
  it.each([
    ["zh", zh],
    ["en", en],
  ] as const)(
    "server renders %s and retains both server-validated provider URLs",
    (locale, messages) => {
      preference.locale = locale;
      const google =
        "https://login.loom-labs.ai/api/auth/login?provider=google&returnTo=https%3A%2F%2Fwww.loom-labs.ai%2Fworkspace%3Fsource%3Dlogin";
      const github = google.replace("provider=google", "provider=github");
      const markup = renderToStaticMarkup(
        <NextIntlClientProvider locale={locale} messages={{ SignIn: messages }} timeZone="UTC">
          <SignInPage googleSignInUrl={google} githubSignInUrl={github} />
        </NextIntlClientProvider>,
      );
      expect(markup).toContain(messages.login.title);
      expect(markup).toContain(messages.login.google);
      expect(markup).toContain(messages.login.github);
      expect(markup).toContain(messages.carousel.preview);
      expect(markup).toContain(`href="https://www.loom-labs.ai/${locale === "en" ? "en" : ""}"`);
      expect(markup).toContain(`href="${google.replaceAll("&", "&amp;")}"`);
      expect(markup).toContain(`href="${github.replaceAll("&", "&amp;")}"`);
      expect(markup).not.toContain('href="#');
    },
  );
});
