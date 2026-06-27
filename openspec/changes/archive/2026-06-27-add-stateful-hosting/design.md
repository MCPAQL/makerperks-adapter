# Design — Stateful hosting (McpAgent + Durable Objects + real per-user OAuth)

Issue #20. The Stage 1 infra shift. This captures the load-bearing decisions; the
normative behavior is in the delta specs.

## Context

Stage 0 (archived `hosted-endpoint` + `endpoint-auth`): `@cloudflare/workers-oauth-provider`
wraps a Worker that, per request, builds a fresh `Server` + a stateless
`WebStandardStreamableHTTPServerTransport` and serves the `mcp_aql_read` READ surface;
data/router cached per isolate; `/authorize` auto-approves an anonymous principal. The
transport-agnostic core (`Router`, `wire`, `introspect`, `operations/read`) is unchanged
and stays unchanged here.

## Decisions

### 1. Per-session state → Cloudflare `McpAgent` (a Durable Object per session)

Use Cloudflare's `agents` `McpAgent` rather than hand-rolling a Durable Object + session
plumbing. It is the documented, integrated path: it owns the MCP session lifecycle, gives
each session its own DO instance, and receives the OAuth identity as `this.props` from
`@cloudflare/workers-oauth-provider`. We mount the existing `createMcpServer(router)`
inside it, so the READ surface and the token-efficient single-tool design are preserved.

A typed `SessionState` container lives on the agent as the home for what the pipeline will
add — confirmation tokens (single-use, time-limited, param-bound) and EXECUTE context.
**READ does not read or write it in this change.** Establishing the substrate now (rather
than alongside #17) is what de-risks the stateless→stateful migration independently of the
pipeline.

- Adds the `agents` dependency (pinned exact, per `.npmrc save-exact=true`).
- Data/router remain cached per isolate (module-global) exactly as today — the DO holds
  *session* state, not the dataset.

### 2. Real per-user OAuth → GitHub as the upstream IdP

"Real per-user" means a real login whose identity we carry, not a username/password store
we own. We delegate `/authorize` to **GitHub OAuth**:

- **Audience fit** — makers/devs already have GitHub; it is the lowest-friction real login.
- **Security rule** — "no stored passwords where OAuth/scoped tokens exist" (ARCHITECTURE
  §5). An upstream IdP means we never hold a password.
- **Proven pattern** — `@cloudflare/workers-oauth-provider` is built for exactly this
  (the provider is *our* AS issuing tokens to MCP clients via DCR; GitHub is the upstream
  IdP that authenticates the human at `/authorize`).

The authenticated identity (`userId` = GitHub user id, plus login) is passed to
`completeAuthorization({ userId, props })` and surfaces in the agent as `this.props`. DCR,
discovery metadata, and the token endpoint are unchanged; unauthenticated MCP requests
still get 401 + `WWW-Authenticate` so clients discover the AS.

GitHub OAuth requires a registered **GitHub OAuth App** (client id + secret). That is a
manual, outward-facing step done by the user; the secret is a Worker secret, never
committed. (Alternatives — generic OIDC, a hosted IdP/gateway — are the portable path
tracked upstream; GitHub is the concrete choice for this Cloudflare proving ground.)

### 3. Isolated test deployment → live endpoint untouched

Per the explicit constraint, the stateful build must not overwrite
`https://makerperks.mcpaql.com`. We keep `src/worker.ts` + `wrangler.jsonc` (the live
Stage 0 deploy) as-is and add a **parallel** stateful deployment:

- **Separate Worker name** (e.g. `makerperks-adapter-dev`) — a distinct Worker, not a
  new version of the live one.
- **Separate hostname** — proposed `makerperks-dev.mcpaql.com` (custom domain on the
  same `mcpaql.com` zone) + the auto `*.workers.dev` smoke URL.
- **Separate bindings** — its own `OAUTH_KV` namespace (grants for the real-auth AS must
  not mingle with the live anonymous grants) and the Durable Object binding + migration
  for the `McpAgent` class.
- **Separate config** — `wrangler.dev.jsonc`, deployed via a dedicated
  telemetry-off script, so a `npm run deploy` of the live Worker and a stateful deploy can
  never be confused.

Cutover of the live endpoint to the stateful build is **explicitly out of scope** — a
later deliberate step after Stage 1 is proven.

## Risks & mitigations

- **DO/McpAgent adds cold-start + cost vs. stateless.** Acceptable: it is required for
  per-session state and confined to the test endpoint; the live read-only endpoint stays
  stateless.
- **Edge gotchas still apply** (issue #23): eval-free validation, wrapped `fetch`, no
  filesystem. The core already honors these; the stateful entry inherits them.
- **Mingling real-auth and anonymous grants.** Mitigated by a separate KV namespace for
  the dev deployment.

## Out of scope (tracked elsewhere)

EXECUTE pipeline (#17), autonomy switch (#18), vault storage + encryption-at-rest (#19),
provider-flow dataset (#16), portable non-Cloudflare hosting (upstream), and the eventual
live cutover.
