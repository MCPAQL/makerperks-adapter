import { test } from "node:test";
import assert from "node:assert/strict";
import {
  operatorPolicy,
  resolveOperator,
  policyNeedsRepoScope,
} from "../dist/session/operator.js";

// A fetch stub for option A: GET /repos/{owner}/{repo} -> { permissions: { admin } }. Asserts the
// user's own token is sent (no server credential).
const repoFetch = (admin, expectToken) => async (url, init) => {
  assert.match(String(url), /\/repos\/acme\/dir$/);
  if (expectToken) {
    assert.equal(init.headers.authorization, `Bearer ${expectToken}`);
  }
  return {
    ok: true,
    json: async () => ({ permissions: { admin } }),
  };
};

test("operatorPolicy: parses each config combination", () => {
  assert.deepEqual(operatorPolicy({}, true), { kind: "implicit" });
  assert.deepEqual(operatorPolicy({}), { kind: "closed" });
  assert.deepEqual(operatorPolicy({ OPERATOR_REPO: "acme/dir" }), {
    kind: "repo",
    owner: "acme",
    repo: "dir",
  });
  assert.deepEqual(operatorPolicy({ OPERATOR_LOGINS: "mickdarling, natea" }), {
    kind: "allowlist",
    logins: ["mickdarling", "natea"],
  });
  assert.deepEqual(
    operatorPolicy({ OPERATOR_REPO: "acme/dir", OPERATOR_LOGINS: "natea" }),
    { kind: "both", owner: "acme", repo: "dir", logins: ["natea"] },
  );
  // A malformed repo string fails safe (not half-open).
  assert.deepEqual(operatorPolicy({ OPERATOR_REPO: "not-a-repo" }), {
    kind: "closed",
  });
});

test("resolveOperator: implicit is always operator, closed never", async () => {
  assert.equal(await resolveOperator({ kind: "implicit" }, { login: "x" }), true);
  assert.equal(await resolveOperator({ kind: "closed" }, { login: "x" }), false);
});

test("resolveOperator: allowlist matches by login, no outbound call", async () => {
  const policy = { kind: "allowlist", logins: ["mickdarling", "natea"] };
  assert.equal(await resolveOperator(policy, { login: "natea" }), true);
  assert.equal(await resolveOperator(policy, { login: "rando" }), false);
});

test("resolveOperator: repo policy reads admin with the user's own token", async () => {
  const policy = { kind: "repo", owner: "acme", repo: "dir" };
  assert.equal(
    await resolveOperator(policy, {
      login: "admin-user",
      token: "tok-abc",
      fetchImpl: repoFetch(true, "tok-abc"),
    }),
    true,
  );
  assert.equal(
    await resolveOperator(policy, {
      login: "member",
      token: "tok-xyz",
      fetchImpl: repoFetch(false),
    }),
    false,
  );
  // No token -> cannot verify -> denied.
  assert.equal(await resolveOperator(policy, { login: "admin-user" }), false);
});

test("resolveOperator: both OR's allowlist and repo admin", async () => {
  const policy = { kind: "both", owner: "acme", repo: "dir", logins: ["natea"] };
  // Listed login short-circuits without any outbound call.
  assert.equal(
    await resolveOperator(policy, {
      login: "natea",
      fetchImpl: () => assert.fail("should not fetch for a listed login"),
    }),
    true,
  );
  // Not listed but repo admin -> operator.
  assert.equal(
    await resolveOperator(policy, {
      login: "someone",
      token: "tok",
      fetchImpl: repoFetch(true),
    }),
    true,
  );
  // Not listed, not admin -> not operator.
  assert.equal(
    await resolveOperator(policy, {
      login: "someone",
      token: "tok",
      fetchImpl: repoFetch(false),
    }),
    false,
  );
});

test("policyNeedsRepoScope: only repo/both need the broader OAuth scope", () => {
  assert.equal(policyNeedsRepoScope({ kind: "repo", owner: "a", repo: "b" }), true);
  assert.equal(
    policyNeedsRepoScope({ kind: "both", owner: "a", repo: "b", logins: ["x"] }),
    true,
  );
  assert.equal(policyNeedsRepoScope({ kind: "allowlist", logins: ["x"] }), false);
  assert.equal(policyNeedsRepoScope({ kind: "implicit" }), false);
  assert.equal(policyNeedsRepoScope({ kind: "closed" }), false);
});
