// §1 (#47 piece D): the FlowRegistry seam + the proposed-flow review queue (CRUD).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { inMemoryFlowRegistry } from "../dist/session/flow-registry.js";

const FIXTURE = "test/fixtures/perks.sample.json";
const SLUG = "neon/neon-free-tier"; // uncurated in the fixture → diff is all-added
const withQueue = () =>
  buildApp({ source: FIXTURE, flowRegistry: inMemoryFlowRegistry() });
const d = (router, operation, params = {}) => router.dispatch({ operation, params });

// A schema-valid, well-sourced candidate that clears the verify gate.
const READY = {
  automatability: "api",
  submission: { method: "oauth_signup", action_url: "https://x.example.com/signup" },
  redemption: { type: "auto" },
  danger_level: 0,
  source: "https://x.example.com/signup",
  verified: "2026-06-28",
};
// Same shape but no provenance / verified → the server's verify must flag it not-ready.
const NOT_READY = {
  automatability: "api",
  submission: { method: "oauth_signup", action_url: "https://x.example.com/signup" },
};

test("acceptance queue ops register only with a FlowRegistry", async () => {
  const { router } = await withQueue();
  const ops = (await d(router, "introspect")).data.operations.map((o) => o.name);
  for (const n of [
    "propose_flow",
    "list_proposed_flows",
    "update_proposed_flow",
    "reject_flow",
  ]) {
    assert.ok(ops.includes(n), `${n} registered with a registry`);
  }
  const { router: noReg } = await buildApp({ source: FIXTURE });
  const noOps = (await d(noReg, "introspect")).data.operations.map((o) => o.name);
  assert.ok(!noOps.includes("propose_flow") && !noOps.includes("list_proposed_flows"));
});

test("a proposal enters pending and lists with its verdict + diff", async () => {
  const { router } = await withQueue();
  const res = await d(router, "propose_flow", { slug: SLUG, candidate: READY });
  assert.equal(res.success, true);
  assert.equal(res.data.status, "pending");
  assert.equal(res.data.verdict.ready_for_proposal, true);

  const list = await d(router, "list_proposed_flows", { status: "pending" });
  assert.equal(list.data.count, 1);
  const p = list.data.proposals[0];
  assert.equal(p.slug, SLUG);
  assert.equal(p.ready_for_proposal, true);
  assert.ok(
    p.diff.added.automatability === "api",
    "diff vs the served (uncurated) flow is all-added",
  );
});

test("the server re-runs verify authoritatively (caller cannot claim ready)", async () => {
  const { router } = await withQueue();
  // The op takes no verdict param; even a 'ready'-looking candidate that lacks provenance is
  // flagged not-ready by the server's own re-run.
  const res = await d(router, "propose_flow", { slug: SLUG, candidate: NOT_READY });
  assert.equal(res.data.verdict.ready_for_proposal, false);
  assert.ok(res.data.verdict.provenance_findings.length >= 1);
});

test("update_proposed_flow re-verifies a pending proposal", async () => {
  const { router } = await withQueue();
  const { data: created } = await d(router, "propose_flow", {
    slug: SLUG,
    candidate: NOT_READY,
  });
  assert.equal(created.verdict.ready_for_proposal, false);

  const upd = await d(router, "update_proposed_flow", {
    id: created.id,
    candidate: READY,
  });
  assert.equal(upd.success, true);
  assert.equal(upd.data.verdict.ready_for_proposal, true);
});

test("reject_flow records a reason and the proposal leaves pending", async () => {
  const { router } = await withQueue();
  const { data: created } = await d(router, "propose_flow", {
    slug: SLUG,
    candidate: READY,
  });
  const rej = await d(router, "reject_flow", {
    id: created.id,
    reason: "duplicate of an existing flow",
  });
  assert.equal(rej.data.status, "rejected");
  assert.equal(rej.data.reason, "duplicate of an existing flow");

  const pending = await d(router, "list_proposed_flows", { status: "pending" });
  assert.equal(pending.data.count, 0);
  const rejected = await d(router, "list_proposed_flows", { status: "rejected" });
  assert.equal(rejected.data.count, 1);
});

