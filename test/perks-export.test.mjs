import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { DataSource } from "../dist/data/source.js";

const prog = (slug) => ({
  slug,
  title: slug,
  provider: slug.split("/")[0],
  url: "https://example.com",
  audience: ["startup"],
  max_value: 100,
  sources: ["https://example.com"],
  verified: "2026-06-29",
});
const feedBody = (name, programs) => JSON.stringify({ name, programs });
const fetchFrom = (map) => async (url) => {
  const body = map[String(url)];
  if (body === undefined) return { ok: false, status: 404, statusText: "Not Found" };
  return { ok: true, text: async () => body };
};
const A = "https://a.example.com/perks.json";
const B = "https://b.example.com/perks.json";
const call = (router, operation, params = {}) => router.dispatch({ operation, params });

const app = () =>
  buildApp({
    sources: [
      { id: "alpha", source: A },
      { id: "beta", source: B },
    ],
    fetchImpl: fetchFrom({
      [A]: feedBody("Alpha", [prog("anthropic/x"), prog("neon/y")]),
      [B]: feedBody("Beta", [prog("grant/z")]),
    }),
  });

test("export_perks emits a valid payload that re-ingests to the same programs", async () => {
  const { router } = await app();
  const res = await call(router, "export_perks");
  assert.equal(res.success, true);
  assert.equal(res.data.count, 3);
  assert.equal(res.data.payload.name, "Alpha"); // the directory (primary) name
  assert.ok(res.data.payload.generated, "carries a generated timestamp");

  // Round-trip: the emitted payload re-ingests as a fresh single-feed directory.
  const url = "https://gen.example.com/perks.json";
  const reingested = new DataSource({
    sources: [url],
    fetchImpl: fetchFrom({ [url]: JSON.stringify(res.data.payload) }),
  });
  await reingested.load();
  assert.equal(reingested.programs().length, 3);
});

test("export_perks strips the server-set feed provenance tag", async () => {
  const { router } = await app();
  const res = await call(router, "export_perks");
  assert.ok(
    res.data.payload.programs.every((p) => p.feed === undefined),
    "no program carries the internal feed tag",
  );
});

test("export_perks: feed filter narrows + name override", async () => {
  const { router } = await app();
  const res = await call(router, "export_perks", { feed: "beta", name: "Just Beta" });
  assert.equal(res.data.count, 1);
  assert.equal(res.data.payload.programs[0].slug, "grant/z");
  assert.equal(res.data.payload.name, "Just Beta");
});

test("export_perks is introspectable as a READ op", async () => {
  const { router } = await app();
  const op = (await call(router, "introspect")).data.operations.find(
    (o) => o.name === "export_perks",
  );
  assert.ok(op);
  assert.equal(op.semantic_category, "READ");
});
