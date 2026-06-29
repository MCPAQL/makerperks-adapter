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

// §2: submit_step flags the handoff for non-api flows and stays simulated for api flows.
async function driveToSubmissionResult(slug) {
  const { router } = await buildApp({
    source: FIXTURE,
    sessionStore: inMemorySessionStore(),
    profileStore: inMemoryProfileStore(),
  });
  await router.dispatch({ operation: "set_autonomy", params: { mode: "full_auto" } });
  const started = await router.dispatch({
    operation: "start_application",
    params: { slug },
  });
  const id = started.data.execution_id;
  await router.dispatch({ operation: "submit_step", params: { execution_id: id } }); // eligibility
  await router.dispatch({ operation: "submit_step", params: { execution_id: id } }); // assemble
  return router.dispatch({ operation: "submit_step", params: { execution_id: id } }); // submission
}

test("submit_step on a non-api (manual_review) flow flags a handoff, not a simulated submit", async () => {
  const res = await driveToSubmissionResult(ANTHROPIC); // curated manual_review
  assert.equal(res.data.handoff_available, true);
  assert.equal(res.data.simulated, false);
  assert.match(res.data.did, /prepared web handoff/);
  assert.match(res.data.next_step, /get_handoff/);
});

test("submit_step on an api flow still returns a simulated submission (no handoff)", async () => {
  const res = await driveToSubmissionResult("neon/neon-free-tier"); // derived api
  assert.equal(res.data.simulated, true);
  assert.equal("handoff_available" in res.data, false);
  assert.match(res.data.did, /SIMULATED submission/);
});

// ── danger-tiered credential delivery in the application package (#91) ────────
import { buildApplicationPackage } from "../dist/operations/handoff.js";
import {
  vaultCrypto,
  generateVaultKeyBytes,
  importVaultKey,
} from "../dist/session/vault.js";

const makeVaultAndEntry = async (plaintext) => {
  const vault = vaultCrypto(await importVaultKey(generateVaultKeyBytes()));
  const sealed = await vault.seal(plaintext);
  const credential = {
    id: "c1",
    kind: "scoped_token",
    label: "GCP billing",
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    createdAt: 0,
  };
  return { vault, credential };
};

test("buildApplicationPackage: danger <=2 includes the decrypted credential for the agent", async () => {
  const { vault, credential } = await makeVaultAndEntry("secret-billing-123");
  const pkg = await buildApplicationPackage(webFlow, execution(), profile({}), {
    vault,
    credential,
  });
  const cred = pkg.assembled_inputs.find((i) => i.key === "billing_account_id");
  assert.ok(cred, "credential moved to assembled");
  assert.equal(cred.value, "secret-billing-123"); // decrypted for the agent
  assert.equal(cred.source, "credential");
  assert.equal(
    pkg.pending_inputs.some((i) => i.key === "billing_account_id"),
    false,
    "no longer pending",
  );
});

test("buildApplicationPackage: danger >=3 never exposes the credential", async () => {
  const { vault, credential } = await makeVaultAndEntry("secret-billing-123");
  const dangerFlow = { ...webFlow, danger_level: 3 };
  const pkg = await buildApplicationPackage(dangerFlow, execution(), profile({}), {
    vault,
    credential,
  });
  const cred = pkg.pending_inputs.find((i) => i.key === "billing_account_id");
  assert.equal(cred.reason, "credential"); // still pending / out-of-band
  assert.equal(
    pkg.assembled_inputs.some((i) => i.key === "billing_account_id"),
    false,
    "never assembled",
  );
});

test("buildApplicationPackage: no vault key keeps the credential pending (fail safe)", async () => {
  const pkg = await buildApplicationPackage(webFlow, execution(), profile({}));
  assert.equal(
    pkg.pending_inputs.find((i) => i.key === "billing_account_id").reason,
    "credential",
  );
});
