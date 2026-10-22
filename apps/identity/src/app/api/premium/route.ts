import { getUser } from "@/server/auth";
import { hasPremium } from "@/server/billing";
import { ApiError, jsonError, jsonSuccess } from "@/server/http";

export async function GET() {
  try {
    const user = await getUser();
    if (!user) throw new ApiError(401, "unauthenticated", "请先登录。");
    if (!(await hasPremium(user.id)))
      throw new ApiError(403, "premium_required", "购买后可访问示例高级功能。");
    return jsonSuccess({
      unlocked: true,
      message: "你已通过服务端权益校验，成功访问示例高级功能。",
    });
  } catch (error) {
    return jsonError(error);
  }
}
