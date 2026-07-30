// serve-accelerators-feed: the perks.json-family checker generalization, audience
// normalization, federation of the accelerators feed, and upcoming_deadlines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DataSource, collectPayloadErrors } from "../dist/data/source.js";
import { buildApp } from "../dist/app.js";

const PERKS_FIXTURE = "test/fixtures/perks.sample.json";

// The accelerators fixture with its deadline placeholders resolved relative to today,
// so days_left assertions never rot.
const isoDaysFromNow = (days) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function acceleratorsBody({ soonDays = 10, laterDays = 90 } = {}) {
  const raw = await readFile("test/fixtures/accelerators.sample.json", "utf8");
  return raw
    .replace("REPLACE_SOON", isoDaysFromNow(soonDays))
    .replace("REPLACE_LATER", isoDaysFromNow(laterDays));
}

const ACCEL_URL = "https://feeds.example.com/accelerators.json";
const fetchAccel = (body) => async (url) => {
  if (String(url) !== ACCEL_URL)
    return { ok: false, status: 404, statusText: "Not Found" };
  return { ok: true, text: async () => body };
};

// An app federating the perks fixture (local path, primary) + the accelerators feed
// (URL via injected fetch, prefixed `accel`).
async function federatedApp(opts = {}) {
  const body = await acceleratorsBody(opts);
  return buildApp({
    sources: [
      PERKS_FIXTURE,
      { id: "accelerators", source: ACCEL_URL, prefix: "accel" },
    ],
    fetchImpl: fetchAccel(body),
  });
}

const d = (router, operation, params = {}) => router.dispatch({ operation, params });

test("the checker accepts accelerator-family programs (no audience, open vocabularies)", async () => {
  const body = await acceleratorsBody();
  const errors = collectPayloadErrors(JSON.parse(body));
  assert.deepEqual(errors, []);
});

test("the shared core is still enforced and family fields are type-checked", () => {
  const errors = collectPayloadErrors({
    name: "bad",
    programs: [
      {
        // slug missing, max_value missing
        title: "x",
        provider: "x",
        url: "https://x.example.com",
        verified: "2026-07-29",
        sources: [],
        next_deadline: 42, // wrong type
        apply_url: { nope: true }, // wrong type
      },
    ],
  });
  assert.ok(errors.some((e) => e.includes("/slug")));
  assert.ok(errors.some((e) => e.includes("/max_value")));
  assert.ok(errors.some((e) => e.includes("/next_deadline")));
  assert.ok(errors.some((e) => e.includes("/apply_url")));
});

test("accelerator programs federate prefixed, with audience normalized to []", async () => {
  const body = await acceleratorsBody();
  const ds = new DataSource({
    sources: [
      PERKS_FIXTURE,
      { id: "accelerators", source: ACCEL_URL, prefix: "accel" },
    ],
    fetchImpl: fetchAccel(body),
  });
  await ds.load();
  const accel = ds.programs().filter((p) => p.feed === "accelerators");
  assert.equal(accel.length, 5);
  assert.ok(accel.every((p) => p.slug.startsWith("accel:")));
  assert.ok(accel.every((p) => Array.isArray(p.audience) && p.audience.length === 0));
  const statuses = ds.sources();
  assert.equal(statuses.find((s) => s.id === "accelerators").status, "ok");
});

test("upcoming_deadlines windows, orders, and computes days_left", async () => {
  const { router } = await federatedApp({ soonDays: 10, laterDays: 90 });
  const inWindow = await d(router, "upcoming_deadlines", { within_days: 30 });
  assert.equal(inWindow.success, true);
  assert.deepEqual(
    inWindow.data.deadlines.map((x) => x.slug),
    ["accel:soon/program"],
  );
  assert.equal(inWindow.data.deadlines[0].days_left, 10);
  assert.equal(inWindow.data.deadlines[0].apply_url, "https://soon.example.com/apply");

  const wide = await d(router, "upcoming_deadlines", { within_days: 365 });
  assert.deepEqual(
    wide.data.deadlines.map((x) => x.slug),
    ["accel:soon/program", "accel:later/program"], // soonest first
  );
  // The past deadline is excluded regardless of window.
  assert.ok(!wide.data.deadlines.some((x) => x.slug === "accel:past/program"));
});

test("rolling is explicit null only — perks programs and Defunct never appear", async () => {
  const { router } = await federatedApp();
  const res = await d(router, "upcoming_deadlines", {});
  assert.equal(res.success, true);
  assert.deepEqual(
    res.data.rolling.map((x) => x.slug),
    ["accel:rolling/program"], // not dead/program (Defunct), nothing from perks
  );
  assert.ok(res.data.rolling.every((x) => x.feed === "accelerators"));

  const noRolling = await d(router, "upcoming_deadlines", { include_rolling: false });
  assert.deepEqual(noRolling.data.rolling, []);
});

test("the status filter passes the accelerator vocabulary through list_programs", async () => {
  const { router } = await federatedApp();
  const defunct = await d(router, "list_programs", {
    status: "Defunct",
    include_inactive: true,
  });
  assert.equal(defunct.success, true);
  assert.deepEqual(
    defunct.data.programs.map((p) => p.slug),
    ["accel:dead/program"],
  );
});

test("search reaches accelerator programs across the federation", async () => {
  const { router } = await federatedApp();
  const res = await d(router, "search_programs", { query: "Rolling Program" });
  assert.equal(res.success, true);
  assert.ok(res.data.programs.some((p) => p.slug === "accel:rolling/program"));
});
