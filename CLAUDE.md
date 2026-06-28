# MakerPerks MCP-AQL Adapter

Native [MCP-AQL](https://github.com/MCPAQL/spec) server over
[MakerPerks](https://github.com/natea/makerperks) — a token-cheap semantic interface
to the builder-perks directory for AI agents.

> **This file is stable project configuration only — what it is, the stack, tooling,
> and conventions.** Plans do NOT go here (they change and would bloat it):
> - the staged plan lives in **[`docs/ROADMAP.md`](docs/ROADMAP.md)**
> - the system model in **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**
> - active, `--strict`-validatable specs in **`openspec/changes/`**

## What this is (and is not)

- A standalone server in the MCP-AQL world (`MCPAQL` org / Dollhouse Research), modeled
  on **DollhouseMCP** (the canonical native MCP-AQL server).
- It **consumes** MakerPerks' *published* data contract (`perks.json` + the program
  JSON Schema). It does **not** read MakerPerks' source content, fork the dataset, or
  write back through code.
- The MakerPerks fork being contributed to lives separately at `mickdarling/makerperks`
  (`~/Developer/makerperks`), MIT.

## Stack

TypeScript · Node 20+ · `@modelcontextprotocol/sdk` (both `StdioServerTransport` and
`StreamableHTTPServerTransport`) · `ajv` + `ajv-formats` (schema validation) ·
`fuse.js` (fuzzy search).

## Conventions

- **Decoupling / license rule:** data (MIT) crosses in; **no AGPL code crosses back**
  to Nate's MIT repo (only MIT-safe data/docs may flow back). This repo's code/schemas
  are AGPL-3.0 + commercial; docs CC BY 4.0.
- **Spec-driven via OpenSpec.** Non-trivial work is a *change* under
  `openspec/changes/<name>/` (proposal + design + delta specs + tasks), implemented,
  validated `--strict`, then archived into `openspec/specs/`.
- **OpenSpec tooling is local + pinned + telemetry-off.** The CLI is
  `@fission-ai/openspec` (NEVER the bare `openspec` package — an unrelated `0.0.0`
  name-squat), pinned exact in `devDependencies`. Run via npm scripts so telemetry
  stays disabled: `npm run spec:list` · `npm run spec:validate <change>` ·
  `npm run spec -- <args>`.
- This is **backend/data/agent work** — the makerperks `impeccable` UI rule does not
  apply here.
- **Testing is two layers, both run by `npm test`:** the transport-agnostic core via
  `node:test` (`test/*.test.mjs`, against `dist/`), and the Workers/Durable-Object edge via
  `@cloudflare/vitest-pool-workers` (`test/workers/*.test.ts`, real workerd — proves per-user
  DO isolation). The workers harness uses `wrangler.test.jsonc` (a minimal config registering
  only `MakerProfileDO`, so it never loads the MCP-SDK-heavy worker). `npm run test:unit` /
  `test:workers` run one layer; `test:coverage` reports core coverage.
- Conventional commits. Dependency versions pinned exact (`.npmrc` `save-exact=true`).
