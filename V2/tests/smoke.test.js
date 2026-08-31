const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

test("GET /health", async () => {
  const { server, port } = await listen(createApp());
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { status: "ok" });
  } finally {
    server.close();
  }
});

test("GET /api/enrollment-types", async () => {
  const { server, port } = await listen(createApp());
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/enrollment-types`);
    const data = await r.json();
    assert.equal(data.types.length, 6);
    assert.equal(data.types[0].id, "graduacao_multipla");
  } finally {
    server.close();
  }
});
