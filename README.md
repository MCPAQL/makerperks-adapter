# MakerPerks MCP-AQL Adapter

A native [MCP-AQL](https://github.com/MCPAQL/spec) server over
[MakerPerks](https://github.com/natea/makerperks) — the browseable, agent-friendly
directory of builder perks (free credits, discounts, and programs for startups,
students, OSS maintainers, indie devs, and non-profits).

It lets a maker's AI agent query the directory through **one token-cheap semantic
endpoint** instead of a wall of discrete MCP tools (~96% fewer registration tokens),
with runtime introspection for discovery. Later changes add an application pipeline
that drives the actual perk signups under a user-controlled autonomy switch.

- **Runs two ways from day one:** local **stdio** (add it to any MCP client) and
  remote **Streamable HTTP** (connect a hosted URL — zero install).
- **Decoupled from MakerPerks:** consumes the published `perks.json` + JSON Schema.
  No fork divergence; updates flow on refresh.

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — project configuration & conventions
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — the full staged plan (Stage 0 → 1 → 2)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system model & MCP-AQL primitives
- [`openspec/changes/`](openspec/changes/) — active, `--strict`-validatable specs

## Status

Stage 0 in progress — the read adapter + dual-transport foundation (OpenSpec change
`add-makerperks-adapter`). See [`docs/ROADMAP.md`](docs/ROADMAP.md) §7.

## License

Code & schemas: AGPL-3.0 (commercial tiers available, like the rest of the MCP-AQL
org). Docs: CC BY 4.0.
