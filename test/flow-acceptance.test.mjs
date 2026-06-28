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
