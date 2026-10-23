export { getLocale, getTranslations, getMessages, setRequestLocale } from "next-intl/server";
import type { Locale } from "./routing";

export async function getMessagesForLocale(locale: Locale) {
  if (locale === "en") {
    const [Common, Web, SignIn, Access] = await Promise.all([
      import("../messages/en/common.json"),
      import("../messages/en/web.json"),
      import("../messages/en/sign-in.json"),
      import("../messages/en/access.json"),
    ]);
    return {
      Common: Common.default,
      Web: Web.default,
      SignIn: SignIn.default,
      Access: Access.default,
    };
  }
  const [Common, Web, SignIn, Access] = await Promise.all([
    import("../messages/zh/common.json"),
    import("../messages/zh/web.json"),
    import("../messages/zh/sign-in.json"),
    import("../messages/zh/access.json"),
  ]);
  return {
    Common: Common.default,
    Web: Web.default,
    SignIn: SignIn.default,
    Access: Access.default,
  };
}
