## Why

The hosted endpoint is live and works with MCP clients that allow unauthenticated remote
servers — but some clients (notably **claude.ai's connector**) **mandate OAuth**: they run
the MCP authorization flow (dynamic client registration → authorize → token) and refuse to
connect to a server that doesn't speak it ("Couldn't register with … add an OAuth Client
ID"). Returning clean 404s on the OAuth discovery paths was not enough; these clients need a
real OAuth 2.1 authorization server.

We add one — cross-platform, with **dynamic client registration (DCR)** so any compliant
client (claude.ai first, but also ChatGPT, Cursor, etc.) auto-registers and connects — using
Cloudflare's **`@cloudflare/workers-oauth-provider`**, which wraps our Worker.

**Important framing:** the directory is **public** data. This OAuth layer exists for **client
compatibility**, not access control — it authorizes *anonymously* (auto-approve), issues
tokens, and the MCP endpoint accepts them, but it does not gate access to specific users or
scopes. **Real, per-user, scoped authorization arrives with the Stage 1 pipeline** (when there
is something to protect — applications acting on a user's behalf). We are explicit about this
so it is never mistaken for security it does not provide.

## What Changes

- **Wrap the Worker in `OAuthProvider`.** It serves the OAuth metadata
  (`/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`),
  `/token`, and `/register` (DCR), and delegates **authenticated** API requests to our existing
  MCP handler (the `mcp_aql_read` surface, unchanged).
- **An auto-approve `/authorize` handler** (the provider's `defaultHandler`) — since the data is
  public, it completes authorization for an anonymous principal without a real login (a minimal
  consent step), then redirects back with the code.
- **KV storage** for OAuth grants/tokens/clients (a new `OAUTH_KV` namespace binding).
- **Remove the hotfix 404 shim** for `/.well-known/*` + `/register` — the provider now owns
  those paths.

## Capabilities

### New Capabilities

- `endpoint-auth`: OAuth 2.1 (with dynamic client registration) in front of the hosted MCP
  endpoint, so OAuth-mandatory clients connect; anonymous/auto-approve for now (public data).

### Modified Capabilities

(none — the `hosted-endpoint` MCP surface is unchanged; OAuth is an added layer.)

## Impact

- **Affected code:** restructure `src/worker.ts` to export an `OAuthProvider` wrapping the MCP
  `apiHandler` + an `/authorize` `defaultHandler`; `wrangler.jsonc` gains a KV binding.
- **Dependencies:** add `@cloudflare/workers-oauth-provider` (runtime). Exact binding/handler
  API confirmed at implementation.
- **Infra (manual / outward-facing):** create a Cloudflare **KV namespace** (`OAUTH_KV`) via
  `wrangler kv namespace create`.
- **Non-goals / tracked follow-up:** real per-user identity / login, scoped authorization, and
  access gating — all deferred to the **Stage 1** pipeline. No rate limiting.
