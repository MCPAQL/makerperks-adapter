// §1 (#47 piece C): the discovery brief + the Flow Document contract descriptor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { curatedFlowContract, collectCuratedFlowErrors } from "../dist/data/flows.js";
import { buildDiscoveryBrief } from "../dist/data/discovery.js";
import { FlowSource } from "../dist/data/flow-source.js";

const FIXTURE = "test/fixtures/perks.sample.json";
const d = (router, operation, params = {}) => router.dispatch({ operation, params });

test("get_discovery_brief is an introspectable READ op on every deployment", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  const op = (await d(router, "introspect")).data.operations.find(
    (o) => o.name === "get_discovery_brief",
  );
  assert.ok(op, "get_discovery_brief is registered without any store");
  assert.equal(op.semantic_category, "READ");
});

test("a brief seeds discovery with baseline + gaps + the target contract", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  const res = await d(router, "get_discovery_brief", { slug: "neon/neon-free-tier" });
  assert.equal(res.success, true);
  const b = res.data;
  assert.equal(b.slug, "neon/neon-free-tier");
  assert.ok(b.program && b.baseline);
  assert.ok(
    Array.isArray(b.gaps) && b.gaps.length > 0,
    "the baseline's gaps are surfaced",
  );
  assert.ok(
    Array.isArray(b.target.enums.automatability),
    "the target contract is present",
  );
  assert.ok(
    b.verification_contract.adversarial_checklist.length > 0,
    "the adversarial checklist is handed to the agent",
  );
});

test("the brief's target contract matches what the validator enforces", () => {
  const contract = curatedFlowContract();
  // A value the contract advertises is accepted by the validator…
  const advertised = contract.enums.automatability[0];
  assert.deepEqual(
    collectCuratedFlowErrors({ "x/y": { automatability: advertised } }),
    [],
  );
  // …and a value it does not advertise is rejected (no drift between brief and gate).
  const errs = collectCuratedFlowErrors({
    "x/y": { automatability: "definitely-not-valid" },
  });
  assert.ok(errs.some((e) => e.includes("automatability")));
});

test("get_discovery_brief errors on an unknown slug", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  const res = await d(router, "get_discovery_brief", { slug: "nope/nope" });
  assert.equal(res.success, false);
  assert.equal(res.error.code, "NOT_FOUND_RESOURCE");
});

test("the brief carries the current (possibly curated) flow for re-discovery context", async () => {
  const flows = new FlowSource();
  await flows.ensureLoaded();
  // The anthropic spike is curated in the bundled overlay, so `current` is curated while the
  // `baseline` stays the derived heuristic — the agent sees both on re-discovery.
  const program = {
    slug: "anthropic/anthropic-startup-program",
    title: "Anthropic Startup Program",
    provider: "anthropic",
    url: "https://claude.com/programs/startups",
    audience: ["startup"],
    max_value: 25000,
    sources: [],
    verified: "2026-06-25",
    value_type: "credits",
  };
  const b = buildDiscoveryBrief(program, flows);
  assert.equal(b.current.confidence, "curated");
  assert.equal(b.baseline.confidence, "derived");
});
