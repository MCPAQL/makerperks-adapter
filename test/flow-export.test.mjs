import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";

const FIXTURE = "test/fixtures/perks.sample.json";
// The bundled flows.json curated overlay (flowsSource unset => bundled default).
const BASE_SLUGS = [
  "anthropic/anthropic-startup-program",
  "deepgram/deepgram-pricing-startup-credits",
  "gcp/google-ai-startup-program",
];

// A minimal registry stub: export_flows only ever calls accepted(). The other acceptance ops are
// registered too but are never dispatched in these tests.
const stubRegistry = (accepted = {}) => ({
  mode: async () => "review_each",
  setMode: async () => {},
  put: async () => {},
  get: async () => undefined,
  list: async () => [],
  decide: async () => {
    throw new Error("not used");
  },
  accepted: async () => ({ ...accepted }),
});

const dispatch = (router, operation, params) => router.dispatch({ operation, params });

test("export_flows: no registry exports the loaded overlay, every slug base", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  const r = await dispatch(router, "export_flows");
  assert.equal(r.success, true);
  assert.equal(r.data.count, BASE_SLUGS.length);
  assert.deepEqual(Object.keys(r.data.flows).sort(), BASE_SLUGS);
  assert.deepEqual(
    Object.values(r.data.sources),
    BASE_SLUGS.map(() => "base"),
  );
  // The exported map is a re-ingestible flows.json shape (slug -> Flow Document).
  assert.equal(
    r.data.flows["anthropic/anthropic-startup-program"].automatability,
    "manual_review",
  );
});

test("export_flows: an accepted overlay entry for a new slug is merged and attributed", async () => {
  const accepted = {
    "newco/newco-credits": { automatability: "api", danger_level: 1 },
  };
  const { router } = await buildApp({
    source: FIXTURE,
    flowRegistry: stubRegistry(accepted),
  });
  const r = await dispatch(router, "export_flows");
  assert.equal(r.success, true);
  assert.equal(r.data.count, BASE_SLUGS.length + 1);
  assert.equal(r.data.sources["newco/newco-credits"], "accepted");
  assert.equal(r.data.sources["anthropic/anthropic-startup-program"], "base");
  assert.equal(r.data.flows["newco/newco-credits"].automatability, "api");
});

test("export_flows: an accepted entry wins over a base slug, count unchanged", async () => {
  const accepted = {
    "anthropic/anthropic-startup-program": {
      automatability: "api",
      danger_level: 3,
      note: "overridden",
    },
  };
  const { router } = await buildApp({
    source: FIXTURE,
    flowRegistry: stubRegistry(accepted),
  });
  const r = await dispatch(router, "export_flows");
  assert.equal(r.success, true);
  assert.equal(r.data.count, BASE_SLUGS.length); // override, not addition
  assert.equal(r.data.sources["anthropic/anthropic-startup-program"], "accepted");
  assert.equal(
    r.data.flows["anthropic/anthropic-startup-program"].automatability,
    "api", // accepted value, not the bundled "manual_review"
  );
  assert.equal(r.data.flows["anthropic/anthropic-startup-program"].note, "overridden");
});

test("export_flows: introspectable as a READ op", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  const r = await dispatch(router, "introspect");
  const op = r.data.operations.find((o) => o.name === "export_flows");
  assert.ok(op, "export_flows is listed");
  assert.equal(op.semantic_category, "READ");
});
