# data-source

## ADDED Requirements

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
