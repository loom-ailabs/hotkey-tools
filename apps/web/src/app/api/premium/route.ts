import { getUser } from "@/server/auth";
import { hasPremium } from "@/server/entitlements";
import { ApiError, jsonError, jsonSuccess } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getUser();
    if (!user) throw new ApiError(401, "unauthenticated", "请先登录。");
    if (!(await hasPremium(user.id)))
      throw new ApiError(403, "premium_required", "购买后可访问示例高级功能。");
    return jsonSuccess({
      unlocked: true,
      message: "你已通过服务端权益校验，可运行 Loom AI 固定演示工作计划；此功能不调用真实模型。",
    });
  } catch (error) {
    return jsonError(error);
  }
}
