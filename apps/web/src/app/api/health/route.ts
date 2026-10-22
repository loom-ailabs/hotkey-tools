import { getDatabase } from "@/server/db";
import { jsonError, jsonSuccess } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const db = await getDatabase();
    await db.prepare("SELECT id FROM users LIMIT 1").first();
    return jsonSuccess({ status: "ok", framework: "nextjs", storage: "d1" });
  } catch (error) {
    return jsonError(error);
  }
}
