// §1 (#47 piece C): the discovery brief + the Flow Document contract descriptor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { curatedFlowContract, collectCuratedFlowErrors } from "../dist/data/flows.js";
import {
  buildDiscoveryBrief,
  collectProposalFindings,
  diffFlow,
  scoreFidelity,
} from "../dist/data/discovery.js";
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

test("the brief carries a provenance envelope labeling the directory data untrusted (#97)", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  const res = await d(router, "get_discovery_brief", { slug: "neon/neon-free-tier" });
  assert.equal(res.success, true);
  const p = res.data.provenance;
  assert.equal(p.trust, "untrusted-third-party");
  assert.ok(
    p.untrusted_fields.includes("title") && p.untrusted_fields.includes("gaps"),
  );
  assert.match(p.notice, /not instructions/);
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

test("the contract advertises oauth_provider, matching the validator (#103)", () => {
  const contract = curatedFlowContract();
  assert.ok(Array.isArray(contract.enums.oauth_provider));
  assert.ok(contract.enums.oauth_provider.includes("github"));
  // an advertised provider on an oauth_signup flow validates…
  const advertised = contract.enums.oauth_provider[0];
  assert.deepEqual(
    collectCuratedFlowErrors({
      "x/y": { submission: { method: "oauth_signup", oauth_providers: [advertised] } },
    }),
    [],
  );
  // …and a value it does not advertise is rejected (no drift between brief and gate).
  const errs = collectCuratedFlowErrors({
    "x/y": {
      submission: { method: "oauth_signup", oauth_providers: ["definitely-not-valid"] },
    },
  });
  assert.ok(errs.some((e) => e.includes("oauth_providers")));
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

// ── §2: model-free verify + diff ─────────────────────────────────────────────

test("verify_flow_proposal + diff_flow_proposal are introspectable READ ops", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  const ops = (await d(router, "introspect")).data.operations;
  for (const name of ["verify_flow_proposal", "diff_flow_proposal"]) {
    const op = ops.find((o) => o.name === name);
    assert.ok(op, `${name} is registered`);
    assert.equal(op.semantic_category, "READ");
  }
});

test("a known-good spike candidate passes the structural gates", async () => {
  const flows = new FlowSource();
  await flows.ensureLoaded();
  // The deepgram spike overlay has a `source` docs URL + a `verified` date and keeps eligibility
  // in `gaps` — it should clear schema + provenance + eligibility.
  const candidate = flows.curatedFor("deepgram/deepgram-pricing-startup-credits");
  const v = collectProposalFindings(candidate);
  assert.equal(v.schema_valid, true);
  assert.deepEqual(v.provenance_findings, []);
  assert.deepEqual(v.eligibility_findings, []);
  assert.equal(v.ready_for_proposal, true);
  assert.ok(v.adversarial_checklist.length > 0);
});

test("a substantive candidate with no provenance is flagged, not accepted", async () => {
  const v = collectProposalFindings({
    automatability: "api",
    submission: { method: "oauth_signup", action_url: "https://x.example.com/signup" },
    // no source / sources / verified
  });
  assert.equal(v.schema_valid, true);
  assert.ok(v.provenance_findings.length >= 1, "no provenance → finding");
  assert.equal(v.ready_for_proposal, false);
});

test("asserted eligibility is flagged, never satisfied and never blocking", async () => {
  const v = collectProposalFindings({
    automatability: "manual_review",
    source: "https://provider.example.com/apply",
    verified: "2026-06-28",
    eligible: true, // recording eligibility as data instead of surfacing it in gaps
  });
  assert.ok(
    v.eligibility_findings.some((f) => f.includes("eligibility")),
    "eligibility encoded as data is flagged",
  );
  assert.equal(v.ready_for_proposal, false);
  // The verdict never asserts eligibility nor hard-blocks the perk — it only surfaces a finding.
  assert.ok(!("eligible" in v) && !("blocked" in v));
});

test("verify_flow_proposal errors on an unknown slug", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  const res = await d(router, "verify_flow_proposal", {
    slug: "nope/nope",
    candidate: {},
  });
  assert.equal(res.success, false);
  assert.equal(res.error.code, "NOT_FOUND_RESOURCE");
});

test("diffFlow reports changed + added fields", () => {
  const diff = diffFlow(
    { automatability: "web_only", source: "https://x/apply" },
    { automatability: "api" },
  );
  assert.deepEqual(diff.changed.automatability, { from: "api", to: "web_only" });
  assert.equal(diff.added.source, "https://x/apply");
  assert.deepEqual(diff.removed, []);
});

test("diff_flow_proposal diffs an uncurated slug as all-added", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  // neon/neon-free-tier has no curated overlay entry → every populated field is added.
  const res = await d(router, "diff_flow_proposal", {
    slug: "neon/neon-free-tier",
    candidate: { automatability: "api", danger_level: 0 },
  });
  assert.equal(res.success, true);
  assert.equal(res.data.added.automatability, "api");
  assert.deepEqual(res.data.changed, {});
  assert.deepEqual(res.data.removed, []);
});

