import { test } from "node:test";
import assert from "node:assert/strict";
import { DataSource } from "../dist/data/source.js";

const FIXTURE = "test/fixtures/perks.sample.json";

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
