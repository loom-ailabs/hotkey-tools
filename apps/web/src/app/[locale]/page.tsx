import { getLocale } from "@hotkey-tools/i18n/server";
import { HomePage } from "@/_pages/home";
import { createPageMetadata } from "@/shared/config/seo";

export async function generateMetadata() {
  return createPageMetadata("/", await getLocale());
}

export default function Page() {
  return <HomePage />;
}
