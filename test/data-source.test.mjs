import { test } from "node:test";
import assert from "node:assert/strict";
import { DataSource } from "../dist/data/source.js";
import { sha256Hex } from "../dist/data/untrusted.js";

const FIXTURE = "test/fixtures/perks.sample.json";

// #97 feed provenance fixtures
const onePerk = (slug = "p/0") =>
  JSON.stringify({
    name: "MakerPerks",
    count: 1,
    programs: [
      {
        slug,
        title: "P",
        provider: "p",
        url: "https://x.test/",
        audience: [],
        max_value: 0,
        sources: ["s"],
        verified: "2026-06-25",
      },
    ],
  });

test("loads and serves the fixture", async () => {
  const ds = new DataSource({ source: FIXTURE });
  await ds.load();
  assert.equal(ds.programs().length, 2);
  assert.equal(ds.meta().name, "MakerPerks");
});

test("fails loud on a schema-invalid payload", async () => {
  const ds = new DataSource({ source: "test/fixtures/perks.invalid.json" });
  await assert.rejects(() => ds.load(), /schema validation/);
});

test("throws if queried before load", () => {
  const ds = new DataSource({ source: FIXTURE });
  assert.throws(() => ds.programs(), /not loaded/);
});

test("refresh reflects upstream changes (injected fetch)", async () => {
  let count = 1;
  const make = (n) =>
    JSON.stringify({
      name: "MakerPerks",
      count: n,
      programs: Array.from({ length: n }, (_unused, i) => ({
        slug: `p/${i}`,
        title: `P${i}`,
        provider: "p",
        url: "https://x.test/",
        audience: ["startup"],
        max_value: 0,
        sources: ["s"],
        verified: "2026-06-25",
      })),
    });
  const fetchImpl = async () => new Response(make(count), { status: 200 });
  const ds = new DataSource({ source: "https://example.test/perks.json", fetchImpl });
  await ds.load();
  assert.equal(ds.programs().length, 1);
  count = 3;
  await ds.refresh();
  assert.equal(ds.programs().length, 3);
});

// ── #97 feed provenance: trust classification + integrity verification ─────────

test("primary feed is trusted; an additional federated feed is untrusted by default (#97)", async () => {
  const fetchImpl = async () => new Response(onePerk(), { status: 200 });
  const ds = new DataSource({
    sources: [
      { id: "primary", source: "https://a.test/perks.json" },
      { id: "extra", source: "https://b.test/perks.json", prefix: "x" },
    ],
    fetchImpl,
  });
  await ds.load();
  const s = ds.sources();
  assert.equal(s.find((f) => f.id === "primary").trust, "trusted");
  assert.equal(s.find((f) => f.id === "extra").trust, "untrusted");
  assert.equal(ds.feedTrust("primary"), "trusted");
  assert.equal(ds.feedTrust("extra"), "untrusted");
  assert.equal(ds.feedTrust("unknown"), "untrusted"); // unknown feed is untrusted (fail safe)
  assert.equal(ds.feedTrust(undefined), "untrusted");
});

test("an operator can mark an additional feed trusted (#97)", async () => {
  const fetchImpl = async () => new Response(onePerk(), { status: 200 });
  const ds = new DataSource({
    sources: [
      { id: "primary", source: "https://a.test/perks.json" },
      {
        id: "extra",
        source: "https://b.test/perks.json",
        prefix: "x",
        trust: "trusted",
      },
    ],
    fetchImpl,
  });
  await ds.load();
  assert.equal(ds.feedTrust("extra"), "trusted");
});

test("a verifying integrity hash classifies an extra feed as trusted (#97)", async () => {
  const body = onePerk();
  const integrity = await sha256Hex(body);
  const fetchImpl = async () => new Response(body, { status: 200 });
  const ds = new DataSource({
    sources: [
      { id: "primary", source: "https://a.test/perks.json" },
      { id: "pinned", source: "https://b.test/perks.json", prefix: "x", integrity },
    ],
    fetchImpl,
  });
  await ds.load();
  assert.equal(ds.feedTrust("pinned"), "trusted");
});

test("an explicit trust:untrusted is NOT auto-upgraded by a verifying integrity (#97)", async () => {
  const body = onePerk();
  const integrity = await sha256Hex(body);
  const fetchImpl = async () => new Response(body, { status: 200 });
  const ds = new DataSource({
    sources: [
      { id: "primary", source: "https://a.test/perks.json" },
      {
        id: "pinned-untrusted",
        source: "https://b.test/perks.json",
        prefix: "x",
        trust: "untrusted",
        integrity, // pinned for reproducibility, but operator marked it untrusted
      },
    ],
    fetchImpl,
  });
  await ds.load();
  // the feed loads (integrity verifies, programs served) but stays untrusted (operator's explicit call)
  assert.equal(ds.feedTrust("pinned-untrusted"), "untrusted");
  assert.equal(ds.programs().length, 2);
});

test("an integrity mismatch drops the feed fail-soft; siblings still serve (#97)", async () => {
  const fetchImpl = async () => new Response(onePerk(), { status: 200 });
  const ds = new DataSource({
    sources: [
      { id: "primary", source: "https://a.test/perks.json" },
      {
        id: "bad",
        source: "https://b.test/perks.json",
        prefix: "x",
        integrity: "deadbeef",
      },
    ],
    fetchImpl,
  });
  await ds.load();
  const bad = ds.sources().find((f) => f.id === "bad");
  assert.equal(bad.status, "failed");
  assert.match(bad.error, /integrity mismatch/);
  assert.equal(ds.programs().length, 1); // the primary feed still served
});

test("a lone feed with a bad integrity hash stays loud (throws) (#97)", async () => {
  const fetchImpl = async () => new Response(onePerk(), { status: 200 });
  const ds = new DataSource({
    sources: [
      { id: "only", source: "https://a.test/perks.json", integrity: "deadbeef" },
    ],
    fetchImpl,
  });
  await assert.rejects(() => ds.load(), /integrity mismatch/);
});
