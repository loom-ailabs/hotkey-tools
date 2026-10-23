import zh from "../messages/zh/seo.json";
import en from "../messages/en/seo.json";
import type { Locale } from "./routing";
export const getSeoMessages = (locale: Locale) => (locale === "en" ? en : zh);
