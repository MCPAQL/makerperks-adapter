## ADDED Requirements

### Requirement: The directory federates one or many perks.json feeds in priority order

The adapter SHALL accept a list of `perks.json`-shaped sources (each a URL or path, optionally with a
feed id and a slug prefix) and federate them into one queryable directory, loaded in the listed
**priority order**. A single configured source SHALL behave as a federation of one (the existing
single-feed behavior). Each feed SHALL be validated with the existing eval-free payload checker.

#### Scenario: Two feeds are federated into one directory

- **WHEN** two valid feeds are configured and the directory loads
- **THEN** `list_programs` returns programs from both feeds, and the directory's federated count is
  the sum of the per-feed contributions (after dedupe)

#### Scenario: A single source behaves as before

- **WHEN** exactly one source is configured (or only `source`)
- **THEN** the directory serves that feed's programs exactly as the single-source directory did

### Requirement: A failing feed is skipped and surfaced, not fatal

When more than one feed is configured, a feed that fails to fetch, parse, or validate SHALL be
**skipped** — it contributes no programs — and SHALL be recorded with a `failed` status and an error
message, while the remaining feeds continue to serve. The adapter SHALL NOT throw for a failing feed
when others are configured. When exactly one feed is configured, a load failure SHALL still throw
(the directory is never silently empty).

#### Scenario: One bad feed does not take down the directory

- **WHEN** one of several feeds returns an error or invalid payload and the directory loads
- **THEN** the other feeds' programs are served, and `list_sources` reports the bad feed as `failed`
  with its error

#### Scenario: A lone failing feed still fails loud

- **WHEN** the only configured feed fails to load
- **THEN** loading throws rather than serving an empty directory

### Requirement: Slug collisions dedupe by priority; a feed may opt into a prefix

Without a prefix, a feed's programs SHALL keep their bare slug, and on a slug collision across feeds
the **earlier (higher-priority) feed SHALL win** — the later duplicate is dropped and counted. A feed
configured with a `prefix` SHALL have its program slugs rewritten to `prefix:slug`, so they are
isolated and cannot collide with another feed's slugs. The primary (unprefixed) feed's bare slugs
SHALL be preserved, so slug-keyed overlays (`flows.json`, the accepted overlay, discovery) are
unaffected.

#### Scenario: A bare-slug collision resolves to the higher-priority feed

- **WHEN** two unprefixed feeds both publish the same slug
- **THEN** the program from the earlier-listed feed is served, the later one is dropped, and that
  feed's `collisions_dropped` is incremented

#### Scenario: A prefixed feed's slugs are isolated

- **WHEN** a feed is configured with a prefix
- **THEN** its programs are addressable as `prefix:slug` and never collide with another feed's slugs

### Requirement: Each program carries server-set feed provenance, filterable

Every program SHALL be tagged at ingest with the `feed` id of the source it came from, set by the
server and not trusted from the feed's own data. `list_programs` and `search_programs` SHALL accept
an optional `feed` filter that narrows results to one feed. A new `list_sources` read operation SHALL
return each configured feed's health: its id, source, optional prefix, status (`ok` | `failed`),
program count, any load error, and the number of collisions dropped.

#### Scenario: Provenance is server-set and filterable

- **WHEN** a client lists programs with a `feed` filter
- **THEN** only programs whose server-set `feed` matches are returned, regardless of any `feed` value
  present in the feed's own data

#### Scenario: Feed health is observable

- **WHEN** a client calls `list_sources`
- **THEN** it receives one entry per configured feed with its status, count, any error, and dropped
  collisions
