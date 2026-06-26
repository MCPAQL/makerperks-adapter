## ADDED Requirements

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
