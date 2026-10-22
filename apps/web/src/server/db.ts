import "server-only";

import { getEnv } from "@/server/env";
import { ApiError } from "@/server/http";

export async function getDatabase(): Promise<D1Database> {
  const { DB } = await getEnv();
  if (!DB) {
    throw new ApiError(503, "database_not_configured", "数据库尚未配置。");
  }
  return DB;
}
