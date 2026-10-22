import { describe, expect, it } from "vitest";
import { ApiRequestError, readResponse } from "./client";

describe("API response reader", () => {
  it("unwraps the shared success format", async () => {
    const response = Response.json({ code: 0, msg: "success", data: { premium: true } });
    expect(await readResponse(response)).toEqual({ premium: true });
  });

  it("rejects a business failure even when the transport status is 200", async () => {
    const response = Response.json({
      code: 1001,
      msg: "需要登录。",
      error: { type: "unauthorized" },
    });
    await expect(readResponse(response)).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 200,
      code: 1001,
      type: "unauthorized",
      message: "需要登录。",
    });
  });

  it("preserves a safe configuration message for service setup hints", async () => {
    const response = Response.json(
      { code: 1501, msg: "登录服务尚未配置。", error: { type: "AUTH_NOT_CONFIGURED" } },
      { status: 503 },
    );
    await expect(readResponse(response)).rejects.toMatchObject({
      status: 503,
      type: "AUTH_NOT_CONFIGURED",
    });
  });

  it("does not treat an unsuccessful HTTP response as business success", async () => {
    await expect(
      readResponse(Response.json({ code: 0, msg: "success", data: {} }, { status: 503 })),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("rejects missing data and unexpected non-JSON responses", async () => {
    await expect(readResponse(Response.json({ code: 0, msg: "success" }))).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    await expect(
      readResponse(new Response("<html>error</html>", { status: 502 })),
    ).rejects.toMatchObject({ status: 502 });
  });
});
