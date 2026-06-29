# perks-export Specification

## Purpose
The producer half of the opportunity-directory substrate (#89, epic #84): the server emits a
schema-valid, re-ingestible `perks.json` from its federated directory (the mirror of `export_flows`),
so anyone can stand a feed up and a generated feed is itself an ingestable `directory-federation`
source — closing the producer/consumer round-trip. `export_perks` (READ, every deployment) emits
`{ name, generated, count, programs }`, optionally restricted to one `feed` or renamed; it strips the
server-set `feed` provenance tag and validates on emit (the eval-free checker) so the output is a
clean feed. A dev `export-perks.mjs` writes it to a file. This is the general capability behind the
Nate-facing feed (#82 is its PR pipeline); generating from accepted perk-record contributions arrives
with the contribution queue (#81). The server emits data only — it never writes upstream (the #90
invariant).

## Requirements
### Requirement: Export a schema-valid perks.json from the federated directory

The adapter SHALL expose an `export_perks` read operation that emits a schema-valid `perks.json`
payload (`{ name, generated, count, programs }`) from the current federated directory, so the server
is a producer of feeds, not only a consumer. The emitted payload SHALL be validated on emit with the
existing eval-free payload checker, and SHALL be re-ingestible as a `DataSource` feed (closing the
producer/consumer round-trip). An optional `feed` parameter SHALL restrict the export to one source
feed's programs; an optional `name` SHALL override the payload name (default: the directory's name).
The server-set `feed` provenance tag SHALL be stripped from the emitted programs so the output is a
clean feed. The operation SHALL mutate no state, be discoverable via `introspect` as READ, and be
available on every deployment.

#### Scenario: The export is a valid, re-ingestible perks.json

- **WHEN** `export_perks` is called
- **THEN** it returns a payload that the eval-free checker accepts, and feeding that payload to a
  fresh `DataSource` yields the same programs

#### Scenario: A feed filter exports one source

- **WHEN** `export_perks` is called with a `feed` that matches a configured source id
- **THEN** only that feed's programs are emitted

#### Scenario: Emitted programs carry no server-set provenance

- **WHEN** `export_perks` emits programs
- **THEN** none of them carries the internal `feed` provenance field (it is stripped on emit)

