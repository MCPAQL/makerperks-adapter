/**
 * isolation.test.ts — per-user isolation for the makerperks stateful Worker.
 *
 * Invariant: the maker profile + vault live in a Durable Object keyed on the AUTHENTICATED
 * OAuth subject (the GitHub user id resolved into `this.props.userId`). Subject A's writes must
 * be invisible to subject B's reads, and vice versa. The real bug surface is the derivation
 *   authenticated subject -> DO name -> DO id
 * — if it drops the subject or collapses two subjects to one name, isolation breaks. Tested in
 * two layers: (1) the derivation function itself; (2) behaviour through the real op handlers.
 *
 * Adapted from the handoff template to OUR setup: we don't add a test-only OAuth-bypass header.
 * Instead we build a per-subject router over the REAL PROFILE_OBJECT Durable Object exactly the
 * way worker-stateful.ts does (deriveDoName -> idFromName -> stub) and drive the real op
 * handlers — so the DO, its storage, and the derivation are all real (workerd), with no auth
 * bypass and no MCP-transport/DataSource dependency.
 *
 * Runner: vitest + @cloudflare/vitest-pool-workers (`cloudflare:test` provides `env`).
 */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { Router } from "../../dist/core/router.js";
import { registerProfileOperations } from "../../dist/operations/profile.js";
import { registerVaultOperations } from "../../dist/operations/vault.js";
import {
  vaultCrypto,
  importVaultKey,
  generateVaultKeyBytes,
} from "../../dist/session/vault.js";
import { deriveDoName } from "../../dist/auth/do-name.js";

// Build a router bound to THIS subject's real Durable Object — the same wiring as
// worker-stateful.ts (deriveDoName -> idFromName -> stub RPC), driving the op handlers directly.
async function routerFor(subject: string): Promise<Router> {
  const ns = env.PROFILE_OBJECT;
  const stub = ns.get(ns.idFromName(deriveDoName(subject)));
  const store = {
    get: () => stub.getRecord(),
    set: (record: unknown) => stub.setRecord(record),
    delete: () => stub.deleteRecord(),
  };
  const router = new Router();
  registerProfileOperations(router, store);
  registerVaultOperations(
    router,
    store,
    vaultCrypto(await importVaultKey(generateVaultKeyBytes())),
  );
  return router;
}

const dispatch = (
  router: Router,
  operation: string,
  params: Record<string, unknown> = {},
) => router.dispatch({ operation, params });

const getProfile = async (s: string) => dispatch(await routerFor(s), "get_profile");
const createProfile = async (s: string, name: string) =>
  dispatch(await routerFor(s), "create_profile", { identity: { name } });
const addCredential = async (s: string, secret: string) =>
  dispatch(await routerFor(s), "add_credential", {
    kind: "scoped_token",
    label: "tok",
    secret,
  });
const listCredentials = async (s: string) =>
  dispatch(await routerFor(s), "list_credentials");

// Two distinct synthetic subjects — exactly what the invariant is about.
const ALICE = "gh|1001";
const BOB = "gh|2002";

// --- Layer 1: the derivation itself --------------------------------------------------------
describe("DO name derivation", () => {
  it("includes the subject (distinct subjects -> distinct names)", () => {
    expect(deriveDoName(ALICE)).not.toBe(deriveDoName(BOB));
  });

  it("is stable for the same subject (a reconnect resolves the same DO)", () => {
    expect(deriveDoName(ALICE)).toBe(deriveDoName(ALICE));
  });

  it("refuses an empty / missing subject (must not collapse to a shared DO)", () => {
    expect(() => deriveDoName("")).toThrow();
    expect(() => deriveDoName("   ")).toThrow();
    // @ts-expect-error exercising the null path on purpose
    expect(() => deriveDoName(undefined)).toThrow();
  });
});

// --- Layer 2: behaviour through the real op handlers + real DO -----------------------------
describe("per-user isolation", () => {
  it("a fresh subject sees no one else's profile", async () => {
    await createProfile(ALICE, "Alice");
    const bob = await getProfile(BOB);
    expect(bob.success).toBe(true);
    expect(bob.data.profile).toBeNull(); // the headline assertion
  });

  it("writes under A never appear under B, and B's writes don't disturb A", async () => {
    await createProfile(ALICE, "Alice");
    await createProfile(BOB, "Bob");

    const a = await getProfile(ALICE);
    const b = await getProfile(BOB);

    expect(a.data.profile.identity.name).toBe("Alice");
    expect(b.data.profile.identity.name).toBe("Bob");
    // cross-check: neither sees the other's name anywhere
    expect(JSON.stringify(a)).not.toContain("Bob");
    expect(JSON.stringify(b)).not.toContain("Alice");
  });

  it("vault contents are isolated (and never leak the secret either way)", async () => {
    await createProfile(ALICE, "Alice");
    await addCredential(ALICE, "ghp_alice_secret");

    const bobList = await listCredentials(BOB);
    expect(bobList.data.credentials).toHaveLength(0); // B sees none of A's creds

    const aList = await listCredentials(ALICE);
    expect(aList.data.credentials).toHaveLength(1);
    // belt-and-suspenders: the plaintext shows up in NEITHER response
    expect(JSON.stringify(aList)).not.toContain("ghp_alice_secret");
    expect(JSON.stringify(bobList)).not.toContain("ghp_alice_secret");
  });
});
