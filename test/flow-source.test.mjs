// §1 (#47 piece A): the FlowSource loader + the migrated flows.json overlay.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FlowSource } from "../dist/data/flow-source.js";
import { curatedFlows } from "../dist/data/provider-flows.js";

const GCP = "gcp/google-ai-startup-program";

test("FlowSource loads the bundled overlay and resolves a slug", async () => {
  const fs = new FlowSource();
  await fs.ensureLoaded();
  const gcp = fs.curatedFor(GCP);
  assert.equal(gcp.automatability, "web_only");
  assert.equal(gcp.danger_level, 2);
  assert.equal(fs.curatedFor("does/not-exist"), undefined);
  assert.equal(Object.keys(fs.all()).length, 3);
});

test("the migrated flows.json is verbatim-equal to the old provider-flows.ts overlay", async () => {
  const fs = new FlowSource();
  await fs.ensureLoaded();
  for (const slug of Object.keys(curatedFlows)) {
    assert.deepEqual(
      fs.curatedFor(slug),
      curatedFlows[slug],
      `flows.json drift for ${slug}`,
    );
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
