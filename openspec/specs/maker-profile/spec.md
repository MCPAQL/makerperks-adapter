# maker-profile Specification

## Purpose
TBD - created by archiving change add-profile-vault. Update Purpose after archive.
## Requirements
### Requirement: Maker profile as a per-user CRUDE entity

The adapter SHALL expose the maker's own profile (identity + projects) as a first-class
CRUDE entity, with `create_profile`, `get_profile`, `update_profile`, `add_project`,
`remove_project`, and `delete_profile` operations. The profile SHALL hold only non-secret
fields used to assemble applications (name, contact, region, public links, project
descriptions). Each operation SHALL carry the correct semantic category — `create_profile`
and `add_credential` as CREATE, reads as READ, `update_profile`/`add_project`/`remove_project`
as UPDATE, and `delete_profile`/`remove_credential` as DELETE — and the `mcp_aql_create` /
`mcp_aql_update` / `mcp_aql_delete` tools SHALL be exposed only when an operation of that
category is registered.

#### Scenario: Create then read a profile

- **WHEN** `create_profile` is called with identity fields and `get_profile` is then called
- **THEN** the stored profile is returned with the supplied fields

#### Scenario: Update merges fields

- **WHEN** `update_profile` is called with a subset of fields
- **THEN** those fields are changed and the others are preserved

#### Scenario: Projects can be added and removed

- **WHEN** `add_project` then `remove_project` are called
- **THEN** the project appears in the profile after the add and is gone after the remove

#### Scenario: Delete removes the profile

- **WHEN** `delete_profile` is called
- **THEN** a subsequent `get_profile` reports no profile

#### Scenario: CRUDE tools are gated

- **WHEN** the router has no CREATE/UPDATE/DELETE operations registered (the live READ-only
  deployment)
- **THEN** the `mcp_aql_create` / `mcp_aql_update` / `mcp_aql_delete` tools are not exposed

### Requirement: Per-user keying and isolation

The profile SHALL be keyed by the authenticated user (`userId`). On the hosted endpoint a
session SHALL only ever read or write the profile of the user that authenticated it
(`this.props.userId`); one user's profile SHALL NOT be visible to another.

#### Scenario: Users are isolated

- **WHEN** two authenticated users each create a profile
- **THEN** each `get_profile` returns only that user's profile, never the other's

### Requirement: Local-only mode

The adapter SHALL support a fully local deployment (over stdio) in which the profile and
vault are stored on the user's machine and never transmitted to any server — a private
personal management tool. The same CRUDE operations SHALL behave identically in local and
hosted modes.

#### Scenario: Local profile never leaves the machine

- **WHEN** the adapter runs over stdio in local-only mode
- **THEN** profile create/read/update/delete operate against on-device storage with no network
  transmission of profile or vault data

