## ADDED Requirements

### Requirement: Export the effective curated overlay as a portable flows.json

The adapter SHALL expose an `export_flows` read operation that returns the **effective curated
overlay** as a valid `flows.json` document: the loaded overlay (`FlowSource.all()`) merged with the
registry's accepted overlay (`registry.accepted()`), with **accepted entries winning** on a slug
collision — the same overlay precedence the server serves. The result SHALL be an object with
`count` (the number of slugs), `flows` (the merged `slug -> Flow Document` map), and `sources` (a
per-slug `"base" | "accepted"` breakdown). The operation SHALL take no parameters, mutate no state,
be discoverable via `introspect` as a READ operation, and be available on every deployment —
including the read-only endpoint, where no registry is wired and it exports just the loaded overlay
with every slug sourced `"base"`.

#### Scenario: Export with no registry returns the loaded overlay

- **WHEN** `export_flows` is called on a deployment with no registry wired (the read-only endpoint)
- **THEN** `flows` equals the loaded `flows.json` overlay, `count` is its slug count, and every
  entry in `sources` is `"base"`

#### Scenario: An accepted overlay entry is merged and attributed

- **WHEN** the registry's accepted overlay contains a Flow Document for a slug not in the loaded
  overlay, and `export_flows` is called
- **THEN** that slug appears in `flows`, `count` grows by one, and its `sources` entry is
  `"accepted"`

#### Scenario: An accepted entry wins over a base entry

- **WHEN** the accepted overlay and the loaded overlay both have a Flow Document for the same slug,
  and `export_flows` is called
- **THEN** `flows` for that slug is the accepted value, `sources` for that slug is `"accepted"`, and
  `count` is unchanged

#### Scenario: The export is a re-ingestible flows.json document

- **WHEN** the `flows` map returned by `export_flows` is written out and loaded by a `FlowSource`
- **THEN** it loads as a valid curated overlay (it is a `slug -> Flow Document` map), so the export
  round-trips back into the server

### Requirement: The effective overlay is externally co-maintainable

The exported overlay SHALL be co-maintainable by an external process via the existing inbound path:
a dev export script SHALL be able to produce a `flows.json` from the effective overlay, and the
documented loop SHALL be export → external edit → host at `FLOWS_URL` (or commit the file) →
`FlowSource` ingests. The runtime accepted overlay SHALL continue to layer on top of an externally
re-published file until it is reconciled into the durable artifact (a separate change).

#### Scenario: An exported file re-published at FLOWS_URL is ingested

- **WHEN** the exported `flows.json` is edited and hosted at `FLOWS_URL` (or committed as the bundled
  file)
- **THEN** `FlowSource` ingests it as the loaded overlay on its next load, with the runtime accepted
  overlay still layering on top
