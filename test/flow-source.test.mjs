// §1 (#47 piece A): the FlowSource loader + the migrated flows.json overlay.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FlowSource } from "../dist/data/flow-source.js";
import { buildApp } from "../dist/app.js";

const GCP = "gcp/google-ai-startup-program";
const SPIKES = {
  "deepgram/deepgram-pricing-startup-credits": "api",
  "anthropic/anthropic-startup-program": "manual_review",
  "gcp/google-ai-startup-program": "web_only",
};

test("FlowSource loads the bundled overlay and resolves a slug", async () => {
  const fs = new FlowSource();
  await fs.ensureLoaded();
  const gcp = fs.curatedFor(GCP);
  assert.equal(gcp.automatability, "web_only");
  assert.equal(gcp.danger_level, 2);
  assert.equal(fs.curatedFor("does/not-exist"), undefined);
  assert.equal(Object.keys(fs.all()).length, 3);
});

test("the bundled flows.json carries the 3 curated spikes with their automatability", async () => {
  const fs = new FlowSource();
  await fs.ensureLoaded();
  for (const [slug, automatability] of Object.entries(SPIKES)) {
    const doc = fs.curatedFor(slug);
    assert.ok(doc, `missing curated flow for ${slug}`);
    assert.equal(doc.automatability, automatability);
    assert.ok(Array.isArray(doc.required_inputs) && doc.required_inputs.length > 0);
    assert.ok(Array.isArray(doc.gaps) && doc.gaps.length > 0);
  }
});

test("curatedFor before ensureLoaded throws", () => {
  const fs = new FlowSource();
  assert.throws(() => fs.curatedFor(GCP), /not loaded/);
});

test("a configured URL source is fetched + validated (fetchImpl injected)", async () => {
  const body = JSON.stringify({
    "x/y": {
      automatability: "api",
      submission: { method: "oauth_signup", action_url: "https://x.test" },
      required_inputs: [
        { key: "email", type: "email", required: true, source: "profile" },
      ],
      redemption: { type: "auto" },
      danger_level: 0,
      gaps: [],
      source: "https://x.test",
      sources: ["https://x.test"],
      verified: "2026-06-28",
    },
  });
  const fs = new FlowSource({
    source: "https://example.test/flows.json",
    fetchImpl: async () => new Response(body, { status: 200 }),
  });
  await fs.ensureLoaded();
  assert.equal(fs.curatedFor("x/y").automatability, "api");
});

test("a schema-invalid flows.json fails loud", async () => {
  const bad = JSON.stringify({
    "x/y": { automatability: "not-a-real-value", danger_level: 9 },
  });
  const fs = new FlowSource({
    source: "https://example.test/flows.json",
    fetchImpl: async () => new Response(bad, { status: 200 }),
  });
  await assert.rejects(() => fs.ensureLoaded(), /schema validation/);
});

test("a non-OK fetch fails loud", async () => {
  const fs = new FlowSource({
    source: "https://example.test/flows.json",
    fetchImpl: async () => new Response("", { status: 404 }),
  });
  await assert.rejects(() => fs.ensureLoaded(), /failed to fetch/);
});

// §2 end-to-end: a flowsSource override changes the served flow through buildApp + the ops.
test("get_application_flow reflects a flowsSource override (not the bundled default)", async () => {
  const { router } = await buildApp({
    source: "test/fixtures/perks.sample.json",
    flowsSource: "test/fixtures/flows.alt.json",
  });
  const overridden = await router.dispatch({
    operation: "get_application_flow",
    params: { slug: "neon/neon-free-tier" },
  });
  assert.equal(overridden.data.flow.confidence, "curated"); // overlay applied
  assert.equal(overridden.data.flow.automatability, "manual_review");
  assert.equal(overridden.data.flow.submission.action_url, "https://alt.example/apply");

  // A slug absent from the alt overlay falls back to the derived baseline.
  const derived = await router.dispatch({
    operation: "get_application_flow",
    params: { slug: "anthropic/anthropic-startup-program" },
  });
  assert.equal(derived.data.flow.confidence, "derived");
});

test("get_application_flow carries a freshness annotation (#47 piece B)", async () => {
  const { router } = await buildApp({ source: "test/fixtures/perks.sample.json" });
  const res = await router.dispatch({
    operation: "get_application_flow",
    params: { slug: "anthropic/anthropic-startup-program" }, // curated, verified 2026-06-27
  });
  assert.equal(res.data.freshness.verified, "2026-06-27");
  assert.equal(typeof res.data.freshness.stale, "boolean");
  // A derived baseline (neon is api-derived, no curated verified) is not stale.
  const neon = await router.dispatch({
    operation: "get_application_flow",
    params: { slug: "neon/neon-free-tier" },
  });
  assert.equal(neon.data.freshness.stale, false);
  assert.equal(neon.data.freshness.age_days, null);
});
