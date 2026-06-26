# Tasks — Add endpoint OAuth (client compatibility)

> **Scope:** front the live MCP endpoint with a cross-platform OAuth 2.1 server (DCR) so
> OAuth-mandatory clients (claude.ai first) connect. **Anonymous / auto-approve** — public data,
> no real gating. Real per-user/scoped auth is **Stage 1** (see proposal "Non-goals").
>
> **Definition of done:** all tasks `[x]`, `openspec validate add-endpoint-oauth --strict`
> passes, typecheck/build/lint green, the OAuth flow works end-to-end (metadata → DCR →
> authorize → token → authenticated MCP call), and claude.ai connects.

## 1. Infra + deps

- [x] 1.1 Create a Cloudflare KV namespace `OAUTH_KV` (`wrangler kv namespace create`,
  id `609312bd…`) and bind it in `wrangler.jsonc`
- [x] 1.2 Add `@cloudflare/workers-oauth-provider` (runtime, pinned `0.8.1`) +
  `@cloudflare/workers-types` (dev, for the Worker's Cloudflare types)

## 2. OAuth provider wiring

- [ ] 2.1 Restructure `src/worker.ts`: `export default new OAuthProvider({ apiHandler: <MCP
  fetch handler>, apiRoute, defaultHandler: <authorize>, authorizeEndpoint, tokenEndpoint,
  clientRegistrationEndpoint, scopesSupported })` — confirm exact API against the installed types
- [ ] 2.2 Implement the auto-approve `/authorize` `defaultHandler`: `parseAuthRequest` →
  `completeAuthorization({ userId: "public", scope, props: {} })` → redirect back with the code
- [ ] 2.3 Keep the MCP `apiHandler` as the existing stateless transport wiring (surface
  unchanged); accept the validated request regardless of `props`
- [ ] 2.4 Remove the hotfix 404 shim for `/.well-known/*` + `/register` (the provider owns them)

## 3. Verify the flow

- [ ] 3.1 Metadata: `/.well-known/oauth-authorization-server` + `/.well-known/oauth-protected-resource`
  return 200 valid metadata
- [ ] 3.2 Scripted end-to-end: DCR → authorize (auto-approve) → token exchange → MCP call with
  the token returns `introspect` (4 ops) + a READ op
- [ ] 3.3 A no-token MCP request is handled per the provider's policy (unauth → 401 with
  `WWW-Authenticate`, so clients discover the auth server)

## 4. Deploy + verify with a real client

- [ ] 4.1 Deploy; confirm the OAuth metadata + MCP both live at `https://makerperks.mcpaql.com`
- [ ] 4.2 **(user)** Add the connector in **claude.ai** and confirm it registers + connects
- [ ] 4.3 `openspec validate add-endpoint-oauth --strict` + typecheck/build/lint green