// ── §3: discovery entry point + fidelity oracle ──────────────────────────────

test("start_flow_discovery is an introspectable READ op", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  const op = (await d(router, "introspect")).data.operations.find(
    (o) => o.name === "start_flow_discovery",
  );
  assert.ok(op);
  assert.equal(op.semantic_category, "READ");
});

test("start_flow_discovery uses a fresh curated flow", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  // The anthropic spike is curated + recently verified in the bundled overlay.
  const res = await d(router, "start_flow_discovery", {
    slug: "anthropic/anthropic-startup-program",
  });
  assert.equal(res.success, true);
  assert.equal(res.data.action, "use");
  assert.equal(res.data.flow.confidence, "curated");
  assert.equal(res.data.freshness.stale, false);
});

test("start_flow_discovery discovers an uncurated flow, attaching the brief", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  // neon/neon-free-tier has no bundled overlay → a derived baseline → discover.
  const res = await d(router, "start_flow_discovery", { slug: "neon/neon-free-tier" });
  assert.equal(res.data.action, "discover");
  assert.equal(res.data.reason, "uncurated");
  assert.ok(res.data.brief && res.data.brief.target, "the brief is attached");
});

test("start_flow_discovery re-discovers a stale curated flow", async () => {
  const { router } = await buildApp({
    source: FIXTURE,
    flowsSource: "test/fixtures/flows.stale.json", // neon curated, verified 2020 → stale
  });
  const res = await d(router, "start_flow_discovery", { slug: "neon/neon-free-tier" });
  assert.equal(res.data.action, "discover");
  assert.equal(res.data.reason, "stale");
});

test("start_flow_discovery errors on an unknown slug", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  const res = await d(router, "start_flow_discovery", { slug: "nope/nope" });
  assert.equal(res.success, false);
  assert.equal(res.error.code, "NOT_FOUND_RESOURCE");
});

test("scoreFidelity: a spike scored against itself is a perfect match", async () => {
  const flows = new FlowSource();
  await flows.ensureLoaded();
  for (const slug of [
    "deepgram/deepgram-pricing-startup-credits",
    "anthropic/anthropic-startup-program",
    "gcp/google-ai-startup-program",
  ]) {
    const known = flows.curatedFor(slug);
    assert.equal(scoreFidelity(known, known), 1, `${slug} self-fidelity is 1.0`);
  }
});

test("scoreFidelity: a degraded candidate scores lower than the known-good", async () => {
  const flows = new FlowSource();
  await flows.ensureLoaded();
  const known = flows.curatedFor("gcp/google-ai-startup-program");
  const degraded = {
    ...known,
    automatability: "api", // wrong (known is web_only)
    danger_level: 0, // wrong (known is 2)
  };
  assert.ok(scoreFidelity(degraded, known) < 1, "a divergent candidate is < 1.0");
});
