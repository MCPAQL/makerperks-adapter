import test from "node:test";
import assert from "node:assert/strict";

import {
  OAUTH_PROVIDERS,
  AUTH_METHODS,
  isOAuthProvider,
  isAuthMethod,
  resolvePreferredMethod,
} from "../dist/data/auth-methods.js";

test("AUTH_METHODS is the OAuth providers plus email_password", () => {
  assert.ok(AUTH_METHODS.includes("email_password"));
  for (const p of OAUTH_PROVIDERS) assert.ok(AUTH_METHODS.includes(p));
  assert.ok(!OAUTH_PROVIDERS.includes("email_password"));
});

test("isOAuthProvider / isAuthMethod gate the known vocabulary", () => {
  assert.ok(isOAuthProvider("github"));
  assert.ok(!isOAuthProvider("email_password")); // not an OAuth provider
  assert.ok(!isOAuthProvider("nope"));
  assert.ok(isAuthMethod("email_password"));
  assert.ok(isAuthMethod("google"));
  assert.ok(!isAuthMethod("nope"));
  assert.ok(!isAuthMethod(42));
});

test("resolvePreferredMethod picks the first stated preference the flow supports", () => {
  assert.equal(
    resolvePreferredMethod(
      ["github", "google", "email_password"],
      ["google", "github"],
    ),
    "github", // honors maker order, not the flow's order
  );
  assert.equal(
    resolvePreferredMethod(["google", "github"], ["github"]),
    "github", // github is the only offered one
  );
});

test("resolvePreferredMethod falls back to email_password (always available on a signup)", () => {
  assert.equal(
    resolvePreferredMethod(["github", "email_password"], ["azure"]),
    "email_password",
  );
});

test("resolvePreferredMethod returns undefined when nothing matches or no preference is stated", () => {
  // maker prefers github only, flow offers azure, no email_password listed → no invented preference
  assert.equal(resolvePreferredMethod(["github"], ["azure"]), undefined);
  assert.equal(resolvePreferredMethod([], ["github"]), undefined);
  assert.equal(resolvePreferredMethod(undefined, ["github"]), undefined);
});

test("resolvePreferredMethod with no providers still honors a stated email_password", () => {
  // an empty providers list still has the implicit email_password fallback
  assert.equal(resolvePreferredMethod(["email_password"], []), "email_password");
  assert.equal(resolvePreferredMethod(["github"], []), undefined);
});
