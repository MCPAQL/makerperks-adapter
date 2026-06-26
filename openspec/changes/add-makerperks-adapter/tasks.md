# Tasks — Add MakerPerks MCP-AQL Adapter

> **Scope:** the foundational read adapter + a complete dual-transport foundation
> (stdio + Streamable HTTP) over one transport-agnostic core. The application
> pipeline (EXECUTE), the autonomy switch, per-provider automatability tagging /
> web-only handoff, and the public hosted endpoint are **separate follow-up changes**
> (see proposal "Non-goals") and are NOT in this change.
>
> **Definition of done** (per MCP-AQL / makerperks conventions): all tasks `[x]`,
> `openspec validate add-makerperks-adapter --strict` passes, and typecheck + build +
> lint are green. This is backend/data/agent work — the `impeccable` UI rule does not
> apply.

## 1. Repository scaffold

- [x] 1.1 Initialize the TypeScript / Node 20+ package (`package.json`, `tsconfig`,
  lint/format config, AGPL-3.0 + commercial license files matching the MCP-AQL org)
- [x] 1.2 Add dependencies: `@modelcontextprotocol/sdk`, `ajv` + `ajv-formats`,
  `fuse.js`
- [x] 1.3 Lay out `src/` as core (transport-agnostic) vs. transport bindings vs.
  data source, so no core module imports a transport

## 2. Data source (`data-source`)

- [x] 2.1 Implement a loader that reads `perks.json` from a configurable source
  (default: live published URL; alt: local path to a built copy)
- [x] 2.2 Author a JSON Schema for the published `perks.json` **payload** (a flattened
  projection — NOT the per-program source schema) and validate loaded data with `ajv`;
  on non-conformance, fail loudly with a clear error
- [x] 2.3 Hold data in memory; expose an explicit refresh trigger + a configurable
  TTL; confirm a refresh reflects upstream changes with no redeploy
- [x] 2.4 Confirm the adapter reads only the published artifact — no source-collection
  or fork access, no write-back

## 3. Request core + READ surface (`directory-query`)

- [x] 3.1 Implement the MCP-AQL request core: parse `{ operation, params }`, route by
  operation, validate params (required, type, reject unknown →
  `VALIDATION_UNKNOWN_PARAM`), return discriminated `{ success, data | error }`
- [x] 3.2 Implement `list_programs` with filters (audience/persona, tag, region,
  min value); results carry decision signal (title, provider, audience, value,
  region, eligibility/caveats, verified date, redemption URL)
- [x] 3.3 Implement `get_program` by identifier/slug
- [x] 3.4 Implement `search_programs` (fuzzy, ranked) via `fuse.js`
- [x] 3.5 Implement mandatory `introspect` (all operations + a single named
  operation). (Exposing it as an MCP tool in registration lands with the transports
  in §4.)
- [x] 3.6 Register the READ endpoint family via a router built to accept further
  families later (no restructuring needed to add EXECUTE)

## 4. Transports (`server-transport`)

- [ ] 4.1 Wire the **stdio** binding (`StdioServerTransport`) as the default launch
  mode
- [ ] 4.2 Wire the **Streamable HTTP** binding (`StreamableHTTPServerTransport`):
  single endpoint, POST + optional SSE, `Mcp-Session-Id` session management, `Origin`
  validation; do NOT use the deprecated HTTP+SSE transport
- [ ] 4.3 Launch selection (`--transport stdio|http`, default stdio); both share the
  same request core
- [ ] 4.4 Release session-scoped state on session termination / disconnect

## 5. Verify

- [ ] 5.1 Transport parity: the same operation + params over stdio and over Streamable
  HTTP returns identical results and wire format
- [ ] 5.2 READ behavior: list/get/search/introspect each return the discriminated
  format; an unknown param is rejected with `VALIDATION_UNKNOWN_PARAM`; a typo query
  still finds the right program; an empty match is a success, not an error
- [ ] 5.3 Data: a schema-invalid `perks.json` fails loudly; a refresh reflects an
  upstream change
- [ ] 5.4 Connect from a real MCP client over stdio (local add-to-client) and over
  Streamable HTTP (URL) and confirm discovery + a query both work
- [ ] 5.5 `openspec validate add-makerperks-adapter --strict` passes; typecheck +
  build + lint green
