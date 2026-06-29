# Licensing

- **Code & schemas:** [AGPL-3.0-or-later](LICENSE).
- **Documentation:** CC BY 4.0.

This matches the licensing of the MCP-AQL org.

## Data & the MakerPerks boundary (MIT-compatible)

The AGPL covers **this repo's code and schemas only** — not the directory *data* the
adapter reads, nor the data it emits. The boundary with MakerPerks (and any other feed)
stays clean and MIT-compatible:

- **Inbound (consume):** the adapter reads MakerPerks' **published** `perks.json` — and any
  other feed you point it at — as **data**, read-only. Using MIT-licensed data inside an
  AGPL program imposes nothing on the upstream source; we never fork the dataset or touch
  MakerPerks' code.
- **Outbound (contribute back):** anything sent back to an MIT directory (e.g.
  `natea/makerperks`) is **MIT-safe data only** — the application-step data from the
  `--mit` export (`scripts/export-flows.mjs --mit`), offered under MIT and compatible with
  the upstream repo. **No AGPL code is ever contributed upstream**, and the server never
  opens the PR itself (the operator does, with their own tooling).
- **Generated feeds:** a `perks.json` / `grants.json` / … the server *produces*
  (`export_perks`) is data, not a copyleft derivative of the program — license your own
  feed however you like.

Net: the AGPL / commercial terms protect the **engine**; the **directory data** flows
freely in and (MIT-safe) back out.

## Commercial license

Commercial licenses — using/modifying/distributing this software **without** the
AGPL's obligations — are available on the same terms as the rest of the MCP-AQL
project:

- Organizations under **$1,000,000 USD** annual revenue may use a free commercial
  license by self-certifying in their own records.
- Organizations at/over **$1M**, or wanting custom terms, contact `licensing@mcpaql.org`.

See the MCP-AQL spec's
[COMMERCIAL-LICENSE-TERMS](https://github.com/MCPAQL/spec/blob/main/COMMERCIAL-LICENSE-TERMS.md).

> Fuller governance files (CLA, full commercial terms, trademarks) will be copied
> from the MCP-AQL org as this repo matures.
