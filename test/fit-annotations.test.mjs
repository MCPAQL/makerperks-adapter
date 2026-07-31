// per-user-fit-annotations: fit is personal data — stored per-user, overlaid onto reads
// for that user only, stripped from feeds at ingest, absent without a store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildApp } from "../dist/app.js";
import { inMemoryProfileStore } from "../dist/session/profile.js";

const PERKS_FIXTURE = "test/fixtures/perks.sample.json";

const isoDaysFromNow = (days) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// The accelerators fixture (deadline placeholders resolved), with fit fields INJECTED
// into every program — proving the ingest strip, since the fixture itself is fit-free.
async function acceleratorsBodyWithFit() {
  const raw = await readFile("test/fixtures/accelerators.sample.json", "utf8");
  const payload = JSON.parse(
    raw
      .replace("REPLACE_SOON", isoDaysFromNow(10))
      .replace("REPLACE_LATER", isoDaysFromNow(90)),
  );
  payload.programs = payload.programs.map((p) => ({
    ...p,
    fit: "high",
    fit_note: "feed-injected — must never be served",
  }));
  return JSON.stringify(payload);
}

const ACCEL_URL = "https://feeds.example.com/accelerators.json";
const fetchAccel = (body) => async (url) => {
  if (String(url) !== ACCEL_URL)
    return { ok: false, status: 404, statusText: "Not Found" };
  return { ok: true, text: async () => body };
};

async function appWith(store) {
  const body = await acceleratorsBodyWithFit();
  return buildApp({
    sources: [
      PERKS_FIXTURE,
      { id: "accelerators", source: ACCEL_URL, prefix: "accel" },
    ],
    fetchImpl: fetchAccel(body),
    ...(store ? { profileStore: store } : {}),
  });
}

const d = (router, operation, params = {}) => router.dispatch({ operation, params });

test("feed-supplied fit is stripped at ingest, whatever the feed ships", async () => {
  const { router } = await appWith(inMemoryProfileStore());
  const list = await d(router, "list_programs", { feed: "accelerators" });
  assert.equal(list.success, true);
  assert.ok(list.data.programs.length > 0);
  assert.ok(
    list.data.programs.every((p) => p.fit === undefined && p.fit_note === undefined),
    "no feed-injected fit survives federation",
  );
});

test("set / get / clear round-trip, audited, unknown slug rejected", async () => {
  const store = inMemoryProfileStore();
  const { router } = await appWith(store);

  const bad = await d(router, "set_program_fit", { slug: "no/such", fit: "high" });
  assert.equal(bad.success, false);
  assert.equal(bad.error.code, "NOT_FOUND_RESOURCE");

  const set = await d(router, "set_program_fit", {
    slug: "accel:soon/program",
    fit: "high",
    note: "my own words",
  });
  assert.equal(set.success, true);
  assert.equal(set.data.annotation.fit, "high");

  const got = await d(router, "get_fit_annotations", {});
  assert.equal(got.data.count, 1);
  assert.equal(got.data.annotations["accel:soon/program"].note, "my own words");
  const audit = (await store.get()).audit;
  assert.ok(audit.some((a) => a.action === "set_program_fit"));

  const cleared = await d(router, "clear_program_fit", { slug: "accel:soon/program" });
  assert.equal(cleared.data.cleared, true);
  assert.equal((await d(router, "get_fit_annotations", {})).data.count, 0);
});

test("reads overlay the session user's fit — and only theirs", async () => {
  const store = inMemoryProfileStore();
  const { router } = await appWith(store);
  await d(router, "set_program_fit", {
    slug: "accel:rolling/program",
    fit: "high",
    note: "top pick",
  });

  const got = await d(router, "get_program", { slug: "accel:rolling/program" });
  assert.equal(got.data.program.fit, "high");
  assert.equal(got.data.program.fit_note, "top pick");

  const list = await d(router, "list_programs", { feed: "accelerators" });
  const annotated = list.data.programs.find((p) => p.slug === "accel:rolling/program");
  const other = list.data.programs.find((p) => p.slug === "accel:soon/program");
  assert.equal(annotated.fit, "high");
  assert.equal(other.fit, undefined, "unannotated programs carry no fit");

  const search = await d(router, "search_programs", { query: "Rolling Program" });
  assert.equal(
    search.data.programs.find((p) => p.slug === "accel:rolling/program").fit,
    "high",
  );

  const radar = await d(router, "upcoming_deadlines", {});
  assert.equal(
    radar.data.rolling.find((x) => x.slug === "accel:rolling/program").fit,
    "high",
  );
  assert.ok(radar.data.deadlines.every((x) => x.fit === undefined));
});

test("no store → no fit ops registered and no fit served", async () => {
  const { router } = await appWith(undefined);
  const set = await d(router, "set_program_fit", {
    slug: "accel:soon/program",
    fit: "high",
  });
  assert.equal(set.success, false, "fit ops are not registered without a store");
  const list = await d(router, "list_programs", { feed: "accelerators" });
  assert.ok(list.data.programs.every((p) => p.fit === undefined));
});
