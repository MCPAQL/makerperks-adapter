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

// ── §2: the read surface over a federated directory ──────────────────────────
import { buildApp } from "../dist/app.js";

const twoFeedApp = (fetchImpl) =>
  buildApp({
    sources: [
      { id: "alpha", source: A },
      { id: "beta", source: B },
    ],
    fetchImpl,
  });
const call = (router, operation, params = {}) => router.dispatch({ operation, params });

test("list_programs feed filter narrows to one feed; list_sources reports health", async () => {
  const { router } = await twoFeedApp(
    fetchFrom({
      [A]: feed("Alpha", [prog("anthropic/x"), prog("neon/y")]),
      [B]: feed("Beta", [prog("grant/z")]),
    }),
  );
  const all = await call(router, "list_programs");
  assert.equal(all.data.count, 3);

  const beta = await call(router, "list_programs", { feed: "beta" });
  assert.equal(beta.data.count, 1);
  assert.equal(beta.data.programs[0].slug, "grant/z");

  const sources = await call(router, "list_sources");
  assert.equal(sources.data.count, 2);
  assert.equal(sources.data.sources.find((s) => s.id === "alpha").count, 2);
});

test("list_sources surfaces a failed feed while the directory still serves", async () => {
  const { router } = await twoFeedApp(
    fetchFrom({ [A]: feed("Alpha", [prog("anthropic/x")]), [B]: 500 }),
  );
  assert.equal((await call(router, "list_programs")).data.count, 1);
  const beta = (await call(router, "list_sources")).data.sources.find(
    (s) => s.id === "beta",
  );
  assert.equal(beta.status, "failed");
  assert.match(beta.error, /500/);
});

test("list_sources is introspectable as a READ op", async () => {
  const { router } = await twoFeedApp(
    fetchFrom({ [A]: feed("Alpha", [prog("anthropic/x")]), [B]: feed("Beta", []) }),
  );
  const op = (await call(router, "introspect")).data.operations.find(
    (o) => o.name === "list_sources",
  );
  assert.ok(op);
  assert.equal(op.semantic_category, "READ");
});

// ── parseSourcesEnv (deploy config) ──────────────────────────────────────────
import { parseSourcesEnv } from "../dist/data/source.js";

test("parseSourcesEnv: comma list, JSON array, and blank", () => {
  assert.deepEqual(parseSourcesEnv(" https://a/perks.json, ./grants.json "), [
    "https://a/perks.json",
    "./grants.json",
  ]);
  assert.deepEqual(
    parseSourcesEnv(
      '[{"id":"grants","source":"https://x/grants.json","prefix":"grants"}]',
    ),
    [{ id: "grants", source: "https://x/grants.json", prefix: "grants" }],
  );
  assert.deepEqual(parseSourcesEnv("  "), []);
});

test("parseSourcesEnv: a comma-list env federates end to end", async () => {
  const ds = new DataSource({
    sources: parseSourcesEnv(`${A},${B}`),
    fetchImpl: fetchFrom({
      [A]: feed("Alpha", [prog("anthropic/x")]),
      [B]: feed("Beta", [prog("grant/z")]),
    }),
  });
  await ds.load();
  assert.equal(ds.programs().length, 2);
  assert.equal(ds.sources()[0].id, "a.example.com"); // bare URL → derived id
});
