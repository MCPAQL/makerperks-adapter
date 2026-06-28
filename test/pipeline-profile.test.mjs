// §4: the EXECUTE pipeline assembles from the maker profile and may reference a vault
// credential at submission (simulated, gated, audited — never decrypting/returning plaintext).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { inMemorySessionStore } from "../dist/session/state.js";
import { inMemoryProfileStore } from "../dist/session/profile.js";
import {
  vaultCrypto,
  importVaultKey,
  generateVaultKeyBytes,
} from "../dist/session/vault.js";

const FIXTURE = "test/fixtures/perks.sample.json";
const SLUG = "neon/neon-free-tier"; // free_tier → api flow; required_inputs: email + full_name

async function app() {
  return buildApp({
    source: FIXTURE,
    sessionStore: inMemorySessionStore(),
    profileStore: inMemoryProfileStore(),
    vaultCrypto: vaultCrypto(await importVaultKey(generateVaultKeyBytes())),
  });
}
const d = (router, operation, params = {}) => router.dispatch({ operation, params });

// Drive a fresh execution to the point where the NEXT submit_step processes the given stage.
async function toStage(router, stage) {
  const started = await d(router, "start_application", { slug: SLUG });
  const id = started.data.execution_id;
  const order = ["eligibility", "assemble", "submission"];
  for (let i = 0; i < order.indexOf(stage); i++) {
    await d(router, "submit_step", { execution_id: id });
  }
  return id;
}

test("assemble fills required inputs from the maker profile", async () => {
  const { router } = await app();
  await d(router, "create_profile", {
    identity: { name: "Mick", email: "mick@x.test" },
  });
  const id = await toStage(router, "assemble");
  const assembled = await d(router, "submit_step", { execution_id: id });
  assert.equal(assembled.data.stage, "submission"); // assemble processed, advanced
  assert.deepEqual(assembled.data.missing_inputs, []); // email + full_name both from profile
  assert.ok(assembled.data.filled_from_profile.includes("email"));
  assert.ok(assembled.data.filled_from_profile.includes("full_name"));
});

test("with no profile, the same inputs are still missing (profile is the difference)", async () => {
  const { router } = await app(); // profile store wired but empty
  const id = await toStage(router, "assemble");
  const assembled = await d(router, "submit_step", { execution_id: id });
  assert.deepEqual(assembled.data.filled_from_profile, []);
  assert.deepEqual(assembled.data.missing_inputs.sort(), ["email", "full_name"]);
});

test("per-call inputs override profile-derived values", async () => {
  const { router } = await app();
  await d(router, "create_profile", {
    identity: { name: "Mick", email: "mick@x.test" },
  });
  const id = await toStage(router, "assemble");
  await d(router, "submit_step", {
    execution_id: id,
    inputs: { email: "override@x.test" },
  });
  const status = await d(router, "get_status", { execution_id: id });
  assert.equal(status.data.execution.inputs.email, "override@x.test"); // per-call wins
  assert.equal(status.data.execution.inputs.full_name, "Mick"); // profile still fills the rest
});

test("a referenced vault credential at submission is gated, simulated, audited — never leaked", async () => {
  const { router } = await app();
  await d(router, "create_profile", {
    identity: { name: "Mick", email: "mick@x.test" },
  });
  const added = await d(router, "add_credential", {
    kind: "scoped_token",
    label: "Neon API key",
    secret: "SUPER_SECRET_TOKEN",
  });
  const credentialId = added.data.credential.id;

  const id = await toStage(router, "submission");
  // review_each (default) gates the submission — the credential is NOT used yet.
  const halt = await d(router, "submit_step", {
    execution_id: id,
    credential_id: credentialId,
  });
  assert.equal(halt.data.status, "halted");
  assert.equal(halt.data.confirmation_required, true);
  const auditBefore = await d(router, "get_profile", { include_audit: true });
  assert.ok(!auditBefore.data.audit.some((e) => e.action === "use_credential"));

  // Resume with the confirmation token — now the (simulated) use happens and is audited.
  const done = await d(router, "submit_step", {
    execution_id: id,
    confirmation_token: halt.data.confirmation_token,
    credential_id: credentialId,
  });
  assert.equal(done.data.stage, "verification");
  assert.match(done.data.did, /would inject credential scoped_token:Neon API key/);
  assert.ok(!JSON.stringify(done).includes("SUPER_SECRET_TOKEN")); // plaintext never returned

  const auditAfter = await d(router, "get_profile", { include_audit: true });
  const use = auditAfter.data.audit.find((e) => e.action === "use_credential");
  assert.ok(use);
  assert.ok(use.detail.includes("Neon API key"));
  assert.ok(!use.detail.includes("SUPER_SECRET_TOKEN")); // audit logs the label, not the secret
});

test("referencing an unknown credential id at submission is NOT_FOUND", async () => {
  const { router } = await app();
  await d(router, "set_autonomy", { mode: "full_auto" }); // danger 0 → no halt
  const id = await toStage(router, "submission");
  const res = await d(router, "submit_step", {
    execution_id: id,
    credential_id: "does-not-exist",
  });
  assert.equal(res.error.code, "NOT_FOUND_RESOURCE");
});