test("a decided proposal cannot be revised", async () => {
  const { router } = await withQueue();
  const { data: created } = await d(router, "propose_flow", {
    slug: SLUG,
    candidate: READY,
  });
  await d(router, "reject_flow", { id: created.id });
  const upd = await d(router, "update_proposed_flow", {
    id: created.id,
    candidate: READY,
  });
  assert.equal(upd.success, false);
  assert.equal(upd.error.code, "CONFLICT_EXISTS");
});

test("propose_flow errors on an unknown slug; update/reject error on an unknown id", async () => {
  const { router } = await withQueue();
  const noSlug = await d(router, "propose_flow", {
    slug: "nope/nope",
    candidate: READY,
  });
  assert.equal(noSlug.error.code, "NOT_FOUND_RESOURCE");
  const noId = await d(router, "update_proposed_flow", {
    id: "missing",
    candidate: READY,
  });
  assert.equal(noId.error.code, "NOT_FOUND_RESOURCE");
  const noRej = await d(router, "reject_flow", { id: "missing" });
  assert.equal(noRej.error.code, "NOT_FOUND_RESOURCE");
});

// ── §2: the acceptance dial + accept + live serving ──────────────────────────

const ready = (danger) => ({
  automatability: "api",
  submission: { method: "oauth_signup", action_url: "https://x.example.com/signup" },
  redemption: { type: "auto" },
  danger_level: danger,
  source: "https://x.example.com/signup",
  verified: "2026-06-28",
});

test("the dial defaults to review_each and rejects an invalid mode", async () => {
  const { router } = await withQueue();
  assert.equal((await d(router, "get_acceptance_mode")).data.mode, "review_each");
  const bad = await d(router, "set_acceptance_mode", { mode: "yolo" });
  assert.equal(bad.success, false); // enum validation
  await d(router, "set_acceptance_mode", { mode: "full_auto" });
  assert.equal((await d(router, "get_acceptance_mode")).data.mode, "full_auto");
});

test("review_each keeps every proposal pending", async () => {
  const { router } = await withQueue();
  const res = await d(router, "propose_flow", { slug: SLUG, candidate: ready(0) });
  assert.equal(res.data.status, "pending");
  assert.ok(!res.data.auto_accepted);
});

test("auto_low_risk auto-accepts ready danger<=1 and escalates the rest", async () => {
  const { router } = await withQueue();
  await d(router, "set_acceptance_mode", { mode: "auto_low_risk" });
  assert.equal(
    (await d(router, "propose_flow", { slug: SLUG, candidate: ready(1) })).data.status,
    "accepted",
  );
  assert.equal(
    (await d(router, "propose_flow", { slug: SLUG, candidate: ready(2) })).data.status,
    "pending",
  );
  // not-ready (no provenance) stays pending even at danger 0
  assert.equal(
    (
      await d(router, "propose_flow", {
        slug: SLUG,
        candidate: { automatability: "api" },
      })
    ).data.status,
    "pending",
  );
});

test("full_auto auto-accepts danger<=2 but never danger>=3", async () => {
  const { router } = await withQueue();
  await d(router, "set_acceptance_mode", { mode: "full_auto" });
  assert.equal(
    (await d(router, "propose_flow", { slug: SLUG, candidate: ready(2) })).data.status,
    "accepted",
  );
  assert.equal(
    (await d(router, "propose_flow", { slug: SLUG, candidate: ready(3) })).data.status,
    "pending",
  );
});

test("accept_flow publishes a ready proposal; it is then served live as curated", async () => {
  const { router } = await withQueue();
  const { data: created } = await d(router, "propose_flow", {
    slug: SLUG,
    candidate: ready(0),
  });
  // before acceptance: the served flow is the derived baseline
  assert.equal(
    (await d(router, "get_application_flow", { slug: SLUG })).data.flow.confidence,
    "derived",
  );

  const acc = await d(router, "accept_flow", { id: created.id });
  assert.equal(acc.data.accepted, true);
  assert.equal(acc.data.status, "accepted");

  const served = await d(router, "get_application_flow", { slug: SLUG });
  assert.equal(served.data.flow.confidence, "curated");
  assert.equal(served.data.flow.automatability, "api");
});

