import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../dist/app.js";
import { inMemoryProfileStore } from "../dist/session/profile.js";
import {
  vaultCrypto,
  generateVaultKeyBytes,
  importVaultKey,
} from "../dist/session/vault.js";
import { loadLocalVaultKey } from "../dist/local/vault-key.js";

const FIXTURE = "test/fixtures/perks.sample.json";

const testCrypto = async () =>
  vaultCrypto(await importVaultKey(generateVaultKeyBytes()));
const withVault = async () =>
  buildApp({
    source: FIXTURE,
    profileStore: inMemoryProfileStore(),
    vaultCrypto: await testCrypto(),
  });

test("vault ops register only when both a profile store and crypto are wired", async () => {
  const { router } = await withVault();
  const ops = (await router.dispatch({ operation: "introspect" })).data.operations.map(
    (o) => o.name,
  );
  for (const op of ["add_credential", "list_credentials", "remove_credential"]) {
    assert.ok(ops.includes(op), `expected ${op}`);
  }

  // profileStore but no vaultCrypto → no vault ops (the key is required to seal/open)
  const { router: noVault } = await buildApp({
    source: FIXTURE,
    profileStore: inMemoryProfileStore(),
  });
  const noVaultOps = (
    await noVault.dispatch({ operation: "introspect" })
  ).data.operations.map((o) => o.name);
  assert.ok(!noVaultOps.includes("add_credential"));
});

test("AES-GCM seal/open round-trips; same plaintext yields different ciphertext (fresh IV)", async () => {
  const crypto = await testCrypto();
  const a = await crypto.seal("hunter2");
  const b = await crypto.seal("hunter2");
  assert.notEqual(a.ciphertext, b.ciphertext); // random IV per seal
  assert.notEqual(a.iv, b.iv);
  assert.equal(await crypto.open(a), "hunter2");
  assert.equal(await crypto.open(b), "hunter2");
});

test("add_credential returns metadata only — never the secret, ciphertext, or iv", async () => {
  const { router } = await withVault();
  const added = await router.dispatch({
    operation: "add_credential",
    params: { kind: "scoped_token", label: "GitHub PAT", secret: "ghp_supersecret" },
  });
  assert.equal(added.success, true);
  const cred = added.data.credential;
  assert.equal(cred.kind, "scoped_token");
  assert.equal(cred.label, "GitHub PAT");
  assert.ok(cred.id);
  const serialized = JSON.stringify(added);
  assert.ok(!serialized.includes("ghp_supersecret"), "secret leaked");
  assert.ok(!("ciphertext" in cred) && !("iv" in cred), "ciphertext/iv leaked");
});

test("list_credentials returns metadata only and never the plaintext/ciphertext", async () => {
  const { router } = await withVault();
  await router.dispatch({
    operation: "add_credential",
    params: { kind: "password", label: "Provider login", secret: "p@ssw0rd!" },
  });
  const list = await router.dispatch({ operation: "list_credentials" });
  assert.equal(list.data.credentials.length, 1);
  const serialized = JSON.stringify(list);
  assert.ok(!serialized.includes("p@ssw0rd!"), "plaintext leaked");
  assert.ok(!serialized.includes("ciphertext"), "ciphertext leaked");
});

test("payment is not a storable kind — rejected with a validation error, stores nothing", async () => {
  const { router } = await withVault();
  const r = await router.dispatch({
    operation: "add_credential",
    params: { kind: "payment", label: "Visa", secret: "4111111111111111" },
  });
  assert.equal(r.success, false);
  assert.equal(r.error.code, "VALIDATION_INVALID_TYPE");
  const list = await router.dispatch({ operation: "list_credentials" });
  assert.equal(list.data.credentials.length, 0);
});

test("remove_credential removes by id; a second remove is NOT_FOUND", async () => {
  const { router } = await withVault();
  const added = await router.dispatch({
    operation: "add_credential",
    params: { kind: "identity_document", label: "Passport", secret: "scan-bytes" },
  });
  const id = added.data.credential.id;
  const removed = await router.dispatch({
    operation: "remove_credential",
    params: { credential_id: id },
  });
  assert.equal(removed.data.removed, id);
  const again = await router.dispatch({
    operation: "remove_credential",
    params: { credential_id: id },
  });
  assert.equal(again.error.code, "NOT_FOUND_RESOURCE");
});

test("mutations are audited (metadata only) and surfaced via get_profile include_audit", async () => {
  const { router } = await withVault();
  await router.dispatch({ operation: "create_profile", params: {} });
  await router.dispatch({
    operation: "add_credential",
    params: {
      kind: "scoped_token",
      label: "Neon API key",
      secret: "neon_secret_value",
    },
  });
  const got = await router.dispatch({
    operation: "get_profile",
    params: { include_audit: true },
  });
  const actions = got.data.audit.map((e) => e.action);
  assert.ok(actions.includes("create_profile"));
  assert.ok(actions.includes("add_credential"));
  // The audit detail names the credential label, never the secret value.
  assert.ok(!JSON.stringify(got.data.audit).includes("neon_secret_value"));
  const credEntry = got.data.audit.find((e) => e.action === "add_credential");
  assert.ok(credEntry.detail.includes("Neon API key"));
});

test("get_profile omits audit unless include_audit is set", async () => {
  const { router } = await withVault();
  await router.dispatch({ operation: "create_profile", params: {} });
  const got = await router.dispatch({ operation: "get_profile" });
  assert.equal("audit" in got.data, false);
});

test("local keyfile: generated 0600, persisted, and the same key reopens sealed secrets", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mp-vaultkey-"));
  const key1 = await loadLocalVaultKey(dir);
  const sealed = await vaultCrypto(key1).seal("durable-secret");

  // File exists with owner-only permissions.
  const mode = statSync(join(dir, "vault.key")).mode & 0o777;
  assert.equal(mode, 0o600);

  // A second load returns the SAME key (reads the file, doesn't regenerate) → can open it.
  const key2 = await loadLocalVaultKey(dir);
  assert.equal(await vaultCrypto(key2).open(sealed), "durable-secret");
});
