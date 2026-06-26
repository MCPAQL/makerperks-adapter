## ADDED Requirements

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
