import { HomePage } from "@/_pages/home";
import { createPageMetadata } from "@/shared/config/seo";

export const metadata = createPageMetadata("/vision");

export default function Page() {
  return <HomePage view="vision" />;
}
