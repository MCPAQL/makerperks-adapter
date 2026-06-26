# MakerPerks MCP-AQL Adapter — Roadmap

The plan of record for this initiative. It is intentionally complete and
self-contained so the scope and sequencing live in files, not in any
conversation. Architecture details are in [`ARCHITECTURE.md`](ARCHITECTURE.md);
the protocol facts we rely on are summarized there with pointers to the
[MCP-AQL spec](https://github.com/MCPAQL/spec).

## 1. Why

There are hundreds of thousands of dollars in builder credits and programs scattered
across viral posts and unmaintained lists, and most makers never claim a cent.
MakerPerks already answers *"I am X — what can I claim?"* for humans and publishes a
clean machine contract. But the maker's real workflow happens inside an **AI agent**,
and there is no first-class way for that agent to consume the directory — let alone
act on it.

This adapter closes that gap, and does it in **MCP-AQL specifically** for two reasons:

1. **Token efficiency.** A conventional MCP server exposes one discrete tool per query
   shape and burns thousands of registration tokens before any work begins. MCP-AQL
   collapses that into a few semantic endpoints plus runtime introspection
   (~85–96% reduction). The target audience — **makers running agents against AI
   platforms** — feels this directly.
2. **It is the substrate for action.** The same server that answers "what can I claim"
   later *drives the applications* (EXECUTE + the Execution Safety Loop). Read and act
   share one server.

Strategic frame: MakerPerks' audience **is** MCP-AQL's target audience, so this adapter
is also a flagship, on-audience demo that drives MCP-AQL adoption.

## 2. Topology & license boundary

Three pieces, two worlds, decoupled at the data contract:

| Piece | Location | License | Role |
|---|---|---|---|
| MakerPerks fork | `mickdarling/makerperks` (`~/Developer/makerperks`) | MIT | Contribution vehicle to Nate; `upstream` = `natea/makerperks` |
| **This adapter** | `MCPAQL/makerperks-adapter` (Dollhouse Research) | AGPL-3.0 + commercial | The product / flagship demo |
| The data contract | MakerPerks' published `perks.json` + JSON Schema | MIT (data) | The **only** thing that crosses the boundary |

**Rule:** data crosses, code does not. The adapter consumes the published artifact;
no AGPL code is contributed into Nate's MIT repo (only MIT-safe data/docs may flow
back). This keeps licensing clean and avoids fork divergence — upstream data updates
arrive on refresh.

## 3. Audience decision (load-bearing)

Target = **makers who work with AI platforms**, *not* Pi users. Consequences that
shaped the architecture:

- Build as a **standard native MCP-AQL server** consumable by mainstream MCP clients
  (Claude Desktop / Claude Code, Cursor, etc.). **No dependency on pi-bridge.**
- **Dual transport from day one** (see ARCHITECTURE): local **stdio** (add-to-client)
  *and* remote **Streamable HTTP** (paste-a-URL, zero install). The hosted URL is the
  lowest-friction path for this audience.

## 4. The stages

Each stage is one or more OpenSpec changes. A stage is "done" when its changes are
implemented, `openspec validate --strict` passes, build/typecheck/lint are green, and
the change is archived into `openspec/specs/`.

### Stage 0 — Read adapter + dual-transport foundation  *(ACTIVE)*

**Goal:** a native MCP-AQL **READ** surface over the directory, with **both**
transports working over one transport-agnostic core from the first release.

**Scope / deliverables:**
- CRUDE **READ** endpoint family: `list_programs`, `get_program`, `search_programs`,
  plus mandatory `introspect`. Discriminated `{ success, data | error }` wire format;
  unknown params rejected (`VALIDATION_UNKNOWN_PARAM`).
- **Dual transport:** stdio (default) + Streamable HTTP (single endpoint, optional
  SSE, `Mcp-Session-Id` sessions, origin validation). Not the deprecated HTTP+SSE.
- **Data source:** load + JSON-Schema-validate + refresh MakerPerks' published
  `perks.json`. Results carry decision signal (value, audience, eligibility, verified
  date, redemption URL).

**OpenSpec change:** `add-makerperks-adapter` (capabilities `server-transport`,
`directory-query`, `data-source`; 22 tasks; validates `--strict`).

**Explicitly NOT in Stage 0:** any write/EXECUTE path, the autonomy switch, provider
automatability tagging, the public hosted endpoint. Stage 0 makes the server *capable*
of Streamable HTTP; standing up the hosted endpoint is Stage 2.

### Stage 1 — Application pipeline + autonomy switch (API-based providers)

