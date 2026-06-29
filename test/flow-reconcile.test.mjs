import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { inMemoryFlowRegistry } from "../dist/session/flow-registry.js";
import { inMemoryOverlayMirror } from "../dist/session/overlay-mirror.js";

const FIXTURE = "test/fixtures/perks.sample.json";
const SLUG = "neon/neon-free-tier";
const d = (router, operation, params = {}) => router.dispatch({ operation, params });

const READY = {
  automatability: "api",
  submission: { method: "oauth_signup", action_url: "https://x.example.com/signup" },
  redemption: { type: "auto" },
  danger_level: 0,
  source: "https://x.example.com/signup",
  verified: "2026-06-28",
};

// A registry + mirror; `operator` toggles authority. Returns the router + the shared mirror.
const build = async (operator) => {
  const registry = inMemoryFlowRegistry();
  const mirror = inMemoryOverlayMirror();
  const { router } = await buildApp({
    source: FIXTURE,
    flowRegistry: registry,
    overlayMirror: mirror,
    operator,
  });
  return { router, mirror };
};

test("reconcile_flows registers only with both a registry and a mirror", async () => {
  const { router } = await build(true);
  assert.ok(
    (await d(router, "introspect")).data.operations.some(
      (o) => o.name === "reconcile_flows",
    ),
  );
  // A registry but no mirror → not registered.
  const { router: noMirror } = await buildApp({
    source: FIXTURE,
    flowRegistry: inMemoryFlowRegistry(),
    operator: true,
  });
  assert.ok(
    !(await d(noMirror, "introspect")).data.operations.some(
      (o) => o.name === "reconcile_flows",
    ),
  );
});

test("a non-operator cannot reconcile and the mirror is untouched", async () => {
  const { router, mirror } = await build(false);
  const res = await d(router, "reconcile_flows");
  assert.equal(res.success, false);
  assert.equal(res.error.code, "FORBIDDEN");
  assert.deepEqual(await mirror.read(), {});
});

test("an operator reconcile publishes the accepted overlay to the mirror", async () => {
  const { router, mirror } = await build(true);
  // Propose + accept a flow so the registry has an accepted overlay.
  const created = await d(router, "propose_flow", { slug: SLUG, candidate: READY });
  await d(router, "accept_flow", { id: created.data.id });

  const res = await d(router, "reconcile_flows");
  assert.equal(res.success, true);
  assert.equal(res.data.count, 1);
  assert.deepEqual(res.data.slugs, [SLUG]);

  // The mirror now holds the blessed flow — what the read-only worker would serve.
  const published = await mirror.read();
  assert.equal(published[SLUG].automatability, "api");
});

test("reconcile with nothing accepted publishes an empty overlay", async () => {
  const { router, mirror } = await build(true);
  const res = await d(router, "reconcile_flows");
  assert.equal(res.success, true);
  assert.equal(res.data.count, 0);
  assert.deepEqual(await mirror.read(), {});
});
