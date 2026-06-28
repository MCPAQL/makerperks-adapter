// §1 (#21): the web-only handoff builder + get_handoff op. The package assembles non-secret
// inputs from the profile, keeps credential fields pending (no value), and surfaces eligibility
// without deciding or hard-blocking it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { inMemorySessionStore } from "../dist/session/state.js";
import { inMemoryProfileStore } from "../dist/session/profile.js";
import { buildHandoff } from "../dist/operations/handoff.js";

const FIXTURE = "test/fixtures/perks.sample.json";
const ANTHROPIC = "anthropic/anthropic-startup-program"; // curated: manual_review, danger 2

const webFlow = {
  slug: "x/y",
  provider: "x",
  title: "X Startup Program",
  automatability: "web_only",
  confidence: "curated",
  required_inputs: [
    { key: "email", type: "email", required: true, source: "profile" },
    { key: "full_name", type: "string", required: true, source: "profile" },
    {
      key: "billing_account_id",
      type: "string",
      required: true,
      source: "credential",
      note: "GCP billing id",
    },
  ],
  submission: {
    method: "web_form",
    action_url: "https://apply.example",
    instructions: "Apply on the web form.",
  },
  redemption: { type: "manual_review" },
  danger_level: 2,
  gaps: ["eligibility must be verified by the maker"],
  source: "https://apply.example",
};
const execution = (inputs = {}) => ({
  id: "e",
  slug: "x/y",
  stage: "submission",
  status: "running",
  inputs,
  log: [],
  createdAt: 0,
});
const profile = (identity) => ({
  identity,
  projects: [],
  createdAt: 0,
  updatedAt: 0,
});

test("buildHandoff: profile fields assemble; a credential field stays pending with no value", () => {
  const pkg = buildHandoff(
    webFlow,
    execution(),
    profile({ name: "Mick", email: "mick@x.test" }),
  );
  const assembledKeys = pkg.assembled_inputs.map((i) => i.key).sort();
  assert.deepEqual(assembledKeys, ["email", "full_name"]);
  assert.equal(
    pkg.assembled_inputs.find((i) => i.key === "email").value,
    "mick@x.test",
  );

  const cred = pkg.pending_inputs.find((i) => i.key === "billing_account_id");
  assert.equal(cred.reason, "credential");
  assert.equal("value" in cred, false); // never carries a value
  assert.match(cred.note, /out-of-band/);

  assert.equal(pkg.action_url, "https://apply.example");
  assert.equal(pkg.danger_level, 2);
  assert.deepEqual(pkg.gaps, ["eligibility must be verified by the maker"]);
});

test("buildHandoff: per-call/accumulated inputs override profile-derived values", () => {
  const pkg = buildHandoff(
    webFlow,
    execution({ email: "exec@x.test" }),
    profile({ name: "Mick", email: "mick@x.test" }),
  );
  assert.equal(
    pkg.assembled_inputs.find((i) => i.key === "email").value,
    "exec@x.test",
  );
});

test("buildHandoff: gated flow surfaces eligibility without deciding it (no hard block)", () => {
  const pkg = buildHandoff(webFlow, execution(), profile({ name: "Mick" }));
  assert.match(pkg.eligibility_notice, /neither auto-asserts nor auto-denies/i);
  assert.match(pkg.eligibility_notice, /you may proceed/i);
  // The package is still returned in full — nothing is blocked.
  assert.ok(pkg.pending_inputs.length > 0);
});

test("buildHandoff: a self-serve (api) flow gets a neutral eligibility notice", () => {
  const apiFlow = { ...webFlow, automatability: "api", danger_level: 0 };
  const pkg = buildHandoff(apiFlow, execution(), profile({ name: "Mick" }));
  assert.match(pkg.eligibility_notice, /self-serve/i);
});

test("get_handoff returns the package for an execution; unknown execution is NOT_FOUND", async () => {
  const { router } = await buildApp({
    source: FIXTURE,
    sessionStore: inMemorySessionStore(),
    profileStore: inMemoryProfileStore(),
  });
  await router.dispatch({
    operation: "create_profile",
    params: { identity: { name: "Mick", email: "mick@x.test" } },
  });
  const started = await router.dispatch({
    operation: "start_application",
    params: { slug: ANTHROPIC },
  });
  const handoff = (
    await router.dispatch({
      operation: "get_handoff",
      params: { execution_id: started.data.execution_id },
    })
  ).data.handoff;
  assert.equal(handoff.automatability, "manual_review");
  assert.match(handoff.eligibility_notice, /yours to assert/i);
  assert.ok(handoff.gaps.length > 0);
  // company_* fields the profile doesn't hold are pending, not silently asserted.
  assert.ok(handoff.pending_inputs.some((i) => i.key === "company_name"));

  const missing = await router.dispatch({
    operation: "get_handoff",
    params: { execution_id: "nope" },
  });
  assert.equal(missing.error.code, "NOT_FOUND_RESOURCE");
});
