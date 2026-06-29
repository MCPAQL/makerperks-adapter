import { test } from "node:test";
import assert from "node:assert/strict";
import { DataSource } from "../dist/data/source.js";

// A valid PerkProgram with the required fields; override as needed.
const prog = (slug, extra = {}) => ({
  slug,
  title: slug,
  provider: slug.split("/")[0],
  url: "https://example.com",
  audience: ["startup"],
  max_value: 100,
  sources: ["https://example.com"],
  verified: "2026-06-29",
  ...extra,
});

const feed = (name, programs) => JSON.stringify({ name, programs });

// An injected fetch that serves a canned payload (or a 500) per URL.
const fetchFrom = (map) => async (url) => {
  const body = map[String(url)];
  if (body === undefined) return { ok: false, status: 404, statusText: "Not Found" };
  if (body === 500) return { ok: false, status: 500, statusText: "Server Error" };
  return { ok: true, text: async () => body };
};

const A = "https://a.example.com/perks.json";
const B = "https://b.example.com/perks.json";

test("two bare feeds federate; a slug collision resolves to the higher-priority feed", async () => {
  const ds = new DataSource({
    sources: [
      { id: "alpha", source: A },
      { id: "beta", source: B },
    ],
    fetchImpl: fetchFrom({
      [A]: feed("Alpha", [prog("anthropic/x"), prog("neon/y")]),
      [B]: feed("Beta", [prog("anthropic/x", { title: "B's dup" }), prog("grant/z")]),
    }),
  });
  await ds.load();
  const programs = ds.programs();
  assert.equal(programs.length, 3); // a/x (A wins), n/y (A), g/z (B)
  const ax = programs.find((p) => p.slug === "anthropic/x");
  assert.equal(
    ax.title,
    "anthropic/x",
    "the higher-priority feed A wins the collision",
  );
  assert.equal(ax.feed, "alpha", "provenance is the winning feed");

  const sources = ds.sources();
  const beta = sources.find((s) => s.id === "beta");
  assert.equal(beta.status, "ok");
  assert.equal(beta.count, 1); // only grant/z survived
  assert.equal(beta.collisions_dropped, 1); // anthropic/x dropped
});

test("a prefixed feed is isolated and never collides", async () => {
  const ds = new DataSource({
    sources: [
      { id: "alpha", source: A },
      { id: "grants", source: B, prefix: "grants" },
    ],
    fetchImpl: fetchFrom({
      [A]: feed("Alpha", [prog("anthropic/x")]),
      [B]: feed("Beta", [prog("anthropic/x"), prog("grant/z")]),
    }),
  });
  await ds.load();
  const slugs = ds
    .programs()
    .map((p) => p.slug)
    .sort();
  assert.deepEqual(slugs, ["anthropic/x", "grants:anthropic/x", "grants:grant/z"]);
  assert.equal(ds.sources().find((s) => s.id === "grants").collisions_dropped, 0);
  assert.equal(ds.programs().find((p) => p.slug === "grants:grant/z").feed, "grants");
});

test("feed provenance is server-set, overwriting any feed-supplied value", async () => {
  const ds = new DataSource({
    sources: [{ id: "alpha", source: A }],
    fetchImpl: fetchFrom({
      [A]: feed("Alpha", [prog("anthropic/x", { feed: "spoofed" })]),
    }),
  });
  await ds.load();
  assert.equal(ds.programs()[0].feed, "alpha");
});

test("fail-soft: a bad feed is skipped + surfaced while the rest serve", async () => {
  const ds = new DataSource({
    sources: [
      { id: "alpha", source: A },
      { id: "beta", source: B },
    ],
    fetchImpl: fetchFrom({
      [A]: feed("Alpha", [prog("anthropic/x")]),
      [B]: 500,
    }),
  });
  await ds.load();
  assert.equal(ds.programs().length, 1, "alpha still serves");
  const beta = ds.sources().find((s) => s.id === "beta");
  assert.equal(beta.status, "failed");
  assert.match(beta.error, /500/);
  assert.equal(beta.count, 0);
});

test("a lone failing feed still throws (never silently empty)", async () => {
  const ds = new DataSource({
    sources: [{ id: "only", source: B }],
    fetchImpl: fetchFrom({ [B]: 500 }),
  });
  await assert.rejects(() => ds.load(), /500/);
});

test("derived feed id + federated meta count", async () => {
  const ds = new DataSource({
    sources: [A], // bare string → id derived from host
    fetchImpl: fetchFrom({ [A]: feed("Alpha", [prog("anthropic/x"), prog("neon/y")]) }),
  });
  await ds.load();
  assert.equal(ds.sources()[0].id, "a.example.com");
  assert.equal(ds.meta().count, 2);
  assert.equal(ds.meta().name, "Alpha");
});
