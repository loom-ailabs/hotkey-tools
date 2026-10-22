import { getUser } from "@/server/auth";
import { hasPremium } from "@/server/entitlements";
import { jsonError, jsonSuccess } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getUser();
    const premium = user ? await hasPremium(user.id) : false;
    return jsonSuccess({ user, entitlements: { premium } });
  } catch (error) {
    return jsonError(error);
  }
}
