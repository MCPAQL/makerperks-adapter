## Why

`DataSource` loads exactly one `perks.json` today. The directory is meant to be a **general
opportunity-directory substrate** — anyone can publish a `perks.json`-shaped feed (perks / grants /
college programs / camping slots / …), and the server should federate one or many of them into a
single queryable directory. This is #88 (epic #84), and the foundation for the server being reused by
many publishers; a server-generated feed (#89) is itself an ingestable source, closing the round-trip.

## What Changes

- **Multiple sources, in priority order.** `DataSourceOptions` gains `sources: (string | FeedConfig)[]`
  (each a URL/path, or `{ id?, source, prefix? }`); `source` stays as single-feed sugar. Feeds load in
  the listed **priority order**.
- **Fail-soft per feed.** Each feed loads + validates with the existing eval-free checker
  independently. A feed that fails to fetch/parse/validate is **skipped and surfaced** (a load error
  on that feed), never fatal — one publisher's broken feed cannot take down the directory. A
  single-source deployment stays fail-loud (an unconfigured/only feed failing still throws, so we
  never silently serve empty).
- **Priority dedupe + opt-in prefix.** Without a `prefix`, a feed's programs keep their **bare** slug,
  and on a cross-feed slug collision the **earlier (higher-priority) feed wins** — the loser is
  dropped and recorded as a collision. With a `prefix`, that feed's slugs become `prefix:slug`
  (isolated, cannot collide). The primary MakerPerks feed stays bare, so `flows.json`, the accepted
  overlay, and discovery — all keyed by bare slug — keep working unchanged.
- **Per-feed provenance.** Each `PerkProgram` is tagged with its **`feed`** id at ingest
  (server-set, never trusted from feed data). `list_programs` / `search_programs` gain an optional
  `feed` filter; the read surface keeps its shape, results just span feeds.
- **`list_sources` (READ).** Surfaces per-feed health: `{ id, source, prefix?, count, status
  (ok|failed), error?, collisions_dropped }` — how fail-soft skips and collisions become visible.

## Capabilities

### New Capabilities

- `directory-federation`: ingest one or many `perks.json`-shaped feeds (priority order, fail-soft per
  feed), federate them into one directory with priority dedupe + opt-in per-feed slug prefixing and
  per-feed provenance, and surface per-feed load/collision health — a single feed being just a
  federation of one.

## Impact

- **Affected specs:** `directory-federation` (new). Generalizes `data-source` without changing its
  single-feed contract (one feed = a federation of one); the read ops (`directory-query`) gain a
  `feed` filter + the `list_sources` op.
- **Affected code:** `data/source.ts` — `DataSource` loads a list of feeds (each fail-soft), applies
  an optional slug prefix, tags `feed` provenance, federates with priority dedupe, and exposes
  `sources()` health; `PerkProgram` gains `feed?`. `operations/read.ts` — `feed` filter +
  `list_sources` op. `app.ts`/`AppOptions` accept `sources`. The worker entries can pass a configured
  feed list (env). `flows.json` / accepted overlay / discovery are untouched (bare primary slugs).
- **Non-goals / tracked follow-up:** generating a `perks.json` feed (**#89**, which ingests as a
  source here); the contribution queue feeding a generated feed (#81); per-feed status *defaults*
  (status policy stays per-user and uniform, #76–#79); auth/trust per feed (a feed is read-only
  third-party data the server consumes — the #90 invariant: only reads).
