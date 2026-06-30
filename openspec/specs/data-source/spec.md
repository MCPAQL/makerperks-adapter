# data-source Specification

## Purpose
TBD - created by archiving change add-makerperks-adapter. Update Purpose after archive.
## Requirements
### Requirement: MakerPerks published artifact as source of truth

The adapter SHALL source its program data from the MakerPerks **published**
`perks.json` and SHALL validate the loaded data against a JSON Schema for that
**published payload** before serving any query. (The payload is a flattened
projection — `{ name, count, programs: [{ slug, provider, value_display, … }] }` —
so the schema is authored in this repository; it is NOT MakerPerks' per-program
source schema, which validates the source YAML this adapter never reads.) The adapter
SHALL NOT read MakerPerks' source content collection, fork or hand-edit the dataset,
or write back to it through code — only the published artifact crosses into this
repository.

#### Scenario: Load and serve

- **WHEN** the adapter starts
- **THEN** it loads `perks.json` from the configured published source and serves
  queries from it

#### Scenario: Schema validation gate

- **WHEN** the loaded data does not conform to the program JSON Schema
- **THEN** the adapter fails loudly with a clear validation error rather than serving
  malformed or partial records

#### Scenario: Refresh picks up upstream changes

- **WHEN** the published `perks.json` is updated upstream and the adapter refreshes
  (via its refresh trigger or configured TTL)
- **THEN** subsequent queries reflect the updated data without a code change or
  redeploy

#### Scenario: Configurable source

- **WHEN** the data source location is configured (a live published URL or a local
  path to a built copy)
- **THEN** the adapter loads from that source, defaulting to the live published URL

### Requirement: Filesystem-free loading

The data source SHALL load and serve `perks.json` **without any filesystem access** when
configured with a URL source, so it runs on edge runtimes (e.g. Cloudflare Workers).
Filesystem reads SHALL be used only for an explicit local file-path source, and the
filesystem module SHALL NOT be required (or bundled) when a URL source is used.

#### Scenario: URL source needs no filesystem

- **WHEN** the configured source is an `http(s)` URL
- **THEN** the data loads via `fetch` with no filesystem access, and no filesystem module is
  pulled into an edge bundle

#### Scenario: Local path still works on a Node runtime

- **WHEN** the configured source is a local file path (on a Node runtime)
- **THEN** the data loads from disk as before

### Requirement: Feeds carry a trust classification and optional integrity verification

Each configured feed SHALL carry a trust classification: the default feed and any feed the operator
explicitly pins or marks SHALL be `trusted`; any additional federated feed SHALL be `untrusted`
unless the operator marks it trusted. A feed MAY declare an `integrity` (sha256 hex of its raw body);
when present, it SHALL be verified on load and a mismatch SHALL drop the feed fail-soft (its programs
are excluded and the failure is recorded), consistent with the existing per-feed fail-soft behavior.
A feed whose declared integrity verifies SHALL be classified `trusted` — **unless** the operator set
`trust` explicitly in config, in which case the explicit value wins and an integrity that verifies
SHALL NOT auto-upgrade it (so `{ trust: "untrusted", integrity }` pins the content for reproducibility
while staying `untrusted`). When no integrity is declared, the feed loads without verification (trust
classification still applies); a detached `signature`/`publicKey` pair is a reserved field for signed
feeds and is not yet verified. A feed's trust SHALL be surfaced to
the operator via the source-status listing, and each program SHALL retain the id of the feed it was
ingested from so downstream gates can consult its trust.

#### Scenario: An additional federated feed is untrusted by default

- **WHEN** the operator configures a federated feed beyond the default without marking it trusted
- **THEN** that feed and its programs are classified `untrusted` and reported as such by the
  source-status listing

#### Scenario: An integrity mismatch drops the feed fail-soft

- **WHEN** a feed declares an `integrity` hash and the fetched body's hash does not match
- **THEN** the feed is dropped (its programs excluded) with the failure recorded, and other feeds
  continue to load

#### Scenario: A verified or default feed is trusted

- **WHEN** the default feed loads, or a feed's declared integrity verifies (with no explicit `trust`)
- **THEN** the feed is classified `trusted` and its programs are eligible for the credential
  auto-expose path

#### Scenario: An explicit untrusted is not upgraded by a verifying integrity

- **WHEN** a feed is configured with both `trust: "untrusted"` and an `integrity` hash that verifies
  on load
- **THEN** the feed loads and serves its programs but remains `untrusted` (the operator's explicit
  classification wins), so its programs never take the credential auto-expose path

