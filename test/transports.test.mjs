import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { inMemorySessionStore } from "../dist/session/state.js";
import { inMemoryProfileStore } from "../dist/session/profile.js";
import { startHttp } from "../dist/transports/http.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const FIXTURE = "test/fixtures/perks.sample.json";
const opsOf = (res) =>
  JSON.parse(res.content[0].text)
    .data.operations.map((o) => o.name)
    .sort();

async function viaStdio() {
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: "node",
      args: ["dist/index.js"],
      env: { ...process.env, MAKERPERKS_SOURCE: FIXTURE },
    }),
  );
  const tools = (await client.listTools()).tools.map((t) => t.name);
  const ops = opsOf(
    await client.callTool({
      name: "mcp_aql_read",
      arguments: { operation: "introspect" },
    }),
  );
  await client.close();
  return { tools, ops };
}

async function viaHttp(port) {
  // Match the stdio entry, which wires in-memory session + profile stores (the local
  // personal-tool mode), so both transports expose the same READ + CRUDE + EXECUTE surface.
  const { router } = await buildApp({
    source: FIXTURE,
    sessionStore: inMemorySessionStore(),
    profileStore: inMemoryProfileStore(),
  });
  const handle = await startHttp(router, { port });
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(handle.url)));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  const ops = opsOf(
    await client.callTool({
      name: "mcp_aql_read",
      arguments: { operation: "introspect" },
    }),
  );
  await client.close();
  await handle.close();
  return { tools, ops };
}

// Local mode wires session + profile stores, so the full CRUDE + EXECUTE surface is present.
const LOCAL_TOOLS = [
  "mcp_aql_read",
  "mcp_aql_create",
  "mcp_aql_update",
  "mcp_aql_delete",
  "mcp_aql_execute",
];

test("stdio: full CRUDE + execute tools, introspect lists 18 ops", async () => {
  const { tools, ops } = await viaStdio();
  assert.deepEqual(tools, LOCAL_TOOLS);
  assert.equal(ops.length, 18);
  assert.ok(ops.includes("submit_step") && ops.includes("set_autonomy"));
  assert.ok(ops.includes("create_profile") && ops.includes("get_profile"));
});

test("streamable http: full CRUDE + execute tools, introspect lists 18 ops", async () => {
  const { tools, ops } = await viaHttp(38974);
  assert.deepEqual(tools, LOCAL_TOOLS);
  assert.equal(ops.length, 18);
});

test("transport parity: same operations over stdio and streamable http", async () => {
  const s = await viaStdio();
  const h = await viaHttp(38975);
  assert.deepEqual(s.ops, h.ops);
});
