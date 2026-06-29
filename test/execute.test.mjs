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

// --- §2: the application lifecycle (the agent applies; the server packages + records) ---

test("submit_step walks the full lifecycle to completed (agent applies)", async () => {
  const { router } = await withStore();
  await router.dispatch({ operation: "set_autonomy", params: { mode: "full_auto" } });
  const started = await router.dispatch({
    operation: "start_application",
    params: { slug: "neon/neon-free-tier" }, // danger 0 → full_auto flows straight through
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

  // submission → verification: the server hands the agent a real package, not a simulation
  const s3 = await step();
  assert.equal(s3.data.stage, "verification");
  assert.ok(s3.data.application_package, "the agent receives an application package");
  assert.equal(s3.data.application_package.action_url !== undefined, true);
  assert.match(s3.data.did, /application package/);

  // verification needs the agent's reported result to advance (never asserts success on its own)
  const awaiting = await step();
  assert.equal(awaiting.data.stage, "verification"); // no result → stays put
  assert.match(awaiting.data.did, /awaiting the agent's result/);

  const v = await router.dispatch({
    operation: "submit_step",
    params: { execution_id: id, result: { ok: true, detail: "applied" } },
  });
  assert.equal(v.data.stage, "redeem"); // result recorded → advance
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

test("a web-only/manual provider yields a prepared handoff (after confirmation)", async () => {
  const { router } = await withStore();
  const started = await router.dispatch({
    operation: "start_application",
    params: { slug: "anthropic/anthropic-startup-program" },
  });
  const id = started.data.execution_id;
  await router.dispatch({ operation: "submit_step", params: { execution_id: id } });
  await router.dispatch({ operation: "submit_step", params: { execution_id: id } });
  // anthropic is danger 2 → submission halts for confirmation first
  const h = await router.dispatch({
    operation: "submit_step",
    params: { execution_id: id },
  });
  assert.equal(h.data.confirmation_required, true);
  const sub = await router.dispatch({
    operation: "submit_step",
    params: { execution_id: id, confirmation_token: h.data.confirmation_token },
  });
  assert.match(sub.data.did, /application package/);
  assert.equal(sub.data.handoff_available, true); // web/manual → a browser flow the agent drives
  assert.ok(sub.data.application_package);
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

// --- §3: batch-with-halting + confirmation tokens ---

const build = async () => {
  const store = inMemorySessionStore();
  const { router } = await buildApp({ source: FIXTURE, sessionStore: store });
  return { router, store };
};
// Drive a danger-2 provider (anthropic curated) to the gated submission stage.
const toSubmission = async (router) => {
  const s = await router.dispatch({
    operation: "start_application",
    params: { slug: "anthropic/anthropic-startup-program" },
  });
  const id = s.data.execution_id;
  await router.dispatch({ operation: "submit_step", params: { execution_id: id } });
  await router.dispatch({ operation: "submit_step", params: { execution_id: id } });
  return id;
};
const halt = (router, id, extra) =>
  router.dispatch({
    operation: "submit_step",
    params: { execution_id: id, ...extra },
  });

test("a gated submission halts with a confirmation token, without advancing", async () => {
  const { router } = await build();
  const id = await toSubmission(router);
  const h = await halt(router, id);
  assert.equal(h.data.status, "halted");
  assert.equal(h.data.confirmation_required, true);
  assert.ok(h.data.confirmation_token);
  assert.equal(h.data.stage, "submission");
});

test("resuming with the token proceeds past the gate exactly once", async () => {
  const { router } = await build();
  const id = await toSubmission(router);
  const h = await halt(router, id);
  const resume = await halt(router, id, {
    confirmation_token: h.data.confirmation_token,
  });
  assert.equal(resume.data.stage, "verification");
  assert.match(resume.data.did, /application package/);
});

test("a used token cannot be replayed", async () => {
  const { router, store } = await build();
  const id = await toSubmission(router);
  const h = await halt(router, id);
  store.get().confirmationTokens[h.data.confirmation_token].used = true;
  const r = await halt(router, id, { confirmation_token: h.data.confirmation_token });
  assert.equal(r.error.code, "CONFIRMATION_REJECTED");
  assert.match(r.error.message, /already used/);
});

test("an expired token is rejected", async () => {
  const { router, store } = await build();
  const id = await toSubmission(router);
  const h = await halt(router, id);
  store.get().confirmationTokens[h.data.confirmation_token].expiresAt = 1;
  const r = await halt(router, id, { confirmation_token: h.data.confirmation_token });
  assert.equal(r.error.code, "CONFIRMATION_REJECTED");
  assert.match(r.error.message, /expired/);
});

test("a token bound to different inputs is rejected", async () => {
  const { router } = await build();
  const id = await toSubmission(router);
  const h = await halt(router, id);
  const r = await halt(router, id, {
    confirmation_token: h.data.confirmation_token,
    inputs: { company_email: "x@y.com" },
  });
  assert.equal(r.error.code, "CONFIRMATION_REJECTED");
  assert.match(r.error.message, /inputs changed/);
});

test("an unknown token is rejected", async () => {
  const { router } = await build();
  const id = await toSubmission(router);
  await halt(router, id); // issue a real token; we present a bogus one
  const r = await halt(router, id, { confirmation_token: "bogus" });
  assert.equal(r.error.code, "CONFIRMATION_REJECTED");
});

test("under full_auto a low-danger provider does not halt", async () => {
  const { router } = await build();
  await router.dispatch({ operation: "set_autonomy", params: { mode: "full_auto" } });
  const s = await router.dispatch({
    operation: "start_application",
    params: { slug: "neon/neon-free-tier" }, // free_tier → danger 0
  });
  const id = s.data.execution_id;
  await router.dispatch({ operation: "submit_step", params: { execution_id: id } });
  await router.dispatch({ operation: "submit_step", params: { execution_id: id } });
  const sub = await router.dispatch({
    operation: "submit_step",
    params: { execution_id: id },
  });
  assert.equal(sub.data.stage, "verification");
  assert.notEqual(sub.data.status, "halted");
});

// --- #18 §2: the mode changes gating behavior ---

const setMode = (router, mode) =>
  router.dispatch({ operation: "set_autonomy", params: { mode } });
const driveToSubmission = async (router, slug) => {
  const s = await router.dispatch({ operation: "start_application", params: { slug } });
  const id = s.data.execution_id;
  await router.dispatch({ operation: "submit_step", params: { execution_id: id } });
  await router.dispatch({ operation: "submit_step", params: { execution_id: id } });
  return id;
};
const processSubmission = (router, id) =>
  router.dispatch({ operation: "submit_step", params: { execution_id: id } });

test("review_each halts even a danger-0 submission", async () => {
  const { router } = await build();
  await setMode(router, "review_each");
  const id = await driveToSubmission(router, "neon/neon-free-tier"); // danger 0
  const r = await processSubmission(router, id);
  assert.equal(r.data.status, "halted");
  assert.equal(r.data.decision, "pause");
  assert.equal(r.data.challenge_required, false);
});

test("auto_low_risk lets danger-0 through but halts danger-2", async () => {
  const { router } = await build();
  await setMode(router, "auto_low_risk");
  const low = await processSubmission(
    router,
    await driveToSubmission(router, "neon/neon-free-tier"), // danger 0 → go
  );
  assert.equal(low.data.stage, "verification");
  assert.notEqual(low.data.status, "halted");

  const hi = await processSubmission(
    router,
    await driveToSubmission(router, "anthropic/anthropic-startup-program"), // danger 2 → pause
  );
  assert.equal(hi.data.status, "halted");
  assert.equal(hi.data.decision, "pause");
});

test("full_auto runs a danger-2 submission without halting", async () => {
  const { router } = await build();
  await setMode(router, "full_auto");
  const r = await processSubmission(
    router,
    await driveToSubmission(router, "anthropic/anthropic-startup-program"), // danger 2 → go
  );
  assert.equal(r.data.stage, "verification");
  assert.match(r.data.did, /application package/);
});

// --- #18 §1: autonomy set/get ---

test("set_autonomy / get_autonomy round-trip; default review_each; invalid rejected", async () => {
  const { router } = await withStore();
  assert.equal(
    (await router.dispatch({ operation: "get_autonomy" })).data.autonomy,
    "review_each",
  );
  const set = await router.dispatch({
    operation: "set_autonomy",
    params: { mode: "full_auto" },
  });
  assert.equal(set.data.autonomy, "full_auto");
  assert.equal(
    (await router.dispatch({ operation: "get_autonomy" })).data.autonomy,
    "full_auto",
  );
  const bad = await router.dispatch({
    operation: "set_autonomy",
    params: { mode: "yolo" },
  });
  assert.equal(bad.error.code, "VALIDATION_INVALID_TYPE");
});

// --- §4: opt-in Execution Safety Loop ---

test("record_execution_step reflects the session mode (go/pause/stop)", async () => {
  const { router } = await build();
  await router.dispatch({
    operation: "set_autonomy",
    params: { mode: "auto_low_risk" },
  });
  const dir = async (danger_level) =>
    (
      await router.dispatch({
        operation: "record_execution_step",
        params: { danger_level, hint: "doing a thing" },
      })
    ).data.directive;

  assert.equal((await dir(1)).decision, "go"); // auto 0–1
  assert.equal((await dir(2)).decision, "pause"); // escalate ≥ 2
  const stop = await dir(4);
  assert.equal(stop.decision, "stop");
  assert.match(stop.reason, /out-of-band/);
});

test("record_execution_step: danger can be derived from a perk slug", async () => {
  const { router } = await build();
  const r = await router.dispatch({
    operation: "record_execution_step",
    params: { slug: "anthropic/anthropic-startup-program" }, // curated danger 2
  });
  assert.equal(r.data.directive.decision, "pause");
  assert.equal(r.data.directive.danger_level, 2);
});

test("record_execution_step is stateless (creates no execution)", async () => {
  const { router, store } = await build();
  await router.dispatch({
    operation: "record_execution_step",
    params: { danger_level: 3 },
  });
  assert.deepEqual(store.get().executions, {});
  assert.deepEqual(store.get().confirmationTokens, {});
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
