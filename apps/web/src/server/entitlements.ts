import "server-only";
import { hasPremiumInDatabase } from "@hotkey-tools/identity-core/entitlements";
import { getDatabase } from "./db";
export async function hasPremium(userId: string): Promise<boolean> {
  return hasPremiumInDatabase(await getDatabase(), userId);
}
