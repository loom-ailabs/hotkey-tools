import { HomePage } from "@/_pages/home";
import { createPageMetadata } from "@/shared/config/seo";

export const metadata = createPageMetadata("/pricing");

export default function Page() {
  return <HomePage view="pricing" />;
}
