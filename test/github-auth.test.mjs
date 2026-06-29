import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeAuthState,
  decodeAuthState,
  githubAuthorizeUrl,
  fetchGitHubIdentity,
} from "../dist/auth/github.js";

const SAMPLE_AUTH_REQ = {
  responseType: "code",
  clientId: "client-123",
  redirectUri: "https://claude.ai/api/mcp/callback",
  scope: ["mcp"],
  state: "client-state-✓-with-unicode",
  codeChallenge: "abc123",
  codeChallengeMethod: "S256",
};

test("auth state round-trips the full AuthRequest (incl PKCE + unicode)", () => {
  const encoded = encodeAuthState(SAMPLE_AUTH_REQ);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/); // base64url, unpadded
  assert.deepEqual(decodeAuthState(encoded), SAMPLE_AUTH_REQ);
});

test("githubAuthorizeUrl carries client_id, callback, read:user scope, state", () => {
  const u = new URL(
    githubAuthorizeUrl({
      clientId: "gh-client",
      redirectUri: "https://makerperks-dev.mcpaql.com/callback",
      state: "STATE",
    }),
  );
  assert.equal(u.origin + u.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(u.searchParams.get("client_id"), "gh-client");
  assert.equal(
    u.searchParams.get("redirect_uri"),
    "https://makerperks-dev.mcpaql.com/callback",
  );
  assert.equal(u.searchParams.get("scope"), "read:user");
  assert.equal(u.searchParams.get("state"), "STATE");
});

const CONFIG = { clientId: "id", clientSecret: "secret" };
const okJson = (body) => ({ ok: true, json: async () => body });
const notOk = () => ({ ok: false, json: async () => ({}) });

test("fetchGitHubIdentity returns the identity on a successful exchange", async () => {
  const fakeFetch = async (urlInput, init) => {
    const url = String(urlInput);
    if (url === "https://github.com/login/oauth/access_token") {
      const body = init.body.toString(); // URLSearchParams -> form-encoded
      assert.match(body, /code=the-code/);
      assert.match(body, /redirect_uri=/);
      return okJson({ access_token: "gh-token" });
    }
    if (url === "https://api.github.com/user") {
      assert.equal(init.headers.authorization, "Bearer gh-token");
      return okJson({ id: 4242, login: "octocat", name: "The Octocat" });
    }
    throw new Error("unexpected url " + url);
  };
  const id = await fetchGitHubIdentity(
    "the-code",
    "https://x/callback",
    CONFIG,
    fakeFetch,
  );
  assert.deepEqual(id, {
    userId: "4242",
    login: "octocat",
    name: "The Octocat",
    accessToken: "gh-token",
  });
});

test("fetchGitHubIdentity returns null when GitHub omits the access token", async () => {
  const fakeFetch = async () => okJson({ error: "bad_verification_code" });
  assert.equal(
    await fetchGitHubIdentity("c", "https://x/callback", CONFIG, fakeFetch),
    null,
  );
});

test("fetchGitHubIdentity returns null when the user fetch fails", async () => {
  const fakeFetch = async (urlInput) =>
    String(urlInput).includes("access_token") ? okJson({ access_token: "t" }) : notOk();
  assert.equal(
    await fetchGitHubIdentity("c", "https://x/callback", CONFIG, fakeFetch),
    null,
  );
});

test("fetchGitHubIdentity maps a missing GitHub name to null", async () => {
  const fakeFetch = async (urlInput) =>
    String(urlInput).includes("access_token")
      ? okJson({ access_token: "t" })
      : okJson({ id: 1, login: "nameless" });
  const id = await fetchGitHubIdentity("c", "https://x/callback", CONFIG, fakeFetch);
  assert.deepEqual(id, {
    userId: "1",
    login: "nameless",
    name: null,
    accessToken: "t",
  });
});
