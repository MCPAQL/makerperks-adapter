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

### Requirement: The payload checker accepts perks.json-family opportunity feeds

The payload checker SHALL validate any perks.json-family feed against the shared
required core (`slug`, `title`, `provider`, `url`, `max_value`, `sources`,
`verified`) while treating family-variant fields as optional: `audience` MAY be
absent (normalized to an empty list on ingest), and `value_type` and `status` SHALL
validate as strings without a closed vocabulary. Family-specific optional fields
(e.g. the accelerator family's `apply_url`, `category`, `format`, `next_deadline`,
`deadline_note`) SHALL be type-checked when present. Programs from a feed without
`audience` SHALL simply never match audience filters.

#### Scenario: An accelerators.json feed validates and federates

- **WHEN** a feed whose programs carry the shared core plus accelerator fields (no
  `audience`, `value_type: "investment"`, `status: "Defunct"`, an explicit
  `next_deadline`) is configured alongside the perks feed
- **THEN** the feed loads, its programs federate (prefixed per its config), and its
  programs' `audience` is served as an empty list

#### Scenario: The shared core is still enforced

- **WHEN** a family feed's program lacks a core field (e.g. no `slug` or no
  `max_value`)
- **THEN** the feed fails validation exactly as a malformed perks.json does

#### Scenario: A present family field is still type-checked

- **WHEN** a program carries `next_deadline` as a number or `apply_url` as an object
- **THEN** the feed fails validation with a clear per-field error

### Requirement: Feed-supplied fit fields are stripped at ingest

The data source SHALL drop `fit` and `fit_note` from every program during
federation, whatever a feed ships, so personal fit judgments can never be
hard-coded into the served directory. A feed carrying these fields SHALL still
validate (they are type-checked when present) — stripping is silent and unconditional.

#### Scenario: A feed shipping fit fields serves without them

- **WHEN** a configured feed's programs include `fit`/`fit_note` and the directory
  loads
- **THEN** the feed validates and its programs are served with no `fit` or
  `fit_note` fields

