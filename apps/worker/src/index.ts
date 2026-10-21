import { Hono } from "hono";

type HotkeyRow = {
  id: string;
  name: string;
  combination: string;
  description: string;
  created_at: string;
  updated_at: string;
};

type CreateHotkeyInput = {
  name?: unknown;
  combination?: unknown;
  description?: unknown;
};

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  PYTHON_SERVICE?: { fetch(request: Request): Promise<Response> };
  DB?: D1Database;
};

const app = new Hono<{ Bindings: Env }>();

function databaseOrError(db: D1Database | undefined): D1Database {
  if (!db) {
    throw new Error("D1 database is not configured");
  }
  return db;
}

app.get("/api/health", async (context) => {
  const database = databaseOrError(context.env.DB);
  // 同时检查绑定和初始 migration，避免未建表时错误地返回健康。
  await database.prepare("SELECT id FROM hotkeys LIMIT 1").first();
  return context.json({ status: "ok", storage: "d1" });
});

app.post("/api/normalize", async (context) => {
  if (!context.env.PYTHON_SERVICE) {
    return context.json({ error: "Python service is not configured" }, 503);
  }
  const url = new URL(context.req.url);
  url.pathname = "/normalize";
  return context.env.PYTHON_SERVICE.fetch(new Request(url, context.req.raw));
});

app.get("/api/hotkeys", async (context) => {
  try {
    const database = databaseOrError(context.env.DB);
    const result = await database
      .prepare("SELECT * FROM hotkeys ORDER BY name ASC")
      .all<HotkeyRow>();
    return context.json({ items: result.results });
  } catch (error) {
    return context.json(
      { error: error instanceof Error ? error.message : "Unable to read hotkeys" },
      503,
    );
  }
});

app.post("/api/hotkeys", async (context) => {
  try {
    const body = (await context.req.json()) as CreateHotkeyInput;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const combination = typeof body.combination === "string" ? body.combination.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";

    if (!name || !combination) {
      return context.json({ error: "name and combination are required" }, 400);
    }

    const id = crypto.randomUUID();
    const database = databaseOrError(context.env.DB);
    await database
      .prepare("INSERT INTO hotkeys (id, name, combination, description) VALUES (?, ?, ?, ?)")
      .bind(id, name, combination, description)
      .run();

    return context.json({ id, name, combination, description }, 201);
  } catch (error) {
    return context.json(
      { error: error instanceof Error ? error.message : "Unable to create hotkey" },
      503,
    );
  }
});

app.delete("/api/hotkeys/:id", async (context) => {
  try {
    const database = databaseOrError(context.env.DB);
    const result = await database
      .prepare("DELETE FROM hotkeys WHERE id = ?")
      .bind(context.req.param("id"))
      .run();
    return result.meta.changes === 0
      ? context.json({ error: "Hotkey not found" }, 404)
      : context.body(null, 204);
  } catch (error) {
    return context.json(
      { error: error instanceof Error ? error.message : "Unable to delete hotkey" },
      503,
    );
  }
});

app.all("/api/*", (context) => context.json({ error: "API route not found" }, 404));
app.all("*", (context) => context.env.ASSETS.fetch(context.req.raw));

app.onError((error, context) => {
  console.error("Worker request failed", error);
  return context.json({ error: "Service unavailable" }, 503);
});

export default app;
