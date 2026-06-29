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

## Caveat — the accepted overlay is not yet reconciled into the file

Re-publishing an edited file replaces the **loaded** overlay. The runtime **accepted** overlay still
layers on top of it (accepted wins), so an externally-published `flows.json` does **not** override an
accepted entry for the same slug until that accepted change is reconciled back into the durable
file. Making the file the single durable source of truth — a writable overlay store vs. a PR/commit
to `flows.json` — is [#87](https://github.com/MCPAQL/makerperks-adapter/issues/87).

## License boundary

`flows.json` data is exportable as MIT-safe data. The adapter's **code** is AGPL-3.0; only MIT-safe
data/docs flow back to Nate's MIT directory — no AGPL crosses back. See `CLAUDE.md`.
