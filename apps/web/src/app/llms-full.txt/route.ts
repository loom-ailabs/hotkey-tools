import { llmsFullText, publicTextHeaders } from "@/shared/config/seo";

export const dynamic = "force-static";

export function GET() {
  return new Response(llmsFullText, { headers: publicTextHeaders });
}
