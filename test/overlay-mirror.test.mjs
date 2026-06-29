import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import {
  kvOverlayMirror,
  inMemoryOverlayMirror,
  overlayReader,
} from "../dist/session/overlay-mirror.js";

const FIXTURE = "test/fixtures/perks.sample.json";
const SLUG = "anthropic/anthropic-startup-program"; // curated in bundled flows.json as manual_review
const d = (router, operation, params = {}) => router.dispatch({ operation, params });

// A minimal in-memory KV (text get/put) for the KV-backed mirror.
const fakeKv = (initial = null) => {
  let value = initial;
  return {
    store: () => value,
    get: async () => value,
    put: async (_k, v) => {
      value = v;
    },
  };
};

test("inMemoryOverlayMirror round-trips an overlay", async () => {
  const m = inMemoryOverlayMirror();
  assert.deepEqual(await m.read(), {});
  await m.write({ "a/b": { automatability: "api" } });
  assert.deepEqual(await m.read(), { "a/b": { automatability: "api" } });
});

test("kvOverlayMirror reads/writes JSON and caches within the TTL", async () => {
  let ticks = 0;
  const now = () => ticks;
  const kv = fakeKv();
  const m = kvOverlayMirror(kv, { ttlMs: 100, now });

  await m.write({ "x/y": { automatability: "web_only" } });
  assert.match(kv.store(), /web_only/, "write persisted JSON to KV");
  assert.deepEqual(await m.read(), { "x/y": { automatability: "web_only" } });

  // An out-of-band KV change is NOT seen until the TTL elapses (cache holds).
  await kv.put("accepted-overlay", JSON.stringify({ "z/z": {} }));
  assert.deepEqual(await m.read(), { "x/y": { automatability: "web_only" } });
  ticks += 200; // TTL elapsed
  assert.deepEqual(await m.read(), { "z/z": {} });
});

test("kvOverlayMirror serves empty on a missing or corrupt value", async () => {
  assert.deepEqual(await kvOverlayMirror(fakeKv(null)).read(), {});
  assert.deepEqual(await kvOverlayMirror(fakeKv("not json{")).read(), {});
});

test("a mirror-backed accepted overlay serves blessed flows without a registry", async () => {
  const mirror = inMemoryOverlayMirror({
    [SLUG]: { automatability: "api", note: "blessed via mirror" },
  });
  const { router } = await buildApp({
    source: FIXTURE,
    acceptedOverlay: overlayReader(mirror),
  });
  // get_application_flow: the mirror entry wins over the bundled curated flow.
  const flow = await d(router, "get_application_flow", { slug: SLUG });
  assert.equal(flow.data.flow.automatability, "api"); // not the bundled "manual_review"

  // export_flows attributes it to the accepted overlay.
  const exp = await d(router, "export_flows");
  assert.equal(exp.data.sources[SLUG], "accepted");
  assert.equal(exp.data.flows[SLUG].note, "blessed via mirror");
});

test("an empty mirror leaves serving unchanged (base flows.json)", async () => {
  const { router } = await buildApp({
    source: FIXTURE,
    acceptedOverlay: overlayReader(inMemoryOverlayMirror()),
  });
  const flow = await d(router, "get_application_flow", { slug: SLUG });
  assert.equal(flow.data.flow.automatability, "manual_review"); // the bundled base, untouched
  const exp = await d(router, "export_flows");
  assert.equal(exp.data.sources[SLUG], "base");
});
