import assert from "node:assert/strict";

const gateway = "http://localhost:8787";

async function json(path, options) {
  const response = await fetch(`${gateway}${path}`, options);
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return response.json();
}

for (const url of ["http://localhost:3000", gateway]) {
  const response = await fetch(url);
  assert.equal(response.status, 200, url);
  assert.match(await response.text(), /Hotkey Tools/);
}

const pythonHealth = await fetch("http://localhost:8788/health");
assert.equal(pythonHealth.status, 200);
assert.deepEqual(await pythonHealth.json(), { status: "ok" });
assert.deepEqual(await json("/api/health"), { status: "ok", storage: "d1" });

const headers = { "Content-Type": "application/json" };
assert.deepEqual(
  await json("/api/normalize", {
    method: "POST",
    headers,
    body: JSON.stringify({ combination: " ctrl + shift + p " }),
  }),
  { combination: "Ctrl + Shift + P" },
);

const record = await json("/api/hotkeys", {
  method: "POST",
  headers,
  body: JSON.stringify({ name: `smoke-${crypto.randomUUID()}`, combination: "Ctrl + K" }),
});
try {
  const { items } = await json("/api/hotkeys");
  assert.ok(
    items.some((item) => item.id === record.id),
    "Created record must be readable from D1",
  );
} finally {
  const response = await fetch(`${gateway}/api/hotkeys/${record.id}`, { method: "DELETE" });
  assert.equal(response.status, 204, "Clean up the smoke record");
}

console.log(
  "Smoke passed: Next.js + static assets + D1 read/write/delete + Python service binding.",
);
