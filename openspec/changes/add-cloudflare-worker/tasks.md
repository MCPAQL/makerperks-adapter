# Tasks — Add Cloudflare Worker (public HTTPS endpoint)

> **Scope:** host the existing Stage 0 READ surface as a public HTTPS Streamable HTTP
> endpoint on Cloudflare Workers at `makerperks.mcpaql.com`, reusing the core. Endpoint
> auth, per-session/stateful ops, and `McpAgent` are **out of scope** (they arrive with the
> Stage 1 pipeline — see proposal "Non-goals").
>
> **Definition of done:** all tasks `[x]`, `openspec validate add-cloudflare-worker --strict`
> passes, typecheck/build/lint green, and an MCP client connects to the live HTTPS endpoint.
>
> **Sections 1–3 need no Cloudflare account; Section 4 (deploy) needs an interactive
> `wrangler login` by the user.**

## 1. Edge-safe data source (`data-source`)

- [ ] 1.1 Make the `node:fs/promises` import in `src/data/source.ts` **lazy** — imported only
  inside the local file-path branch — so URL sources pull in no filesystem module
- [ ] 1.2 Confirm a URL source loads with zero filesystem access; local-path source still works
- [ ] 1.3 Existing `node:test` suite stays green

## 2. Worker entry (`hosted-endpoint`)

- [ ] 2.1 Add `src/worker.ts`: build the `Router` via `buildApp` (URL source + TTL cache),
  register the single `mcp_aql_read` tool, dispatch to `router.dispatch`
- [ ] 2.2 Serve it over Streamable HTTP using the Cloudflare `agents` SDK `createMcpHandler`
  (stateless); confirm exact API against current Cloudflare docs
- [ ] 2.3 Cache the loaded dataset across requests (module-global) with the existing TTL;
  fetch on first use

## 3. Deploy config (`hosted-endpoint`)

- [ ] 3.1 Add `wrangler.jsonc` (name, `compatibility_date`, `main: src/worker.ts`,
  `workers_dev` for a pre-DNS smoke URL)
- [ ] 3.2 Add deps: `agents` (Cloudflare) + `@cloudflare/workers-types` (dev); add a
  `deploy` npm script
- [ ] 3.3 Build the Worker bundle locally (`wrangler deploy --dry-run`) and confirm it
  compiles with no Node-only dependencies

## 4. Deploy + DNS (manual auth)

- [ ] 4.1 **(user)** `wrangler login` on the Cloudflare account that owns `mcpaql.com`
- [ ] 4.2 Deploy; add the route binding `makerperks.mcpaql.com` on the `mcpaql.com` zone
- [ ] 4.3 Confirm HTTPS + a valid certificate at `https://makerperks.mcpaql.com`

## 5. Verify

- [ ] 5.1 Connect a real MCP client to `https://makerperks.mcpaql.com`; list tools; call
  `introspect` and a READ op
- [ ] 5.2 Parity: the hosted endpoint returns the same results as the local transports
- [ ] 5.3 `openspec validate add-cloudflare-worker --strict` + typecheck/build/lint green
