# Architecture

The system model and the MCP-AQL protocol primitives this adapter depends on. For
*what we build when*, see [`ROADMAP.md`](ROADMAP.md). Normative protocol details live
in the [MCP-AQL spec](https://github.com/MCPAQL/spec) (local:
`~/Developer/dollhouse research/MCPAQL/spec`); **DollhouseMCP** is the reference native
MCP-AQL server.

## 1. Three layers

1. **Read surface** *(Stage 0)* — a CRUDE **READ** family over the directory
   (`list_programs`, `get_program`, `search_programs`, `introspect`). Stateless; this
   is the token-efficiency win and the foundation everything else sits on.
2. **Application pipeline** *(Stage 1)* — **EXECUTE** operations that drive perk
   applications (`start_application` → `submit_step` → `get_status`), composed via
   batch-with-halting, gated by the autonomy switch.
3. **Provider connectors** *(Stage 1–2)* — per-provider flows. API-based providers run
   in-pipeline; web-only providers are a prepared handoff to an external
   browser-automation agent (the adapter never drives a headless browser itself).

## 2. Server design — one core, two transports

The single most important structural rule (Stage 0): a **transport-agnostic request
core** with **thin transport bindings**.

- **Request core:** parse an MCP-AQL request `{ operation, params }` → route by
  operation to a handler → validate params (required, type, reject unknown →
  `VALIDATION_UNKNOWN_PARAM`) → return the discriminated `{ success, data | error }`
  wire format. The core imports **no** transport API and holds no transport-global
  state.
- **Transport bindings** carry bytes against `@modelcontextprotocol/sdk`:
  - **stdio** (`StdioServerTransport`) — default; local add-to-client; simplest dev
    loop and fastest path to first users.
  - **Streamable HTTP** (`StreamableHTTPServerTransport`) — single endpoint, POST +
    optional SSE upgrade, sessions via `Mcp-Session-Id`, `Origin` validation. The
    paste-a-URL remote path. **Not** the deprecated HTTP+SSE dual-endpoint transport.
- Launch selects the binding (`--transport stdio|http`, default stdio). Both produce
  identical results for the same operation.

**Why both from day one:** a stdio-only server grows stdio-shaped assumptions
(process-global state, stdout coupling) that are painful to unwind. Building the HTTP
binding immediately forces the core to stay session-scoped and transport-clean. Note
the READ surface is stateless, but we settle the **session contract now** because the
Stage-1 pipeline needs per-session state (confirmation tokens, execution context).

### Planned `src/` layout

```
src/
  index.ts              # entry: parse flags, pick transport, start server
  core/
    wire.ts             # request/response types, discriminated result, error codes
    router.ts           # operation registry + dispatch (built to accept more families)
    introspect.ts       # mandatory introspection over the registry
  data/
    source.ts           # load + schema-validate + refresh perks.json
  operations/
    read.ts             # list_programs / get_program / search_programs
  transports/
    stdio.ts            # StdioServerTransport binding
    http.ts             # StreamableHTTPServerTransport binding (sessions, origin)
```

## 3. MCP-AQL primitives we rely on

| Primitive | What it gives us | Used in |
|---|---|---|
| **CRUDE endpoints** | Many tools collapse into a few semantic endpoints (READ now; EXECUTE later) | 0, 1 |
| **Mandatory introspection** | Runtime discovery of operations/params/types — no preloaded tool schemas (the token win) | 0 |
| **Discriminated wire format** | Every result is `{ success, data }` or `{ success, error }`; unknown params rejected | 0 |
| **EXECUTE lifecycle** | Non-idempotent, stateful application steps (pending→running→completed) | 1 |
| **Batch-with-halting** | A sequence of ops that **halts** at the first confirmation-required step and resumes with a token — safe multi-step application flows | 1 |
| **Confirmation tokens** | Session-scoped, single-use, time-limited, param-bound approval for gated steps | 1 |
| **Danger levels (0–4) + trust** | Classify each step's risk; the autonomy switch is a threshold over these | 1 |
| **Execution Safety Loop** | Agent reports each intended action → `AutonomyDirective { continue }`; pause/escalate. The multi-step orchestration + safety spine | 1 |
| **Challenge-Response** | Out-of-band code (LLM can't see it) for the highest-risk actions | 1 |

The autonomy switch (ROADMAP §4 Stage 1) is **not new machinery** — it is a
configured danger-level threshold enforced by the confirmation + Execution Safety Loop
primitives above.

## 4. Data source & license boundary

The adapter loads MakerPerks' **published** `perks.json`, validates it against the
program JSON Schema with `ajv` (mirroring MakerPerks' own CI gate), holds it in memory,
and exposes a refresh path (trigger + configurable TTL). It never reads the source
content collection, forks the data, or writes back through code.

- **Boundary:** data (MIT) crosses in; AGPL code never crosses back to Nate's MIT repo.
- **Drift safety:** a schema-invalid `perks.json` fails loud rather than serving
  malformed records.
- Query results carry decision signal (title, provider, audience, value, region,
  eligibility/caveats, verified date, redemption URL) so an agent decides without a
  second call — and so Stage 1 has the fields it will act on.

## 5. Security model (Stage 1+)

Acting on a maker's behalf is the sensitive part. Rules, designed in from Stage 1:

- **No stored passwords where OAuth / scoped tokens exist.** Prefer delegated,
  revocable credentials.
- **A profile + credential vault** the adapter assembles applications from — this is
  per-user state the protocol does *not* provide (confirmation tokens are
  session-scoped, not persistent storage). It is our backend's responsibility, kept
  separate from the stateless read core.
- **Per-action approval** governed by the autonomy switch; **audit log** of every
  action taken; **Challenge-Response** for payment / real-identity steps.
- Never auto-assert false eligibility.

## 6. Infra gaps (known, for Stage 2 hosting)

- The MCP-AQL **adapter-studio hosted tier is unbuilt**, and the adapter-generator
  emits **Node stdio** servers, not Workers. So the public Streamable HTTP endpoint
  needs a **Worker/edge shim** around the HTTP transport + auth — that is real Stage-2
  work, not a flip of a switch.
- There is **no MCP-AQL adapter registry/marketplace** yet; distribution is via the
  stdio package (add-to-client) and, later, the hosted URL.
- The **adapter-generator is a 1:1 projection of an existing MCP server** (bearer-token
  only); it does not synthesize signup flows. It helps Stage 2 only for providers that
  already expose an MCP/API server — not for web-only signups.
