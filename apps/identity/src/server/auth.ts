import "server-only";
import { createAuthService } from "@hotkey-tools/identity-core/auth";
import { getDatabase } from "./db";
import { getEnv } from "./env";
export type { IdentityUser } from "@hotkey-tools/identity-core/auth";
export const { getLoginPageConfig, getLogtoConfig, getAuthClient, getUser } = createAuthService({
  getEnv,
  getDatabase,
});
