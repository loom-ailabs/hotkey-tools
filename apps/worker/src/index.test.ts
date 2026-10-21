import { describe, expect, it } from "vitest";
import app from "./index";

const assets = { fetch: async () => new Response("static asset") };

describe("Worker routing", () => {
  it("does not report healthy when D1 is missing", async () => {
    const response = await app.request("/api/health", {}, { ASSETS: assets });
    expect(response.status).toBe(503);
  });

  it("returns 404 for unknown API routes instead of serving HTML", async () => {
    const response = await app.request("/api/missing", {}, { ASSETS: assets });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("rejects an incomplete hotkey before accessing storage", async () => {
    const response = await app.request(
      "/api/hotkeys",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Command palette" }),
      },
      { ASSETS: assets },
    );
    expect(response.status).toBe(400);
  });

  it("forwards the request body and Python response through a service binding", async () => {
    const pythonService = {
      fetch: async (request: Request) => {
        expect(new URL(request.url).pathname).toBe("/normalize");
        expect(await request.json()).toEqual({ combination: "ctrl + k" });
        return Response.json({ combination: "Ctrl + K" });
      },
    };
    const response = await app.request(
      "/api/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ combination: "ctrl + k" }),
      },
      { ASSETS: assets, PYTHON_SERVICE: pythonService },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ combination: "Ctrl + K" });
  });
});
