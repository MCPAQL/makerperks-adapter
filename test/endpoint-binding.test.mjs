// CRUDE endpoint enforcement (#93; spec crude-pattern §5, operations §6.3).
// An operation invoked via the wrong endpoint MUST be rejected before any side effect.
// Enforcement lives in `dispatchFromEndpoint` (the transport boundary); the plain `dispatch`
// is the trusted in-process path and does no binding check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Router } from "../dist/core/router.js";

// Build a router with one op per relevant category + a spyable handler.
function makeRouter() {
  const calls = [];
  const router = new Router();
  const handler = (name) => async (params) => {
    calls.push({ name, params });
    return { success: true, data: { ran: name } };
  };
  router.register({
    name: "introspect",
    semanticCategory: "READ",
    anyEndpoint: true,
    params: {},
    handler: handler("introspect"),
  });
  router.register({
    name: "get_thing",
    semanticCategory: "READ",
    params: {},
    handler: handler("get_thing"),
  });
  router.register({
    name: "set_thing",
    semanticCategory: "EXECUTE",
    params: { mode: { type: "string", required: true } },
    handler: handler("set_thing"),
  });
  return { router, calls };
}

test("rejects an EXECUTE op invoked via the READ endpoint, without running the handler", async () => {
  const { router, calls } = makeRouter();
  const r = await router.dispatchFromEndpoint(
    { operation: "set_thing", params: { mode: "full_auto" } },
    "READ",
  );
  assert.equal(r.success, false);
  assert.equal(r.error.code, "VALIDATION_ENDPOINT_MISMATCH");
  assert.match(r.error.message, /must be called via mcp_aql_execute, not mcp_aql_read/);
  assert.deepEqual(r.error.details, {
    operation: "set_thing",
    expected_endpoint: "EXECUTE",
    actual_endpoint: "READ",
  });
  assert.equal(calls.length, 0, "handler must not run on endpoint mismatch");
});

test("the binding check precedes param validation (a wrong-endpoint call never validates)", async () => {
  const { router, calls } = makeRouter();
  // `mode` is required, but it is omitted: mismatch must win over VALIDATION_MISSING_PARAM.
  const r = await router.dispatchFromEndpoint(
    { operation: "set_thing", params: {} },
    "READ",
  );
  assert.equal(r.error.code, "VALIDATION_ENDPOINT_MISMATCH");
  assert.equal(calls.length, 0);
});

test("allows an op invoked via its correct endpoint", async () => {
  const { router, calls } = makeRouter();
  const r = await router.dispatchFromEndpoint(
    { operation: "set_thing", params: { mode: "review_each" } },
    "EXECUTE",
  );
  assert.equal(r.success, true);
  assert.deepEqual(calls, [{ name: "set_thing", params: { mode: "review_each" } }]);
});

test("an anyEndpoint op (introspect) is reachable from every endpoint", async () => {
  for (const cat of ["READ", "CREATE", "UPDATE", "DELETE", "EXECUTE"]) {
    const { router } = makeRouter();
    const r = await router.dispatchFromEndpoint({ operation: "introspect" }, cat);
    assert.equal(r.success, true, `introspect via ${cat} should succeed`);
  }
});

test("an unknown operation is NOT_FOUND_OPERATION, not an endpoint mismatch", async () => {
  const { router } = makeRouter();
  const r = await router.dispatchFromEndpoint({ operation: "nope" }, "READ");
  assert.equal(r.error.code, "NOT_FOUND_OPERATION");
});

test("the trusted in-process dispatch() does no binding check", async () => {
  const { router, calls } = makeRouter();
  // set_thing is EXECUTE; plain dispatch (no endpoint context) runs it regardless.
  const r = await router.dispatch({
    operation: "set_thing",
    params: { mode: "x" },
  });
  assert.equal(
    r.success,
    true,
    "in-process callers without an endpoint context are unaffected",
  );
  assert.equal(calls.length, 1);
});
