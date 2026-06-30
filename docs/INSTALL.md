# Install & Self-Hosting

Run the adapter yourself and point it at **your own** opportunity feed(s) — a `perks.json`,
a `grants.json`, a `college-programs.json`, whatever — one feed or many, federated into a
single agent-queryable directory. The directory format is a general
**opportunity-directory standard**, not MakerPerks-specific.

There are three ways to run it; pick by how much you need:

| You want… | Run | Effort |
|---|---|---|
| To use the public MakerPerks directory from your agent | **Nothing** — add the hosted URL | none |
| Your *own* directory on your machine, from your own feed(s) | **Local (stdio)** | a few minutes |
| A shared, hosted directory for a team / the public | **Cloudflare Workers** | advanced |

---

## 0. Just connect to the hosted directory

No install. Add **`https://makerperks.mcpaql.com`** as a remote MCP connector (claude.ai,
Claude Code, Cursor, …); OAuth registers automatically. Then call `mcp_aql_read` with
`{ "operation": "introspect" }` to discover the operations.

---

## 1. Local install (stdio) — your own directory

### Prerequisites
- **Node 20+** and npm.

### Build
```sh
git clone https://github.com/MCPAQL/makerperks-adapter
cd makerperks-adapter
npm install
npm run build
```

### Point it at your own feed
The adapter reads its feed(s) from environment variables. **One** feed:

```sh
# a URL…
MAKERPERKS_SOURCE="https://you.example.com/grants.json" node dist/index.js
# …or a local file
MAKERPERKS_SOURCE="./my-grants.json" node dist/index.js
```

**Many** feeds, federated (`MAKERPERKS_SOURCES` wins over `MAKERPERKS_SOURCE`) — a comma
list, or a JSON array when you want ids/prefixes:

```sh
# comma-separated URLs/paths (feed ids derived from the host/filename)
MAKERPERKS_SOURCES="https://a.example.com/perks.json, ./grants.json" node dist/index.js

# JSON array — gives each feed an id and an optional slug prefix
MAKERPERKS_SOURCES='[
  {"id":"perks","source":"https://a.example.com/perks.json"},
  {"id":"grants","source":"https://b.example.com/grants.json","prefix":"grants"}
]' node dist/index.js
```

With no source set, it defaults to the live MakerPerks feed.

### Connect your MCP client
Point any stdio MCP client at `node dist/index.js`. Example (Claude Desktop /
`claude_desktop_config.json`-style):

```jsonc
{
  "mcpServers": {
    "my-directory": {
      "command": "node",
      "args": ["/absolute/path/to/makerperks-adapter/dist/index.js"],
      "env": {
        "MAKERPERKS_SOURCES": "https://a.example.com/perks.json, https://b.example.com/grants.json"
      }
    }
  }
}
```

Other local env knobs: `MAKERPERKS_FLOWS` (a `flows.json` application-flow overlay URL/path),
`MAKERPERKS_PORT` + `--transport=http` (serve Streamable HTTP locally instead of stdio),
`MAKERPERKS_VAULT_DIR` (where the encrypted credential vault keyfile lives; default
`~/.makerperks`).

### Recommended: keep a human in the loop (gate the mutating endpoints)

The server exposes its operations as the five CRUDE tools — `mcp_aql_read` and the mutating
`mcp_aql_create` / `mcp_aql_update` / `mcp_aql_delete` / `mcp_aql_execute`. Every read is on
`mcp_aql_read` (safe to auto-approve); everything that changes state or acts on your behalf
(profile/credential writes, application submissions via `mcp_aql_execute`) is on a **mutating**
tool. So in your MCP client's tool-permission settings, **auto-approve `mcp_aql_read` and require
approval for the four mutating tools** (at least `mcp_aql_execute`, which drives submissions). That
host prompt is your real human-in-the-loop: the connected agent cannot approve it for you. The
server also keeps a host-independent confirmation step for higher-danger submissions, and never
auto-exposes a `password` or `identity_document` from the vault regardless of host settings — but
gating the mutating tools is the primary control, so set it deliberately.

---

## 2. The feed format (`perks.json` / `grants.json` / …)

A feed is a JSON object: a `name` and a `programs` array. Each program is one opportunity.
Validation is strict-but-lenient — it checks the fields below and **tolerates extra fields**,
so you can carry your own metadata.

**Required** per program: `slug`, `title`, `provider`, `url`, `verified` (strings),
`max_value` (number), `audience` (string array), `sources` (string array).

