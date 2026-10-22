import { CookieStorage, PersistKey } from "@logto/node";
import { describe, expect, it, vi } from "vitest";

// Exercise the published storage used by @logto/next, with generated test keys
// and fixture session data only. This does not replace browser host isolation.
describe("official SDK cookie encryption boundary", () => {
  it("uses host-only secure HttpOnly cookies and rejects a corrupted or misconfigured encryption key", async () => {
    const checkoutKey = crypto.randomUUID();
    const websiteKey = crypto.randomUUID();
    let encryptedCookie = "";
    const setCookie = vi.fn((_name: string, value: string) => {
      encryptedCookie = value;
    });
    const storage = (encryptionKey: string) =>
      new CookieStorage({
        cookieKey: "logto_fixture_app",
        encryptionKey,
        isSecure: true,
        getCookie: () => encryptedCookie,
        setCookie,
      });
    const checkout = storage(checkoutKey);
    await checkout.init();
    await checkout.setItem(PersistKey.SignInSession, "fixture-state-and-pkce-session");
    expect(setCookie).toHaveBeenLastCalledWith("logto_fixture_app", expect.any(String), {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
      maxAge: 14 * 24 * 3600,
    });
    expect(setCookie.mock.calls.at(-1)?.[1]).not.toContain("fixture-state");
    const sameApplication = storage(checkoutKey);
    await sameApplication.init();
    expect(await sameApplication.getItem(PersistKey.SignInSession)).toBe(
      "fixture-state-and-pkce-session",
    );
    const wrongKeyReader = storage(websiteKey);
    await wrongKeyReader.init();
    expect(await wrongKeyReader.getItem(PersistKey.SignInSession)).toBeNull();
    expect(await wrongKeyReader.getItem(PersistKey.IdToken)).toBeNull();
  });
});
