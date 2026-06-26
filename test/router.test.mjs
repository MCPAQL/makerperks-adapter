import { test, before } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";

const FIXTURE = "test/fixtures/perks.sample.json";
let router;
before(async () => {
  ({ router } = await buildApp({ source: FIXTURE }));
});
const d = (operation, params) => router.dispatch({ operation, params });

test("introspect lists the four READ ops", async () => {
  const r = await d("introspect");
  assert.equal(r.success, true);
  assert.deepEqual(r.data.operations.map((o) => o.name).sort(), [
    "get_program",
    "introspect",
    "list_programs",
    "search_programs",
  ]);
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
