# Design — directory-federation (#84 / #88)

## Context

`DataSource` holds one `PerksPayload` (`source: string`), exposes `programs()` / `meta()`, validates
with the eval-free `collectPayloadErrors`. Read ops filter `data.programs()` by provider/slug; slugs
(`provider/program`) key `flows.json`, the accepted overlay, discovery, and status.

## Decisions

- **Feed config.** `DataSourceOptions.sources?: FeedConfig[]`, `FeedConfig = string | { id?: string;
  source: string; prefix?: string }`. `source?: string` stays as sugar (→ a one-element `sources`).
  A bare string feed's `id` is derived (URL host, or filename stem) and `prefix` is empty. Priority =
  array order.
- **Per-feed, fail-soft load.** Load each feed independently (fetch/read + JSON parse + eval-free
  validate). A failure becomes a recorded `FeedStatus` (`status: "failed"`, `error`) and the feed
  contributes no programs — never throws. **Exception:** if exactly one feed is configured (the
  single-source default), a failure throws, preserving today's loud behavior (never silently empty).
- **Prefix + provenance, applied at ingest.** For each loaded feed, map its programs: set
  `feed = <feed id>` (overwriting any feed-supplied value — provenance is server-set), and if the
  feed has a `prefix`, rewrite `slug` to `${prefix}:${slug}`. `:` is the separator (safe in JSON keys
  and op params; absent from bare `provider/program` slugs).
- **Priority dedupe.** Concatenate feeds in order; keep the first program seen per slug; a later
  duplicate is dropped and counted on its feed's `collisions_dropped`. Prefixed feeds don't collide
  (distinct keys), so only bare-slug overlaps dedupe — the primary feed always wins.
- **Accessors.** `programs()` returns the federated, deduped list (unchanged signature). `sources()`
  returns `FeedStatus[]` (per-feed health). `meta()` returns a synthesized federated meta (name from
  the primary feed; `count` = federated total; `sources` = the feed ids) — backward-compatible shape
  for `get_directory` consumers.
- **Read surface.** `list_programs` / `search_programs` gain an optional `feed` filter (exact feed
  id). A new `list_sources` READ op returns `sources()` so fail-soft skips + collisions are visible.
  `get_program` / `get_application_flow` work unchanged on whatever slug (bare or prefixed) a program
  carries.
- **Untouched contracts.** The bundled `flows.json`, the accepted overlay, discovery, and status all
  key by slug; the primary feed stays bare, so they're unaffected. A prefixed feed's flows would key
  by the prefixed slug (consistent) — curating those is future work, not this change.

## Shape

```ts
export interface FeedConfig { id?: string; source: string; prefix?: string }
export interface FeedStatus {
  id: string; source: string; prefix?: string;
  status: "ok" | "failed"; count: number; error?: string; collisions_dropped: number;
}
// DataSource: constructor takes opts.sources ?? [opts.source ?? DEFAULT]; load() loads all (fail-soft);
//   programs() federated+deduped; sources(): FeedStatus[]; meta() synthesized.
// PerkProgram gains `feed?: string`.
```

## Why not

- **Always namespace every slug** — rejected (Mick): it rewrites the slug shape everywhere
  (flows.json/overlay/discovery re-key) and breaks existing references. Bare-by-default + opt-in
  prefix keeps the contract and still lets third-party feeds isolate.
- **Fail-loud on any feed** — rejected (Mick): one bad publisher shouldn't outage the directory.
  Fail-soft + surface; single-feed default stays loud.
- **Trust a feed's own `feed`/provenance field** — rejected: provenance is server-set at ingest, like
  `proposed_by` (#73). A feed cannot spoof which feed it is.
