# Tasks — directory-federation (#84 / #88)

> **Scope:** ingest one or many `perks.json`-shaped feeds (priority order, fail-soft per feed),
> federate with priority dedupe + opt-in per-feed slug prefix + per-feed `feed` provenance, and
> surface per-feed health via `list_sources`. Generating a feed (#89), the contribution queue (#81),
> and per-feed status defaults are **out of scope**.
>
> **Definition of done:** all tasks `[x]`; `openspec validate add-directory-federation --strict`
> passes; typecheck/lint/both test layers green; multiple feeds federate (bare first-wins dedupe;
> prefixed feeds isolated + tagged); a failing feed is skipped + surfaced while the rest serve; a
> single failing feed still throws; `list_sources` reports per-feed health; the `feed` filter works;
> bundled single-feed behavior is unchanged. One commit per section, closing #88 on the last; push on
> `main` as each section completes.

## 1. Multi-source DataSource (federate + fail-soft + prefix + provenance)

- [x] 1.1 `data/source.ts`: `FeedConfig` (`string | { id?, source, prefix? }`) + `FeedStatus`;
  `PerkProgram` gains `feed?: string`. Constructor normalizes `opts.sources ?? [opts.source ?? DEFAULT]`.
- [x] 1.2 `load()` loads each feed independently: fetch/read + parse + eval-free validate; on failure
  record a `failed` `FeedStatus` (no throw) — EXCEPT a lone configured feed still throws (loud
  single-source default). On success, map programs: set `feed = id` (server-set), and if `prefix`,
  rewrite `slug` → `${prefix}:${slug}`.
- [x] 1.3 Federate in priority order with first-wins dedupe on slug; count dropped duplicates per
  feed. `programs()` returns the federated list; `sources(): FeedStatus[]`; `meta()` synthesized
  (primary name + federated count; feed ids via `sources()`).
- [x] 1.4 Tests: two feeds federate; a bare-slug collision → first feed wins + the loser feed's
  `collisions_dropped` increments; a prefixed feed's slugs are `prefix:...` and never collide; every
  program carries its `feed`; a feed-supplied `feed` value is overwritten; fail-soft + lone-throws +
  derived id/meta count.

## 2. Read surface: feed filter + list_sources + fail-soft visibility

- [ ] 2.1 `operations/read.ts`: `list_programs` / `search_programs` gain an optional `feed` filter
  (exact id); `data.programs()` is federated so spanning feeds is automatic.
- [ ] 2.2 `list_sources` READ op returning `data.sources()` (per-feed `{ id, source, prefix?, status,
  count, error?, collisions_dropped }`).
- [ ] 2.3 `app.ts`/`AppOptions`: accept `sources`; thread into `DataSource`. (Worker env wiring of a
  feed list is deferred to deploy config — note it; not required for the capability.)
- [ ] 2.4 Tests: a failing feed is skipped, the rest serve, and `list_sources` reports it `failed`
  with the error; a single failing feed throws; the `feed` filter narrows results; op-count/parity
  assertions updated for `list_sources`.

## 3. Validate + archive

- [ ] 3.1 `openspec validate add-directory-federation --strict`; typecheck/lint/both test layers green.
- [ ] 3.2 Archive into `openspec/specs/` (`directory-federation` created); fill the spec `Purpose`.
