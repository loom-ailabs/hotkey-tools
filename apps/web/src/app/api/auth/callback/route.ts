import { createAuthRoutes } from "@hotkey-tools/identity-core/auth-routes";
import { getAuthClient, getUser } from "@/server/auth";
import { getEnv } from "@/server/env";
export const dynamic = "force-dynamic";
export const GET = createAuthRoutes({ getAuthClient, getEnv, getUser }).callback;
