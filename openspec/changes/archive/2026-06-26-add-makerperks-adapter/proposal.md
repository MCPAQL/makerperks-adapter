## Why

There is hundreds of thousands of dollars in builder credits and programs scattered
across viral posts and unmaintained lists, and most makers never claim a cent.
MakerPerks already answers *"I am X — what can I claim?"* for humans and publishes a
clean machine contract (`perks.json`, `llms.txt`, schema.org JSON-LD). But the
maker's actual workflow happens inside an **AI agent**, and there is no first-class
way for that agent to consume the directory — let alone act on it.

A native MCP-AQL adapter closes that gap. MCP-AQL specifically, for two reasons: it
collapses what would be a wall of discrete MCP tools into **one semantic READ
endpoint plus runtime introspection (~96% fewer registration tokens)**, which the
target audience — makers running agents against AI platforms — feels directly; and
it is the substrate for the later application-automation pipeline (EXECUTE + the
Execution Safety Loop), so the read layer and the act layer share one server.

This foundational change builds the server, its data source, and — deliberately —
**both client transports from day one**. Stdio (local, add-to-client) and Streamable
HTTP (remote, paste-a-URL hosted endpoint) are designed in together over one
transport-agnostic core, so we never ship a stdio-only server and retrofit HTTP
later.

## What Changes

- **A new native MCP-AQL server** over the MakerPerks dataset. It exposes a CRUDE
  **READ** endpoint family (list / get / search programs) plus the mandatory
  `introspect` operation, returning the standard discriminated
  `{ success, data | error }` wire format. No discrete per-program tools.
- **Dual client transport, built in from the start.** The same server core runs over
  **stdio** and over **Streamable HTTP** (the MCP remote transport: a single HTTP
  endpoint with optional SSE streaming and session management). Transport is a thin
  binding chosen at launch; operation semantics are identical across both.
- **A decoupled data source.** The adapter loads the MakerPerks **published**
  `perks.json` and validates it against the program JSON Schema, refreshing to pick
  up upstream updates. It never forks or hand-edits the data — the published artifact
  is the only thing that crosses the MIT↔AGPL boundary.
- **Token-efficient discovery.** Operations, parameters, and types are discoverable
  at runtime via `introspect`, not pre-loaded as N tool schemas.

## Capabilities

### New Capabilities

- `server-transport`: dual stdio + Streamable HTTP client transport over a single
  transport-agnostic request core.
- `directory-query`: an MCP-AQL READ endpoint family (list / get / search) plus
  mandatory introspection over the perks dataset.
- `data-source`: load + schema-validate + refresh the MakerPerks published
  `perks.json` as the adapter's source of truth.

### Modified Capabilities

(none — new repository.)

## Impact

- **Affected specs:** all new — `server-transport`, `directory-query`, `data-source`.
- **Affected code:** new repository (`MCPAQL/makerperks-adapter`). TypeScript / Node
  20+. `@modelcontextprotocol/sdk` for both `StdioServerTransport` and
  `StreamableHTTPServerTransport`; a small MCP-AQL operation router + introspection;
  a data loader/validator over `perks.json`; a fuzzy query helper.
- **Dependencies:** `@modelcontextprotocol/sdk`, a JSON-Schema validator (`ajv` +
  `ajv-formats`, mirroring MakerPerks' own validation), and a fuzzy matcher
  (`fuse.js`) for search.
- **Non-goals / tracked follow-up (separate change[s]):**
  - The **application pipeline** — CRUDE **EXECUTE** operations that drive perk
    signups (assemble → submit → track), composed via batch-with-halting.
  - The **user-selectable autonomy switch** (review-each / auto-low-risk / full-auto)
    enforced via danger levels + confirmation tokens + the Execution Safety Loop.
  - **Per-provider automatability tagging** (API-based vs web-only) and the
    **web-only handoff** to a browser-automation harness. This needs a new
    provider-flow dataset MakerPerks does not carry; it lands with the pipeline.
  - **Hosted deployment infrastructure** (the Worker/edge runtime that exposes the
    Streamable HTTP endpoint publicly). This change makes the server *capable* of
    Streamable HTTP; standing up the hosted endpoint is its own change.
