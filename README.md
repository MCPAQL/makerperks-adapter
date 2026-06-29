# MakerPerks MCP-AQL Adapter

**Find and claim the free credits, discounts, and startup programs you qualify for — and
let your AI assistant do the hunting and the paperwork.**

There are hundreds of thousands of dollars in perks for builders — cloud and AI credits,
discounts, startup and student programs — scattered across the web, and most people never
claim them. This connects that directory to your AI assistant so it can find what fits you
and even apply for you.

**What you can do with it:**

1. **Connect it to your AI assistant** — Claude, Cursor, and other AI tools. (For the hosted
   version, there's nothing to install.)
2. **Ask what you can get.** Tell it about yourself — _"I'm a bootstrapped two-person startup
   building with AI"_ — and it searches the whole directory and shows you the perks that fit,
   and how much each is worth.
3. **Let it work out how to apply.** For any program, it figures out the exact steps to sign
   up.
4. **Have it apply for you — with your approval.** It fills in the application from details
   you've saved and submits it, pausing to check with you before anything sensitive. Whether
   a program signs you up through a direct connection or a normal web form, your assistant can
   handle it — or hand you a ready-to-submit form to finish yourself.

You stay in control the whole way: you choose how much it does on its own, and it never
claims something you don't qualify for.

---

A native [MCP-AQL](https://github.com/MCPAQL/spec) server over
[MakerPerks](https://github.com/natea/makerperks) — the browseable, agent-friendly
directory of builder perks (free credits, discounts, and programs for startups,
students, OSS maintainers, indie devs, and non-profits).

It speaks **MCP-AQL**: instead of registering a separate MCP tool for every query and
action, the server exposes a small set of **semantic verbs** — *read · create · update ·
delete · execute* (~120 tokens each) — and the agent discovers the operations behind them
**at runtime** via introspection. So an agent's tool-registration cost stays nearly flat
even as the number of operations grows past 30 — a fraction of a conventional "a tool per
operation" server. (The public endpoint is **read-only** — just the read verb; the full
server exposes all five.)

Beyond reading, the adapter is a **substrate for action and curation**: agents discover
and propose application *flows*, an **operator** accepts them, the directory federates
**many** opportunity feeds, and the server can **produce** feeds too — with safety checks
throughout, and it only ever acts **with your permission, on your behalf**.

## System at a glance

```mermaid
flowchart TB
  agent["MCP agent<br/>(Claude Desktop / Code, Cursor, …)<br/>brings the model + web"]

  subgraph core["One shared core (same code everywhere)"]
    direction TB
    ops["What an agent can do here:<br/>• browse + search the directory<br/>• discover + propose application flows<br/>• curate + publish them (operator)<br/>• drive signups, with consent"]
  end

  subgraph ro["Read-only endpoint — makerperks.mcpaql.com"]
    direction TB
    rostd["stateless · hardened<br/>serves directory + published flows"]
  end

  subgraph stf["Stateful endpoint — makerperks-dev.mcpaql.com"]
    direction TB
    dos["GitHub OAuth · per-user DO<br/>profile/vault · flow registry DO"]
  end

  feeds[("perks.json feeds<br/>(one or many, federated)")]
  flows[("flows.json overlay<br/>+ accepted overlay")]
  kv[("shared KV mirror<br/>operator-published flows")]

  agent <-->|stdio / Streamable HTTP| core
  core --- ro
  core --- stf
  feeds --> core
  flows --> core
  stf -->|reconcile_flows| kv
  kv --> ro
```

**In the picture:**

- **MCP agent** — your client (Claude Desktop / Code, Cursor, …). It brings the model and
  any web access; the adapter brings the directory, the tools, and the guardrails.
- **The core** — one request router. The *same* code runs three ways: local **stdio** (a
  personal tool), the public **read-only** Worker, and the **stateful** Worker (per-user
  GitHub login + Durable Objects).
- **Read-only endpoint** (`makerperks.mcpaql.com`) — public, no login, stateless and
  hardened. Serves the directory and any flows an operator has published.
- **Stateful endpoint** (`makerperks-dev.mcpaql.com`) — per-user GitHub login, a per-user
  profile + encrypted credential vault, the shared flow registry, and operator-gated
  curation.
- **Feeds → flows → KV mirror** — the data: one or many opportunity feeds federated into
  the directory; a curated *flows* overlay (how to actually apply); and a shared mirror
  that pushes operator-blessed flows to the public endpoint with no redeploy.

**What makes it unique:**

- **A near-flat tool cost** — a few semantic verbs + runtime discovery, so an agent's setup
  cost barely grows as the operation count does.
- **Model-agnostic flow discovery** — the server hands a connected agent a research
  scaffold and the safety gates; the *agent* supplies the intelligence. No model or
  provider SDK is baked in.
- **Curation that can't be vandalized** — anyone may propose a change, but only a trusted
  operator can accept and publish it, so untrusted input can't damage the shared directory.
  Publishing back to an upstream source is always operator-driven — the server never opens
  pull requests or edits anyone's repository on its own.
- **A federating, producing substrate** — point it at many feeds (perks, grants, programs,
  camping slots, …); it can also *generate* a feed of its own, which round-trips back in as
  a source.
- **One core, three deployments** — personal tool, public read-only, and full stateful,
  from the same code.

## Connect

- **Hosted (zero install):** add **`https://makerperks.mcpaql.com`** as a remote MCP
  connector (claude.ai, Claude Code, Cursor, …). OAuth registers automatically.
- **Local (stdio):** `npm install && npm run build`, then point your MCP client at
  `node dist/index.js`.
- **Your own directory:** run it locally or self-host it and point it at **your own** feed(s)
  (`perks.json`, `grants.json`, …) — see **[`docs/INSTALL.md`](docs/INSTALL.md)**.

Then call `mcp_aql_read` with `{ "operation": "introspect" }` to discover the operations.

## What it does

- **Read** the directory — `list_programs` / `get_program` / `search_programs` /
  `get_application_flow`, carrying decision signal (value, audience, eligibility,
  verified date, redemption URL) so an agent decides without a second call.
- **Discover & propose flows** — a model-agnostic toolkit (`get_discovery_brief` →
  `verify_flow_proposal` → `propose_flow`) a connected agent drives to turn a bare perk
  into an automatable, verified application *flow*. The server supplies the scaffold and
  the gates; the agent brings the model and the web.
- **Curate (operator-gated)** — users are untrusted and may only propose; a configured
  **operator** accepts flows into the served set and `reconcile_flows` publishes them to
  the public endpoint. The server holds no write credentials and opens no PRs.
- **Federate & produce** — ingest one or **many** `perks.json`-shaped feeds (perks /
  grants / college programs / camping slots …) into one directory, and emit a
  schema-valid feed of its own (`export_perks`) — a general opportunity-directory
  substrate, not just a MakerPerks app.
- **Act on your behalf — with consent** — the adapter can drive the actual signup **whether
  or not the program has an API**. It assembles the application from your saved profile and
  an encrypted credential vault and runs it under an **autonomy switch you control** (*review
  every step* / *auto-submit low-risk* / *full-auto within limits*), pausing before anything
  sensitive, routing payment / real-identity steps to an out-of-band check, and never
  claiming eligibility you don't have. When there's an **API**, it submits directly. When
  there **isn't**, it discovers the application flow and the connected agent carries it out
  with its own **browser automation** (computer-use / browser-use) — same assembled data,
  same guardrails. That's the superpower: no API required, as long as the flow is
  discoverable and the agent can drive a browser. (If it can't, the pre-filled application is
  a ready-to-finish handoff.) The adapter supplies the flow, the data, and the safety rails;
  the agent supplies the doing.

## Status

Everything described above is **built, tested, and deployed** — browsing and search, the
discover-and-propose flow toolkit, operator-gated curation, multi-feed federation, feed
production, and the consent-based signup pipeline (profile + encrypted vault + autonomy
switch). Two endpoints are live:

- **Read-only (public, no login):** `https://makerperks.mcpaql.com`
- **Stateful (per-user GitHub login):** `https://makerperks-dev.mcpaql.com`

Every capability is specified and validated under [`openspec/specs/`](openspec/specs/), with
200+ automated tests passing. **Still ahead:** broader provider coverage, a contribution
pipeline back to the upstream directory, and anti-abuse limits — see
[`docs/ROADMAP.md`](docs/ROADMAP.md) for the full plan.

## Documentation

- [`docs/INSTALL.md`](docs/INSTALL.md) — install + point it at your own feed(s) + self-hosting
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system model, the capability map, and
  diagrams (flow lifecycle, federation, the trust boundary)
- [`docs/flows-roundtrip.md`](docs/flows-roundtrip.md) — the flows.json round-trip + the
  operator publish/contribute workflow
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — the staged plan and status
- [`CLAUDE.md`](CLAUDE.md) — project configuration & conventions
- [`openspec/specs/`](openspec/specs/) — the spec baseline (every capability, with
  requirements + scenarios)

## License

Code & schemas: AGPL-3.0 (commercial tiers available, like the rest of the MCP-AQL
org). Docs: CC BY 4.0. The directory **data** is MIT (MakerPerks); only MIT-safe data
crosses back to the upstream directory — no AGPL code does. The AGPL covers the engine,
not the feeds it reads or emits — see [`LICENSING.md`](LICENSING.md) for the full data
boundary.
