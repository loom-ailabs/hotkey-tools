import { HomePage } from "@/_pages/home";
import { createPageMetadata } from "@/shared/config/seo";

export const metadata = createPageMetadata("/workspace");

export default function Page() {
  return <HomePage view="workspace" />;
}
