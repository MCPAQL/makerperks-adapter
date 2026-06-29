## ADDED Requirements

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