**Goal:** an agent drives real perk applications for a handful of **API-based**
providers, with the human in the loop exactly as much as they choose.

**Scope / deliverables:**
- **EXECUTE** operations for the application lifecycle (`start_application` →
  `submit_step` → `get_status`), composed via **batch-with-halting**.
- **User-selectable autonomy switch** — asked up front, changeable anytime, keeping
  the user in control. Three modes, implemented as a danger-level threshold enforced
  by confirmation tokens + the Execution Safety Loop:
  1. **Review each** — every submission pauses for approval (gate at danger 0).
  2. **Auto low-risk** — auto-submit danger 0–1 (free-tier / OAuth-only / no payment,
     no identity assertion); escalate danger ≥2.
  3. **Full auto** — submit within policy; the highest-risk steps (payment, real
     identity) still hit out-of-band Challenge-Response.
- **Per-provider automatability tagging** surfaced in query results: **API-based**
  (in-pipeline automatable) vs **web-only** (no API). This needs a new provider-flow
  dataset this repo owns (MakerPerks does not carry it).
- **Profile + credential model** (the security-sensitive part): assemble applications
  from a stored maker profile. Prefer OAuth / scoped tokens over stored passwords;
  per-action approval; audit log. See ARCHITECTURE "Security model."
- Target the ~3–5 highest **(value × automatability)** API-based providers first.

**OpenSpec change(s):** e.g. `add-application-pipeline`, `add-autonomy-switch`
(to be proposed when Stage 1 starts).

### Stage 2 — Coverage, web-only handoff, and hosting

**Goal:** broaden coverage and remove the last frictions.

**Scope / deliverables:**
- **Web-only handoff.** For providers with no API, the pipeline pre-assembles
  everything and hands off to an external **browser-automation harness/agent**
  (computer-use / browser-use style). The user is told which providers are web-only
  and routed to that path. The adapter does not itself drive headless browsers.
- **Expand provider coverage** incrementally (the long tail; each provider flow is
  bespoke; the MCP-AQL adapter-generator helps only for providers that already expose
  an MCP/API server).
- **Hosted Streamable HTTP endpoint.** Stand up the public remote endpoint
  (paste-a-URL). Known gap: the MCP-AQL studio hosted tier is unbuilt and generated
  adapters are Node stdio, so this needs a Worker/edge shim around the HTTP transport
  + auth. (See ARCHITECTURE "Infra gaps.")
- Optional: list the adapter / MCP-AQL in MakerPerks' agent section (an MIT-safe data
  PR to Nate) to close the traffic loop.

## 5. Cross-cutting decisions (apply across stages)

- **Dual transport is foundational, not retrofit** (Stage 0). One transport-agnostic
  core; stdio + Streamable HTTP are thin bindings.
- **Decouple at `perks.json`**; never fork the data; validate against the schema and
  fail loud on drift.
- **Autonomy is the user's dial, never the product's default.** The agent always
  reports what it is about to do; modes only change *how often* the user is asked.
- **Web-only ≠ automatable in-pipeline.** Those are always a prepared handoff to a
  browser-automation agent, regardless of autonomy mode.
- **Security is first-class from Stage 1.** No stored passwords where OAuth/scoped
  tokens exist; per-action approval; audit log; Challenge-Response for the riskiest.

## 6. Open questions (tracked, not blocking)

- Data load mode: fetch live `makerperks.com/perks.json` vs. read a built copy from the
  local fork (leaning: configurable source, default live URL).
- Default endpoint profile: semantic CRUDE READ (clarity) vs single-mode (max token
  savings) — ship CRUDE READ default, single-mode behind config?
- Published npm scope/name for the stdio distribution (`@mcpaql/makerperks-adapter`?).
- Where the Stage-1 provider-flow dataset lives and its schema.

## 7. Status

- **Stage 0 — DONE** (2026-06-26): `add-makerperks-adapter` implemented — all 22 tasks
  complete, `--strict`-validated, and **archived into `openspec/specs/`** (baseline:
  `server-transport`, `directory-query`, `data-source`). The adapter is a working MCP
  server over **stdio and Streamable HTTP** exposing a single `mcp_aql_read` tool (READ
  ops + mandatory introspection) over the live `perks.json`. 17 `node:test` tests green;
  typecheck/lint/build clean. Repo: github.com/MCPAQL/makerperks-adapter (issues #1–#5
  closed).
- **Next:** Stage 1 (application pipeline + the autonomy switch) — to be proposed as new
  OpenSpec change(s) when it begins.
- **Not started:** Stage 2.
