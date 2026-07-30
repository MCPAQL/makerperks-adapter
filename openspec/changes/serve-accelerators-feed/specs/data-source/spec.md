# data-source

## ADDED Requirements

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
