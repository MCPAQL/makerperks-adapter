// §1 (#36 add-directory-status): the status model + surfacing + per-user policy knobs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { inMemoryProfileStore } from "../dist/session/profile.js";
import {
  resolveStatus,
  effectiveStatusPolicy,
  DEFAULT_STATUS_POLICY,
} from "../dist/data/status.js";

const FIXTURE = "test/fixtures/perks.sample.json";
const withStore = () =>
  buildApp({ source: FIXTURE, profileStore: inMemoryProfileStore() });
const d = (router, operation, params = {}) => router.dispatch({ operation, params });

test("resolveStatus defaults to Active for an absent/unknown status", () => {
  assert.equal(resolveStatus({ status: "Discontinued" }), "Discontinued");
  assert.equal(resolveStatus({}), "Active");
  assert.equal(resolveStatus({ status: "bogus" }), "Active");
});

test("the default policy surfaces/flags but excludes/blocks nothing", () => {
  const p = effectiveStatusPolicy(undefined);
  assert.deepEqual(p, DEFAULT_STATUS_POLICY);
  for (const s of Object.keys(p)) assert.equal(p[s].listing, "include");
  assert.equal(p.Active.proposal, "allow");
  assert.equal(p.Discontinued.proposal, "flag");
});

test("a partial stored override falls back to DEFAULT per status", () => {
  const eff = effectiveStatusPolicy({ Discontinued: { listing: "exclude" } });
  assert.deepEqual(eff.Discontinued, { listing: "exclude", proposal: "flag" });
  assert.deepEqual(eff.Active, DEFAULT_STATUS_POLICY.Active);
});

test("status is surfaced on get_application_flow + the list summaries", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  const one = await d(router, "get_application_flow", {
    slug: "anthropic/anthropic-startup-program",
  });
  assert.equal(one.data.flow.status, "Active");
  const list = await d(router, "list_application_flows", {});
  assert.ok(list.data.flows.every((f) => typeof f.status === "string"));
});

test("status policy ops register only with a profile store; default round-trips", async () => {
  const { router } = await withStore();
  const ops = (await d(router, "introspect")).data.operations.map((o) => o.name);
  assert.ok(ops.includes("get_status_policy") && ops.includes("set_status_policy"));
  const def = await d(router, "get_status_policy");
  assert.equal(def.data.policy.Discontinued.listing, "include");

  const { router: noStore } = await buildApp({ source: FIXTURE });
  const noOps = (await d(noStore, "introspect")).data.operations.map((o) => o.name);
  assert.ok(!noOps.includes("get_status_policy"));
});

test("set_status_policy updates one status per-user; others untouched", async () => {
  const { router } = await withStore();
  await d(router, "set_status_policy", {
    status: "Discontinued",
    listing: "exclude",
    proposal: "block",
  });
  const got = await d(router, "get_status_policy");
  assert.deepEqual(got.data.policy.Discontinued, {
    listing: "exclude",
    proposal: "block",
  });
  assert.deepEqual(got.data.policy.Active, DEFAULT_STATUS_POLICY.Active);
});

test("set_status_policy rejects invalid status / listing / proposal", async () => {
  const { router } = await withStore();
  assert.equal(
    (await d(router, "set_status_policy", { status: "Nope" })).error.code,
    "VALIDATION_INVALID_TYPE",
  );
  assert.equal(
    (await d(router, "set_status_policy", { status: "Beta", listing: "maybe" })).error
      .code,
    "VALIDATION_INVALID_TYPE",
  );
});

// ── §2: listings honor exclude ───────────────────────────────────────────────

const STATUS_FIXTURE = "test/fixtures/perks.status.json";

const excludeDiscontinued = async () => {
  const app = await buildApp({
    source: STATUS_FIXTURE,
    profileStore: inMemoryProfileStore(),
  });
  await d(app.router, "set_status_policy", {
    status: "Discontinued",
    listing: "exclude",
  });
  return app.router;
};

test("list_programs omits an excluded status, include_inactive brings it back", async () => {
  const router = await excludeDiscontinued();
  const def = await d(router, "list_programs", {});
  assert.deepEqual(
    def.data.programs.map((p) => p.slug),
    ["acme/active-perk"],
  );
  const all = await d(router, "list_programs", { include_inactive: true });
  assert.equal(all.data.count, 2);
});

test("search_programs honors the exclusion too", async () => {
  const router = await excludeDiscontinued();
  const hit = await d(router, "search_programs", { query: "perk" });
  assert.ok(!hit.data.programs.some((p) => p.slug === "defunct/gone-perk"));
  const all = await d(router, "search_programs", {
    query: "perk",
    include_inactive: true,
  });
  assert.ok(all.data.programs.some((p) => p.slug === "defunct/gone-perk"));
});

test("list_application_flows honors the exclusion", async () => {
  const router = await excludeDiscontinued();
  const def = await d(router, "list_application_flows", {});
  assert.ok(!def.data.flows.some((f) => f.slug === "defunct/gone-perk"));
  const all = await d(router, "list_application_flows", { include_inactive: true });
  assert.ok(all.data.flows.some((f) => f.slug === "defunct/gone-perk"));
});

test("the default policy excludes nothing (listings unchanged)", async () => {
  const { router } = await buildApp({
    source: STATUS_FIXTURE,
    profileStore: inMemoryProfileStore(),
  });
  assert.equal((await d(router, "list_programs", {})).data.count, 2);
});

test("with no store wired, nothing is excluded", async () => {
  const { router } = await buildApp({ source: STATUS_FIXTURE });
  assert.equal((await d(router, "list_programs", {})).data.count, 2);
});
