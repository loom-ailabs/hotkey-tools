import { llmsIndex, publicTextHeaders } from "@/shared/config/seo";

export const dynamic = "force-static";

export function GET() {
  return new Response(llmsIndex, { headers: { ...publicTextHeaders, "Content-Language": "en" } });
}
