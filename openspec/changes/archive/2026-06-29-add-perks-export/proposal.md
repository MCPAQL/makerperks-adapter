## Why

The producer half of the opportunity-directory substrate (#89, epic #84). The server already
*consumes* `perks.json` feeds (now one or many, #88); it should also *produce* one — emit a
schema-valid `perks.json` from its (federated) directory, so anyone can stand up a feed and so a
generated feed is itself an ingestable #88 source (the producer/consumer round-trip closes). This is
the general capability behind the Nate-facing feed (#82 is its MakerPerks-specific PR pipeline).

Scope now (per the design pass): generate from the **current federated directory** — the mirror of
`export_flows`. Generating from accepted **perk-record** contributions waits for the contribution
queue (#81); this op ingests that later as just another input.

## What Changes

- **`export_perks(name?, feed?)` (READ):** emit a schema-valid `PerksPayload` from the federated
  directory — `{ name, generated, count, programs }`. Optional `feed` exports just one source feed's
  programs (a single-feed view); optional `name` overrides the payload name (default: the directory
  meta name). The server-set `feed` provenance tag is stripped from emitted programs so the output is
  a clean, re-ingestible feed. The payload is **validated on emit** with the existing eval-free
  checker (valid by construction, but verified — never emit a malformed feed).
- **`scripts/export-perks.mjs` (dev tooling, never bundled):** write a `perks.json` from the op (or
  the data layer), peer to `export-flows.mjs`.

## Capabilities

### New Capabilities

- `perks-export`: emit a schema-valid, re-ingestible `perks.json` from the federated directory (the
  server as producer, not only consumer) — the general capability behind a server-stood-up feed,
  plus the dev export script.

## Impact

- **Affected specs:** `perks-export` (new). Consumes `directory-federation`'s federated `programs()`
  + `meta()`; emits the `data-source` payload shape. No existing spec changes.
- **Affected code:** export `collectPayloadErrors` from `data/source.ts` (validate-on-emit); a new
  `operations/perks-export.ts` (`export_perks`); `buildRouter` registration (unconditional, like
  `export_flows`); a new `scripts/export-perks.mjs`.
- **Non-goals / tracked follow-up:** generating from accepted perk-record contributions (**#81**);
  the Nate-facing feed + PR pipeline (**#82**); any server-initiated upstream write (the #90
  invariant — the operator publishes, the server only emits data).
