# Tasks — Add stateful hosting (McpAgent + Durable Objects + real per-user OAuth)

> **Scope:** the stateless → stateful infra shift on Cloudflare (issue #20) — a Durable
> Object per session via `McpAgent`, plus real per-user OAuth (GitHub IdP), deployed to a
> **separate test endpoint** so the live `makerperks.mcpaql.com` is untouched. The EXECUTE
> pipeline (#17), autonomy switch (#18), and credential vault (#19) are **out of scope** —
> this builds the substrate they sit on.
>
> **Definition of done:** all tasks `[x]`, `openspec validate add-stateful-hosting --strict`
> passes, typecheck/build/lint/tests green, the stateful build connects from a real MCP
> client through a real GitHub login with a session DO instantiated, and
> `https://makerperks.mcpaql.com` is verified **unchanged**.
>
> **Sections 1–3 need no Cloudflare account actions (dry-run builds). Section 4 needs the
> user: a GitHub OAuth App + secrets, the dev KV namespace, and the test custom domain.**

## 1. Deps + isolated deploy config (`hosted-endpoint`)

- [x] 1.1 Add `agents` (Cloudflare McpAgent) to dependencies, pinned exact (`agents@0.17.0`)
- [x] 1.2 Add `wrangler.dev.jsonc`: distinct `name` (`makerperks-adapter-dev`),
  `main: dist/worker-stateful.js`, the test route (`makerperks-dev.mcpaql.com`,
  `custom_domain`), `workers_dev`, a **separate** `OAUTH_KV` namespace binding (placeholder
  id — user creates it in §4), and the `MCP_OBJECT` Durable Object binding + sqlite
  migration for the `MakerPerksMcpAgent` class
- [x] 1.3 Add a telemetry-off `deploy:dev` npm script targeting `wrangler.dev.jsonc`;
  leave `npm run deploy` (live) and `src/worker.ts`/`wrangler.jsonc` untouched
- [x] 1.4 `wrangler deploy --dry-run -c wrangler.dev.jsonc` builds clean (2022 KiB /
  370 KiB gzip; `MCP_OBJECT` DO + `OAUTH_KV` bind; runs under `nodejs_compat`). A minimal
  `src/worker-stateful.ts` McpAgent entry was added here so the DO binding resolves; its
  typed `SessionState` is fleshed out in §2

## 2. Per-session substrate via McpAgent + Durable Object (`stateful-session`)

- [x] 2.1 Add `src/worker-stateful.ts`: an `McpAgent` subclass that builds the `Router` via
  `buildApp` (URL source + TTL, cached per isolate) and mounts `createMcpServer(router)` —
  same single `mcp_aql_read` READ surface, now session-backed (entry added in §1)
- [x] 2.2 Define a typed `SessionState` container — pure `src/session/state.ts`
  (`confirmationTokens` + `executions`, both empty) wired as the agent's State generic +
  `initialState`; **unused by READ** in this change — substrate only
- [x] 2.3 Per-session isolation: `freshSessionState()` returns an independent container per
  session (unit-tested — mutating one never leaks into another); READ parity holds by
  construction (same `createMcpServer(router)` as the existing transport-parity test). Live
  DO-instance isolation + endpoint parity are verified in §4 (needs the Workers runtime)

## 3. Real per-user OAuth via GitHub IdP (`endpoint-auth`)

- [x] 3.1 Replaced auto-approve `/authorize` with a GitHub OAuth login (`src/auth/github.ts`
  + the `authHandler`): `/authorize` redirects to GitHub (full `AuthRequest` round-tripped
  through the `state` param, no KV needed); `/callback` exchanges the code and fetches the
  GitHub identity. Pure helpers are fetch-injectable and unit-tested
- [x] 3.2 `completeAuthorization` with the real identity — `userId` = GitHub user id, `props`
  carry `{ userId, login, name }` so they reach the agent as `this.props`. DCR, discovery
  metadata, and `/token` are unchanged; unauth MCP → 401 + `WWW-Authenticate` is provided by
  the OAuthProvider on the protected API route. `/callback` reaches the handler because
  `apiRoute "/"` matches only the exact root (verified in the provider's `matchApiRoute`)
- [x] 3.3 GitHub client id/secret read from Worker secrets (`GITHUB_CLIENT_ID`/
  `GITHUB_CLIENT_SECRET`), never committed; missing config throws a clear error. Required
  secrets + the `wrangler secret put` commands documented in `wrangler.dev.jsonc`

## 4. Isolated deploy + verify (manual auth — user)

- [ ] 4.1 **(user)** Register a GitHub OAuth App (callback on the test host); set
  `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` as Worker secrets
- [ ] 4.2 **(user)** Create the dev `OAUTH_KV` namespace; put its id in
  `wrangler.dev.jsonc`
- [ ] 4.3 Deploy the stateful Worker (`npm run deploy:dev`); bind
  `makerperks-dev.mcpaql.com` on the `mcpaql.com` zone
- [ ] 4.4 Connect a real MCP client (claude.ai) through the **GitHub login**; confirm a
  session DO is instantiated and identity is present in `props`; READ ops return live results
- [ ] 4.5 **Verify the live endpoint is unchanged** — `https://makerperks.mcpaql.com` still
  serves the Stage 0 anonymous build (HTTP 200, `mcp_aql_read`, READ parity), separate
  Worker/KV/route confirmed

## 5. Validate

- [ ] 5.1 `openspec validate add-stateful-hosting --strict` passes
- [ ] 5.2 `npm run typecheck`, `npm run build`, `npm run lint`, `npm test` green