test("with no registry wired, serving is unchanged (derived baseline)", async () => {
  const { router } = await buildApp({ source: FIXTURE });
  const served = await d(router, "get_application_flow", { slug: SLUG });
  assert.equal(served.data.flow.confidence, "derived");
});

test("accept_flow is the explicit human path for danger>=3", async () => {
  const { router } = await withQueue();
  await d(router, "set_acceptance_mode", { mode: "full_auto" });
  const { data: created } = await d(router, "propose_flow", {
    slug: SLUG,
    candidate: ready(3),
  });
  assert.equal(created.status, "pending"); // never auto-accepted
  const acc = await d(router, "accept_flow", { id: created.id });
  assert.equal(acc.data.accepted, true); // explicit human accept allowed
});

test("accept_flow refuses a not-ready proposal and publishes nothing", async () => {
  const { router } = await withQueue();
  const { data: created } = await d(router, "propose_flow", {
    slug: SLUG,
    candidate: { automatability: "api" },
  });
  const acc = await d(router, "accept_flow", { id: created.id });
  assert.equal(acc.data.accepted, false);
  assert.ok(acc.data.verdict.provenance_findings.length >= 1);
  assert.equal(
    (await d(router, "get_application_flow", { slug: SLUG })).data.flow.confidence,
    "derived",
  );
});

test("accept_flow errors on an unknown id and on an already-decided proposal", async () => {
  const { router } = await withQueue();
  assert.equal(
    (await d(router, "accept_flow", { id: "missing" })).error.code,
    "NOT_FOUND_RESOURCE",
  );
  const { data: created } = await d(router, "propose_flow", {
    slug: SLUG,
    candidate: ready(0),
  });
  await d(router, "accept_flow", { id: created.id });
  assert.equal(
    (await d(router, "accept_flow", { id: created.id })).error.code,
    "CONFLICT_EXISTS",
  );
});

test("start_flow_discovery uses an accepted flow instead of re-discovering", async () => {
  const { router } = await withQueue();
  const { data: created } = await d(router, "propose_flow", {
    slug: SLUG,
    candidate: ready(0),
  });
  // before acceptance neon is uncurated → discover
  assert.equal(
    (await d(router, "start_flow_discovery", { slug: SLUG })).data.action,
    "discover",
  );
  await d(router, "accept_flow", { id: created.id });
  // after acceptance the fresh accepted flow is used
  const after = await d(router, "start_flow_discovery", { slug: SLUG });
  assert.equal(after.data.action, "use");
  assert.equal(after.data.flow.confidence, "curated");
});

// ── attribution: proposed_by (#73) ───────────────────────────────────────────

const withQueueAs = (proposer) =>
  buildApp({ source: FIXTURE, flowRegistry: inMemoryFlowRegistry(), proposer });

test("a proposal records the authenticated subject and lists it", async () => {
  const { router } = await withQueueAs("gh|1001");
  await d(router, "propose_flow", { slug: SLUG, candidate: ready(0) });
  const list = await d(router, "list_proposed_flows", {});
  assert.equal(list.data.proposals[0].proposed_by, "gh|1001");
});

test("a revised proposal keeps the original proposer", async () => {
  const { router } = await withQueueAs("gh|1001");
  const { data: created } = await d(router, "propose_flow", {
    slug: SLUG,
    candidate: ready(0),
  });
  await d(router, "update_proposed_flow", { id: created.id, candidate: ready(1) });
  const list = await d(router, "list_proposed_flows", {});
  assert.equal(list.data.proposals[0].proposed_by, "gh|1001");
});

test("proposed_by is server-set (no caller param) and absent when unattributed", async () => {
  const { router } = await withQueue(); // no proposer wired
  // `proposed_by` is not a declared param — supplying it is rejected as unknown.
  const spoof = await d(router, "propose_flow", {
    slug: SLUG,
    candidate: ready(0),
    proposed_by: "gh|9999",
  });
  assert.equal(spoof.success, false);
  assert.equal(spoof.error.code, "VALIDATION_UNKNOWN_PARAM");
  // a normal propose with no proposer wired is simply unattributed
  await d(router, "propose_flow", { slug: SLUG, candidate: ready(0) });
  const list = await d(router, "list_proposed_flows", {});
  assert.equal(list.data.proposals[0].proposed_by, undefined);
});
