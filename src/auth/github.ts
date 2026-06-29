// GitHub OAuth — the upstream IdP for the stateful endpoint's real per-user login.
// Pure + fetch-injectable so the identity exchange is unit-testable off the Workers
// runtime. The provider stays our authorization server (DCR, /token, discovery); GitHub
// only authenticates the human. No password is ever stored — only a scoped, revocable
// login. See openspec/changes/add-stateful-hosting §3 (capability `endpoint-auth`, #26).

import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_USER_URL = "https://api.github.com/user";
export const GITHUB_API_BASE = "https://api.github.com";

/** Minimal identity scope. Operator option A (#90) bumps this when a governing repo is set. */
export const SCOPE_IDENTITY = "read:user";
/** Adds read of a public governing repo's `permissions` (operator option A, public repo). */
export const SCOPE_OPERATOR_PUBLIC = "read:user public_repo";

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
}

/** The authenticated identity we carry into the grant props (no secrets stored). */
export interface GitHubIdentity {
  /** GitHub numeric id — stable across login renames; the per-user key. */
  userId: string;
  login: string;
  name: string | null;
}

// --- base64url JSON codec: round-trips the full AuthRequest through GitHub's `state` ---
// param (PKCE fields included), so no KV storage is needed across the redirect. UTF-8 safe
// because the client-supplied `state` may contain non-ASCII.

export function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeAuthState(req: AuthRequest): string {
  return b64urlEncode(JSON.stringify(req));
}

export function decodeAuthState(state: string): AuthRequest {
  return JSON.parse(b64urlDecode(state)) as AuthRequest;
}

/** Build the GitHub authorize URL the user is redirected to. */
export function githubAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  /** OAuth scope to request; defaults to the minimal identity scope (#90 bumps it for option A). */
  scope?: string;
}): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("scope", opts.scope ?? SCOPE_IDENTITY);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("allow_signup", "true");
  return url.toString();
}

/**
 * Exchange a GitHub authorization code for the user's identity. Returns `null` on any
 * failure (bad code, GitHub error, missing token). `fetchImpl` is injectable for tests;
 * the default wraps the global fetch (never store a bare reference — a detached global
 * `fetch` throws "Illegal invocation" on Workers).
 */
export async function fetchGitHubIdentity(
  code: string,
  redirectUri: string,
  config: GitHubOAuthConfig,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<GitHubIdentity | null> {
  const tokenRes = await fetchImpl(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) return null;
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenJson.access_token;
  if (!accessToken) return null;

  const userRes = await fetchImpl(GITHUB_USER_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/vnd.github+json",
      "user-agent": "makerperks-adapter",
    },
  });
  if (!userRes.ok) return null;
  const user = (await userRes.json()) as {
    id: number;
    login: string;
    name?: string | null;
  };
  return { userId: String(user.id), login: user.login, name: user.name ?? null };
}

/**
 * Whether the user behind `token` has admin on `owner/repo` — operator option A (#90). A READ:
 * `GET /repos/{owner}/{repo}` returns a `permissions` object scoped to the authenticated user, so
 * this asks "does THIS user, with THEIR token, have admin here?" — no server credential, no write.
 * Returns `false` on any failure (network, 404, no permissions field), never throws — a failed
 * check denies operator status rather than crashing the login. `fetchImpl` is injectable for tests.
 */
export async function fetchRepoAdmin(
  owner: string,
  repo: string,
  token: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<boolean> {
  try {
    const res = await fetchImpl(
      `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "user-agent": "makerperks-adapter",
        },
      },
    );
    if (!res.ok) return false;
    const body = (await res.json()) as { permissions?: { admin?: boolean } };
    return body.permissions?.admin === true;
  } catch {
    return false;
  }
}
