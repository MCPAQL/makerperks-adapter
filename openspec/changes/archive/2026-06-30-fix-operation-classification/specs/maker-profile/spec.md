## MODIFIED Requirements

### Requirement: Maker profile as a per-user CRUDE entity

The adapter SHALL expose the maker's own profile (identity + projects) as a first-class
CRUDE entity, with `create_profile`, `get_profile`, `update_profile`, `add_project`,
`update_project`, `remove_project`, and `delete_profile` operations. The profile SHALL hold
only non-secret fields used to assemble applications (name, contact, region, public links,
project descriptions). Each operation SHALL carry the correct semantic category — `create_profile`,
`add_credential`, and `add_project` as CREATE; reads as READ; `update_profile` and
`update_project` as UPDATE; and `delete_profile`, `remove_credential`, and `remove_project` as
DELETE — and the `mcp_aql_create` / `mcp_aql_update` / `mcp_aql_delete` tools SHALL be exposed
only when an operation of that category is registered. Projects are first-class sub-resources
keyed by a stable `project_id`, so editing a project SHALL be an `update_project` (an in-place
UPDATE), never a `remove_project` + `add_project`.

#### Scenario: Create then read a profile

- **WHEN** `create_profile` is called with identity fields and `get_profile` is then called
- **THEN** the stored profile is returned with the supplied fields

#### Scenario: Update merges fields

- **WHEN** `update_profile` is called with a subset of fields
- **THEN** those fields are changed and the others are preserved

#### Scenario: Projects can be added and removed

- **WHEN** `add_project` then `remove_project` are called
- **THEN** the project appears in the profile after the add and is gone after the remove

#### Scenario: A project can be edited in place

- **WHEN** `update_project` is called with a project's id and a subset of fields
- **THEN** those fields are replaced on the existing project, omitted fields are kept, and the
  project's `project_id` is unchanged (an in-place update, not a delete+create)

#### Scenario: Updating an unknown project id is rejected

- **WHEN** `update_project` is called with a `project_id` no project has
- **THEN** it returns a `NOT_FOUND_RESOURCE` error

#### Scenario: Delete removes the profile

- **WHEN** `delete_profile` is called
- **THEN** a subsequent `get_profile` reports no profile

#### Scenario: CRUDE tools are gated

- **WHEN** the router has no CREATE/UPDATE/DELETE operations registered (the live READ-only
  deployment)
- **THEN** the `mcp_aql_create` / `mcp_aql_update` / `mcp_aql_delete` tools are not exposed
