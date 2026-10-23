import { getUser } from "@/server/auth";
import { hasPremium } from "@/server/entitlements";
import { ApiError, jsonError, jsonSuccess } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getUser();
    if (!user) throw new ApiError(401, "unauthenticated", "请先登录。");
    if (!(await hasPremium(user.id)))
      throw new ApiError(403, "premium_required", "解锁 Loom Pro 后即可查看工作计划。");
    return jsonSuccess({
      unlocked: true,
      message: "你已获得 Loom Pro 工作计划的访问权限。",
    });
  } catch (error) {
    return jsonError(error);
  }
}
