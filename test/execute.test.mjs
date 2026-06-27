import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { inMemorySessionStore } from "../dist/session/state.js";
import { startHttp } from "../dist/transports/http.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const FIXTURE = "test/fixtures/perks.sample.json";
const withStore = () =>
  buildApp({ source: FIXTURE, sessionStore: inMemorySessionStore() });
const opNames = async (router) =>
  (await router.dispatch({ operation: "introspect" })).data.operations
    .map((o) => o.name)
    .sort();

test("EXECUTE ops register only when a session store is wired", async () => {
  const { router: withExec } = await withStore();
  const names = await opNames(withExec);
  assert.ok(names.includes("start_application") && names.includes("get_status"));

  const { router: readOnly } = await buildApp({ source: FIXTURE });
  const ro = await opNames(readOnly);
  assert.ok(!ro.includes("start_application") && !ro.includes("get_status"));
});

test("start_application creates an execution; get_status reads it", async () => {
  const { router } = await withStore();
  const started = await router.dispatch({
    operation: "start_application",
    params: { slug: "neon/neon-free-tier" },
  });
  assert.equal(started.success, true);
  assert.equal(started.data.stage, "eligibility");
  assert.equal(started.data.status, "pending");
  const id = started.data.execution_id;

  const status = await router.dispatch({
    operation: "get_status",
    params: { execution_id: id },
  });
  assert.equal(status.data.execution.slug, "neon/neon-free-tier");
  assert.equal(status.data.execution.stage, "eligibility");
});

test("start_application on an unknown slug is NOT_FOUND", async () => {
  const { router } = await withStore();
  const r = await router.dispatch({
    operation: "start_application",
    params: { slug: "x/y" },
  });
  assert.equal(r.error.code, "NOT_FOUND_RESOURCE");
});

test("get_status for an unknown execution is NOT_FOUND", async () => {
  const { router } = await withStore();
  const r = await router.dispatch({
    operation: "get_status",
    params: { execution_id: "nope" },
  });
  assert.equal(r.error.code, "NOT_FOUND_RESOURCE");
});

test("executions are isolated per session store", async () => {
  const { router: a } = await withStore();
  const { router: b } = await withStore();
  const started = await a.dispatch({
    operation: "start_application",
    params: { slug: "neon/neon-free-tier" },
  });
  const id = started.data.execution_id;
  // session B cannot see session A's execution
  const inB = await b.dispatch({
    operation: "get_status",
    params: { execution_id: id },
  });
  assert.equal(inB.error.code, "NOT_FOUND_RESOURCE");
});

// --- §2: the simulated lifecycle ---

test("submit_step walks the full lifecycle to completed (simulated api submission)", async () => {
  const { router } = await withStore();
  const started = await router.dispatch({
    operation: "start_application",
    params: { slug: "neon/neon-free-tier" },
  });
  const id = started.data.execution_id;
  const step = (inputs) =>
    router.dispatch({
      operation: "submit_step",
      params: inputs ? { execution_id: id, inputs } : { execution_id: id },
    });

  assert.equal((await step()).data.stage, "assemble"); // eligibility → assemble
  const s2 = await step({ email: "m@x.com", full_name: "Mick" }); // assemble → submission
  assert.equal(s2.data.stage, "submission");
  assert.deepEqual(s2.data.missing_inputs, []);
  const s3 = await step(); // submission → verification
  assert.equal(s3.data.stage, "verification");
  assert.equal(s3.data.simulated, true);
  assert.match(s3.data.did, /SIMULATED submission/);
  assert.equal((await step()).data.stage, "redeem"); // verification → redeem
  const done = await step(); // redeem → done
  assert.equal(done.data.stage, "done");
  assert.equal(done.data.status, "completed");

  assert.equal((await step()).data.note, "already completed");
});

test("assemble reports missing required inputs", async () => {
  const { router } = await withStore();
  const started = await router.dispatch({
    operation: "start_application",
    params: { slug: "neon/neon-free-tier" },
  });
  const id = started.data.execution_id;
  await router.dispatch({ operation: "submit_step", params: { execution_id: id } });
  const assemble = await router.dispatch({
    operation: "submit_step",
    params: { execution_id: id },
  });
  assert.ok(assemble.data.missing_inputs.includes("email"));
  assert.ok(assemble.data.missing_inputs.includes("full_name"));
});

test("a web-only/manual provider yields a prepared handoff, not a submission", async () => {
  const { router } = await withStore();
  const started = await router.dispatch({
    operation: "start_application",
    params: { slug: "anthropic/anthropic-startup-program" },
  });
  const id = started.data.execution_id;
  await router.dispatch({ operation: "submit_step", params: { execution_id: id } });
  await router.dispatch({ operation: "submit_step", params: { execution_id: id } });
  const sub = await router.dispatch({
    operation: "submit_step",
    params: { execution_id: id },
  });
  assert.match(sub.data.did, /prepared handoff/);
  assert.match(sub.data.did, /#21/);
});

test("get_status carries flow context", async () => {
  const { router } = await withStore();
  const started = await router.dispatch({
    operation: "start_application",
    params: { slug: "neon/neon-free-tier" },
  });
  const status = await router.dispatch({
    operation: "get_status",
    params: { execution_id: started.data.execution_id },
  });
  assert.equal(status.data.flow.automatability, "api");
  assert.ok(Array.isArray(status.data.flow.gaps));
  assert.match(status.data.next_step, /eligibility/);
});

test("submit_step on an unknown execution is NOT_FOUND", async () => {
  const { router } = await withStore();
  const r = await router.dispatch({
    operation: "submit_step",
    params: { execution_id: "nope" },
  });
  assert.equal(r.error.code, "NOT_FOUND_RESOURCE");
});

test("http: mcp_aql_execute is exposed and dispatches when a store is wired", async () => {
  const { router } = await withStore();
  const handle = await startHttp(router, { port: 38981 });
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(handle.url)));

  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(tools, ["mcp_aql_execute", "mcp_aql_read"]);

  const res = await client.callTool({
    name: "mcp_aql_execute",
    arguments: {
      operation: "start_application",
      params: { slug: "neon/neon-free-tier" },
    },
  });
  const payload = JSON.parse(res.content[0].text);
  assert.equal(payload.success, true);
  assert.equal(payload.data.stage, "eligibility");

  await client.close();
  await handle.close();
});
