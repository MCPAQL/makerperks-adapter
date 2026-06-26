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

- [ ] 1.1 Add `agents` (Cloudflare McpAgent) to dependencies, pinned exact (`.npmrc`)
- [ ] 1.2 Add `wrangler.dev.jsonc`: distinct `name` (`makerperks-adapter-dev`),
  `main: dist/worker-stateful.js`, the test route (`makerperks-dev.mcpaql.com`,
  `custom_domain`), `workers_dev`, a **separate** `OAUTH_KV` namespace binding, and the
  Durable Object binding + migration for the `McpAgent` class
- [ ] 1.3 Add a telemetry-off `deploy:dev` npm script targeting `wrangler.dev.jsonc`;
  leave `npm run deploy` (live) and `src/worker.ts`/`wrangler.jsonc` untouched
- [ ] 1.4 `wrangler deploy --dry-run -c wrangler.dev.jsonc` builds clean (no Node-only deps)

## 2. Per-session substrate via McpAgent + Durable Object (`stateful-session`)

- [ ] 2.1 Add `src/worker-stateful.ts`: an `McpAgent` subclass that builds the `Router` via
  `buildApp` (URL source + TTL, cached per isolate) and mounts `createMcpServer(router)` —
  same single `mcp_aql_read` READ surface, now session-backed
- [ ] 2.2 Define a typed `SessionState` container on the agent (home for confirmation
  tokens + execution context); **unused by READ** in this change — substrate only
- [ ] 2.3 Confirm per-session isolation: two concurrent sessions get distinct DO instances;
  READ results are identical to the live endpoint (parity preserved)

## 3. Real per-user OAuth via GitHub IdP (`endpoint-auth`)

- [ ] 3.1 Replace the auto-approve `/authorize` with a GitHub OAuth login: redirect to
  GitHub, handle the callback, fetch the GitHub identity
- [ ] 3.2 Complete authorization with the real identity — `userId` = GitHub user id, `props`
  carry login/profile — so it reaches the agent as `this.props`; retain DCR, discovery
  metadata, token endpoint; unauth MCP → 401 + `WWW-Authenticate`
- [ ] 3.3 Read GitHub client id/secret from Worker secrets (never committed); document the
  required secrets in the deploy notes

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