**Optional:** `tags` (string[]), `value_type` (`credits` | `discount` | `free_tier`),
`currency`, `min_value`, `value_display`, `region`, `status`
(`Active` | `Discontinued` | `Beta` | `Upcoming`), `aggregator` (bool), `unlocks` (string[]).

A minimal `grants.json`:

```json
{
  "name": "My Grants Directory",
  "programs": [
    {
      "slug": "acme/acme-research-grant",
      "title": "ACME Research Grant",
      "provider": "acme",
      "url": "https://acme.example.com/grants",
      "audience": ["nonprofit", "research"],
      "max_value": 50000,
      "sources": ["https://acme.example.com/grants"],
      "verified": "2026-06-29",
      "status": "Active"
    }
  ]
}
```

Notes:
- **`slug`** is the program's stable id (convention: `provider/program`). It keys everything
  (flows, status). Keep it unique within a feed.
- **Federation & collisions:** feeds load in the order you list them. Two feeds sharing a bare
  slug → the **earlier** feed wins (the loser is dropped and reported). Give a feed a
  **`prefix`** to isolate it (`prefix:slug`) so it can never collide.
- **Health:** `list_sources` reports each feed's status (ok/failed), program count, load error,
  and dropped collisions — so a broken feed is visible, and one bad feed never takes down the
  rest (it's skipped, not fatal).
- **The server can produce a feed too:** `export_perks` (and `scripts/export-perks.mjs`) emit a
  schema-valid `perks.json` from the federated directory — so a generated feed is itself an
  ingestable source.

---

## 3. Self-host on Cloudflare Workers (shared / public)

For a hosted directory others connect to. There are two Worker entries (see
[`ARCHITECTURE.md`](ARCHITECTURE.md) §2):

- **Read-only** (`wrangler.jsonc` → `src/worker.ts`) — stateless, public, no login. Serves the
  directory + any operator-published flows.
- **Stateful** (`wrangler.dev.jsonc` → `src/worker-stateful.ts`) — real per-user GitHub OAuth,
  per-user profile/vault, the shared flow registry, operator-gated curation.

### Configure feeds (both Workers)
Set `vars` in the wrangler config (or the dashboard):

```jsonc
"vars": {
  // one feed…
  "PERKS_URL": "https://you.example.com/perks.json",
  // …or many (wins over PERKS_URL): a comma list or a JSON array of feeds
  "PERKS_URLS": "https://a.example.com/perks.json, https://b.example.com/grants.json"
}
```

Optional: `FLOWS_URL` (a hosted `flows.json` overlay; otherwise the bundled default).

### Deploy
```sh
npm run deploy       # read-only worker  (wrangler.jsonc)
npm run deploy:dev   # stateful worker   (wrangler.dev.jsonc)
```

### Curation / operator (stateful worker)
The stateful worker is **zero-trust**: any user may *propose* flows; only an **operator** may
accept and publish them. Configure who the operator is (the host picks; both can be set):

```jsonc
"vars": {
  // A) GitHub-native: operator = admin on this repo (checked with the user's own token)
  "OPERATOR_REPO": "your-org/your-directory",
  // B) or a static allowlist of GitHub logins
  "OPERATOR_LOGINS": "you, a-teammate"
}
```

Secrets for the stateful worker (never commit): `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
(a GitHub OAuth App with callback `https://<your-host>/callback`), and `VAULT_KEY` (base64 of
32 random bytes). Set with `wrangler secret put <NAME> -c wrangler.dev.jsonc`.

The full curation + publish + contribute workflow (accept → `reconcile_flows` → the public
endpoint serves it → operator-run upstream PR) is in
[`flows-roundtrip.md`](flows-roundtrip.md). The trust model + the "server never initiates an
outbound write" invariant are in [`ARCHITECTURE.md`](ARCHITECTURE.md) §6.

---

## Troubleshooting

- **`failed to fetch perks.json` / schema error** on a single feed → it fails loud. Check the
  URL/path and that it matches the format in §2. With multiple feeds, a bad one is skipped —
  call `list_sources` to see which and why.
- **Workers: `ajv` / `new Function` errors** → not applicable here; the adapter is eval-free by
  design. If you fork and add a dependency that uses codegen, it won't run on Workers.
- **Nothing returned** → call `mcp_aql_read { "operation": "introspect" }` to confirm the
  surface, then `list_sources` to confirm your feed loaded.
