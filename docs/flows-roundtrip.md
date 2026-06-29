# The flows.json round-trip

`flows.json` is the **curated application-flow overlay** — a `slug → Flow Document` map merged over
the server's derived baseline. It is a **portable artifact the server both consumes and produces**
(epic [#84](https://github.com/MCPAQL/makerperks-adapter/issues/84)), so an external process can
co-maintain it: pull what the server serves, edit it, re-publish, and the server picks it up.

```
          export (read-out)                         ingest (read-in)
  server ───────────────────▶  flows.json  ──edit──▶  FLOWS_URL / file  ──▶ FlowSource ──▶ server
   (export_flows op /                                                        (loads the overlay)
    export-flows.mjs)
```

## Read-out — exporting the effective overlay

The effective overlay is the loaded `flows.json` merged with the registry's **accepted overlay**
(the flows `accept_flow` published live), accepted entries winning — the same precedence the server
serves. Get it two ways:

- **The `export_flows` op (READ).** Returns `{ count, flows, sources }` — `flows` is the merged,
  re-ingestible map; `sources[slug]` is `base` or `accepted` for transparency. Available on every
  deployment; with no registry (the read-only endpoint) it exports just the loaded overlay, every
  slug `base`. Call it from any MCP client.
- **`scripts/export-flows.mjs` (dev tooling).** Writes a `flows.json` file. Requires `npm run build`.

  ```sh
  node scripts/export-flows.mjs                                   # local bundled overlay  -> flows.export.json
  node scripts/export-flows.mjs --source ./my-flows.json --out ./flows.json
  FLOWS_URL=https://… node scripts/export-flows.mjs               # local, from a hosted overlay

  # Effective overlay (incl. the accepted layer) from a running deployment, over MCP:
  node scripts/export-flows.mjs --url https://makerperks-dev.mcpaql.com/mcp --out ./flows.json
  # set MAKERPERKS_TOKEN for an endpoint that requires auth (the stateful worker does)
  ```

  The **local** modes export only the loaded overlay (no registry → every slug `base`). To capture
  the **accepted** layer too, use `--url` against a running stateful deployment (it drives the
  `export_flows` op).

## Read-in — re-publishing an edited overlay

The inbound path already exists. After editing the exported file:

- **Hosted (Workers):** host it at `FLOWS_URL` — `FlowSource` fetches it (per its TTL), no redeploy.
- **Bundled / local:** commit it as `src/data/flows.json`, or point a local deployment at a file/URL.

`FlowSource` validates the overlay with the eval-free payload checker and **fails loud** on a
schema-invalid collection, so a bad edit is rejected rather than served.

## The operator workflow — publish blessed flows + contribute upstream

On a hosted, multi-user deployment, **users propose and an operator accepts** (see the
`operator-authorization` capability, #90). Accepting serves a flow live on the *stateful* endpoint
immediately (the registry Durable Object). Two further, **operator-only**, deliberate steps make
that flow durable and public:

1. **Publish to the read-only endpoint — `reconcile_flows`.** Flushes the accepted overlay into a
   shared KV mirror that the read-only public endpoint (`makerperks.mcpaql.com`) reads, so it serves
   the blessed flows **with no redeploy**. The Durable Object stays the always-live layer on the
   stateful side; `reconcile_flows` is the deliberate "make it public" step (an operator running it,
   not an automatic effect of accepting). Non-operators get `FORBIDDEN`.

2. **Contribute upstream — operator-run, never the server.** The server holds **no GitHub write
   credential** and opens no PR. The operator pulls the effective overlay and opens one PR with their
   own `gh`:

   ```sh
   # MIT-safe, data-only subset (application steps; drops the AGPL adapter's agent model)
   node scripts/export-flows.mjs --url https://makerperks-dev.mcpaql.com/mcp --mit --out perks-flows.json
   # ...review, then a single deduplicated PR to Nate's MIT directory:
   gh pr create --repo natea/makerperks ...
   ```

   `--mit` keeps `submission` / `required_inputs` / `redemption` / `source` / `verified` and drops
   `automatability` / `danger_level` / `gaps`, so only MIT-safe data crosses into the MIT directory
   (no AGPL). This is the one curated PR — not one-per-user, not server-generated.

## Precedence — where the accepted overlay lives

Re-publishing an edited file replaces the **loaded base** overlay; the **accepted** overlay layers on
top (accepted wins). As of [#87](https://github.com/MCPAQL/makerperks-adapter/issues/87) the accepted
overlay is durable in two places: live in the registry Durable Object (stateful endpoint), and — once
an operator runs `reconcile_flows` — in the shared KV mirror the read-only endpoint serves. The
committed `flows.json` **file** is still updated only by the deliberate operator PR above (export →
`--mit` → `gh`), so the file remains the human-reviewed, versioned artifact rather than a thing the
server writes. An externally-published base file does not override an accepted entry for the same slug
until that accept is itself curated into the file via a PR.

## License boundary

`flows.json` data is exportable as MIT-safe data. The adapter's **code** is AGPL-3.0; only MIT-safe
data/docs flow back to Nate's MIT directory — no AGPL crosses back. See `CLAUDE.md`.
