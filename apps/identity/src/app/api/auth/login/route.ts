import { NextResponse } from "next/server";
import { getAuthClient } from "@/server/auth";
import { ApiError, jsonError, privateHeaders } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { client, config, successUrl } = await getAuthClient();
    const requestUrl = new URL(request.url);
    const destinations = requestUrl.searchParams.getAll("destination");
    const destination = destinations[0] ?? "website";
    if (destinations.length > 1 || !["website", "checkout"].includes(destination)) {
      throw new ApiError(400, "invalid_login_destination", "登录后的访问位置无效。");
    }
    const providers = requestUrl.searchParams.getAll("provider");
    const provider = providers[0];
    if (
      providers.length > 1 ||
      (provider !== undefined && !["google", "github"].includes(provider))
    ) {
      throw new ApiError(400, "invalid_login_provider", "登录方式无效。");
    }
    // A host-only pre-auth cookie must be written on the callback's own host.
    // Drop all unrecognized query parameters rather than forwarding redirect URLs.
    if (requestUrl.origin !== config.baseUrl) {
      const canonical = new URL("/api/auth/login", config.baseUrl);
      canonical.searchParams.set("destination", destination);
      if (provider) canonical.searchParams.set("provider", provider);
      return NextResponse.redirect(canonical, { status: 303, headers: privateHeaders });
    }
    const { url } = await client.handleSignIn({
      redirectUri: `${config.baseUrl}/api/auth/callback`,
      postRedirectUri: destination === "checkout" ? `${config.baseUrl}/` : successUrl,
      // Social direct sign-in selects the fixed IdP target, not a connector ID.
      ...(provider ? { directSignIn: { method: "social" as const, target: provider } } : {}),
    });
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
