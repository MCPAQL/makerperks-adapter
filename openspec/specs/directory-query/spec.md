# directory-query Specification

## Purpose
TBD - created by archiving change add-makerperks-adapter. Update Purpose after archive.
## Requirements
### Requirement: MCP-AQL READ endpoint over the perks directory

The adapter SHALL expose a CRUDE **READ** endpoint family over the MakerPerks
directory, providing at minimum `list_programs`, `get_program`, and
`search_programs`. Every operation SHALL return the discriminated wire format
(`{ success: true, data }` or `{ success: false, error }`). No discrete per-program
or per-query-shape tools SHALL be registered; the directory is reachable through the
semantic READ surface only.

#### Scenario: List with filters

- **WHEN** a client issues `list_programs` with optional filters (e.g. audience /
  persona, tag, region, minimum value)
- **THEN** the matching programs are returned, each carrying decision signal — title,
  provider, audience, value, region, eligibility/caveats, verified date, and
  redemption URL

#### Scenario: Get one program

- **WHEN** a client issues `get_program` for a known program identifier or slug
- **THEN** the full record for that program is returned

#### Scenario: Fuzzy search

- **WHEN** a client issues `search_programs` with a free-text query containing a minor
  typo or a term matching a program's summary rather than its title
- **THEN** the relevant program is still returned, ranked by relevance

#### Scenario: No matches

- **WHEN** a query matches no programs
- **THEN** a successful response with an empty result set is returned, not an error

#### Scenario: Unknown parameter rejected

- **WHEN** a request includes a parameter not declared by the operation
- **THEN** the request is rejected with error code `VALIDATION_UNKNOWN_PARAM`

### Requirement: Mandatory introspection

The adapter SHALL implement `introspect` as a READ operation that returns its
available operations, their parameters, and their types on demand, so clients
discover capability at runtime without preloading every operation schema. The
adapter's tool registration SHALL advertise introspection so clients know it is
available.

#### Scenario: Discover operations

- **WHEN** a client issues `introspect`
- **THEN** the response enumerates the available operations with their semantic
  category, parameters (name, type, required), and return shapes

#### Scenario: Discover a single operation

- **WHEN** a client issues `introspect` scoped to a named operation
- **THEN** the response returns the detailed parameter and return definition for that
  operation

### Requirement: Deadline-window query

The READ endpoint family SHALL provide an `upcoming_deadlines` operation returning
programs whose `next_deadline` falls within a requested day window (default 60 days),
sorted soonest-first, each with the days remaining computed against the current date;
past deadlines SHALL be excluded. Programs that explicitly declare `next_deadline:
null` SHALL be reported separately as rolling (apply-anytime); programs whose feed
does not carry the `next_deadline` field at all SHALL NOT appear in either list. The
operation SHALL support restricting to one feed and excluding the rolling list.

#### Scenario: Deadlines inside the window, soonest first

- **WHEN** a client issues `upcoming_deadlines` with a window covering two dated
  programs and not a third
- **THEN** the two in-window programs are returned soonest-first with their
  `days_left`, and the third is absent

#### Scenario: Rolling is explicit, not inferred from absence

- **WHEN** the directory federates a feed with explicit `next_deadline: null`
  programs and a feed (e.g. perks) whose programs lack the field
- **THEN** the explicit-null programs appear under `rolling` and the field-less
  programs appear nowhere in the result

#### Scenario: Past deadlines are excluded

- **WHEN** a program's `next_deadline` is before the current date
- **THEN** it is not returned, whatever the window

