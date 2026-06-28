// §2 (#47 piece B): per-user flow health — report_flow_outcome + get_flow_status.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { inMemoryProfileStore } from "../dist/session/profile.js";

const FIXTURE = "test/fixtures/perks.sample.json";
const SLUG = "neon/neon-free-tier";

const withHealth = (flowsSource) =>
  buildApp({
    source: FIXTURE,
    profileStore: inMemoryProfileStore(),
    ...(flowsSource ? { flowsSource } : {}),
  });
const d = (router, operation, params = {}) => router.dispatch({ operation, params });

test("flow-health ops register only with a profile store", async () => {
  const { router } = await withHealth();
  const ops = (await d(router, "introspect")).data.operations.map((o) => o.name);
  assert.ok(ops.includes("report_flow_outcome") && ops.includes("get_flow_status"));

  const { router: noStore } = await buildApp({ source: FIXTURE });
  const noOps = (await d(noStore, "introspect")).data.operations.map((o) => o.name);
  assert.ok(
    !noOps.includes("report_flow_outcome") && !noOps.includes("get_flow_status"),
  );
});

test("a failure increments the streak; a success resets it", async () => {
  const { router } = await withHealth();
  const f1 = await d(router, "report_flow_outcome", { slug: SLUG, outcome: "failure" });
  assert.equal(f1.data.health.failure_count, 1);
  assert.equal(f1.data.flagged_for_rediscovery, false);

  const f2 = await d(router, "report_flow_outcome", { slug: SLUG, outcome: "failure" });
  assert.equal(f2.data.health.failure_count, 2);
  assert.equal(f2.data.flagged_for_rediscovery, true); // >= REDISCOVER_AFTER

  const s = await d(router, "report_flow_outcome", { slug: SLUG, outcome: "success" });
  assert.equal(s.data.health.failure_count, 0); // success clears the streak
  assert.equal(s.data.flagged_for_rediscovery, false);
  assert.ok(s.data.health.last_success_at > 0);
});

test("get_flow_status recommends rediscover after repeated failures", async () => {
  const { router } = await withHealth();
  await d(router, "report_flow_outcome", { slug: SLUG, outcome: "failure" });
  await d(router, "report_flow_outcome", { slug: SLUG, outcome: "failure" });
  const status = await d(router, "get_flow_status", { slug: SLUG });
  assert.equal(status.data.recommendation, "rediscover");
  assert.equal(status.data.health.flagged_for_rediscovery, true);
});

test("get_flow_status recommends use for a fresh, healthy flow", async () => {
  const { router } = await withHealth();
  const status = await d(router, "get_flow_status", { slug: SLUG }); // derived, no failures
  assert.equal(status.data.recommendation, "use");
  assert.equal(status.data.freshness.stale, false);
});

test("get_flow_status recommends reverify for a stale but healthy flow", async () => {
  const { router } = await withHealth("test/fixtures/flows.stale.json");
  const status = await d(router, "get_flow_status", { slug: SLUG }); // verified 2020 → stale
  assert.equal(status.data.freshness.stale, true);
  assert.equal(status.data.recommendation, "reverify");
});

test("report_flow_outcome on an unknown slug is NOT_FOUND", async () => {
  const { router } = await withHealth();
  const r = await d(router, "report_flow_outcome", {
    slug: "no/such",
    outcome: "failure",
  });
  assert.equal(r.error.code, "NOT_FOUND_RESOURCE");
});

test("outcomes are audited (no secret values)", async () => {
  const { router } = await withHealth();
  await d(router, "create_profile", {});
  await d(router, "report_flow_outcome", {
    slug: SLUG,
    outcome: "failure",
    note: "form changed",
  });
  const got = await d(router, "get_profile", { include_audit: true });
  const entry = got.data.audit.find((e) => e.action === "report_flow_outcome");
  assert.ok(entry);
  assert.ok(entry.detail.includes(SLUG));
});
