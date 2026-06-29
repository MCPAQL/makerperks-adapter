import { test, before } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";

const FIXTURE = "test/fixtures/perks.sample.json";
let router;
before(async () => {
  ({ router } = await buildApp({ source: FIXTURE }));
});
const d = (operation, params) => router.dispatch({ operation, params });

test("introspect lists the READ ops (incl. the flow + discovery ops)", async () => {
  const r = await d("introspect");
  assert.equal(r.success, true);
  assert.deepEqual(r.data.operations.map((o) => o.name).sort(), [
    "diff_flow_proposal",
    "export_flows",
    "get_application_flow",
    "get_discovery_brief",
    "get_program",
    "introspect",
    "list_application_flows",
    "list_programs",
    "search_programs",
    "start_flow_discovery",
    "verify_flow_proposal",
  ]);
});

test("get_application_flow: curated seed returns a curated flow", async () => {
  const r = await d("get_application_flow", {
    slug: "anthropic/anthropic-startup-program",
  });
  assert.equal(r.success, true);
  assert.equal(r.data.flow.confidence, "curated");
  assert.equal(r.data.flow.automatability, "manual_review");
  assert.ok(r.data.flow.gaps.length > 0);
});

test("get_application_flow: unseeded program returns a derived flow", async () => {
  const r = await d("get_application_flow", { slug: "neon/neon-free-tier" });
  assert.equal(r.data.flow.confidence, "derived");
  assert.equal(r.data.flow.automatability, "api"); // free_tier
});

test("get_application_flow: unknown slug is NOT_FOUND", async () => {
  const r = await d("get_application_flow", { slug: "x/y" });
  assert.equal(r.error.code, "NOT_FOUND_RESOURCE");
});

test("list_application_flows: filters by automatability", async () => {
  const all = await d("list_application_flows");
  assert.equal(all.data.count, 2); // both fixture programs
  const api = await d("list_application_flows", { automatability: "api" });
  assert.equal(api.data.count, 1);
  assert.equal(api.data.flows[0].slug, "neon/neon-free-tier");
});

test("list_application_flows: rejects an invalid automatability enum", async () => {
  const r = await d("list_application_flows", { automatability: "magic" });
  assert.equal(r.success, false);
  assert.equal(r.error.code, "VALIDATION_INVALID_TYPE");
});

test("list_programs filters by tag", async () => {
  const r = await d("list_programs", { tag: "ai" });
  assert.equal(r.data.count, 1);
  assert.equal(r.data.programs[0].provider, "anthropic");
});

test("get_program by slug", async () => {
  const r = await d("get_program", { slug: "neon/neon-free-tier" });
  assert.equal(r.data.program.title, "Neon Free Tier");
});

test("search tolerates a typo", async () => {
  const r = await d("search_programs", { query: "anthrpic" });
  assert.ok(r.data.programs.some((p) => p.provider === "anthropic"));
});

test("empty match is a success, not an error", async () => {
  const r = await d("search_programs", { query: "zzzznotathing" });
  assert.equal(r.success, true);
  assert.equal(r.data.count, 0);
});

test("rejects an unknown parameter", async () => {
  const r = await d("list_programs", { bogus: 1 });
  assert.equal(r.success, false);
  assert.equal(r.error.code, "VALIDATION_UNKNOWN_PARAM");
});

test("rejects a missing required parameter", async () => {
  const r = await d("get_program", {});
  assert.equal(r.error.code, "VALIDATION_MISSING_PARAM");
});

test("rejects a wrong-typed parameter", async () => {
  const r = await d("list_programs", { limit: "lots" });
  assert.equal(r.error.code, "VALIDATION_INVALID_TYPE");
});

test("unknown operation", async () => {
  const r = await d("nope");
  assert.equal(r.error.code, "NOT_FOUND_OPERATION");
});

test("not-found resource", async () => {
  const r = await d("get_program", { slug: "x/y" });
  assert.equal(r.error.code, "NOT_FOUND_RESOURCE");
});
