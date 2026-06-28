// Targeted branch coverage for the pure core: profile/project input validation, the READ
// filter surface, router introspection + type validation, and the DataSource payload validator.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { inMemoryProfileStore } from "../dist/session/profile.js";
import { DataSource } from "../dist/data/source.js";

const FIXTURE = "test/fixtures/perks.sample.json";
const dispatch = (router, operation, params = {}) =>
  router.dispatch({ operation, params });
const profileRouter = async () =>
  (await buildApp({ source: FIXTURE, profileStore: inMemoryProfileStore() })).router;
const readRouter = async () => (await buildApp({ source: FIXTURE })).router;

// --- operations/profile.ts: identity + project field validation branches ------------------
test("create_profile rejects malformed identity sub-fields", async () => {
  const r = await profileRouter();
  const bad = async (identity) =>
    (await dispatch(r, "create_profile", { identity })).error?.code;
  assert.equal(await bad({ email: 5 }), "VALIDATION_INVALID_TYPE");
  assert.equal(await bad({ location: "x" }), "VALIDATION_INVALID_TYPE");
  assert.equal(await bad({ location: { region: 5 } }), "VALIDATION_INVALID_TYPE");
  assert.equal(await bad({ location: { country: 5 } }), "VALIDATION_INVALID_TYPE");
  assert.equal(await bad({ links: "x" }), "VALIDATION_INVALID_TYPE");
  assert.equal(await bad({ links: [{ label: "a" }] }), "VALIDATION_INVALID_TYPE");
});

test("create_profile accepts a full valid identity (links + location)", async () => {
  const r = await profileRouter();
  const res = await dispatch(r, "create_profile", {
    identity: {
      name: "Mick",
      email: "m@x.test",
      location: { region: "global", country: "US" },
      links: [{ label: "site", url: "https://x.test" }],
    },
  });
  assert.equal(res.success, true);
  assert.equal(res.data.profile.identity.links[0].label, "site");
});

test("add_project rejects malformed project fields", async () => {
  const r = await profileRouter();
  await dispatch(r, "create_profile", {});
  const bad = async (project) =>
    (await dispatch(r, "add_project", { project })).error?.code;
  assert.equal(await bad({ name: "p", description: 5 }), "VALIDATION_INVALID_TYPE");
  assert.equal(await bad({ name: "p", url: 5 }), "VALIDATION_INVALID_TYPE");
  assert.equal(await bad({ name: "p", role: 5 }), "VALIDATION_INVALID_TYPE");
  assert.equal(await bad({ name: "p", tags: [1] }), "VALIDATION_INVALID_TYPE");
});

// --- operations/read.ts: the filter surface ------------------------------------------------
test("list_programs honors each filter", async () => {
  const r = await readRouter();
  const count = async (params) =>
    (await dispatch(r, "list_programs", params)).data.count;
  assert.equal(await count({ audience: "startup" }), 1);
  assert.equal(await count({ provider: "neon" }), 1);
  assert.equal(await count({ region: "global" }), 2);
  assert.equal(await count({ status: "Active" }), 2);
  assert.equal(await count({ min_value: 1 }), 1); // only anthropic (25000)
  assert.equal(await count({ limit: 1 }), 1);
  assert.equal(await count({ tag: "database" }), 1);
});

test("get_program on an unknown slug is NOT_FOUND", async () => {
  const r = await readRouter();
  const res = await dispatch(r, "get_program", { slug: "nope/nope" });
  assert.equal(res.error.code, "NOT_FOUND_RESOURCE");
});

// --- core/introspect.ts + router type validation ------------------------------------------
test("introspect can return a single operation, or NOT_FOUND for an unknown one", async () => {
  const r = await profileRouter();
  const one = await dispatch(r, "introspect", { name: "get_profile" });
  assert.equal(one.data.operation.name, "get_profile");
  const miss = await dispatch(r, "introspect", { name: "no_such_op" });
  assert.equal(miss.error.code, "NOT_FOUND_OPERATION");
});

test("router rejects a wrong-typed boolean and a wrong-typed object param", async () => {
  const r = await profileRouter();
  const boolBad = await dispatch(r, "get_profile", { include_audit: "yes" });
  assert.equal(boolBad.error.code, "VALIDATION_INVALID_TYPE");
  const objBad = await dispatch(r, "create_profile", { identity: "not-an-object" });
  assert.equal(objBad.error.code, "VALIDATION_INVALID_TYPE");
});

// --- data/source.ts: the eval-free payload validator + read errors ------------------------
const httpSource = (body, status = 200) =>
  new DataSource({
    source: "https://example.test/perks.json",
    fetchImpl: async () => new Response(body, { status }),
  });

test("load rejects non-JSON", async () => {
  await assert.rejects(() => httpSource("not json {").load(), /not valid JSON/);
});

test("load rejects a non-object payload and a non-array programs", async () => {
  await assert.rejects(() => httpSource("123").load(), /schema validation/);
  await assert.rejects(
    () => httpSource(JSON.stringify({ name: 5, programs: "x" })).load(),
    /schema validation/,
  );
});

test("load flags per-program field type errors", async () => {
  const payload = JSON.stringify({
    name: "MakerPerks",
    programs: [
      42, // not an object
      {
        slug: 1,
        title: 2,
        provider: 3,
        url: 4,
        verified: 5,
        max_value: "x",
        audience: "notarray",
        sources: [1],
        tags: [1],
        unlocks: "x",
        value_type: "bogus",
        status: "Bogus",
        currency: 5,
        min_value: "x",
        region: 5,
        value_display: 5,
        aggregator: "x",
      },
    ],
  });
  await assert.rejects(() => httpSource(payload).load(), /schema validation/);
});

test("load rejects a non-OK HTTP response", async () => {
  await assert.rejects(() => httpSource("", 503).load(), /failed to fetch/);
});

test("meta throws before load", async () => {
  const ds = new DataSource({ source: FIXTURE });
  assert.throws(() => ds.meta(), /not loaded/);
});
