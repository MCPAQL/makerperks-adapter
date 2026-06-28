import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { inMemoryProfileStore } from "../dist/session/profile.js";

const FIXTURE = "test/fixtures/perks.sample.json";
const withProfile = () =>
  buildApp({ source: FIXTURE, profileStore: inMemoryProfileStore() });
const opNames = async (router) =>
  (await router.dispatch({ operation: "introspect" })).data.operations
    .map((o) => o.name)
    .sort();

test("CRUDE profile ops register only when a profile store is wired", async () => {
  const { router } = await withProfile();
  const names = await opNames(router);
  for (const op of [
    "create_profile",
    "get_profile",
    "update_profile",
    "add_project",
    "remove_project",
    "delete_profile",
  ]) {
    assert.ok(names.includes(op), `expected ${op}`);
  }

  const { router: readOnly } = await buildApp({ source: FIXTURE });
  const ro = await opNames(readOnly);
  assert.ok(!ro.includes("create_profile") && !ro.includes("delete_profile"));
});

test("ops carry the right CRUDE semantic categories", async () => {
  const { router } = await withProfile();
  const byName = Object.fromEntries(
    (await router.dispatch({ operation: "introspect" })).data.operations.map((o) => [
      o.name,
      o.semantic_category,
    ]),
  );
  assert.equal(byName.create_profile, "CREATE");
  assert.equal(byName.get_profile, "READ");
  assert.equal(byName.update_profile, "UPDATE");
  assert.equal(byName.add_project, "UPDATE");
  assert.equal(byName.remove_project, "UPDATE");
  assert.equal(byName.delete_profile, "DELETE");
});

test("get_profile is null before creation; create then read round-trips", async () => {
  const { router } = await withProfile();
  const before = await router.dispatch({ operation: "get_profile" });
  assert.equal(before.data.profile, null);

  const created = await router.dispatch({
    operation: "create_profile",
    params: { identity: { name: "Mick", location: { region: "global" } } },
  });
  assert.equal(created.success, true);
  assert.equal(created.data.profile.identity.name, "Mick");
  assert.deepEqual(created.data.profile.projects, []);

  const got = await router.dispatch({ operation: "get_profile" });
  assert.equal(got.data.profile.identity.name, "Mick");
  assert.equal(got.data.profile.identity.location.region, "global");
});

test("create_profile twice is a CONFLICT_EXISTS", async () => {
  const { router } = await withProfile();
  await router.dispatch({ operation: "create_profile", params: {} });
  const again = await router.dispatch({ operation: "create_profile", params: {} });
  assert.equal(again.error.code, "CONFLICT_EXISTS");
});

test("update_profile merges identity field-wise (location half is kept)", async () => {
  const { router } = await withProfile();
  await router.dispatch({
    operation: "create_profile",
    params: {
      identity: { name: "Mick", location: { region: "global", country: "US" } },
    },
  });
  const updated = await router.dispatch({
    operation: "update_profile",
    params: { identity: { email: "mick@example.com", location: { country: "CA" } } },
  });
  const id = updated.data.profile.identity;
  assert.equal(id.name, "Mick"); // preserved
  assert.equal(id.email, "mick@example.com"); // added
  assert.equal(id.location.region, "global"); // half preserved
  assert.equal(id.location.country, "CA"); // half updated
});

test("update before create is NOT_FOUND", async () => {
  const { router } = await withProfile();
  const r = await router.dispatch({
    operation: "update_profile",
    params: { identity: { name: "x" } },
  });
  assert.equal(r.error.code, "NOT_FOUND_RESOURCE");
});

test("add_project assigns an id; remove_project removes it", async () => {
  const { router } = await withProfile();
  await router.dispatch({ operation: "create_profile", params: {} });
  const added = await router.dispatch({
    operation: "add_project",
    params: { project: { name: "DollhouseMCP", tags: ["mcp", "ai"] } },
  });
  const projectId = added.data.project_id;
  assert.ok(projectId);
  assert.equal(added.data.profile.projects.length, 1);
  assert.equal(added.data.profile.projects[0].name, "DollhouseMCP");

  const removed = await router.dispatch({
    operation: "remove_project",
    params: { project_id: projectId },
  });
  assert.equal(removed.data.profile.projects.length, 0);

  const gone = await router.dispatch({
    operation: "remove_project",
    params: { project_id: projectId },
  });
  assert.equal(gone.error.code, "NOT_FOUND_RESOURCE");
});

test("add_project requires a name", async () => {
  const { router } = await withProfile();
  await router.dispatch({ operation: "create_profile", params: {} });
  const r = await router.dispatch({
    operation: "add_project",
    params: { project: { url: "https://x" } },
  });
  assert.equal(r.error.code, "VALIDATION_INVALID_TYPE");
});

test("create_profile rejects a malformed identity", async () => {
  const { router } = await withProfile();
  const r = await router.dispatch({
    operation: "create_profile",
    params: { identity: { name: 42 } },
  });
  assert.equal(r.error.code, "VALIDATION_INVALID_TYPE");
});

test("delete_profile is idempotent; get_profile then reports none", async () => {
  const { router } = await withProfile();
  await router.dispatch({ operation: "create_profile", params: {} });
  const del = await router.dispatch({ operation: "delete_profile" });
  assert.equal(del.data.deleted, true);
  const after = await router.dispatch({ operation: "get_profile" });
  assert.equal(after.data.profile, null);
  const again = await router.dispatch({ operation: "delete_profile" });
  assert.equal(again.data.deleted, false); // idempotent, nothing was there
});

test("two profile stores are isolated (one user cannot see another's)", async () => {
  const { router: a } = await withProfile();
  const { router: b } = await withProfile();
  await a.dispatch({
    operation: "create_profile",
    params: { identity: { name: "A" } },
  });
  const bGet = await b.dispatch({ operation: "get_profile" });
  assert.equal(bGet.data.profile, null); // B's store never saw A's profile
});

test("unknown param is rejected by the router (CRUDE ops use the same validation)", async () => {
  const { router } = await withProfile();
  const r = await router.dispatch({
    operation: "get_profile",
    params: { bogus: 1 },
  });
  assert.equal(r.error.code, "VALIDATION_UNKNOWN_PARAM");
});
