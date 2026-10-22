// Synthetic transport fixtures only. No real OIDC tokens or production credentials.
import { CookieStorage, PersistKey } from "@logto/node";
const fixture = {};
for (const [label, exp] of [
  ["valid", Math.floor(Date.now() / 1000) + 600],
  ["expired", Math.floor(Date.now() / 1000) - 1],
]) {
  let value = "";
  const storage = new CookieStorage({
    encryptionKey: process.env.SHARED_SESSION_TEST_KEY,
    cookieKey: "fixture",
    isSecure: true,
    getCookie: () => "",
    setCookie: (_name, next) => {
      value = next;
    },
  });
  await storage.init();
  const encoded = (payload) => Buffer.from(JSON.stringify(payload)).toString("base64url");
  await storage.setItem(
    PersistKey.IdToken,
    `${encoded({ alg: "none" })}.${encoded({ sub: "local-cookie-domain-fixture", iss: "https://auth.loom-labs.ai/oidc", aud: "7wqbzelu2ey5n5brfr73d", exp, iat: Math.floor(Date.now() / 1000) })}.fixture`,
  );
  fixture[label] = encodeURIComponent(value);
}
console.log(JSON.stringify(fixture));
