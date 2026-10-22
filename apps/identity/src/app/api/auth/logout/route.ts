import { NextResponse } from "next/server";
import { getAuthClient } from "@/server/auth";
import { getEnv } from "@/server/env";
import { jsonError, privateHeaders, requireSameOrigin } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = await getEnv();
    requireSameOrigin(request, env.APP_URL ?? "");
    const { client, config } = await getAuthClient();
    const url = await client.handleSignOut(`${config.baseUrl}/`);
    // A 303 ensures the browser follows the Logto redirect with GET after this POST.
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
