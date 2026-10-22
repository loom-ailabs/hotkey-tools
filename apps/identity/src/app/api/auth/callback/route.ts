import { NextResponse } from "next/server";
import { getAuthClient } from "@/server/auth";
import { ApiError, jsonError, privateHeaders } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { client, config, successUrl } = await getAuthClient();
    if (new URL(request.url).origin !== config.baseUrl) {
      throw new ApiError(400, "invalid_auth_callback", "请从应用的正式登录入口重新登录。");
    }
    // SDK validation includes the state and PKCE values from the sign-in cookie.
    const callbackUrl = new URL(`${config.baseUrl}/api/auth/callback`);
    callbackUrl.search = new URL(request.url).search;
    // The SDK restores postRedirectUri from its encrypted sign-in session only
    // after state, PKCE, issuer, audience, and signature validation have passed.
    const returnedUrl = await client.handleSignInCallback(callbackUrl.toString());
    const destination = returnedUrl ?? successUrl;
    if (![successUrl, `${config.baseUrl}/`].includes(destination)) {
      throw new ApiError(400, "invalid_login_destination", "登录后的访问位置无效。");
    }
    const response = NextResponse.redirect(destination, 303);
    response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
