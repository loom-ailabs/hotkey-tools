import type { ApiResponse, ApiSuccess } from "./contract";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
    public readonly type?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function readResponse<T>(response: Response): Promise<T> {
  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiRequestError("服务返回了无法读取的结果，请稍后重试。", response.status);
  }

  if (!body || typeof body !== "object" || !response.ok || body.code !== 0) {
    throw new ApiRequestError(
      typeof body?.msg === "string" ? body.msg : "服务暂时不可用，请稍后重试。",
      response.status,
      typeof body?.code === "number" ? body.code : undefined,
      typeof body?.error?.type === "string" ? body.error.type : undefined,
    );
  }
  if (!("data" in body)) {
    throw new ApiRequestError("服务返回了不完整的结果，请稍后重试。", response.status);
  }
  return (body as ApiSuccess<T>).data;
}
