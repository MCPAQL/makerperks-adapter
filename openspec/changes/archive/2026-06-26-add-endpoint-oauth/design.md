# Design — Add endpoint OAuth (client compatibility)

## Context

The live endpoint works for clients that permit unauthenticated remote MCP, but claude.ai's
connector mandates the MCP OAuth flow (DCR → authorize → token). The directory is public, so we
have nothing to protect yet — but we still need to *speak* OAuth for these clients.
Cloudflare's `@cloudflare/workers-oauth-provider` is a standard OAuth 2.1 provider (with DCR)
designed to wrap a Worker and front an MCP server; it stores grants/tokens/clients in KV.

## Goals / Non-Goals

**Goals:** a cross-platform OAuth 2.1 authorization server with **DCR** so compliant clients
(claude.ai first) auto-register and connect; the MCP `mcp_aql_read` surface unchanged behind it;
minimal moving parts.

**Non-Goals:** real per-user identity/login, scoped authorization, access gating, rate limiting
— all Stage 1. This layer does not secure anything; it satisfies OAuth-mandatory clients over
public data.

## Decision 1 — `OAuthProvider` wraps the Worker; MCP is the `apiHandler`

`export default new OAuthProvider({ apiHandler, apiRoute, defaultHandler, authorizeEndpoint,
tokenEndpoint, clientRegistrationEndpoint, scopesSupported })`. The provider serves the OAuth
metadata, `/token`, and `/register`, validates bearer tokens, and forwards authenticated
requests to our existing MCP fetch handler (now the `apiHandler`). The MCP surface and the core
are untouched — OAuth is purely a front layer.

_Alternatives:_ the `agents` SDK `McpAgent` + its OAuth (rejected for now — pulls in Durable
Objects and the McpAgent structure we deferred to Stage 1); hand-rolled OAuth (rejected —
re-implements a security-sensitive spec the provider already gives us).

## Decision 2 — Anonymous auto-approve authorization (public data)

The `defaultHandler` serves `/authorize`: it parses the auth request
(`env.OAUTH_PROVIDER.parseAuthRequest`) and immediately completes it
(`completeAuthorization({ userId: "public", scope, props: {} })`) for an anonymous principal,
then redirects back with the code — no real login. A minimal consent page may be shown if a
client needs a user gesture; otherwise auto-approve.

This is deliberate: there is no user system and nothing to gate. **It is client compatibility,
not access control.** When Stage 1 introduces applications acting on a user's behalf, this
handler is replaced with real identity + scoped consent (and likely `McpAgent` + Durable
Objects). Documented loudly so it is never mistaken for security.

_Alternatives:_ federate to GitHub/Google now (rejected — adds a real IdP and user accounts for
no benefit on public data); require a shared secret (rejected — not what these clients do; DCR
is the interop path).

## Decision 3 — KV for OAuth state; MCP data stays stateless

The provider persists clients/grants/tokens in a `OAUTH_KV` namespace. This is the first piece
of server-side state in the project, but it is scoped to OAuth bookkeeping — the MCP read
surface remains stateless (fresh server+transport per request, data cached per isolate).

## Decision 4 — The provider owns the OAuth paths; drop the 404 shim

The hotfix that 404'd `/.well-known/*` + `/register` is removed: the provider now serves the
OAuth metadata and registration on those paths. The MCP surface stays at the `apiRoute`.

## Risks / Trade-offs

- **Exact provider API** (KV binding mechanism, how `props` reach the `apiHandler`, the
  `ExportedHandler` shapes, PKCE handling) — confirm against the installed types/README at
  implementation; treat names here as indicative.
- **Auto-approve UX** — some clients may want a visible consent gesture; start with auto-approve
  and add a minimal consent page if a client balks.
- **Mistaking it for security** — mitigated by explicit docs: anonymous, ungated, compat-only.
- **New KV dependency** — small, OAuth-only; cleanup/sweep handled by the provider.

## Open Questions

- Does claude.ai need a visible consent page, or is silent auto-approve accepted?
- Token TTL / refresh policy (start with the provider defaults).
- Scopes: a single nominal scope (e.g. `mcp`) vs none — start minimal.
