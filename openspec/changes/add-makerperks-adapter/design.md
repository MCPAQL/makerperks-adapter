# Design — Add MakerPerks MCP-AQL Adapter

## Context

MakerPerks renders ~208 programs across ~185 providers and publishes them as a
static `perks.json` derived from one YAML-per-program source of truth. The consumers
we care about are makers operating AI agents against AI platforms, for whom a
conventional MCP server — one discrete tool per query shape — burns thousands of
registration tokens before any work begins. MCP-AQL exists to collapse that into a
few semantic endpoints with on-demand introspection. DollhouseMCP is the canonical
native MCP-AQL server and the pattern this adapter follows; `MCPAQL/mcpaql-adapter`
is the reference runtime.

This is the **foundational change** of a multi-change initiative. It deliberately
stops at the read layer plus a complete transport foundation, because the later
application-pipeline change (EXECUTE + autonomy switch + Execution Safety Loop) is
only safe to build on top of a server whose transport, session, and introspection
contracts are already settled.

## Goals / Non-Goals

**Goals:** a native MCP-AQL READ surface over the directory with mandatory
introspection and the standard discriminated wire format; **both** stdio and
Streamable HTTP transports working from the first release over one shared core; a
decoupled, schema-validated, refreshable data source consuming only MakerPerks'
published artifact; a structure that does not preclude the EXECUTE/pipeline layer.

**Non-Goals:** the application pipeline (EXECUTE operations) and autonomy switch;
per-provider automatability tagging and the web-only browser-automation handoff;
standing up the public hosted endpoint; any write/mutate path; storing user profiles
or credentials.

## Decision 1 — One transport-agnostic core, two thin transport bindings

The server is split into (a) a pure **request core** — parse an MCP-AQL request,
route by operation to a READ handler, validate params, return a discriminated result
— and (b) **transport bindings** that carry bytes. We implement two bindings against
the `@modelcontextprotocol/sdk`: `StdioServerTransport` and
`StreamableHTTPServerTransport`. The core never imports a transport; the entrypoint
selects one at launch (e.g. `--transport stdio|http`, default stdio).

This is the whole point of doing both now: a stdio-only server tends to grow
stdio-shaped assumptions (process-global state, stdout coupling) that are painful to
unwind. Building the HTTP binding immediately forces the core to stay
session-scoped and transport-clean from commit one.

_Alternatives:_ stdio-first, add HTTP later (rejected — the retrofit risk this change
exists to avoid); HTTP-only (rejected — local add-to-client via stdio is the fastest
path to first users and the simplest dev loop).

## Decision 2 — Streamable HTTP, not the legacy HTTP+SSE transport

For the remote binding we target MCP **Streamable HTTP**: a single endpoint that
accepts POSTed requests, MAY upgrade a response to an SSE stream, and manages
sessions via the `Mcp-Session-Id` header. We do not implement the deprecated
HTTP+SSE dual-endpoint transport.

This is the transport that makes the "connect a hosted URL, zero install" experience
real for the target audience, and it is the modern, supported remote transport in
the MCP SDK. Session management is specified here even though our READ surface is
stateless, because the pipeline change *will* need per-session state (confirmation
tokens, execution context) and the session contract must be right from the start.

_Alternatives:_ legacy HTTP+SSE (rejected — deprecated, two-endpoint complexity);
a bespoke REST shim (rejected — abandons MCP client compatibility, which is the
entire distribution story).

## Decision 3 — READ-only CRUDE surface plus mandatory introspection

We expose the **READ** endpoint family only: `list_programs`, `get_program`,
`search_programs`, and the required `introspect`. All return
`{ success, data }` / `{ success, error }`; unknown parameters are rejected with
`VALIDATION_UNKNOWN_PARAM` (catches agent hallucination). The full operation +
parameter + type catalog is served by `introspect`, so clients discover capability
at runtime rather than paying for N tool schemas up front.

The CREATE/UPDATE/DELETE/EXECUTE families are intentionally absent in this change.
The router is built to register additional families later (the pipeline's EXECUTE
operations) without restructuring.

_Alternatives:_ single-mode (one `mcp_aql` tool) for maximum (~96%) token savings
(reasonable, and we keep it open via config, but semantic CRUDE READ reads more
clearly for a first release and is the recommended default profile); discrete tools
per query (rejected — the bloat MCP-AQL exists to eliminate).

## Decision 4 — Decouple at the published `perks.json`, validate against the schema

The adapter fetches/loads MakerPerks' published `perks.json` and validates it against
a JSON Schema for the **published payload** (`ajv`) before serving. Note: `perks.json`
is a *flattened projection* (`{ name, count, programs: [{ slug, provider,
value_display, … }] }`), not MakerPerks' per-program source records — so we validate
against a payload schema authored here, not `program.schema.json` (which validates the
source YAML we never read). The validator is **lenient to additive upstream fields**
but strict on the fields we depend on, so missing/mis-typed required fields fail loud.
It holds the data in memory and exposes a refresh path. It never reads Nate's source
YAML, never forks the dataset, and never writes back through code — only the public
artifact crosses the boundary.

This keeps the MIT↔AGPL license boundary clean (data crosses, code does not),
prevents fork divergence (upstream edits arrive on refresh), and means a schema drift
upstream surfaces as a loud validation error rather than silent wrong answers.

_Alternatives:_ vendoring/forking the YAML (rejected — divergence + license tangle);
reading the source content collection directly (rejected — couples to Astro internals
and breaks the decoupling); a database mirror (rejected — needless backend for ~208
static rows).

## Decision 5 — Query results carry decision signal, not just identifiers

`list`/`search`/`get` results include the fields a maker (or their agent) needs to
decide without a second call: title, provider, persona/audience, value (amount /
"up to" / range), region, eligibility/caveats, verified date, and the redemption URL.
This mirrors MakerPerks' own "scan and compare" principle and pre-positions the data
the pipeline change will act on.

_Note:_ explicit **API-based vs web-only automatability** tagging is **not** in this
change — that classification requires a provider-flow dataset MakerPerks does not
carry, and lands with the pipeline. Here we surface whatever redemption metadata the
published record already provides.

## Risks / Trade-offs

- **Streamable HTTP session/auth surface** is larger than stdio (CORS, origin
  checks, session lifecycle, eventual auth) → for this change the HTTP endpoint is
  unauthenticated and intended for local/trusted use; public exposure + auth is the
  hosted-deployment change. We still implement origin validation and session handling
  now so the contract is correct.
- **Upstream schema drift** → hard-validate on load; fail loud with a clear error
  rather than serving malformed records.
- **Refresh staleness** (in-memory cache goes stale vs. live `perks.json`) → expose
  an explicit refresh trigger + a configurable TTL; document the trade-off.
- **Over-building for a read-only surface** (sessions we don't yet use) → accepted
  deliberately: the pipeline change needs them, and getting the session contract
  right once is cheaper than changing it under EXECUTE.

## Open Questions

- Data load mode: fetch the live `https://makerperks.com/perks.json` at start, or
  read a built copy from the local fork during dev? (Leaning: configurable source
  URL/path, default to the live published URL.)
- Default endpoint profile: semantic CRUDE READ (clarity) vs single-mode (max token
  savings) — ship CRUDE READ as default, single-mode behind config?
- Search: reuse MakerPerks' Fuse weighting/synonym approach, or a thinner matcher for
  the agent context (agents tolerate stricter matching than humans)?
- Package/runtime name and npm scope for the stdio distribution
  (`@mcpaql/makerperks-adapter`?).
