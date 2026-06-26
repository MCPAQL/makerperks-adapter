# MakerPerks MCP-AQL Adapter

A native [MCP-AQL](https://github.com/MCPAQL/spec) server over
[MakerPerks](https://github.com/natea/makerperks) — the browseable, agent-friendly
directory of builder perks (free credits, discounts, and programs for startups,
students, OSS maintainers, indie devs, and non-profits).

It exposes the **whole** directory (200+ programs) to an AI agent through **one
token-cheap semantic tool** (`mcp_aql_read`, **~120 tokens**) instead of a wall of
discrete MCP tools — the operations are discovered at runtime via introspection.
That's ~95%+ fewer tool-registration tokens than a conventional "a tool per query"
server.

## Connect

- **Hosted (zero install):** add **`https://makerperks.mcpaql.com`** as a remote MCP
  connector (claude.ai, Claude Code, Cursor, …). OAuth registers automatically.
- **Local (stdio):** `npm install && npm run build`, then point your MCP client at
  `node dist/index.js`.

Then call `mcp_aql_read` with `{ "operation": "introspect" }` to discover the
operations: `list_programs`, `get_program`, `search_programs`.

## How it works

- Native MCP-AQL **READ** surface over MakerPerks' published `perks.json` — decoupled
  from MakerPerks (no fork divergence; updates flow on refresh).
- **stdio + Streamable HTTP** transports over one transport-agnostic core.
- Hosted on **Cloudflare Workers** (web-standard Streamable HTTP), fronted by **OAuth
  2.1 + dynamic client registration** so OAuth-mandatory clients connect. The endpoint
  is **public and read-only**.

## Status

- **Live:** read adapter + dual transport + Cloudflare hosting + OAuth — done and
  archived (`openspec/specs/`).
- **Next — Stage 1:** an application pipeline that drives the actual perk signups under a
  user-controlled autonomy switch. Tracked as GitHub issues (epic
  [#22](https://github.com/MCPAQL/makerperks-adapter/issues/22)).

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — project configuration & conventions
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — the staged plan
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system model & MCP-AQL primitives
- [`openspec/specs/`](openspec/specs/) — the spec baseline (capabilities)

## License

Code & schemas: AGPL-3.0 (commercial tiers available, like the rest of the MCP-AQL
org). Docs: CC BY 4.0.
