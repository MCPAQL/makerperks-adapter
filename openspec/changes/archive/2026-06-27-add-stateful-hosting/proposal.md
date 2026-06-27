## Why

Stage 0 hosting is **stateless** (a fresh server + transport per request) with
**anonymous auto-approve** OAuth — correct for a public, read-only directory, but it
cannot carry what the Stage 1 application pipeline needs:

- **Per-session state** — confirmation tokens (single-use, time-limited, param-bound),
  EXECUTE context, and the Execution Safety Loop. A stateless per-request transport has
  nowhere to hold these between steps of a batch-with-halting flow.
- **Per-user identity + state** — the profile + credential vault (#19) must be gated by
  *who* the user is. Anonymous auto-approve issues a token to an anonymous principal and
  gives the backend no identity to key per-user state on.

This change makes the **stateless → stateful** shift on Cloudflare, the proving ground
for the portable recipe tracked upstream (MCPAQL/spec#262, mcpaql-adapter#30/#31,
adapter-generator#38). It builds the **substrate** Stage 1 sits on: a Durable Object per
session (via Cloudflare's `McpAgent`) and **real per-user OAuth** (identity in
`userId`/`props`, a real IdP login at `/authorize`). It does **not** add the EXECUTE
pipeline, autonomy switch, or vault — those are #17/#18/#19, built on top.

**The live endpoint is not touched.** `https://makerperks.mcpaql.com` keeps running the
archived Stage 0 build. The stateful build deploys to a **separate test hostname** with
its own Worker name, KV namespace, and Durable Object bindings, so nothing about the live
deployment is overwritten while we prove the substrate. Cutover is a later, deliberate
step — out of scope here.

## What Changes

- **Per-session substrate (new `stateful-session` capability).** A stateful Worker entry
  mounts the **same** `mcp_aql_read` READ surface through Cloudflare's `McpAgent`, so each
  MCP session is backed by a **Durable Object**. A typed per-session state container exists
  as the home for confirmation tokens + execution context; READ does not use it yet —
  this change proves the substrate before the pipeline lands. Data/router stay cached per
  isolate as today.
- **Real per-user OAuth (modifies `endpoint-auth`).** Replace anonymous auto-approve
  `/authorize` with a real login at an **upstream IdP (GitHub)** — the fit for the
  maker/dev audience, and consistent with the security rule "no stored passwords where
  OAuth/scoped tokens exist." The authenticated identity flows into the session DO as
  `this.props` (`userId`, login). DCR and discovery metadata are retained; unauthenticated
  MCP → 401 + `WWW-Authenticate`. The existing anonymous mode is **kept** (it still
  describes the live public read deployment); the stateful endpoint selects real per-user.
- **Isolated test deployment (adds to `hosted-endpoint`).** A second wrangler
  configuration targeting a **separate hostname** (proposed `makerperks-dev.mcpaql.com`)
  + a `*.workers.dev` smoke URL, a distinct Worker name, a distinct `OAUTH_KV` namespace,
  and the Durable Object binding/migration — so deploying the stateful build cannot affect
  `makerperks.mcpaql.com`.

## Capabilities

### New Capabilities

- `stateful-session`: a Durable Object per MCP session (via `McpAgent`) providing
  isolated, session-scoped state — the substrate for confirmation tokens + execution
  context that the Stage 1 pipeline will populate.

### Modified Capabilities

- `endpoint-auth`: add **real per-user authorization via an upstream IdP** (identity in
  `userId`/`props`); reframe the existing **anonymous auto-approve** requirement as the
  mode used by the public read-only deployment (kept, not removed).
- `hosted-endpoint`: add an **isolated stateful deployment** requirement — the stateful
  build deploys to a separate endpoint/bindings and SHALL NOT affect the live Stage 0
  endpoint.

## Impact

- **Affected specs:** `stateful-session` (new), `endpoint-auth` (modified),
  `hosted-endpoint` (modified).
- **Affected code:** new stateful Worker entry (`src/worker-stateful.ts`) defining an
  `McpAgent` subclass that mounts `createMcpServer(router)` and holds a typed per-session
  state container; a GitHub-IdP `/authorize` handler replacing auto-approve; a second
  wrangler config (`wrangler.dev.jsonc`) with the DO binding + migration, the
  `OAUTH_KV` (dev) namespace, and the test route. `src/worker.ts` and `wrangler.jsonc`
  (the live Stage 0 deploy) are **unchanged**.
- **Dependencies:** add `agents` (Cloudflare McpAgent; pinned exact). No change to the
  transport-agnostic core, the READ surface, or `@modelcontextprotocol/sdk`.
- **Deployment prerequisites (manual / outward-facing, by the user):** register a **GitHub
  OAuth App** and set its client id/secret as Worker secrets; create the **dev KV
  namespace**; bind the **test custom domain** on the `mcpaql.com` zone. `wrangler` is
  already authenticated on the account that owns the zone.
- **Non-goals / tracked follow-up:** the EXECUTE pipeline (#17), autonomy switch (#18),
  credential-vault storage + encryption-at-rest (#19), the provider-flow dataset (#16),
  portable/non-Cloudflare hosting (upstream spec#262, mcpaql-adapter#30/#31,
  adapter-generator#38), and **cutting the live endpoint over to the stateful build**
  (a later deliberate step once Stage 1 is proven).
